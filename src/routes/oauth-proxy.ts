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
}
