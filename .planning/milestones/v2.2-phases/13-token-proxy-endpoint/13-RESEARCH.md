# Phase 13: Token Proxy Endpoint - Research

**Researched:** 2026-03-25
**Domain:** OAuth 2.0 token endpoint proxying, Azure AD token exchange, AADSTS error normalization
**Confidence:** HIGH

## Summary

Phase 13 implements a `POST /token` endpoint that proxies `authorization_code` and `refresh_token` grants to Azure AD's v2.0 token endpoint. The proxy receives form-encoded bodies (parsed by `@fastify/formbody` registered in Phase 11), validates required parameters per grant type with Zod, maps scopes from bare MCP format to Azure AD `api://` format using Phase 10's `mapScopes()`, strips the `resource` parameter, forwards the request to Azure AD via an injected `fetch` function, and returns the response. On success, scopes in the response are reverse-mapped from Azure AD format back to bare MCP format. On error, Azure AD's `AADSTS*` codes are normalized to standard OAuth 2.0 error format before returning to the client.

The endpoint is public (unauthenticated) since MCP clients call it before they have an access token. It lives inside the existing `src/routes/oauth-proxy.ts` Fastify plugin established in Phase 11. The injected `fetch` function pattern enables test isolation without real Azure AD calls -- tests provide a mock fetch that returns canned responses.

**Primary recommendation:** Implement as a single route handler in `oauth-proxy.ts` with extracted helper functions for grant-type validation, Azure AD request construction, response normalization, and AADSTS error mapping. Use `URLSearchParams` for constructing the outbound form-encoded body to Azure AD.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Minimal client-facing errors: map AADSTS codes to standard OAuth 2.0 error codes (invalid_grant, invalid_request, etc.) with generic error_description -- no Azure AD leakage
- Mirror Azure AD's HTTP status codes (400 stays 400, 401 stays 401)
- Non-AADSTS failures (network timeouts, 500s, HTML error pages) return `server_error` with generic description "Authorization server unavailable"
- AADSTS-to-OAuth mapping via a const lookup table -- unknown codes fall back to `invalid_request`
- Always log full AADSTS code + original description server-side when normalizing for client
- Reject unsupported grant types locally -- only allow `authorization_code` and `refresh_token`, return `unsupported_grant_type` immediately for anything else
- Validate required parameters per grant type with Zod schemas before forwarding (`code` + `redirect_uri` for authorization_code, `refresh_token` for refresh_token grant)
- Pass through PKCE `code_verifier` as-is to Azure AD -- proxy doesn't validate it
- Enforce `client_id` matches configured `AZURE_CLIENT_ID` -- reject mismatches to prevent proxy misuse
- Pass through Azure AD's JSON response body verbatim (access_token, refresh_token, id_token, expires_in, ext_expires_in, etc.)
- Reverse-map scopes in response from Azure AD format (`api://{client_id}/wikijs:read`) back to bare format (`wikijs:read`) using Phase 10 scope mapper
- Explicitly set `Content-Type: application/json` on all token responses
- Set `Cache-Control: no-store` and `Pragma: no-cache` per RFC 6749 section 5.1
- Basic Fastify logging (no AsyncLocalStorage requestContext) -- token proxy is public/unauthenticated, no user identity to track
- Log on every request: grant_type, Azure AD response status code, round-trip duration in ms
- On error: also log AADSTS code and original Azure error description server-side
- Add `X-Upstream-Duration-Ms` response header with Azure AD round-trip timing
- Never log tokens, authorization codes, or request bodies

