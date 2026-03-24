import { describe, it, expect } from "vitest";
import { createMcpServer } from "../src/mcp-tools.js";

describe("TRNS-01: POST /mcp JSON-RPC", () => {
  it.todo("POST /mcp with initialize request returns a valid JSON-RPC response");
});

describe("TRNS-02: GET /mcp returns 405 in stateless mode", () => {
  it.todo("GET /mcp returns 405 Method Not Allowed");
});

describe("TRNS-03: MCP tools/list and tools/call", () => {
  it.todo("POST /mcp with tools/list returns all 17 tools");
  it.todo("POST /mcp with tools/call invokes a tool with a mock");
});

describe("Module import", () => {
  it("createMcpServer returns an McpServer instance", () => {
    const mockApi = {} as any;
    const server = createMcpServer(mockApi);
    expect(server).toBeDefined();
    expect(typeof server.connect).toBe("function");
  });
});
