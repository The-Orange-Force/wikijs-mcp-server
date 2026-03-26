/**
 * Unprotected public routes as a Fastify plugin.
 *
 * GET / and GET /health are accessible without any Authorization header.
 * GET /.well-known/oauth-protected-resource is registered here as well
 * (moved from server.ts for clean route organization).
 *
 * Note: These routes are registered at root scope, outside the
 * protectedRoutes plugin, so the auth preHandler does NOT apply.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { WikiJsApi } from "../api.js";
import type { AppConfig } from "../config.js";
import { SUPPORTED_SCOPES } from "../scopes.js";

/**
 * Options for the public routes plugin.
 */
export interface PublicRoutesOptions {
  /** WikiJsApi instance for health check */
  wikiJsApi: WikiJsApi;
  /** Application configuration for resource metadata */
  appConfig: AppConfig;
}

/**
 * Fastify plugin registering unauthenticated public routes.
 */
export async function publicRoutes(
  fastify: FastifyInstance,
  opts: PublicRoutesOptions,
): Promise<void> {
  const { wikiJsApi, appConfig } = opts;

  // GET / -- Server info endpoint with auth discovery hints
  fastify.get("/", async () => ({
    name: "wikijs-mcp",
    version: "2.0.0",
    auth_required: true,
    protected_resource_metadata: `${appConfig.azure.resourceUrl}/.well-known/oauth-protected-resource`,
    authorization_server_metadata: `${appConfig.azure.resourceUrl}/.well-known/oauth-authorization-server`,
    endpoints: {
      "GET /": "Server info (unauthenticated)",
      "GET /health": "Health check (unauthenticated)",
      "POST /mcp": "MCP JSON-RPC endpoint (requires Bearer token)",
      "GET /mcp": "MCP SSE endpoint -- returns 405 in stateless mode (requires Bearer token)",
      "GET /.well-known/oauth-protected-resource":
        "RFC 9728 discovery (unauthenticated)",
      "GET /.well-known/oauth-authorization-server":
        "OAuth 2.0 Authorization Server Metadata (unauthenticated)",
      "GET /.well-known/openid-configuration":
        "OpenID Connect Discovery (unauthenticated)",
      "POST /register":
        "Dynamic Client Registration (unauthenticated)",
      "GET /authorize":
        "OAuth authorization redirect (unauthenticated)",
      "POST /token":
        "OAuth token proxy (unauthenticated)",
    },
  }));

  // GET /health -- Health check (unauthenticated)
  fastify.get("/health", async () => {
    try {
      const isConnected = await wikiJsApi.checkConnection();
      return {
        status: isConnected ? "ok" : "error",
        message: isConnected
          ? "Connected to Wiki.js"
          : "Failed to connect to Wiki.js",
      };
    } catch (error) {
      return {
        status: "error",
        message: "Failed to connect to Wiki.js",
        error: String(error),
      };
    }
  });

  // GET /.well-known/oauth-protected-resource -- RFC 9728 Protected Resource Metadata
  // (DISC-01, DISC-02, DISC-03)
  fastify.get(
    "/.well-known/oauth-protected-resource",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const metadata: Record<string, unknown> = {
        resource: appConfig.azure.resourceUrl,
        authorization_servers: [appConfig.azure.resourceUrl],
        scopes_supported: SUPPORTED_SCOPES,
        bearer_methods_supported: ["header"],
        resource_signing_alg_values_supported: ["RS256"],
      };

      // Only include resource_documentation if the optional URL is configured
      if (appConfig.azure.resourceDocsUrl) {
        metadata.resource_documentation = appConfig.azure.resourceDocsUrl;
      }

      return reply
        .header("Cache-Control", "public, max-age=3600")
        .send(metadata);
    },
  );
}