### Claude's Discretion
- Internal function organization within the oauth-proxy plugin
- Exact set of AADSTS codes in the lookup table (cover the common ones)
- Zod schema structure for per-grant-type validation
- Test fixture design for injected fetch mocking

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TOKN-01 | `POST /token` proxies `authorization_code` grant to Azure AD token endpoint and returns the response | Route handler with Zod validation (code, redirect_uri, client_id, code_verifier), scope mapping via `mapScopes()`, resource stripping, `URLSearchParams` body to Azure AD, verbatim response passthrough with reverse scope mapping; see Architecture Patterns |
| TOKN-02 | `POST /token` proxies `refresh_token` grant to Azure AD token endpoint and returns the response | Same handler with Zod validation (refresh_token, client_id), scope mapping, resource stripping, same proxy-and-passthrough pattern; see Architecture Patterns |
| TOKN-03 | Token endpoint normalizes Azure AD `AADSTS*` error responses to standard OAuth 2.0 error format | AADSTS-to-OAuth lookup table mapping ~15 common codes to standard error strings, generic error_description, full server-side logging; see AADSTS Mapping Table and Common Pitfalls |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.3 (strict, ESM) | Type-safe implementation | Already in project |
| Fastify | 4 | Route handler registration | Already in project |
| Zod | 3.25+ | Per-grant-type input validation | Already in project; pattern established in config.ts |
| Vitest | 4 | Unit and integration tests | Already in project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@fastify/formbody` | (installed by Phase 11) | Parse `application/x-www-form-urlencoded` POST bodies | Registered inside oauth-proxy plugin; makes `request.body` a parsed object |
| Node.js built-in `fetch` | Node 20+ | HTTP client for Azure AD requests | Injected via plugin options for testability |
| Node.js built-in `URLSearchParams` | Node 20+ | Construct form-encoded body for outbound requests | Standard API for URL-encoded body construction |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Injected `fetch` | `graphql-request` or `undici` | `fetch` is built-in, no new dependency; injection enables trivial test mocking |
| `URLSearchParams` for outbound body | Manual string concatenation | `URLSearchParams` handles encoding correctly; string concatenation risks encoding bugs |
| Const lookup table for AADSTS | Regex pattern matching on error strings | Lookup table is O(1), explicit, and easy to extend; regex is fragile against format changes |

**Installation:**
```bash
# No new packages needed -- all dependencies already in project
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  oauth-proxy/
    scope-mapper.ts         # Existing: mapScopes(), stripResourceParam()
    azure-endpoints.ts      # Existing: buildAzureEndpoints()
    token-proxy.ts          # NEW: handleTokenRequest(), AADSTS mapping, reverse scope mapping
    __tests__/
      scope-mapper.test.ts  # Existing
      azure-endpoints.test.ts # Existing
      token-proxy.test.ts   # NEW: unit tests for token proxy logic
  routes/
    oauth-proxy.ts          # Phase 11 plugin: add POST /token route handler
