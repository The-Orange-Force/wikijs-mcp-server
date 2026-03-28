/**
 * Dedicated metadata fallback test suite covering the full test matrix:
 * deduplication, unpublished filtering, limit enforcement, case-insensitivity,
 * zero-results-to-fallback, data sharing, negative (enough results), totalHits
 * adjustment, observability logging (both paths + negative), and tool description.
 *
 * Requirement coverage:
 *   META-02 (case), META-03 (dedup), META-04 (unpublished), META-05 (limit),
 *   META-06 (totalHits), INTG-01 (data sharing), INTG-02 (zero-result),
 *   OBSV-01 (observability logs), TOOL-01 (description keywords)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import pino from "pino";
import { Writable } from "node:stream";
import fs from "node:fs";
import path from "node:path";
import { requestContext } from "../src/request-context.js";
import type { FastifyBaseLogger } from "fastify";

// ---------------------------------------------------------------------------
// Mock graphql-request (must be BEFORE WikiJsApi import -- hoisting)
// ---------------------------------------------------------------------------

const mockRequest = vi.fn();

vi.mock("graphql-request", () => {
  return {
    GraphQLClient: class MockGraphQLClient {
      request = mockRequest;
      constructor() {
        // No-op constructor
      }
    },
  };
});

import { WikiJsApi } from "../src/api.js";

// ---------------------------------------------------------------------------
// Log capture helper
// ---------------------------------------------------------------------------

interface LogEntry {
  level: number;
  msg: string;
  query?: string;
  metadataHits?: number;
  totalResolved?: number;
  [key: string]: unknown;
}

function createLogCapture(): { logs: LogEntry[]; stream: Writable } {
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
// Reusable page fixtures
// ---------------------------------------------------------------------------

const publishedPage1 = {
  id: 1,
  path: "clients/COA",
  title: "COA Client Page",
  description: "Client overview for COA",
  isPublished: true,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-06-01T00:00:00Z",
};

const publishedPage2 = {
  id: 2,
  path: "docs/getting-started",
  title: "Getting Started Guide",
  description: "How to get started",
  isPublished: true,
  createdAt: "2024-02-01T00:00:00Z",
  updatedAt: "2024-05-15T00:00:00Z",
};

const publishedPage3 = {
  id: 3,
  path: "projects/coa-migration",
  title: "Migration Plan",
  description: "COA migration details",
  isPublished: true,
  createdAt: "2024-03-01T00:00:00Z",
  updatedAt: "2024-04-20T00:00:00Z",
};

const unpublishedPage = {
  id: 4,
  path: "drafts/coa-draft",
  title: "COA Draft",
  description: "Unpublished COA page",
  isPublished: false,
  createdAt: "2024-04-01T00:00:00Z",
  updatedAt: "2024-06-10T00:00:00Z",
};

const publishedPage4 = {
  id: 5,
  path: "clients/dsm",
  title: "DSM Client Page",
  description: "Client overview for DSM",
  isPublished: true,
  createdAt: "2024-01-15T00:00:00Z",
  updatedAt: "2024-06-05T00:00:00Z",
};

const allTestPages = [publishedPage1, publishedPage2, publishedPage3, unpublishedPage, publishedPage4];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns an empty GraphQL search response (zero results). */
function emptySearchResponse() {
  return { pages: { search: { results: [], totalHits: 0, suggestions: [] } } };
}

/** Returns a pages.list response containing the given pages. */
function pagesListResponse(pages: typeof allTestPages) {
  return { pages: { list: pages } };
}

/** Returns a GraphQL search response with the given raw results. */
function searchResponse(results: Array<{ id: string; path: string; title: string; description: string; locale: string }>, totalHits?: number) {
  return {
    pages: {
      search: {
        results,
        totalHits: totalHits ?? results.length,
        suggestions: [],
      },
    },
  };
}

