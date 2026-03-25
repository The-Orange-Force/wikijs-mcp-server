/**
 * OAuth Authorization Proxy routes as a Fastify plugin.
 *
 * Serves OAuth authorization server metadata, dynamic client registration,
 * and proxies authorization/token requests to Azure AD.
 *
 * All routes are publicly accessible without JWT authentication.
 * Phase 11: discovery + registration endpoints
 * Phase 12: GET /authorize redirect proxy
 * Phase 13: POST /token exchange proxy
 */

import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { SUPPORTED_SCOPES } from "../scopes.js";
import { mapScopes } from "../oauth-proxy/scope-mapper.js";
import { buildAzureEndpoints } from "../oauth-proxy/azure-endpoints.js";

/**
 * Options for the OAuth proxy routes plugin.
 */
export interface OAuthProxyOptions {
  /** Application configuration */
  appConfig: AppConfig;
}

/**
 * Fastify plugin registering OAuth authorization proxy routes.
 */
export async function oauthProxyRoutes(
  fastify: FastifyInstance,
  opts: OAuthProxyOptions,
): Promise<void> {
  const { appConfig } = opts;

  // Build metadata once at registration time (not per-request)
  const metadata = {
    issuer: appConfig.azure.resourceUrl,
    authorization_endpoint: `${appConfig.azure.resourceUrl}/authorize`,
    token_endpoint: `${appConfig.azure.resourceUrl}/token`,
    registration_endpoint: `${appConfig.azure.resourceUrl}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: SUPPORTED_SCOPES,
  };

  // GET /.well-known/oauth-authorization-server -- RFC 8414 AS metadata
  fastify.get("/.well-known/oauth-authorization-server", async (_request, reply) => {
    return reply
      .header("Cache-Control", "public, max-age=3600")
      .send(metadata);
  });

  // GET /.well-known/openid-configuration -- OpenID Connect Discovery (identical)
  fastify.get("/.well-known/openid-configuration", async (_request, reply) => {
    return reply
      .header("Cache-Control", "public, max-age=3600")
      .send(metadata);
  });

  // POST /register -- RFC 7591 Dynamic Client Registration (static response)
  fastify.post("/register", async (request, reply) => {
    const contentType = request.headers["content-type"];
    if (!contentType || !contentType.includes("application/json")) {
      return reply.code(415).send({
        error: "unsupported_media_type",
        error_description: "Content-Type must be application/json",
      });
    }

    const body = request.body as Record<string, unknown> | null;
    if (body && typeof body === "object" && "client_name" in body) {
      request.log.info({ client_name: body.client_name }, "DCR registration request");
    }

    return reply.code(201).send({
      client_id: appConfig.azure.clientId,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    });
  });

  // ---------------------------------------------------------------------------
  // GET /authorize -- OAuth authorization redirect proxy (Phase 12)
  // ---------------------------------------------------------------------------

  /** Params whitelisted for forwarding to Azure AD. */
  const ALLOWED_PARAMS = new Set([
    "client_id",
    "redirect_uri",
    "response_type",
    "scope",
    "state",
    "code_challenge",
    "code_challenge_method",
    "nonce",
    "prompt",
    "login_hint",
  ]);

  const azureAuthorizeUrl = buildAzureEndpoints(appConfig.azure.tenantId).authorize;

  fastify.get("/authorize", async (request, reply) => {
    const query = request.query as Record<string, string>;

    // -- 1. Validate client_id (pre-redirect -- JSON errors) --
    const clientId = query.client_id;
    if (!clientId) {
      return reply.code(400).send({
        error: "invalid_request",
        error_description: "missing required parameter: client_id",
      });
    }
    if (clientId !== appConfig.azure.clientId) {
      request.log.warn({ receivedClientId: clientId }, "client_id mismatch");
      return reply.code(400).send({
        error: "invalid_client",
        error_description: "unknown client_id",
      });
    }

    // -- 2. Validate redirect_uri (pre-redirect -- JSON errors) --
    const redirectUri = query.redirect_uri;
    if (!redirectUri) {
      return reply.code(400).send({
        error: "invalid_request",
        error_description: "missing required parameter: redirect_uri",
      });
    }

    // -- 3. Helper for redirect-based errors --
    const state = query.state;

    function redirectError(error: string, description: string) {
      const url = new URL(redirectUri);
      url.searchParams.set("error", error);
      url.searchParams.set("error_description", description);
      if (state) {
        url.searchParams.set("state", state);
      }
      return reply.redirect(url.toString());
    }

    // -- 4. Validate response_type (post-redirect -- redirect errors) --
    const responseType = query.response_type;
    if (!responseType) {
      return redirectError("invalid_request", "missing required parameter: response_type");
    }
    if (responseType !== "code") {
      return redirectError("unsupported_response_type", "response_type must be 'code'");
    }

    // -- 5. Build outbound scope string --
    const rawScope = query.scope;
    const clientScopes = rawScope ? rawScope.split(" ").filter(Boolean) : [];
    const mapped = mapScopes(clientScopes, appConfig.azure.clientId);
    const filtered = mapped.filter(
      (s) => s !== "openid" && s !== "offline_access",
    );
    const finalScope = [...filtered, "openid", "offline_access"].join(" ");

    // -- 6. Build outbound URL with whitelisted params --
    const outbound = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (ALLOWED_PARAMS.has(key)) {
        outbound.set(key, value);
      } else {
        request.log.debug({ param: key }, "dropping unknown parameter");
      }
    }
    // Override scope with the final mapped scope string
    outbound.set("scope", finalScope);

    const azureUrl = `${azureAuthorizeUrl}?${outbound.toString()}`;

    // -- 7. Log and redirect --
    request.log.info("authorization redirect");
    return reply.redirect(azureUrl);
  });
}