```

### Pattern 1: Token Proxy Route Handler
**What:** POST /token route in the oauth-proxy Fastify plugin that dispatches to `handleTokenRequest()`.
**When to use:** All token exchange requests from MCP clients.
**Example:**
```typescript
// In src/routes/oauth-proxy.ts (inside the plugin)
fastify.post("/token", async (request, reply) => {
  const body = request.body as Record<string, string>;
  const startTime = Date.now();

  const result = await handleTokenRequest(body, {
    clientId: opts.appConfig.azure.clientId,
    tokenEndpoint: buildAzureEndpoints(opts.appConfig.azure.tenantId).token,
    fetch: opts.fetch,
    log: request.log,
  });

  const duration = Date.now() - startTime;
  reply.header("X-Upstream-Duration-Ms", String(duration));
  reply.header("Cache-Control", "no-store");
  reply.header("Pragma", "no-cache");
  reply.header("Content-Type", "application/json");

  return reply.status(result.status).send(result.body);
});
```

### Pattern 2: Per-Grant-Type Zod Validation
**What:** Separate Zod schemas for each supported grant type, validated after grant_type dispatch.
**When to use:** Before forwarding any request to Azure AD.
**Example:**
```typescript
// Source: CONTEXT.md locked decisions + RFC 6749
import { z } from "zod";

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
```

### Pattern 3: Outbound Request Construction with URLSearchParams
**What:** Build the form-encoded body for Azure AD using `URLSearchParams`, with mapped scopes and stripped resource parameter.
**When to use:** After validation passes, before calling `fetch()`.
**Example:**
```typescript
// Source: Azure AD v2.0 token endpoint docs (verified 2026-01-09)
function buildAzureTokenBody(
  validated: Record<string, string>,
  clientId: string,
): URLSearchParams {
  // Strip resource parameter (SCOPE-02)
  const stripped = stripResourceParam(validated);

  // Map scopes to Azure AD format (SCOPE-01)
  if (stripped.scope) {
    const scopes = stripped.scope.split(" ");
    stripped.scope = mapScopes(scopes, clientId).join(" ");
  }

  // Remove client_secret -- this is a public client (no secret)
  const { client_secret: _, ...params } = stripped;

  return new URLSearchParams(params);
}
```

### Pattern 4: AADSTS Error Normalization
**What:** Parse Azure AD error responses and map AADSTS codes to standard OAuth 2.0 error codes.
**When to use:** When Azure AD returns a non-2xx response with JSON body containing `error_description` with an AADSTS code.
**Example:**
```typescript
// Source: Microsoft Entra error codes reference + CONTEXT.md decisions
const AADSTS_TO_OAUTH: Record<string, string> = {
  // Authorization code / PKCE failures
  "AADSTS54005": "invalid_grant",    // expired authorization code
  "AADSTS70008": "invalid_grant",    // expired or revoked authorization code
  "AADSTS501481": "invalid_grant",   // code_verifier mismatch (PKCE)
  "AADSTS70000": "invalid_grant",    // invalid authorization code
  "AADSTS70002": "invalid_grant",    // error validating credentials
  "AADSTS70003": "invalid_grant",    // expired/revoked grant
  "AADSTS700082": "invalid_grant",   // expired refresh token
  "AADSTS7000218": "invalid_client", // missing client credentials
  // Scope and resource errors
  "AADSTS70011": "invalid_scope",    // invalid scope
  "AADSTS28002": "invalid_scope",    // invalid scope in token request
  "AADSTS28003": "invalid_scope",    // empty scope
  "AADSTS9010010": "invalid_request",// resource parameter not supported
  // Client errors
  "AADSTS50011": "invalid_request",  // redirect_uri mismatch
  "AADSTS7000215": "invalid_client", // invalid client_secret
  "AADSTS700016": "unauthorized_client", // app not found in tenant
  // Consent / interaction
  "AADSTS65001": "consent_required", // user consent required
  "AADSTS50076": "interaction_required", // MFA required
  "AADSTS50079": "interaction_required", // MFA enrollment required
  "AADSTS50058": "interaction_required", // session not found
};

function normalizeAzureError(
  azureBody: { error: string; error_description?: string },
  log: FastifyBaseLogger,
): { error: string; error_description: string } {
  const aadstsMatch = azureBody.error_description?.match(/AADSTS(\d+)/);
  const aadstsCode = aadstsMatch ? `AADSTS${aadstsMatch[1]}` : null;

  if (aadstsCode) {
    log.warn({ aadstsCode, originalDescription: azureBody.error_description },
      "Normalizing Azure AD error for client");
  }

  const oauthError = aadstsCode
    ? (AADSTS_TO_OAUTH[aadstsCode] ?? "invalid_request")
    : azureBody.error;

  return {
    error: oauthError,
    error_description: getGenericDescription(oauthError),
  };
}
```

### Pattern 5: Reverse Scope Mapping in Token Response
**What:** Strip the `api://{clientId}/` prefix from scopes in Azure AD's token response so the MCP client sees bare scope names.
**When to use:** Before returning a successful token response to the client.
**Example:**
```typescript
// Reverse of mapScopes -- strip api://{clientId}/ prefix
function unmapScopes(scopeString: string, clientId: string): string {
  const prefix = `api://${clientId}/`;
  return scopeString
    .split(" ")
    .map((scope) => scope.startsWith(prefix) ? scope.slice(prefix.length) : scope)
    .join(" ");
}
```

### Pattern 6: Injected Fetch for Testability
**What:** The `fetch` function is passed as a plugin option rather than using the global `fetch`. Tests inject a mock.
**When to use:** Always -- production passes `globalThis.fetch`, tests pass a mock.
**Example:**
```typescript
// Plugin options interface (extends Phase 11's existing OAuthProxyOptions)
export interface OAuthProxyOptions {
  appConfig: AppConfig;
  fetch: typeof globalThis.fetch;  // injected fetch function
}

