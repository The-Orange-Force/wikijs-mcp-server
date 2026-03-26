import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/server.js";
import { WikiJsApi } from "../src/api.js";
import { createMcpServer } from "../src/mcp-tools.js";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../src/config.js";
import {
  getLocalJwks,
  createTestToken,
  TEST_CONFIG,
} from "../src/auth/__tests__/helpers.js";

// ---------------------------------------------------------------------------
// Mock WikiJsApi -- avoids needing a real WikiJS instance
// ---------------------------------------------------------------------------
const mockWikiJsApi = {
  checkConnection: async () => true,
  getPageById: async (id: number) => ({
    id,
    path: "test/page",
    title: "Test Page",
    description: "A test page",
    content: "# Test Content",
    isPublished: true,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  }),
  listPages: async () => [
    { id: 1, path: "test", title: "Test", description: "Test page", isPublished: true, createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z" },
  ],
  searchPages: async () => [{ id: 1, path: "test", title: "Test" }],
  createPage: async () => ({ succeeded: true, message: "OK" }),
  updatePage: async () => ({ succeeded: true, message: "OK" }),
  deletePage: async () => ({ succeeded: true, message: "OK" }),
  getUsersList: async () => [
    { id: 1, name: "Admin", email: "admin@test.com" },
  ],
  searchUsers: async () => [
    { id: 1, name: "Admin", email: "admin@test.com" },
  ],
  getGroupsList: async () => [{ id: 1, name: "Admins", isSystem: true }],
  createUser: async () => ({ succeeded: true, message: "OK" }),
  updateUser: async () => ({ succeeded: true, message: "OK" }),
  searchUnpublishedPages: async () => [],
  forceDeletePage: async () => ({ succeeded: true, message: "OK" }),
  getPageStatus: async (id: number) => ({
    id,
    path: "test",
    title: "Test",
    description: "Test page",
    content: "# Test Content",
    isPublished: true,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  }),
  publishPage: async () => ({ succeeded: true, message: "OK" }),
} as unknown as WikiJsApi;

// ---------------------------------------------------------------------------
// Server lifecycle -- uses buildApp with local JWKS for test auth
// ---------------------------------------------------------------------------
let server: FastifyInstance;
let baseUrl: string;
let validToken: string;

function makeTestConfig(): AppConfig {
  return {
    port: 0,
    wikijs: {
      baseUrl: "http://localhost:3000",
      token: "test-token",
    },
    azure: {
      tenantId: TEST_CONFIG.tenantId,
      clientId: TEST_CONFIG.clientId,
      resourceUrl: TEST_CONFIG.resourceUrl,
      jwksUri: `https://login.microsoftonline.com/${TEST_CONFIG.tenantId}/discovery/v2.0/keys`,
      issuer: TEST_CONFIG.issuer,
    },
  };
}

beforeAll(async () => {
  validToken = await createTestToken();
  const jwks = await getLocalJwks();
  const appConfig = makeTestConfig();

  // Build the app via buildApp, then manually override auth JWKS.
  // We need to use buildApp's plugin architecture but with local JWKS.
  // Since buildApp registers protectedRoutes with the config JWKS,
  // we create the server directly using Fastify with our test setup.
  const fastify = await import("fastify");
  const { buildLoggerConfig } = await import("../src/logging.js");
  const { publicRoutes } = await import("../src/routes/public-routes.js");
  const { protectedRoutes } = await import("../src/routes/mcp-routes.js");

  server = fastify.default({ ...buildLoggerConfig() });

  server.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  server.register(publicRoutes, {
    wikiJsApi: mockWikiJsApi,
    appConfig,
  });

  server.register(protectedRoutes, {
    wikiJsApi: mockWikiJsApi,
    auth: {
      jwks,
      issuer: appConfig.azure.issuer,
      audience: appConfig.azure.clientId,
      resourceMetadataUrl: `${appConfig.azure.resourceUrl}/.well-known/oauth-protected-resource`,
    },
  });

  // Listen on port 0 to get a random available port
  const address = await server.listen({ port: 0, host: "127.0.0.1" });
  baseUrl = address;
});

afterAll(async () => {
  await server.close();
});

// ---------------------------------------------------------------------------
// Helper: send JSON-RPC request to POST /mcp with auth token
// ---------------------------------------------------------------------------
async function mcpPost(body: Record<string, unknown>) {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${validToken}`,
    },
    body: JSON.stringify(body),
  });
  return res;
}

// ---------------------------------------------------------------------------
// TRNS-01: POST /mcp JSON-RPC
// ---------------------------------------------------------------------------
describe("TRNS-01: POST /mcp JSON-RPC", () => {
  it("POST /mcp with initialize request returns a valid JSON-RPC response", async () => {
    const res = await mcpPost({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0.0" },
      },
    });

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.jsonrpc).toBe("2.0");
    expect(data.id).toBe(1);
    expect(data.result).toBeDefined();
    expect(data.result.serverInfo).toBeDefined();
    expect(data.result.serverInfo.name).toBe("wikijs-mcp");
    expect(data.result.protocolVersion).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TRNS-02: GET /mcp returns 405 in stateless mode (auth required first)
// ---------------------------------------------------------------------------
describe("TRNS-02: GET /mcp returns 401 without auth", () => {
  it("GET /mcp without token returns 401", async () => {
    const res = await fetch(`${baseUrl}/mcp`);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// TRNS-03: MCP tools/list and tools/call
// ---------------------------------------------------------------------------
describe("TRNS-03: MCP tools/list and tools/call", () => {
  it("POST /mcp with tools/list returns all 3 read-only tools", async () => {
    const res = await mcpPost({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    });

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.jsonrpc).toBe("2.0");
    expect(data.id).toBe(2);
    expect(data.result).toBeDefined();
    expect(data.result.tools).toBeDefined();
    expect(Array.isArray(data.result.tools)).toBe(true);
    expect(data.result.tools.length).toBe(3);

    // Verify each tool has required properties
    for (const tool of data.result.tools) {
      expect(tool.name).toBeDefined();
      expect(typeof tool.name).toBe("string");
      expect(tool.description).toBeDefined();
      expect(typeof tool.description).toBe("string");
      expect(tool.inputSchema).toBeDefined();
    }

    // Verify specific tool names are present
    const toolNames = data.result.tools.map((t: { name: string }) => t.name);
    const expectedTools = [
      "get_page",
      "list_pages",
      "search_pages",
    ];
    for (const expected of expectedTools) {
      expect(toolNames).toContain(expected);
    }
  });

  it("POST /mcp with tools/call invokes list_pages tool with mock", async () => {
    const res = await mcpPost({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "list_pages",
        arguments: {},
      },
    });

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.jsonrpc).toBe("2.0");
    expect(data.id).toBe(3);
    expect(data.result).toBeDefined();
    expect(data.result.content).toBeDefined();
    expect(Array.isArray(data.result.content)).toBe(true);
    expect(data.result.content.length).toBeGreaterThan(0);
    expect(data.result.content[0].type).toBe("text");

    // Parse the text content and verify it contains our mock data
    const parsed = JSON.parse(data.result.content[0].text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].id).toBe(1);
    expect(parsed[0].path).toBe("test");
  });
});

// ---------------------------------------------------------------------------
// Additional route tests
// ---------------------------------------------------------------------------
describe("Server routes", () => {
  it("GET / returns server info with auth discovery hints", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.name).toBe("wikijs-mcp");
    expect(data.version).toBe("2.0.0");
    expect(data.auth_required).toBe(true);
    expect(data.protected_resource_metadata).toBeDefined();
    expect(data.endpoints).toBeDefined();
    expect(data.endpoints["POST /mcp"]).toBeDefined();
    expect(data.endpoints["GET /health"]).toBeDefined();
  });

  it("GET /health returns health status", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.message).toBe("Connected to Wiki.js");
  });
});

// ---------------------------------------------------------------------------
// Module import test (kept from Plan 01)
// ---------------------------------------------------------------------------
describe("Module import", () => {
  it("createMcpServer returns an McpServer instance", () => {
    const mockApi = {} as any;
    const mcpSrv = createMcpServer(mockApi);
    expect(mcpSrv).toBeDefined();
    expect(typeof mcpSrv.connect).toBe("function");
  });
});
