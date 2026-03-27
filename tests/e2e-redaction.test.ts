/**
 * End-to-end verification of the complete v2.6 system.
 *
 * Tests the combined output of:
 *  - Phase 25: marker-based GDPR content redaction
 *  - Phase 26: page URL injection in get_page responses
 *  - Phase 27: path-based filter removal (all published pages accessible)
 *
 * Uses Fastify inject (no HTTP listener) with mock WikiJsApi for isolation.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp } from "./helpers/build-test-app.js";
import { WikiJsApi } from "../src/api.js";
import { createTestToken } from "../src/auth/__tests__/helpers.js";
import type { WikiJsPage } from "../src/types.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const PAGE_WITH_MARKERS: WikiJsPage = {
  id: 1,
  path: "docs/team-info",
  title: "Team Info",
  description: "Team page with PII",
  content:
    "# Team\n\nPublic info.\n\n<!-- gdpr-start -->\nJohn Doe: john@example.com\n<!-- gdpr-end -->\n\nMore public info.",
  isPublished: true,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

const PAGE_WITHOUT_MARKERS: WikiJsPage = {
  id: 2,
  path: "docs/getting-started",
  title: "Getting Started",
  description: "Documentation",
  content: "# Getting Started\n\nWelcome to the wiki.",
  isPublished: true,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

const FORMERLY_BLOCKED_PAGE: WikiJsPage = {
  id: 42,
  path: "Clients/AcmeCorp",
  title: "AcmeCorp",
  description: "Client page",
  content: "# AcmeCorp\n\nClient details.",
  isPublished: true,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

const PAGE_WITH_MALFORMED_MARKER: WikiJsPage = {
  id: 3,
  path: "docs/incomplete",
  title: "Incomplete Page",
  description: "Page with unclosed marker",
  content:
    "# Notes\n\nPublic part.\n\n<!-- gdpr-start -->\nSensitive data without end marker",
  isPublished: true,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

const ALL_PAGES = [
  PAGE_WITH_MARKERS,
  PAGE_WITHOUT_MARKERS,
  FORMERLY_BLOCKED_PAGE,
  PAGE_WITH_MALFORMED_MARKER,
];

// ---------------------------------------------------------------------------
// Mock WikiJsApi
// ---------------------------------------------------------------------------

const mockApi = {
  checkConnection: async () => true,
  getPageById: async (id: number) => {
    const page = ALL_PAGES.find((p) => p.id === id);
    if (!page) throw new Error("Page not found");
    return { ...page }; // shallow copy to avoid mutation
  },
  listPages: async () => ALL_PAGES.map((p) => ({ ...p })),
  searchPages: async (query: string) => ({
    results: ALL_PAGES.filter(
      (p) =>
        p.title.toLowerCase().includes(query.toLowerCase()) ||
        p.path.toLowerCase().includes(query.toLowerCase()),
    ).map((p) => ({ ...p })),
    totalHits: ALL_PAGES.length,
  }),
} as unknown as WikiJsApi;

// ---------------------------------------------------------------------------
// Helper: initialize + tools/call via Fastify inject
// ---------------------------------------------------------------------------

async function callTool(
  app: FastifyInstance,
  token: string,
  toolName: string,
  toolArgs: Record<string, unknown>,
) {
  // Step 1: initialize (required before any tool call)
  await app.inject({
    method: "POST",
    url: "/mcp",
    headers: {
      authorization: `Bearer ${token}`,
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

  // Step 2: call tool
  return app.inject({
    method: "POST",
    url: "/mcp",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    payload: {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: toolName, arguments: toolArgs },
    },
  });
}

// ---------------------------------------------------------------------------
// E2E test suite
// ---------------------------------------------------------------------------

describe("E2E: v2.6 redaction and filter removal", () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await buildTestApp(undefined, mockApi);
    await app.ready();
    token = await createTestToken();
  });

  afterAll(async () => {
    await app.close();
  });

  // -------------------------------------------------------------------------
  // Scenario 1: get_page with GDPR markers returns redacted content and URL
  // -------------------------------------------------------------------------

  it("get_page with GDPR markers returns redacted content and URL", async () => {
    const res = await callTool(app, token, "get_page", { id: 1 });
    expect(res.statusCode).toBe(200);

    const data = res.json();
    expect(data.result).toBeDefined();
    expect(data.result.content).toBeDefined();
    expect(data.result.content[0].type).toBe("text");

    const parsed = JSON.parse(data.result.content[0].text);

    // PII must be redacted
    expect(parsed.content).not.toContain("John Doe");
    expect(parsed.content).not.toContain("john@example.com");

    // Redaction placeholder must be present (partial match for resilience)
    expect(parsed.content).toContain("[");
    expect(parsed.content).toMatch(/PII redacted/i);

    // Public content must be preserved
    expect(parsed.content).toContain("Public info.");
    expect(parsed.content).toContain("More public info.");

    // URL must be present (Phase 26)
    expect(typeof parsed.url).toBe("string");
    expect(parsed.url).toContain("docs/team-info");
  });

  // -------------------------------------------------------------------------
  // Scenario 2: get_page without GDPR markers returns full content and URL
  // -------------------------------------------------------------------------

  it("get_page without GDPR markers returns full content and URL", async () => {
    const res = await callTool(app, token, "get_page", { id: 2 });
    expect(res.statusCode).toBe(200);

    const data = res.json();
    const parsed = JSON.parse(data.result.content[0].text);

    // Full content unchanged
    expect(parsed.content).toContain("Welcome to the wiki.");

    // No redaction placeholder
    expect(parsed.content).not.toContain("redacted");

    // URL must be present (Phase 26)
    expect(typeof parsed.url).toBe("string");
    expect(parsed.url.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Scenario 3: formerly-blocked paths accessible via all 3 tools
  // -------------------------------------------------------------------------

  describe("formerly-blocked paths accessible via all 3 tools", () => {
    it("get_page returns Clients/AcmeCorp without error", async () => {
      const res = await callTool(app, token, "get_page", { id: 42 });
      expect(res.statusCode).toBe(200);

      const data = res.json();
      // Must NOT be an error response
      expect(data.result.isError).toBeUndefined();

      const parsed = JSON.parse(data.result.content[0].text);
      expect(parsed.title).toBe("AcmeCorp");
      expect(parsed.content).toContain("AcmeCorp");
      expect(parsed.content).toContain("Client details.");
    });

    it("list_pages includes Clients/AcmeCorp", async () => {
      const res = await callTool(app, token, "list_pages", {});
      expect(res.statusCode).toBe(200);

      const data = res.json();
      const pages = JSON.parse(data.result.content[0].text);
      expect(Array.isArray(pages)).toBe(true);

      const clientPage = pages.find(
        (p: { path: string }) => p.path === "Clients/AcmeCorp",
      );
      expect(clientPage).toBeDefined();
      expect(clientPage.title).toBe("AcmeCorp");
    });

    it("search_pages finds Clients/AcmeCorp", async () => {
      const res = await callTool(app, token, "search_pages", {
        query: "AcmeCorp",
      });
      expect(res.statusCode).toBe(200);

      const data = res.json();
      const results = JSON.parse(data.result.content[0].text);
      expect(Array.isArray(results)).toBe(true);

      const clientPage = results.find(
        (p: { path: string }) => p.path === "Clients/AcmeCorp",
      );
      expect(clientPage).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 4: malformed marker fail-safe redacts to end of content
  // -------------------------------------------------------------------------

  it("malformed marker fail-safe redacts to end of content", async () => {
    const res = await callTool(app, token, "get_page", { id: 3 });
    expect(res.statusCode).toBe(200);

    const data = res.json();
    const parsed = JSON.parse(data.result.content[0].text);

    // Content before the unclosed marker must be preserved
    expect(parsed.content).toContain("Public part.");

    // Sensitive content after unclosed marker must be redacted
    expect(parsed.content).not.toContain(
      "Sensitive data without end marker",
    );

    // Some form of redaction placeholder must be present
    expect(parsed.content).toMatch(/redacted/i);
  });
});