// In server.ts (production):
server.register(oauthProxyRoutes, {
  appConfig,
  fetch: globalThis.fetch,
});

// In tests:
const mockFetch = vi.fn().mockResolvedValue(
  new Response(JSON.stringify({
    access_token: "mock-token",
    token_type: "Bearer",
    expires_in: 3599,
    scope: `api://${clientId}/wikijs:read openid`,
    refresh_token: "mock-refresh",
  }), { status: 200, headers: { "Content-Type": "application/json" } })
);
server.register(oauthProxyRoutes, {
  appConfig,
  fetch: mockFetch,
});
```

### Anti-Patterns to Avoid
- **Parsing Azure AD's response body manually:** Use `response.json()` -- Azure AD returns proper JSON for both success and error responses.
- **Forwarding Azure AD's error_description verbatim to client:** Leaks internal error details, AADSTS codes, trace IDs, and correlation IDs. Always normalize.
- **Using `request.body` without type assertion after `@fastify/formbody`:** The formbody parser produces `Record<string, string>` -- assert the type explicitly.
- **Constructing outbound body by string concatenation:** Use `URLSearchParams` to avoid encoding bugs with special characters in authorization codes or redirect URIs.
- **Importing `config` singleton in token-proxy.ts:** Pass config values as function parameters. Keeps the module testable without environment setup.
- **Validating PKCE code_verifier in the proxy:** The proxy passes it through to Azure AD. Azure AD validates it. Double-validation adds complexity for no benefit.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Form-encoded body parsing | Manual `querystring.parse()` on raw body | `@fastify/formbody` plugin | Edge cases with encoding, duplicate keys, nested values; plugin handles registration with Fastify's content-type system |
| URL-encoded body construction | Manual `key=encodeURIComponent(value)&...` | `URLSearchParams` | Handles special characters in authorization codes, redirect URIs; RFC 3986 compliant |
| HTTP client | Custom `http.request` wrapper | Node.js built-in `fetch` | Standard API, supports streaming, built-in to Node 20+; injection pattern handles testability |
| AADSTS code extraction | Complex regex on full error_description | Simple `/AADSTS(\d+)/` match | AADSTS codes always follow this pattern; the regex is minimal and well-tested |

**Key insight:** The proxy's job is transport and normalization, not validation. Azure AD validates authorization codes, PKCE verifiers, refresh tokens, and scopes. The proxy validates just enough to reject obviously bad requests early (missing required fields, wrong client_id, unsupported grant_type).

## Common Pitfalls

### Pitfall 1: Non-JSON Azure AD Error Responses
**What goes wrong:** Azure AD occasionally returns HTML error pages (503, 502) instead of JSON when experiencing issues. `response.json()` throws, crashing the handler.
**Why it happens:** Azure AD infrastructure (load balancers, gateway) may return HTML for infrastructure-level errors.
**How to avoid:** Check `Content-Type` header before parsing as JSON. If not `application/json`, return `server_error` with "Authorization server unavailable" immediately. Wrap `response.json()` in try-catch as a secondary defense.
**Warning signs:** Unhandled rejection errors in logs; 500 responses to clients instead of clean OAuth errors.

### Pitfall 2: Forgetting to Reverse-Map Scopes in Response
**What goes wrong:** Client receives scopes like `api://6ba7b810.../wikijs:read` instead of `wikijs:read`. The MCP client cannot match these against its known scopes.
**Why it happens:** Azure AD returns scopes in its own fully-qualified format. The proxy must undo the mapping done on the way in.
**How to avoid:** Always call `unmapScopes()` on the `scope` field of successful token responses before returning.
**Warning signs:** MCP client fails to recognize granted scopes; scope-based tool access checks fail.

