// ---------------------------------------------------------------------------
// Token proxy: handles POST /token by proxying to Azure AD
// ---------------------------------------------------------------------------

import { z } from "zod";
import { mapScopes, stripResourceParam, unmapScopes } from "./scope-mapper.js";

// ---------------------------------------------------------------------------
// AADSTS-to-OAuth error code mapping
// ---------------------------------------------------------------------------

/** Maps Azure AD AADSTS error codes to standard OAuth 2.0 error strings. */
export const AADSTS_TO_OAUTH: Record<string, string> = {
  // Authorization code / PKCE failures
  AADSTS54005: "invalid_grant",
  AADSTS70008: "invalid_grant",
  AADSTS501481: "invalid_grant",
  AADSTS70000: "invalid_grant",
  AADSTS70002: "invalid_grant",
  AADSTS70003: "invalid_grant",
  AADSTS700082: "invalid_grant",
  AADSTS7000218: "invalid_client",
  // Scope and resource errors
  AADSTS70011: "invalid_scope",
  AADSTS28002: "invalid_scope",
  AADSTS28003: "invalid_scope",
  AADSTS9010010: "invalid_request",
  // Client errors
  AADSTS50011: "invalid_request",
  AADSTS7000215: "invalid_client",
  AADSTS700016: "unauthorized_client",
  // Consent / interaction
  AADSTS65001: "consent_required",
  AADSTS50076: "interaction_required",
  AADSTS50079: "interaction_required",
  AADSTS50058: "interaction_required",
};

/** Generic error descriptions keyed by OAuth 2.0 error code. */
const GENERIC_DESCRIPTIONS: Record<string, string> = {
  invalid_grant: "The authorization code has expired or is invalid.",
  invalid_scope: "The requested scope is invalid.",
  invalid_request: "The request is missing a required parameter or is malformed.",
  invalid_client: "Client authentication failed.",
  unauthorized_client: "The client is not authorized.",
  consent_required: "User consent is required.",
  interaction_required: "User interaction is required.",
  server_error: "Authorization server unavailable",
  unsupported_grant_type: "The grant type is not supported.",
};

/** Descriptions specific to certain AADSTS codes (overrides GENERIC). */
const AADSTS_DESCRIPTIONS: Record<string, string> = {
  AADSTS700082: "The refresh token has expired.",
};

// ---------------------------------------------------------------------------
// Zod schemas per grant type
// ---------------------------------------------------------------------------

const authCodeSchema = z.object({
  grant_type: z.literal("authorization_code"),
  code: z.string().min(1, "missing required parameter: code"),
  redirect_uri: z.string().min(1, "missing required parameter: redirect_uri"),
  client_id: z.string().min(1, "missing required parameter: client_id"),
  code_verifier: z.string().optional(),
  scope: z.string().optional(),
});

