import fastify, { FastifyInstance } from "fastify";
import { WikiJsApi } from "./api.js";
import { createMcpServer } from "./mcp-tools.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { config as dotenvConfig } from "dotenv";

/**
 * Creates and configures a Fastify server with MCP routes.
 * Does NOT call listen() -- the caller is responsible for starting.
 *
 * @param wikiJsApi - WikiJsApi instance for health checks and tool handlers
 * @returns Configured Fastify instance
 */
export function buildServer(wikiJsApi: WikiJsApi): FastifyInstance {
  const server = fastify({ logger: true });

  // POST /mcp -- MCP JSON-RPC endpoint (TRNS-01)
  // In stateless mode, each request gets a fresh McpServer + transport pair.
  // This avoids the "Already connected to a transport" error when requests
  // overlap, since the Protocol base class enforces single-transport ownership.
  server.post("/mcp", async (request, reply) => {
    const mcpServer = createMcpServer(wikiJsApi);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless mode
      enableJsonResponse: true,      // return JSON instead of SSE for POST
    });

    reply.raw.on("close", async () => {
      await transport.close();
      await mcpServer.close();
    });

    await mcpServer.connect(transport);
    await transport.handleRequest(request.raw, reply.raw, request.body as Record<string, unknown>);
  });

  // GET /mcp -- 405 Method Not Allowed in stateless mode (TRNS-02)
  server.get("/mcp", async (_request, reply) => {
    reply.status(405).send({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    });
  });

  // GET /health -- unauthenticated health check
  server.get("/health", async () => {
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

  // GET / -- server info
  server.get("/", async () => ({
    name: "wikijs-mcp",
    version: "1.3.0",
    endpoints: {
      "GET /": "Server info",
      "GET /health": "Health check",
      "POST /mcp": "MCP JSON-RPC endpoint",
      "GET /mcp": "MCP SSE endpoint (405 in stateless mode)",
    },
  }));

  return server;
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function start() {
  dotenvConfig();

  const port = parseInt(process.env.PORT || "3200");
  const baseUrl = process.env.WIKIJS_BASE_URL || "http://localhost:3000";
  const token = process.env.WIKIJS_TOKEN || "";

  console.log("WikiJS MCP server config:");
  console.log(`  PORT: ${port}`);
  console.log(`  WIKIJS_BASE_URL: ${baseUrl}`);
  console.log(`  WIKIJS_TOKEN: ${token.substring(0, 10)}...`);

  const wikiJsApi = new WikiJsApi(baseUrl, token);
  const server = buildServer(wikiJsApi);

  try {
    const isConnected = await wikiJsApi.checkConnection();
    if (!isConnected) {
      console.warn(
        "WARNING: Could not connect to Wiki.js API. Server will start but functionality may be limited.",
      );
    }

    await server.listen({ port, host: "0.0.0.0" });
    console.log(`WikiJS MCP server listening on port ${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

// Only start when executed directly (not when imported by tests)
// Check that we're not in a vitest/test environment
if (!process.env.VITEST) {
  start();
}
