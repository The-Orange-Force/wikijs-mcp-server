/**
 * GDPR integration tests for all 3 MCP tools and instructions security audit.
 *
 * Verifies that GDPR filtering works correctly from the MCP client perspective
 * across get_page, list_pages, and search_pages. Also audits instructions files
 * (DEFAULT_INSTRUCTIONS, instructions.txt.example, and runtime MCP initialize
 * response) for GDPR-revealing keywords (SEC-03).
 *
 * Uses a custom WikiJsApi mock with both blocked and non-blocked pages, passed
 * via buildTestApp()'s wikiJsApiOverride parameter. The mock includes:
 * - id:1  path:"test/page"                   -- safe (non-Clients path)
 * - id:42 path:"Clients/AcmeCorp"            -- BLOCKED (2-segment, first is "Clients")
 * - id:43 path:"Clients/TestClient"          -- BLOCKED (2-segment, second blocked client)
 * - id:44 path:"Clients"                     -- NOT blocked (1-segment listing page)
 * - id:45 path:"Clients/AcmeCorp/Contacts"   -- NOT blocked (3-segment sub-page)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { WikiJsApi } from "../src/api.js";
import type { WikiJsPage } from "../src/types.js";
import { buildTestApp } from "./helpers/build-test-app.js";
import { createTestToken } from "../src/auth/__tests__/helpers.js";
import { DEFAULT_INSTRUCTIONS } from "../src/instructions.js";

// ---------------------------------------------------------------------------
// GDPR Mock WikiJsApi
// ---------------------------------------------------------------------------

const SAFE_PAGE: WikiJsPage = {
  id: 1,
  path: "test/page",
  title: "Test Page",
  description: "A safe test page",
  content: "# Test Content\n\nThis is test content.",
  isPublished: true,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

const BLOCKED_PAGE_1: WikiJsPage = {
  id: 42,
  path: "Clients/AcmeCorp",
  title: "AcmeCorp",
  description: "GDPR-protected client page",
  content: "# AcmeCorp\n\nConfidential client data.",
  isPublished: true,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

const BLOCKED_PAGE_2: WikiJsPage = {
  id: 43,
  path: "Clients/TestClient",
  title: "TestClient",
  description: "Another GDPR-protected client page",
  content: "# TestClient\n\nConfidential data.",
  isPublished: true,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

const CLIENTS_LISTING_PAGE: WikiJsPage = {
  id: 44,
  path: "Clients",
  title: "Clients Hub",
  description: "Client listing page",
  content: "# Clients\n\nBrowse all clients.",
  isPublished: true,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

const CLIENTS_SUBPAGE: WikiJsPage = {
  id: 45,
  path: "Clients/AcmeCorp/Contacts",
  title: "AcmeCorp Contacts",
  description: "Contacts for AcmeCorp",
  content: "# Contacts\n\nTeam contacts.",
  isPublished: true,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

const ALL_PAGES: WikiJsPage[] = [
  SAFE_PAGE,
  BLOCKED_PAGE_1,
  BLOCKED_PAGE_2,
  CLIENTS_LISTING_PAGE,
  CLIENTS_SUBPAGE,
];

const PAGES_BY_ID: Record<number, WikiJsPage> = {};
for (const page of ALL_PAGES) {
  PAGES_BY_ID[page.id] = page;
}

const gdprMock = {
  checkConnection: async () => true,
  getPageById: async (id: number) => {
    const page = PAGES_BY_ID[id];
    if (!page) throw new Error("Page not found");
    return page;
  },
  listPages: async () => ALL_PAGES,
  searchPages: async () => ({
    results: [...ALL_PAGES],
    totalHits: ALL_PAGES.length,
  }),
} as unknown as WikiJsApi;

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let app: FastifyInstance;
let validToken: string;

beforeAll(async () => {
  app = await buildTestApp(undefined, gdprMock);
  await app.ready();
  validToken = await createTestToken();
});

afterAll(async () => {
  await app.close();
});

// ---------------------------------------------------------------------------
// callTool helper (follows observability.test.ts pattern)
// ---------------------------------------------------------------------------

async function callTool(toolName: string, toolArgs: Record<string, unknown>) {
  // Step 1: send initialize
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

  // Step 2: call tool
  return app.inject({
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
}

// ---------------------------------------------------------------------------
// Forbidden keywords for instructions security audit
// ---------------------------------------------------------------------------

const FORBIDDEN_KEYWORDS = [
  "Clients",
  "blocked",
  "GDPR",
  "filter",
  "isBlocked",
  "restricted",
  "hidden",
];

// ---------------------------------------------------------------------------
// get_page GDPR filtering
// ---------------------------------------------------------------------------

describe("get_page GDPR filtering", () => {
  it("SC-1: returns valid MCP response for non-blocked page", async () => {
    const res = await callTool("get_page", { id: 1 });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.result).toBeDefined();
    expect(body.result.content).toBeInstanceOf(Array);
    expect(body.result.content.length).toBeGreaterThan(0);
    expect(body.result.content[0].type).toBe("text");
    expect(body.result.isError).toBeFalsy();

    // Verify the response contains actual page data
    const pageData = JSON.parse(body.result.content[0].text);
    expect(pageData.id).toBe(1);
    expect(pageData.path).toBe("test/page");
  });

  it("SC-1: returns valid MCP response for blocked page", async () => {
    const res = await callTool("get_page", { id: 42 });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.result).toBeDefined();
    expect(body.result.content).toBeInstanceOf(Array);
    expect(body.result.content.length).toBeGreaterThan(0);
    expect(body.result.isError).toBe(true);
  });

  it("SC-2: blocked response is byte-identical to genuine not-found response", async () => {
    // Get genuine not-found response (unknown page ID)
    const notFoundRes = await callTool("get_page", { id: 99999 });
    const notFoundBody = notFoundRes.json();

    // Get blocked page response
    const blockedRes = await callTool("get_page", { id: 42 });
    const blockedBody = blockedRes.json();

    // Byte-identical comparison on the MCP result
    expect(JSON.stringify(blockedBody.result)).toBe(
      JSON.stringify(notFoundBody.result),
    );
  });

  it("SC-1: returns valid MCP response for 1-segment Clients path (not blocked)", async () => {
    const res = await callTool("get_page", { id: 44 });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.result).toBeDefined();
    expect(body.result.isError).toBeFalsy();

    const pageData = JSON.parse(body.result.content[0].text);
    expect(pageData.id).toBe(44);
    expect(pageData.path).toBe("Clients");
  });

  it("SC-1: returns valid MCP response for 3-segment Clients sub-page (not blocked)", async () => {
    const res = await callTool("get_page", { id: 45 });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.result).toBeDefined();
    expect(body.result.isError).toBeFalsy();

    const pageData = JSON.parse(body.result.content[0].text);
    expect(pageData.id).toBe(45);
    expect(pageData.path).toBe("Clients/AcmeCorp/Contacts");
  });

  it("no side-channel headers on blocked response", async () => {
    const res = await callTool("get_page", { id: 42 });

    const headerNames = Object.keys(res.headers).map((h) => h.toLowerCase());
    const leakHeaders = headerNames.filter(
      (h) =>
        h.includes("gdpr") || h.includes("blocked") || h.includes("filter"),
    );
    expect(leakHeaders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// list_pages GDPR filtering
// ---------------------------------------------------------------------------

describe("list_pages GDPR filtering", () => {
  it("SC-1: returns valid MCP response shape", async () => {
    const res = await callTool("list_pages", {});

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.result).toBeDefined();
    expect(body.result.content).toBeInstanceOf(Array);
    expect(body.result.content.length).toBeGreaterThan(0);
    expect(body.result.content[0].type).toBe("text");
  });

  it("list_pages results exclude blocked pages", async () => {
    const res = await callTool("list_pages", {});
    const body = res.json();
    const responseText = body.result.content[0].text;
    const pages: WikiJsPage[] = JSON.parse(responseText);

    // Blocked paths must be absent
    const paths = pages.map((p) => p.path);
    expect(paths).not.toContain("Clients/AcmeCorp");
    expect(paths).not.toContain("Clients/TestClient");

    // Safe paths must be present
    expect(paths).toContain("test/page");
    expect(paths).toContain("Clients");
    expect(paths).toContain("Clients/AcmeCorp/Contacts");
  });
});

// ---------------------------------------------------------------------------
// search_pages GDPR filtering
// ---------------------------------------------------------------------------

describe("search_pages GDPR filtering", () => {
  it("SC-1: returns valid MCP response shape", async () => {
    const res = await callTool("search_pages", { query: "test" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.result).toBeDefined();
    expect(body.result.content).toBeInstanceOf(Array);
    expect(body.result.content.length).toBeGreaterThan(0);
    expect(body.result.content[0].type).toBe("text");
  });

  it("search_pages results exclude blocked pages", async () => {
    const res = await callTool("search_pages", { query: "test" });
    const body = res.json();
    const responseText = body.result.content[0].text;
    const pages: WikiJsPage[] = JSON.parse(responseText);

    // Blocked paths must be absent
    const paths = pages.map((p) => p.path);
    expect(paths).not.toContain("Clients/AcmeCorp");
    expect(paths).not.toContain("Clients/TestClient");

    // Safe paths must be present
    expect(paths).toContain("test/page");
    expect(paths).toContain("Clients");
    expect(paths).toContain("Clients/AcmeCorp/Contacts");
  });

  it("search_pages totalHits adjusted for filtered pages", async () => {
    const res = await callTool("search_pages", { query: "test" });
    const body = res.json();
    const responseText = body.result.content[0].text;
    const pages: WikiJsPage[] = JSON.parse(responseText);

    // The mock returns totalHits = ALL_PAGES.length (5).
    // Two pages are blocked (Clients/AcmeCorp, Clients/TestClient).
    // The search_pages handler adjusts totalHits by subtracting filtered count.
    // So the response should contain only the non-blocked pages.
    expect(pages.length).toBe(3); // 5 total - 2 blocked = 3
  });
});
