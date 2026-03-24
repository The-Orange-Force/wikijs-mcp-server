import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildServer } from "../src/server.js";
import { WikiJsApi } from "../src/api.js";
import { createMcpServer } from "../src/mcp-tools.js";
import type { FastifyInstance } from "fastify";

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
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  }),
  getPageContent: async () => "# Test Content",
  getPagesList: async () => [{ id: 1, path: "test", title: "Test" }],
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
  getAllPagesList: async () => [
    { id: 1, path: "test", title: "Test", isPublished: true },
  ],
  searchUnpublishedPages: async () => [],
  forceDeletePage: async () => ({ succeeded: true, message: "OK" }),
  getPageStatus: async () => ({
    id: 1,
    path: "test",
    title: "Test",
    isPublished: true,
  }),
  publishPage: async () => ({ succeeded: true, message: "OK" }),
} as unknown as WikiJsApi;

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------
let server: FastifyInstance;
let baseUrl: string;

beforeAll(async () => {
  server = buildServer(mockWikiJsApi);
  // Listen on port 0 to get a random available port
  const address = await server.listen({ port: 0, host: "127.0.0.1" });
  baseUrl = address;
});

afterAll(async () => {
  await server.close();
});

// ---------------------------------------------------------------------------
// Helper: send JSON-RPC request to POST /mcp
// The MCP SDK requires Accept header with both application/json and
// text/event-stream for POST requests.
// ---------------------------------------------------------------------------
async function mcpPost(body: Record<string, unknown>) {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
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
// TRNS-02: GET /mcp returns 405 in stateless mode
// ---------------------------------------------------------------------------
describe("TRNS-02: GET /mcp returns 405 in stateless mode", () => {
  it("GET /mcp returns 405 Method Not Allowed", async () => {
    const res = await fetch(`${baseUrl}/mcp`);

    expect(res.status).toBe(405);

    const data = await res.json();
    expect(data.jsonrpc).toBe("2.0");
    expect(data.error).toBeDefined();
    expect(data.error.code).toBe(-32000);
    expect(data.error.message).toBe("Method not allowed.");
    expect(data.id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TRNS-03: MCP tools/list and tools/call
// ---------------------------------------------------------------------------
describe("TRNS-03: MCP tools/list and tools/call", () => {
  it("POST /mcp with tools/list returns all 17 tools", async () => {
    // In stateless mode, each request gets a fresh McpServer+transport.
    // tools/list works without prior initialize because in stateless mode
    // the SDK skips session and initialization validation.
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
    expect(data.result.tools.length).toBe(17);

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
      "get_page_content",
      "list_pages",
      "search_pages",
      "create_page",
      "update_page",
      "delete_page",
      "list_all_pages",
      "search_unpublished_pages",
      "force_delete_page",
      "get_page_status",
      "publish_page",
      "list_users",
      "search_users",
      "create_user",
      "list_groups",
      "update_user",
    ];
    for (const expected of expectedTools) {
      expect(toolNames).toContain(expected);
    }
  });

  it("POST /mcp with tools/call invokes list_users tool with mock", async () => {
    // Each request is independent in stateless mode
    const res = await mcpPost({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "list_users",
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
    expect(parsed[0].name).toBe("Admin");
    expect(parsed[0].email).toBe("admin@test.com");
  });
});

// ---------------------------------------------------------------------------
// Additional route tests
// ---------------------------------------------------------------------------
describe("Server routes", () => {
  it("GET / returns server info", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.name).toBe("wikijs-mcp");
    expect(data.version).toBe("1.3.0");
    expect(data.endpoints).toBeDefined();
    expect(data.endpoints["POST /mcp"]).toBeDefined();
    expect(data.endpoints["GET /mcp"]).toBeDefined();
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