/** Returns a singleByPath response. */
function singleByPathResponse(page: typeof publishedPage1) {
  return { pages: { singleByPath: page } };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("Metadata fallback search", () => {
  let api: WikiJsApi;

  beforeEach(() => {
    mockRequest.mockReset();
    api = new WikiJsApi("http://localhost:3000", "test-token");
  });

  it("deduplicates pages present in both GraphQL and metadata results", async () => {
    // GraphQL search returns page1 via singleByPath
    // Then metadata fallback also matches page1 (by title "COA")
    // Final results should not contain page1 twice

    // Step 1: search returns 1 result for "coa"
    mockRequest.mockResolvedValueOnce(
      searchResponse([{ id: "s1", path: "clients/COA", title: "COA Client Page", description: "Client overview", locale: "en" }])
    );
    // Step 2: singleByPath succeeds for page1
    mockRequest.mockResolvedValueOnce(singleByPathResponse(publishedPage1));
    // Step 4: metadata fallback -- resolved.length (1) < limit (10)
    // searchPagesByMetadata receives allPages=undefined (no unresolved in step 3)
    // but allPages is undefined only when unresolved.length > 0. Since singleByPath succeeded, allPages stays undefined.
    // In step 4, allPages is passed as the 4th argument. Since no step 3 ran, allPages = undefined.
    // So searchPagesByMetadata will call pages.list itself.
    mockRequest.mockResolvedValueOnce(pagesListResponse(allTestPages));

    const result = await api.searchPages("coa", 10);

    // page1 (id:1) should appear only once despite matching in both GraphQL and metadata
    const page1Occurrences = result.results.filter(r => r.id === 1);
    expect(page1Occurrences).toHaveLength(1);
  });

  it("excludes unpublished pages from metadata results", async () => {
    // Zero GraphQL results -> metadata fallback with "coa" query
    // allTestPages includes unpublished page (id:4)
    mockRequest.mockResolvedValueOnce(emptySearchResponse());
    mockRequest.mockResolvedValueOnce(pagesListResponse(allTestPages));

    const result = await api.searchPages("coa", 10);

    // Unpublished page should not be in results
    const unpublishedIds = result.results.filter(r => r.id === 4);
    expect(unpublishedIds).toHaveLength(0);
    // But published COA pages should be present
    expect(result.results.length).toBeGreaterThan(0);
  });

  it("caps total results at the requested limit", async () => {
    // Zero GraphQL results, metadata has 3 COA matches (page1, page3 title match, unpublished excluded)
    // Request limit = 1
    mockRequest.mockResolvedValueOnce(emptySearchResponse());
    mockRequest.mockResolvedValueOnce(pagesListResponse(allTestPages));

    const result = await api.searchPages("coa", 1);

    expect(result.results.length).toBeLessThanOrEqual(1);
  });

  it("matches case-insensitively -- 'coa' finds path '/clients/COA'", async () => {
    // Zero GraphQL results, search "coa" (lowercase) should match path "clients/COA" (uppercase)
    mockRequest.mockResolvedValueOnce(emptySearchResponse());
    mockRequest.mockResolvedValueOnce(pagesListResponse(allTestPages));

    const result = await api.searchPages("coa", 10);

    const coaPage = result.results.find(r => r.path === "clients/COA");
    expect(coaPage).toBeDefined();
  });

  it("falls back to metadata when GraphQL returns zero results", async () => {
    // Zero GraphQL results -> metadata fallback triggers
    mockRequest.mockResolvedValueOnce(emptySearchResponse());
    mockRequest.mockResolvedValueOnce(pagesListResponse(allTestPages));

    const result = await api.searchPages("coa", 10);

    // Should have found COA pages via metadata
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results.some(r => r.title.toLowerCase().includes("coa") || r.path.toLowerCase().includes("coa"))).toBe(true);
  });

  it("shares pages.list data between resolveViaPagesList and searchPagesByMetadata (single call)", async () => {
    // Setup: GraphQL search returns 1 result, singleByPath FAILS -> resolveViaPagesList called
    // Then metadata fallback also needs pages -> should reuse allPages from resolveViaPagesList
    mockRequest.mockResolvedValueOnce(
      searchResponse([{ id: "s1", path: "clients/COA", title: "COA Client Page", description: "desc", locale: "en" }])
    );
    // Step 2: singleByPath FAILS
    mockRequest.mockRejectedValueOnce(new Error("Permission denied"));
    // Step 3: resolveViaPagesList -- pages.list call
    mockRequest.mockResolvedValueOnce(pagesListResponse(allTestPages));
    // Step 4: metadata fallback should NOT make another pages.list call (allPages passed through)

    await api.searchPages("coa", 10);

    // Count pages.list calls (calls containing "list" with limit 500)
    // Call 1: search query, Call 2: singleByPath (rejected), Call 3: pages.list
    // If data sharing works, there should be exactly 3 total calls (no 4th pages.list)
    expect(mockRequest).toHaveBeenCalledTimes(3);
  });

  it("skips metadata fallback when GraphQL returns enough results", async () => {
    // GraphQL search returns 2 results, limit is 2
    // Both resolve via singleByPath -> resolved.length === limit -> no metadata fallback
    mockRequest.mockResolvedValueOnce(
      searchResponse([
        { id: "s1", path: "clients/COA", title: "COA Client Page", description: "desc", locale: "en" },
        { id: "s2", path: "docs/getting-started", title: "Getting Started Guide", description: "desc", locale: "en" },
      ], 2)
    );
    // singleByPath succeeds for both
    mockRequest.mockResolvedValueOnce(singleByPathResponse(publishedPage1));
    mockRequest.mockResolvedValueOnce(singleByPathResponse(publishedPage2));

    const result = await api.searchPages("test", 2);

    // Should have exactly 2 results
    expect(result.results).toHaveLength(2);
    // Only 3 calls: search + 2 singleByPath. NO pages.list call.
    expect(mockRequest).toHaveBeenCalledTimes(3);
  });

  it("adjusts totalHits to Math.max of original and merged count", async () => {
    // Zero GraphQL results (totalHits = 0), metadata finds 2 pages
    mockRequest.mockResolvedValueOnce(emptySearchResponse());
    mockRequest.mockResolvedValueOnce(pagesListResponse(allTestPages));

    const result = await api.searchPages("coa", 10);

    // totalHits should be at least the number of results found
    expect(result.totalHits).toBe(Math.max(0, result.results.length));
    expect(result.totalHits).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Observability tests
// ---------------------------------------------------------------------------

describe("Metadata fallback observability", () => {
  let api: WikiJsApi;

  beforeEach(() => {
    mockRequest.mockReset();
    api = new WikiJsApi("http://localhost:3000", "test-token");
  });

  it("emits info log with query, metadataHits, totalResolved on zero-result path", async () => {
    const logCapture = createLogCapture();
    const testLogger = pino({ level: "trace" }, logCapture.stream);

    mockRequest.mockResolvedValueOnce(emptySearchResponse());
    mockRequest.mockResolvedValueOnce(pagesListResponse(allTestPages));

    await requestContext.run(
      { correlationId: "test-id-zero", userId: "test-user", username: "test@example.com", log: testLogger as unknown as FastifyBaseLogger },
      async () => { await api.searchPages("coa", 10); }
    );
    await new Promise(resolve => setTimeout(resolve, 50));

    const infoLogs = logCapture.logs.filter(l => l.level === 30 && l.msg === "Metadata fallback supplemented search results");
    expect(infoLogs).toHaveLength(1);
    expect(infoLogs[0]).toMatchObject({
      query: "coa",
      metadataHits: expect.any(Number),
      totalResolved: expect.any(Number),
    });
    expect(infoLogs[0].metadataHits).toBeGreaterThan(0);
  });

  it("emits info log on under-limit path when metadata adds results", async () => {
    const logCapture = createLogCapture();
    const testLogger = pino({ level: "trace" }, logCapture.stream);

    // GraphQL returns 1 result (singleByPath fails -> resolveViaPagesList resolves it)
    // Then metadata fallback adds more results on under-limit path
    mockRequest.mockResolvedValueOnce(
      searchResponse([{ id: "s1", path: "docs/getting-started", title: "Getting Started", description: "desc", locale: "en" }])
    );
    // singleByPath fails
    mockRequest.mockRejectedValueOnce(new Error("Permission denied"));
    // resolveViaPagesList -- pages.list with all pages including COA matches
    mockRequest.mockResolvedValueOnce(pagesListResponse(allTestPages));

    await requestContext.run(
      { correlationId: "test-id-under", userId: "test-user", username: "test@example.com", log: testLogger as unknown as FastifyBaseLogger },
      async () => { await api.searchPages("coa", 10); }
    );
    await new Promise(resolve => setTimeout(resolve, 50));

    const infoLogs = logCapture.logs.filter(l => l.level === 30 && l.msg === "Metadata fallback supplemented search results");
    expect(infoLogs).toHaveLength(1);
    expect(infoLogs[0]).toMatchObject({
      query: "coa",
      metadataHits: expect.any(Number),
      totalResolved: expect.any(Number),
    });
    expect(infoLogs[0].metadataHits).toBeGreaterThan(0);
  });

  it("does not emit log when metadata fallback finds no matches", async () => {
    const logCapture = createLogCapture();
    const testLogger = pino({ level: "trace" }, logCapture.stream);

    // Zero GraphQL results, metadata search for "zzzznotfound" finds nothing
    mockRequest.mockResolvedValueOnce(emptySearchResponse());
    mockRequest.mockResolvedValueOnce(pagesListResponse(allTestPages));

    await requestContext.run(
      { correlationId: "test-id-none", userId: "test-user", username: "test@example.com", log: testLogger as unknown as FastifyBaseLogger },
      async () => { await api.searchPages("zzzznotfound", 10); }
    );
    await new Promise(resolve => setTimeout(resolve, 50));

    const infoLogs = logCapture.logs.filter(l => l.level === 30 && l.msg === "Metadata fallback supplemented search results");
    expect(infoLogs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tool description test
// ---------------------------------------------------------------------------

describe("search_pages tool description", () => {
  it("mentions path, title, and description matching", () => {
    const mcpToolsSource = fs.readFileSync(
      path.resolve(import.meta.dirname, "../src/mcp-tools.ts"),
      "utf-8"
    );

    // The search_pages description should mention paths, titles, and descriptions
    expect(mcpToolsSource).toContain("paths, titles, and descriptions");
  });
});