const refreshTokenSchema = z.object({
  grant_type: z.literal("refresh_token"),
  refresh_token: z.string().min(1, "missing required parameter: refresh_token"),
  client_id: z.string().min(1, "missing required parameter: client_id"),
  scope: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface TokenProxyContext {
  clientId: string;
  tokenEndpoint: string;
  fetch: typeof globalThis.fetch;
  log: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
}

export interface TokenProxyResult {
  status: number;
  body: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SUPPORTED_GRANT_TYPES = new Set(["authorization_code", "refresh_token"]);

function normalizeAzureError(
  azureBody: { error: string; error_description?: string },
  log: TokenProxyContext["log"],
): { error: string; error_description: string } {
  const aadstsMatch = azureBody.error_description?.match(/AADSTS(\d+)/);
  const aadstsCode = aadstsMatch ? `AADSTS${aadstsMatch[1]}` : null;

  if (aadstsCode) {
    log.warn(
      { aadstsCode, originalDescription: azureBody.error_description },
      "normalizing Azure AD error for client",
    );
  }

  const oauthError = aadstsCode
    ? (AADSTS_TO_OAUTH[aadstsCode] ?? "invalid_request")
    : azureBody.error;

  // Use AADSTS-specific description if available, then generic, then fallback
  const description = aadstsCode
    ? (AADSTS_DESCRIPTIONS[aadstsCode] ?? GENERIC_DESCRIPTIONS[oauthError] ?? "An error occurred.")
    : (GENERIC_DESCRIPTIONS[oauthError] ?? "An error occurred.");

  return { error: oauthError, error_description: description };
}

function buildAzureTokenBody(
  validated: Record<string, string>,
  clientId: string,
): URLSearchParams {
  // Strip resource parameter (Azure AD rejects it on v2.0)
  const stripped = stripResourceParam(validated);

  // Map scopes to Azure AD api:// format
  if (stripped.scope) {
    const scopes = stripped.scope.split(" ");
    stripped.scope = mapScopes(scopes, clientId).join(" ");
  }

  // Remove client_secret -- this is a public client
  const { client_secret: _, ...params } = stripped;

  return new URLSearchParams(params);
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

/**
 * Handle a token exchange request by proxying to Azure AD.
 *
 * Validates grant type, required parameters, and client_id before forwarding.
 * On success, reverse-maps Azure AD scopes back to bare MCP format.
 * On error, normalizes AADSTS codes to standard OAuth 2.0 error format.
 */
export async function handleTokenRequest(
  body: Record<string, string>,
  ctx: TokenProxyContext,
): Promise<TokenProxyResult> {
  const grantType = body.grant_type;

  // 1. Check grant_type
  if (!grantType || !SUPPORTED_GRANT_TYPES.has(grantType)) {
    return {
      status: 400,
      body: {
        error: "unsupported_grant_type",
        error_description: GENERIC_DESCRIPTIONS.unsupported_grant_type,
      },
    };
  }

  // 2. Validate per grant type
  const schema = grantType === "authorization_code" ? authCodeSchema : refreshTokenSchema;
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? "invalid request";
    return {
      status: 400,
      body: { error: "invalid_request", error_description: firstError },
    };
  }

  // 3. Verify client_id
  const clientId = body.client_id;
  if (clientId !== ctx.clientId) {
    ctx.log.warn({ receivedClientId: clientId }, "client_id mismatch in token request");
    return {
      status: 400,
      body: { error: "invalid_client", error_description: "unknown client_id" },
    };
  }

  // 4. Build outbound body
  const outboundBody = buildAzureTokenBody(
    parsed.data as unknown as Record<string, string>,
    ctx.clientId,
  );

  // 5. Call Azure AD
  let response: Response;
  try {
    response = await ctx.fetch(ctx.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: outboundBody.toString(),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.log.error({ error: message }, "Azure AD token request failed");
    return {
      status: 502,
      body: { error: "server_error", error_description: "Authorization server unavailable" },
    };
  }

  // 6. Check Content-Type
  const contentType = response.headers.get("Content-Type") ?? "";
  if (!contentType.includes("application/json")) {
    ctx.log.error(
      { status: response.status, contentType },
      "Azure AD returned non-JSON response",
    );
    return {
      status: 502,
      body: { error: "server_error", error_description: "Authorization server unavailable" },
    };
  }

  // 7. Parse JSON
  let azureBody: Record<string, unknown>;
  try {
    azureBody = await response.json() as Record<string, unknown>;
  } catch {
    ctx.log.error("Failed to parse Azure AD JSON response");
    return {
      status: 502,
      body: { error: "server_error", error_description: "Authorization server unavailable" },
    };
  }

  // 8. Log request summary (never log body/tokens)
  ctx.log.info({ grantType, upstreamStatus: response.status }, "Azure AD token response");

  // 9. Error responses -- normalize AADSTS codes
  if (response.status >= 400) {
    const normalized = normalizeAzureError(
      azureBody as { error: string; error_description?: string },
      ctx.log,
    );
    return { status: response.status, body: normalized };
  }

  // 10. Success -- reverse-map scopes
  if (typeof azureBody.scope === "string") {
    azureBody.scope = unmapScopes(azureBody.scope, ctx.clientId);
  }

  return { status: response.status, body: azureBody };
}
