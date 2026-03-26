import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createMcpServer } from "../src/mcp-tools.js";
import type { FastifyInstance } from "fastify";
import {
  getLocalJwks,
  createTestToken,
  TEST_CONFIG,
} from "../src/auth/__tests__/helpers.js";
import { mockWikiJsApi, makeTestConfig } from "./helpers/build-test-app.js";
let server: FastifyInstance;
let baseUrl: string;
let validToken: string;

beforeAll(async () => {
  validToken = await createTestToken();

  // Build the app via buildTestApp from the shared helper
  server = await buildTestApp();
  await server.ready();

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

  it("removed tools are absent from tools/list", async () => {
    const res = await mcpPost({ jsonrpc: "2.0", id: 10, method: "tools/list", params: {} });
    const data = await res.json();
    const toolNames = data.result.tools.map((t: { name: string }) => t.name);
    const removedTools = [
      "get_page_content", "create_page", "update_page", "delete_page",
      "list_all_pages", "search_unpublished_pages", "force_delete_page",
      "get_page_status", "publish_page", "list_users", "search_users",
      "create_user", "list_groups", "update_user",
    ];
    for (const removed of removedTools) {
      expect(toolNames).not.toContain(removed);
    }
  });

  it("each tool has a multi-sentence LLM-optimized description", async () => {
    const res = await mcpPost({ jsonrpc: "2.0", id: 11, method: "tools/list", params: {} });
    const data = await res.json();
    for (const tool of data.result.tools) {
      // Multi-sentence: at least 2 sentences (contains at least one period followed by a space and capital letter)
      expect(tool.description.length).toBeGreaterThan(50);
      expect(tool.description).toMatch(/\.\s+[A-Z]/);
    }
    // get_page description mentions return fields
    const getPage = data.result.tools.find((t: { name: string }) => t.name === "get_page");
    expect(getPage.description).toContain("content");
    expect(getPage.description).toContain("isPublished");
    // search_pages mentions limitation
    const searchPages = data.result.tools.find((t: { name: string }) => t.name === "search_pages");
    expect(searchPages.description).toContain("published");
    // list_pages cross-references get_page
    const listPages = data.result.tools.find((t: { name: string }) => t.name === "list_pages");
    expect(listPages.description).toContain("get_page");
  });

  it("tools/call get_page returns full page object with content", async () => {
    const res = await mcpPost({
      jsonrpc: "2.0", id: 20, method: "tools/call",
      params: { name: "get_page", arguments: { id: 42 } },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.result.content).toBeDefined();
    expect(data.result.content[0].type).toBe("text");
    const parsed = JSON.parse(data.result.content[0].text);
    expect(parsed.id).toBe(42);
    expect(parsed.title).toBe("Test Page");
    expect(parsed.content).toContain("Test Content");
    expect(parsed.isPublished).toBe(true);
  });

  it("tools/call list_pages returns page metadata array", async () => {
    const res = await mcpPost({
      jsonrpc: "2.0", id: 21, method: "tools/call",
      params: { name: "list_pages", arguments: {} },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.result.content[0].type).toBe("text");
    const parsed = JSON.parse(data.result.content[0].text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].id).toBe(1);
    expect(parsed[0].title).toBe("Test");
    expect(parsed[0].isPublished).toBe(true);
  });

  it("tools/call search_pages returns results array", async () => {
    const res = await mcpPost({
      jsonrpc: "2.0", id: 22, method: "tools/call",
      params: { name: "search_pages", arguments: { query: "test" } },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.result.content[0].type).toBe("text");
    const parsed = JSON.parse(data.result.content[0].text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].id).toBe(1);
    expect(parsed[0].title).toBe("Test");
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
    expect(data.version).toBe("2.3.0")
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