### Pitfall 3: Token/Code Leakage in Logs
**What goes wrong:** Authorization codes, access tokens, or refresh tokens appear in server logs.
**Why it happens:** Logging the full request body or full Azure AD response for debugging.
**How to avoid:** Never log `request.body`. Log only: `grant_type`, Azure AD response `status`, duration, and on error: AADSTS code and error description. The CONTEXT.md explicitly forbids logging tokens, codes, or request bodies.
**Warning signs:** Tokens visible in log files; security audit findings.

### Pitfall 4: Missing Cache-Control Headers on Error Responses
**What goes wrong:** Only success responses get `Cache-Control: no-store`. Error responses are cached by intermediaries.
**Why it happens:** Headers set conditionally inside success path only.
**How to avoid:** Set `Cache-Control: no-store` and `Pragma: no-cache` unconditionally on all `/token` responses, before the status code or body is determined.
**Warning signs:** Stale error responses returned to clients after successful retry.

### Pitfall 5: client_id Mismatch Not Caught Before Proxy
**What goes wrong:** A request with a different `client_id` than the configured `AZURE_CLIENT_ID` gets forwarded to Azure AD, which may or may not reject it.
**Why it happens:** Validation only checks required fields exist, not their values.
**How to avoid:** After Zod validation, explicitly compare `client_id` against `appConfig.azure.clientId`. Reject mismatches with `invalid_client` error immediately, without proxying to Azure AD.
**Warning signs:** Azure AD returns confusing errors about unknown applications; proxy is used to exchange tokens for unrelated apps.

### Pitfall 6: Network Timeout Without Cleanup
**What goes wrong:** Azure AD is slow or unreachable, and the proxy hangs indefinitely waiting for a response.
**Why it happens:** Default `fetch` has no timeout.
**How to avoid:** Use `AbortSignal.timeout(30000)` (30 second timeout) on the fetch call. On timeout, return `server_error` with "Authorization server unavailable".
**Warning signs:** Requests pile up; Fastify connection pool exhaustion; client timeouts.

### Pitfall 7: Double Scope Mapping
**What goes wrong:** Scopes that arrive already in `api://` format get mapped again, producing `api://.../api://.../wikijs:read`.
**Why it happens:** The Phase 10 `mapScopes()` function already handles this with an `api://` prefix check, but the reverse mapping `unmapScopes()` must also be defensive.
**How to avoid:** The existing `mapScopes()` skips scopes starting with `api://`. For `unmapScopes()`, only strip the exact expected prefix `api://{clientId}/` -- don't use a generic `api://` strip.
**Warning signs:** Malformed scope strings in token responses.

## Code Examples

Verified patterns from official sources:

### Azure AD Token Request (authorization_code grant)
```typescript
// Source: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
// Request to Azure AD token endpoint
const body = new URLSearchParams({
  client_id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  scope: "api://6ba7b810-9dad-11d1-80b4-00c04fd430c8/wikijs:read openid offline_access",
  code: "OAAABAAAAiL9Kn2Z27UubvWFPbm0gLWQJVzCTE9UkP3pSx1aXxUjq...",
  redirect_uri: "http://localhost:3000/callback",
  grant_type: "authorization_code",
  code_verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
});

const response = await fetch(
  "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token",
  {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(30000),
  }
);
```

### Azure AD Token Response (success)
```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsIng1dCI...",
  "token_type": "Bearer",
  "expires_in": 3599,
  "ext_expires_in": 3599,
  "scope": "api://6ba7b810-9dad-11d1-80b4-00c04fd430c8/wikijs:read openid offline_access",
  "refresh_token": "AwABAAAAvPM1KaPlrEqdFSBzjqfTGAMxZGUTdM0t4B4...",
  "id_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJub25lIn0..."
}
```

### Azure AD Token Response (error with AADSTS)
```json
{
  "error": "invalid_grant",
  "error_description": "AADSTS70008: The provided authorization code or refresh token has expired due to inactivity. Send a new interactive authorization request for this user and resource.\r\nTrace ID: ...\r\nCorrelation ID: ...\r\nTimestamp: 2026-01-09 02:02:12Z",
  "error_codes": [70008],
  "timestamp": "2026-01-09 02:02:12Z",
  "trace_id": "0000aaaa-11bb-cccc-dd22-eeeeee333333",
  "correlation_id": "aaaa0000-bb11-2222-33cc-444444dddddd"
}
```

