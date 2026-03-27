/**
 * Protected MCP routes as a Fastify encapsulated plugin.
 *
 * POST /mcp and GET /mcp require a valid Bearer token.
 * Auth is enforced via a scoped preHandler hook that only runs
 * for routes registered inside this plugin.
 *
 * Uses Phase 4's scoped auth plugin for JWT validation and RFC 6750
 * error responses, and AsyncLocalStorage for propagating request
 * context to MCP tool handlers.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "../mcp-tools.js";
import { WikiJsApi } from "../api.js";
import { requestContext } from "../request-context.js";
import authPlugin from "../auth/middleware.js";
import type { AuthPluginOptions } from "../auth/middleware.js";

/**
 * Options for the protected routes plugin.
 */
export interface ProtectedRoutesOptions {
  /** WikiJsApi instance for MCP tool handlers */
  wikiJsApi: WikiJsApi;
  /** Auth plugin options (jwks, issuer, audience, resourceMetadataUrl) */
  auth: AuthPluginOptions;
  /** MCP instructions text for the initialize response */
  instructions: string;
}

/**
 * Fastify encapsulated plugin registering protected MCP routes.
 *
 * Auth is handled by Phase 4's auth plugin registered within this
 * encapsulated scope -- it only applies to routes inside this plugin.
 *
 * Critical: Uses preHandler (not onRequest) for auth -- body parsing
 * must complete first for POST /mcp (Pitfall 1).
 *
 * Critical: In async Fastify hooks, ALWAYS `return reply` after
 * reply.send() to stop hook chain execution (Pitfall 3).
 */
export async function protectedRoutes(
  fastify: FastifyInstance,
  opts: ProtectedRoutesOptions,
): Promise<void> {
  const { wikiJsApi, auth, instructions } = opts;

  // Register Phase 4 auth plugin within this encapsulated scope.
  // Because protectedRoutes is NOT wrapped with fastify-plugin,
  // the auth plugin's hooks only apply to routes in this scope.
  await fastify.register(authPlugin, auth);

  // POST /mcp -- MCP JSON-RPC endpoint (TRNS-01, PROT-01)
  // In stateless mode, each request gets a fresh McpServer + transport pair.
  fastify.post("/mcp", async (request: FastifyRequest, reply: FastifyReply) => {
    const mcpServer = createMcpServer(wikiJsApi, instructions);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless mode
      enableJsonResponse: true,      // return JSON instead of SSE for POST
    });

    reply.raw.on("close", async () => {
      await transport.close();
      await mcpServer.close();
    });

    await mcpServer.connect(transport);

    // Wrap transport.handleRequest in requestContext.run() to propagate
    // correlation ID and user identity to MCP tool handlers via AsyncLocalStorage.
    await requestContext.run(
      {
        correlationId: request.id as string,
        userId: request.user?.oid,
        username: request.user?.preferred_username,
        log: request.log,
      },
      async () => {
        await transport.handleRequest(
          request.raw,
          reply.raw,
          request.body as Record<string, unknown>,
        );
      },
    );
  });

  // GET /mcp -- 405 Method Not Allowed in stateless mode (TRNS-02)
  fastify.get("/mcp", async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.status(405).send({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    });
  });
}
