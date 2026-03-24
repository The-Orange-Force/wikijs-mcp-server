/**
 * Integration tests for route protection.
 *
 * Tests that MCP routes (POST /mcp, GET /mcp) require valid Bearer tokens
 * while public routes (GET /, GET /health, GET /.well-known/...) work without
 * authentication. Also verifies correlation ID propagation via X-Request-ID
 * headers and auth failure logging at warn level.
 *
 * Uses Fastify's inject() for integration testing without starting a real
 * server or connecting to Azure AD.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { Writable } from "node:stream";
import {
  buildTestApp,
} from "./helpers/build-test-app.js";
import {
  createTestToken,
  createExpiredToken,
} from "../src/auth/__tests__/helpers.js";
import { UUID_REGEX } from "../src/logging.js";

// ---------------------------------------------------------------------------
// Log capture helper
// ---------------------------------------------------------------------------

interface LogEntry {
  level: number;
  msg: string;
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
// App setup with log capture
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Route protection
// ---------------------------------------------------------------------------

describe("Route protection", () => {
  it("POST /mcp without token returns 401 with WWW-Authenticate and error body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/mcp",
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

    expect(res.statusCode).toBe(401);
    expect(res.headers["www-authenticate"]).toBeDefined();
    expect(res.headers["www-authenticate"]).toContain("Bearer");

    const body = res.json();
    expect(body.error).toBeDefined();
    expect(body.error_description).toBeDefined();
    expect(body.correlation_id).toBeDefined();
    expect(body.correlation_id).toBe(res.headers["x-request-id"]);
  });

  it("POST /mcp with 'Bearer invalid' returns 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        authorization: "Bearer invalid-token-value",
      },
      payload: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.correlation_id).toBe(res.headers["x-request-id"]);
  });

  it("GET /mcp without token returns 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/mcp",
    });

    expect(res.statusCode).toBe(401);
    expect(res.headers["www-authenticate"]).toBeDefined();
    const body = res.json();
    expect(body.correlation_id).toBe(res.headers["x-request-id"]);
  });

  it("GET /health without token returns 200", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(res.statusCode).toBe(200);
  });

  it("GET /.well-known/oauth-protected-resource without token returns 200", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-protected-resource",
    });

    expect(res.statusCode).toBe(200);
  });

  it("GET / without token returns 200 with auth_required and protected_resource_metadata", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.auth_required).toBe(true);
    expect(body.protected_resource_metadata).toBeDefined();
    expect(body.protected_resource_metadata).toContain(
      ".well-known/oauth-protected-resource",
    );
  });
});

// ---------------------------------------------------------------------------
// Correlation ID
// ---------------------------------------------------------------------------

describe("Correlation ID", () => {
  it("any request returns X-Request-ID header with UUID", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(res.headers["x-request-id"]).toBeDefined();
    expect(UUID_REGEX.test(res.headers["x-request-id"] as string)).toBe(true);
  });

  it("request with valid UUID X-Request-ID echoes it back", async () => {
    const clientId = "12345678-1234-1234-1234-123456789abc";
    const res = await app.inject({
      method: "GET",
      url: "/health",
      headers: { "x-request-id": clientId },
    });

    expect(res.headers["x-request-id"]).toBe(clientId);
  });

  it("request with invalid X-Request-ID replaces with server-generated UUID", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/health",
      headers: { "x-request-id": "not-a-uuid" },
    });

    const responseId = res.headers["x-request-id"] as string;
    expect(responseId).not.toBe("not-a-uuid");
    expect(UUID_REGEX.test(responseId)).toBe(true);
  });

  it("401 error response includes X-Request-ID header", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      payload: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    });

    expect(res.statusCode).toBe(401);
    expect(res.headers["x-request-id"]).toBeDefined();
    expect(UUID_REGEX.test(res.headers["x-request-id"] as string)).toBe(true);
    const body = res.json();
    expect(body.correlation_id).toBeDefined();
    expect(body.correlation_id).toBe(res.headers["x-request-id"]);
  });

  it("404 response includes X-Request-ID header", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/nonexistent",
    });

    expect(res.statusCode).toBe(404);
    expect(res.headers["x-request-id"]).toBeDefined();
    expect(UUID_REGEX.test(res.headers["x-request-id"] as string)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Auth logging
// ---------------------------------------------------------------------------

describe("Auth logging", () => {
  it("auth rejection is logged at warn level (level 40)", async () => {
    logCapture.logs.length = 0; // Clear logs

    await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        authorization: "Bearer invalid-token",
      },
      payload: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    });

    // Pino warn level = 40
    const warnLogs = logCapture.logs.filter((l) => l.level === 40);
    expect(warnLogs.length).toBeGreaterThan(0);
    // Verify it is about JWT validation failure
    const authWarnLog = warnLogs.find(
      (l) =>
        (l.msg as string).includes("JWT validation failed") ||
        (l.error as string) !== undefined,
    );
    expect(authWarnLog).toBeDefined();
  });

  it("successful auth logs at info level with oid", async () => {
    logCapture.logs.length = 0;

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

    // Pino info level = 30
    const infoLogs = logCapture.logs.filter((l) => l.level === 30);
    const authSuccessLog = infoLogs.find(
      (l) => (l.msg as string).includes("JWT validated") && l.oid !== undefined,
    );
    expect(authSuccessLog).toBeDefined();
  });
});