### Normalized Client-Facing Error (after AADSTS mapping)
```json
{
  "error": "invalid_grant",
  "error_description": "The authorization code has expired or is invalid."
}
```

### Azure AD Refresh Token Request
```typescript
// Source: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
const body = new URLSearchParams({
  client_id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  scope: "api://6ba7b810-9dad-11d1-80b4-00c04fd430c8/wikijs:read openid offline_access",
  refresh_token: "AwABAAAAvPM1KaPlrEqdFSBzjqfTGAMxZGUTdM0t4B4...",
  grant_type: "refresh_token",
});

const response = await fetch(
  "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token",
  {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(30000),
  }
);
```

### Test Pattern: Mock Fetch for Token Proxy
```typescript
// Source: Project test conventions + CONTEXT.md decisions
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

const CLIENT_ID = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

function createMockFetch(status: number, body: Record<string, unknown>) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
}

// Success case
const successFetch = createMockFetch(200, {
  access_token: "mock-access-token",
  token_type: "Bearer",
  expires_in: 3599,
  scope: `api://${CLIENT_ID}/wikijs:read openid`,
  refresh_token: "mock-refresh-token",
});

// Error case (AADSTS)
const errorFetch = createMockFetch(400, {
  error: "invalid_grant",
  error_description: "AADSTS70008: The provided authorization code has expired.",
  error_codes: [70008],
});

// Network failure
const networkErrorFetch = vi.fn().mockRejectedValue(
  new Error("fetch failed")
);
```

## AADSTS-to-OAuth Mapping Table

Recommended lookup table covering the most common token endpoint failures:

| AADSTS Code | OAuth 2.0 Error | Generic Description | Common Cause |
|-------------|-----------------|---------------------|--------------|
| AADSTS54005 | `invalid_grant` | "The authorization code has expired or is invalid." | Code expired (1 min lifetime) |
| AADSTS70008 | `invalid_grant` | "The authorization code has expired or is invalid." | Code expired or revoked |
| AADSTS70000 | `invalid_grant` | "The authorization code has expired or is invalid." | Invalid authorization code |
| AADSTS70002 | `invalid_grant` | "The authorization code has expired or is invalid." | Error validating credentials |
| AADSTS70003 | `invalid_grant` | "The authorization code has expired or is invalid." | Expired/revoked grant |
| AADSTS501481 | `invalid_grant` | "The authorization code has expired or is invalid." | PKCE code_verifier mismatch |
| AADSTS700082 | `invalid_grant` | "The refresh token has expired." | Expired refresh token |
| AADSTS50085 | `invalid_grant` | "The refresh token has expired." | Refresh needs social IDP |
| AADSTS50089 | `invalid_grant` | "The refresh token has expired." | Flow token expired |
| AADSTS70011 | `invalid_scope` | "The requested scope is invalid." | Invalid scope value |
| AADSTS28002 | `invalid_scope` | "The requested scope is invalid." | Invalid scope in token request |
| AADSTS28003 | `invalid_scope` | "The requested scope is invalid." | Empty scope |
| AADSTS9010010 | `invalid_request` | "The request is malformed." | Resource param not supported |
| AADSTS50011 | `invalid_request` | "The request is malformed." | redirect_uri mismatch |
| AADSTS700016 | `unauthorized_client` | "The client is not authorized." | App not found in tenant |
| AADSTS7000218 | `invalid_client` | "Invalid client credentials." | Missing client credentials |
| AADSTS7000215 | `invalid_client` | "Invalid client credentials." | Invalid client_secret |
| AADSTS65001 | `consent_required` | "User consent is required." | User hasn't consented |
| AADSTS50076 | `interaction_required` | "Additional user interaction is required." | MFA required |
| AADSTS50079 | `interaction_required` | "Additional user interaction is required." | MFA enrollment |
| AADSTS50058 | `interaction_required` | "Additional user interaction is required." | No session found |

**Fallback:** Any AADSTS code not in the table maps to `invalid_request` with description "The request could not be processed."

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Azure AD v1.0 `resource` param | Azure AD v2.0 scope-based (`api://`) | GA since 2019, strict March 2026 | Must strip `resource`, prefix scopes |
| MCP without RFC 8707 | MCP spec requires `resource` parameter | November 2025 | Proxy strips what MCP requires but Azure rejects |
| Global fetch | Injected fetch for testability | Modern Node.js pattern | No need for nock/msw; direct mock injection |
| `node-fetch` package | Built-in `globalThis.fetch` | Node 18+ (stable 20+) | No extra dependency needed |

