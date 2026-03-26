/**
 * Observability integration tests for correlation ID propagation and
 * tool invocation logging.
 *
 * Tests OBSV-01 (tool invocation logging with timing) and OBSV-02
 * (correlation ID propagation through pino logs and X-Request-ID headers).
 *
 * Uses Fastify inject() with pino log capture and direct wrapToolHandler
 * invocation within requestContext.run() to verify observability requirements.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance, FastifyBaseLogger } from "fastify";
import pino from "pino";
import { Writable } from "node:stream";
import { buildTestApp } from "./helpers/build-test-app.js";
import {
  createTestToken,
} from "../src/auth/__tests__/helpers.js";
import { UUID_REGEX } from "../src/logging.js";
import { wrapToolHandler } from "../src/tool-wrapper.js";
import { requestContext } from "../src/request-context.js";

// ---------------------------------------------------------------------------
// Log capture helper
// ---------------------------------------------------------------------------

interface LogEntry {
  level: number;
  msg: string;
  correlationId?: string;
  toolName?: string;
  duration?: number;
  userId?: string;
  username?: string;
  error?: string;
  [key: string]: unknown;
}

function createLogCapture(): {
  logs: LogEntry[];
  stream: Writable;
} {
  const logs: LogEntry[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      try {
        const line = chunk.toString().trim();
        if (line) {
          logs.push(JSON.parse(line));
        }
      } catch {
        // Ignore non-JSON lines
      }
      callback();
    },
  });
  return { logs, stream };
}

// ---------------------------------------------------------------------------
// Correlation ID propagation tests (OBSV-02)
// ---------------------------------------------------------------------------

describe("Correlation ID propagation", () => {
  let app: FastifyInstance;
  let logCapture: ReturnType<typeof createLogCapture>;
  let validToken: string;

  beforeAll(async () => {
    validToken = await createTestToken();
    logCapture = createLogCapture();
    app = await buildTestApp(undefined, undefined, {
      logger: { level: "trace", stream: logCapture.stream },
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    logCapture.logs.length = 0;
  });

  it("POST /mcp with valid auth returns X-Request-ID and pino log includes correlationId", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        authorization: `Bearer ${validToken}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0.0" },
        },
      },
    });

    const requestId = res.headers["x-request-id"] as string;
    expect(requestId).toBeDefined();
    expect(UUID_REGEX.test(requestId)).toBe(true);

    // Pino log should include correlationId matching the response header
    const logsWithCorrelationId = logCapture.logs.filter(
      (l) => l.correlationId === requestId,
    );
    expect(logsWithCorrelationId.length).toBeGreaterThan(0);
  });

  it("request with valid UUID X-Request-ID uses client UUID in pino logs", async () => {
    const clientId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

    await app.inject({
      method: "GET",
      url: "/health",
      headers: { "x-request-id": clientId },
    });

    const logsWithClientId = logCapture.logs.filter(
      (l) => l.correlationId === clientId,
    );
    expect(logsWithClientId.length).toBeGreaterThan(0);
  });

  it("request with invalid X-Request-ID uses server-generated UUID in pino logs", async () => {
    const invalidId = "not-a-uuid";

    const res = await app.inject({
      method: "GET",
      url: "/health",
      headers: { "x-request-id": invalidId },
    });

    const serverGeneratedId = res.headers["x-request-id"] as string;
    expect(serverGeneratedId).not.toBe(invalidId);
    expect(UUID_REGEX.test(serverGeneratedId)).toBe(true);

    // Pino logs should use the server-generated UUID, NOT the client value
    const logsWithInvalidId = logCapture.logs.filter(
      (l) => l.correlationId === invalidId,
    );
    expect(logsWithInvalidId.length).toBe(0);

    const logsWithServerId = logCapture.logs.filter(
      (l) => l.correlationId === serverGeneratedId,
    );
    expect(logsWithServerId.length).toBeGreaterThan(0);
  });

  it("401 error response has correlationId in pino warn-level log", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        authorization: "Bearer invalid-token",
      },
      payload: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    });

    const requestId = res.headers["x-request-id"] as string;
    expect(res.statusCode).toBe(401);

    // Find warn-level log (level 40) with the correlation ID
    const warnLogsWithId = logCapture.logs.filter(
      (l) => l.level === 40 && l.correlationId === requestId,
    );
    expect(warnLogsWithId.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Tool invocation logging tests (OBSV-01)
// ---------------------------------------------------------------------------

describe("Tool invocation logging", () => {
  it("successful tool handler logs toolName, duration, userId, and username at info level", async () => {
    const logCapture = createLogCapture();
    const testLogger = pino(
      { level: "trace" },
      logCapture.stream,
    );

    const mockHandler = async (_args: Record<string, unknown>) => ({
      result: "success",
    });
    const wrappedHandler = wrapToolHandler("test_tool", mockHandler);

    await requestContext.run(
      {
        correlationId: "test-correlation-id",
        userId: "user-oid-123",
        username: "user@example.com",
        log: testLogger as unknown as FastifyBaseLogger,
      },
      async () => {
        const result = await wrappedHandler({});
        expect(result).toEqual({ result: "success" });
      },
    );

    // Wait for stream to flush
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Find info-level (30) log with tool invocation
    const toolLogs = logCapture.logs.filter(
      (l) => l.level === 30 && l.toolName === "test_tool",
    );
    expect(toolLogs.length).toBe(1);

    const toolLog = toolLogs[0];
    expect(toolLog.toolName).toBe("test_tool");
    expect(typeof toolLog.duration).toBe("number");
    expect(toolLog.duration).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(toolLog.duration)).toBe(true);
    expect(toolLog.userId).toBe("user-oid-123");
    expect(toolLog.username).toBe("user@example.com");
    expect(toolLog.msg).toContain("Tool invocation: test_tool");
  });

  it("failing tool handler logs toolName, duration, and error at error level", async () => {
    const logCapture = createLogCapture();
    const testLogger = pino(
      { level: "trace" },
      logCapture.stream,
    );

    const failingHandler = async (): Promise<never> => {
      throw new Error("Tool execution failed");
    };
    const wrappedHandler = wrapToolHandler("failing_tool", failingHandler);

    await requestContext.run(
      {
        correlationId: "test-correlation-id-2",
        userId: "user-oid-456",
        username: "admin@example.com",
        log: testLogger as unknown as FastifyBaseLogger,
      },
      async () => {
        await expect(wrappedHandler({})).rejects.toThrow(
          "Tool execution failed",
        );
      },
    );

    // Wait for stream to flush
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Find error-level (50) log with tool error
    const errorLogs = logCapture.logs.filter(
      (l) => l.level === 50 && l.toolName === "failing_tool",
    );
    expect(errorLogs.length).toBe(1);

    const errorLog = errorLogs[0];
    expect(errorLog.toolName).toBe("failing_tool");
    expect(typeof errorLog.duration).toBe("number");
    expect(errorLog.duration).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(errorLog.duration)).toBe(true);
    expect(errorLog.error).toContain("Tool execution failed");
    expect(errorLog.msg).toContain("Tool error: failing_tool");
  });

  it("duration is a non-negative integer (not NaN, not undefined)", async () => {
    const logCapture = createLogCapture();
    const testLogger = pino(
      { level: "trace" },
      logCapture.stream,
    );

    const quickHandler = async () => ({ done: true });
    const wrappedHandler = wrapToolHandler("quick_tool", quickHandler);

    await requestContext.run(
      {
        correlationId: "test-id-3",
        userId: "user-oid",
        username: "test@example.com",
        log: testLogger as unknown as FastifyBaseLogger,
      },
      async () => {
        await wrappedHandler({});
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    const toolLogs = logCapture.logs.filter(
      (l) => l.level === 30 && l.toolName === "quick_tool",
    );
    expect(toolLogs.length).toBe(1);

    const { duration } = toolLogs[0];
    expect(duration).not.toBeNaN();
    expect(duration).not.toBeUndefined();
    expect(duration).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(duration)).toBe(true);
  });

  it("debug-level log emitted before handler invocation with toolName and args", async () => {
    const logCapture = createLogCapture();
    const testLogger = pino(
      { level: "trace" },
      logCapture.stream,
    );

    const mockHandler = async (args: { query: string }) => ({
      results: [`found: ${args.query}`],
    });
    const wrappedHandler = wrapToolHandler("search_pages", mockHandler);

    await requestContext.run(
      {
        correlationId: "test-debug-id",
        userId: "user-oid-debug",
        username: "debuguser@example.com",
        log: testLogger as unknown as FastifyBaseLogger,
      },
      async () => {
        await wrappedHandler({ query: "test" });
      },
    );

    // Wait for stream to flush
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Find debug-level (20) log with tool args
    const debugLogs = logCapture.logs.filter(
      (l) => l.level === 20 && l.toolName === "search_pages",
    );
    expect(debugLogs.length).toBe(1);

    const debugLog = debugLogs[0];
    expect(debugLog.toolName).toBe("search_pages");
    expect(debugLog.args).toEqual({ query: "test" });
    expect(debugLog.msg).toBe("Tool request: search_pages");

    // Debug log should appear BEFORE info log (check array index ordering)
    const allToolLogs = logCapture.logs.filter(
      (l) => l.toolName === "search_pages",
    );
    const debugIndex = allToolLogs.findIndex((l) => l.level === 20);
    const infoIndex = allToolLogs.findIndex((l) => l.level === 30);
    expect(debugIndex).toBeLessThan(infoIndex);
  });

  it("user identity in tool logs matches the authenticated user", async () => {
    const logCapture = createLogCapture();
    const testLogger = pino(
      { level: "trace" },
      logCapture.stream,
    );

    const handler = async () => ({ data: "test" });
    const wrappedHandler = wrapToolHandler("identity_tool", handler);

    const testUserId = "specific-oid-value";
    const testUsername = "specific-user@contoso.com";

    await requestContext.run(
      {
        correlationId: "test-id-4",
        userId: testUserId,
        username: testUsername,
        log: testLogger as unknown as FastifyBaseLogger,
      },
      async () => {
        await wrappedHandler({});
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    const toolLogs = logCapture.logs.filter(
      (l) => l.level === 30 && l.toolName === "identity_tool",
    );
    expect(toolLogs.length).toBe(1);
    expect(toolLogs[0].userId).toBe(testUserId);
    expect(toolLogs[0].username).toBe(testUsername);
  });
});

// ---------------------------------------------------------------------------
// Tool observability integration tests
// ---------------------------------------------------------------------------

describe("Tool observability integration", () => {
  let app: FastifyInstance;
  let logCapture: ReturnType<typeof createLogCapture>;
  let validToken: string;

  beforeAll(async () => {
    validToken = await createTestToken();
    logCapture = createLogCapture();
    app = await buildTestApp(undefined, undefined, {
      logger: { level: "trace", stream: logCapture.stream },
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    logCapture.logs.length = 0;
  });

  /**
   * Helper: sends an MCP initialize request followed by a tools/call request.
   * Each tools/call goes through a fresh McpServer+transport (stateless mode),
   * so each test needs its own initialize + tools/call sequence.
   */
  async function callTool(
    toolName: string,
    toolArgs: Record<string, unknown>,
  ) {
    // Initialize MCP session
    await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        authorization: `Bearer ${validToken}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0.0" },
        },
      },
    });

    // Clear logs so only tool invocation logs are asserted
    logCapture.logs.length = 0;

    // Call the tool
    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        authorization: `Bearer ${validToken}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      payload: {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: toolName,
          arguments: toolArgs,
        },
      },
    });

    // Wait for pino stream flush
    await new Promise((resolve) => setTimeout(resolve, 50));

    return res;
  }

  it("get_page: logs toolName, duration, userId, username at info level", async () => {
    await callTool("get_page", { id: 1 });

    const infoLogs = logCapture.logs.filter(
      (l) => l.level === 30 && l.toolName === "get_page",
    );
    expect(infoLogs.length).toBe(1);

    const log = infoLogs[0];
    expect(log.toolName).toBe("get_page");
    expect(typeof log.duration).toBe("number");
    expect(log.duration).toBeGreaterThanOrEqual(0);
    expect(log.userId).toBeDefined();
    expect(log.username).toBeDefined();
  });

  it("search_pages: logs toolName, duration, userId, username at info level", async () => {
    await callTool("search_pages", { query: "test" });

    const infoLogs = logCapture.logs.filter(
      (l) => l.level === 30 && l.toolName === "search_pages",
    );
    expect(infoLogs.length).toBe(1);

    const log = infoLogs[0];
    expect(log.toolName).toBe("search_pages");
    expect(typeof log.duration).toBe("number");
    expect(log.duration).toBeGreaterThanOrEqual(0);
    expect(log.userId).toBeDefined();
    expect(log.username).toBeDefined();
  });

  it("list_pages: logs toolName, duration, userId, username at info level (zero-arg tool)", async () => {
    await callTool("list_pages", {});

    const infoLogs = logCapture.logs.filter(
      (l) => l.level === 30 && l.toolName === "list_pages",
    );
    expect(infoLogs.length).toBe(1);

    const log = infoLogs[0];
    expect(log.toolName).toBe("list_pages");
    expect(typeof log.duration).toBe("number");
    expect(log.duration).toBeGreaterThanOrEqual(0);
    expect(log.userId).toBeDefined();
    expect(log.username).toBeDefined();
  });
});