**Deprecated/outdated:**
- `node-fetch` package -- unnecessary on Node 20+; use built-in `fetch`
- Azure AD v1.0 token endpoint (`/oauth2/token` without `/v2.0/`) -- do not use

## Open Questions

1. **Should `unmapScopes()` be added to `scope-mapper.ts` or kept in `token-proxy.ts`?**
   - What we know: `mapScopes()` lives in `scope-mapper.ts`. The reverse operation is logically paired with it.
   - What's unclear: Whether Phase 12 (authorize) also needs reverse mapping (it does not -- authorize only maps forward).
   - Recommendation: Add `unmapScopes()` to `scope-mapper.ts` alongside `mapScopes()` for cohesion. Only Phase 13 uses it now, but it belongs with its counterpart.

2. **Should the AADSTS mapping table live in `token-proxy.ts` or a separate file?**
   - What we know: The table is only used by the token proxy. It has ~20 entries.
   - What's unclear: Whether future endpoints might need the same mapping.
   - Recommendation: Keep in `token-proxy.ts` for now. If other endpoints need it, extract then.

3. **What is the Phase 11 plugin's options interface shape?**
   - What we know: Phase 11 CONTEXT.md says Claude has discretion on the interface shape. The plugin needs `appConfig` at minimum.
   - What's unclear: Whether Phase 11 will already include a `fetch` option or if Phase 13 adds it.
   - Recommendation: Phase 13 adds `fetch` to the existing `OAuthProxyOptions` interface. This is backward-compatible -- Phase 11/12 don't use fetch.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4 |
| Config file | `vitest.config.ts` (exists, pre-sets env vars) |
| Quick run command | `npx vitest run src/oauth-proxy/__tests__/token-proxy.test.ts --reporter=verbose` |
| Full suite command | `npm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TOKN-01 | authorization_code grant proxied to Azure AD with mapped scopes | unit | `npx vitest run src/oauth-proxy/__tests__/token-proxy.test.ts -x` | No -- Wave 0 |
| TOKN-01 | authorization_code grant returns Azure AD success response with reverse-mapped scopes | unit | `npx vitest run src/oauth-proxy/__tests__/token-proxy.test.ts -x` | No -- Wave 0 |
| TOKN-01 | Rejects authorization_code grant missing required params (code, redirect_uri) | unit | `npx vitest run src/oauth-proxy/__tests__/token-proxy.test.ts -x` | No -- Wave 0 |
| TOKN-01 | Rejects mismatched client_id | unit | `npx vitest run src/oauth-proxy/__tests__/token-proxy.test.ts -x` | No -- Wave 0 |
| TOKN-01 | Passes through code_verifier to Azure AD | unit | `npx vitest run src/oauth-proxy/__tests__/token-proxy.test.ts -x` | No -- Wave 0 |
| TOKN-01 | resource parameter stripped before forwarding | unit | `npx vitest run src/oauth-proxy/__tests__/token-proxy.test.ts -x` | No -- Wave 0 |
| TOKN-02 | refresh_token grant proxied to Azure AD | unit | `npx vitest run src/oauth-proxy/__tests__/token-proxy.test.ts -x` | No -- Wave 0 |
| TOKN-02 | refresh_token grant returns success response with reverse-mapped scopes | unit | `npx vitest run src/oauth-proxy/__tests__/token-proxy.test.ts -x` | No -- Wave 0 |
| TOKN-02 | Rejects refresh_token grant missing required params | unit | `npx vitest run src/oauth-proxy/__tests__/token-proxy.test.ts -x` | No -- Wave 0 |
| TOKN-03 | AADSTS error normalized to standard OAuth 2.0 error format | unit | `npx vitest run src/oauth-proxy/__tests__/token-proxy.test.ts -x` | No -- Wave 0 |
| TOKN-03 | Unknown AADSTS code falls back to invalid_request | unit | `npx vitest run src/oauth-proxy/__tests__/token-proxy.test.ts -x` | No -- Wave 0 |
| TOKN-03 | Non-JSON Azure AD response returns server_error | unit | `npx vitest run src/oauth-proxy/__tests__/token-proxy.test.ts -x` | No -- Wave 0 |
| TOKN-03 | Network failure returns server_error | unit | `npx vitest run src/oauth-proxy/__tests__/token-proxy.test.ts -x` | No -- Wave 0 |
| N/A | unsupported_grant_type rejected locally | unit | `npx vitest run src/oauth-proxy/__tests__/token-proxy.test.ts -x` | No -- Wave 0 |
| N/A | Cache-Control and Pragma headers set on all responses | unit | `npx vitest run src/oauth-proxy/__tests__/token-proxy.test.ts -x` | No -- Wave 0 |
| N/A | X-Upstream-Duration-Ms header present | unit | `npx vitest run src/oauth-proxy/__tests__/token-proxy.test.ts -x` | No -- Wave 0 |
| N/A | unmapScopes reverse-maps Azure AD scopes | unit | `npx vitest run src/oauth-proxy/__tests__/scope-mapper.test.ts -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/oauth-proxy/__tests__/ --reporter=verbose`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/oauth-proxy/__tests__/token-proxy.test.ts` -- covers TOKN-01, TOKN-02, TOKN-03 (all new)
- [ ] `src/oauth-proxy/__tests__/scope-mapper.test.ts` -- add `unmapScopes` tests (file exists, new tests needed)
- [ ] `src/oauth-proxy/token-proxy.ts` -- new module for handler logic

*(No framework install needed -- Vitest already configured)*

## Sources

### Primary (HIGH confidence)
- [Microsoft identity platform OAuth 2.0 auth code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow) -- Verified token endpoint request/response format for both authorization_code and refresh_token grants; exact parameter names; error response structure with AADSTS codes; updated 2026-01-09
- [RFC 6749 Section 5.1](https://datatracker.ietf.org/doc/html/rfc6749#section-5.1) -- Token endpoint response headers: `Cache-Control: no-store`, `Pragma: no-cache`; required fields: `access_token`, `token_type`
- [RFC 6749 Section 5.2](https://datatracker.ietf.org/doc/html/rfc6749#section-5.2) -- Error response format: `error` (required), `error_description` (optional), `error_uri` (optional)
- Existing codebase: `src/oauth-proxy/scope-mapper.ts` -- `mapScopes()`, `stripResourceParam()` verified as working Phase 10 output
- Existing codebase: `src/oauth-proxy/azure-endpoints.ts` -- `buildAzureEndpoints()` provides token endpoint URL

### Secondary (MEDIUM confidence)
- [Microsoft Entra authentication & authorization error codes](https://learn.microsoft.com/en-us/entra/identity-platform/reference-error-codes) -- AADSTS code reference; used to build the mapping table; verified against multiple error descriptions
- [@fastify/formbody npm](https://www.npmjs.com/package/@fastify/formbody) -- Confirms `request.body` is populated as parsed object from `application/x-www-form-urlencoded` content

### Tertiary (LOW confidence)
None -- all findings verified against primary or secondary sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies; all tools already in project
- Architecture: HIGH -- locked decisions from CONTEXT.md are specific and detailed; existing Phase 10 code verified; Azure AD token endpoint format confirmed from official docs
- Pitfalls: HIGH -- AADSTS error format confirmed from official docs; non-JSON response risk documented in Azure AD operational guidance; token leakage prevention is standard security practice

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable domain -- Azure AD v2.0 endpoints are GA; AADSTS error codes are stable)
