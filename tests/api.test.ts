/**
 * Unit tests for WikiJsApi consolidated methods: getPageById, listPages, and searchPages.
 *
 * Tests mock the GraphQL client directly to verify query structure,
 * field selection, client-side filtering logic, and search ID resolution.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock graphql-request before importing WikiJsApi
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

describe("WikiJsApi", () => {
  let api: WikiJsApi;

  beforeEach(() => {
    mockRequest.mockReset();
    api = new WikiJsApi("http://localhost:3000", "test-token");
  });

  // -------------------------------------------------------------------------
  // getPageById
  // -------------------------------------------------------------------------
  describe("getPageById", () => {
    it("returns metadata, content, and isPublished in one call", async () => {
      const fullPage = {
        id: 42,
        path: "docs/getting-started",
        title: "Getting Started",
        description: "A guide to getting started",
        content: "# Getting Started\n\nWelcome!",
        isPublished: true,
        createdAt: "2024-01-15T10:00:00Z",
        updatedAt: "2024-06-20T14:30:00Z",
      };
      mockRequest.mockResolvedValueOnce({ pages: { single: fullPage } });

      const result = await api.getPageById(42);

      expect(result.id).toBe(42);
      expect(result.path).toBe("docs/getting-started");
      expect(result.title).toBe("Getting Started");
      expect(result.description).toBe("A guide to getting started");
      expect(result.content).toBe("# Getting Started\n\nWelcome!");
      expect(result.isPublished).toBe(true);
      expect(result.createdAt).toBe("2024-01-15T10:00:00Z");
      expect(result.updatedAt).toBe("2024-06-20T14:30:00Z");
      // Exactly one GraphQL call
      expect(mockRequest).toHaveBeenCalledTimes(1);
    });

    it("passes page ID into GraphQL query", async () => {
      mockRequest.mockResolvedValueOnce({
        pages: {
          single: {
            id: 99,
            path: "test",
            title: "Test",
            description: "",
            content: "",
            isPublished: false,
            createdAt: "2024-01-01T00:00:00Z",
            updatedAt: "2024-01-01T00:00:00Z",
          },
        },
      });

      await api.getPageById(99);

      const queryArg = mockRequest.mock.calls[0][0] as string;
      expect(queryArg).toContain("single (id: 99)");
    });

    it("includes content and isPublished in GraphQL field selection", async () => {
      mockRequest.mockResolvedValueOnce({
        pages: {
          single: {
            id: 1,
            path: "p",
            title: "T",
            description: "D",
            content: "C",
            isPublished: true,
            createdAt: "2024-01-01T00:00:00Z",
            updatedAt: "2024-01-01T00:00:00Z",
          },
        },
      });

      await api.getPageById(1);

      const queryArg = mockRequest.mock.calls[0][0] as string;
      expect(queryArg).toContain("content");
      expect(queryArg).toContain("isPublished");
    });
  });

  // -------------------------------------------------------------------------
  // listPages
  // -------------------------------------------------------------------------
  describe("listPages", () => {
    const mixedPages = [
      {
        id: 1,
        path: "public/guide",
        title: "Guide",
        description: "Public guide",
        isPublished: true,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-02-01T00:00:00Z",
      },
      {
        id: 2,
        path: "drafts/wip",
        title: "Work in Progress",
        description: "Draft page",
        isPublished: false,
        createdAt: "2024-03-01T00:00:00Z",
        updatedAt: "2024-03-15T00:00:00Z",
      },
      {
        id: 3,
        path: "public/faq",
        title: "FAQ",
        description: "Frequently asked questions",
        isPublished: true,
        createdAt: "2024-04-01T00:00:00Z",
        updatedAt: "2024-05-01T00:00:00Z",
      },
    ];

    it("returns only published pages by default", async () => {
      mockRequest.mockResolvedValueOnce({ pages: { list: mixedPages } });

      const result = await api.listPages();

      expect(result).toHaveLength(2);
      expect(result.every((p) => p.isPublished === true)).toBe(true);
      expect(result.map((p) => p.id)).toEqual([1, 3]);
    });

    it("returns all pages when includeUnpublished is true", async () => {
      mockRequest.mockResolvedValueOnce({ pages: { list: mixedPages } });

      const result = await api.listPages(50, "TITLE", true);

      expect(result).toHaveLength(3);
      expect(result.map((p) => p.id)).toEqual([1, 2, 3]);
    });

    it("includes isPublished field on every result", async () => {
      mockRequest.mockResolvedValueOnce({ pages: { list: mixedPages } });

      const result = await api.listPages(50, "TITLE", true);

      for (const page of result) {
        expect(page).toHaveProperty("isPublished");
        expect(typeof page.isPublished).toBe("boolean");
      }
    });

    it("does not include content field in GraphQL query", async () => {
      mockRequest.mockResolvedValueOnce({ pages: { list: [] } });

      await api.listPages();

      const queryArg = mockRequest.mock.calls[0][0] as string;
      // The query should NOT request content (list is metadata only)
      // We check that "content" does not appear in the field selection
      // Note: "content" could appear in comments, so we check the actual fields block
      const fieldsMatch = queryArg.match(/list\s*\([^)]*\)\s*\{([^}]+)\}/);
      expect(fieldsMatch).toBeTruthy();
      const fields = fieldsMatch![1];
      expect(fields).not.toContain("content");
    });

    it("respects limit and orderBy parameters", async () => {
      mockRequest.mockResolvedValueOnce({ pages: { list: [] } });

      await api.listPages(25, "UPDATED");

      const queryArg = mockRequest.mock.calls[0][0] as string;
      expect(queryArg).toContain("limit: 25");
      expect(queryArg).toContain("orderBy: UPDATED");
    });
  });

  // -------------------------------------------------------------------------
  // searchPages
  // -------------------------------------------------------------------------
  describe("searchPages", () => {
    // Helper: build a search API response with N results
    function makeSearchResponse(
      items: Array<{ id: string; path: string; title: string; description: string; locale: string }>,
      totalHits?: number,
    ) {
      return {
        pages: {
          search: {
            results: items,
            suggestions: [],
            totalHits: totalHits ?? items.length,
          },
        },
      };
    }

    // Helper: build a singleByPath response
    function makeSingleByPathResponse(page: {
      id: number;
      path: string;
      title: string;
      description: string;
      isPublished: boolean;
      createdAt: string;
      updatedAt: string;
    }) {
      return { pages: { singleByPath: page } };
    }

    // Helper: build a pages.list response
    function makePagesListResponse(
      pages: Array<{
        id: number;
        path: string;
        title: string;
        description: string;
        isPublished: boolean;
        createdAt: string;
        updatedAt: string;
      }>,
    ) {
      return { pages: { list: pages } };
    }

    // Standard resolved page factory
    function resolvedPage(id: number, path: string, title: string) {
      return {
        id,
        path,
        title,
        description: `Description for ${title}`,
        isPublished: true,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-06-01T00:00:00Z",
      };
    }

    it("returns resolved results with real database IDs when singleByPath succeeds", async () => {
      // Search returns 2 results with string IDs
      mockRequest.mockResolvedValueOnce(
        makeSearchResponse([
          { id: "abc-1", path: "docs/guide", title: "Guide", description: "A guide", locale: "en" },
          { id: "abc-2", path: "docs/faq", title: "FAQ", description: "Questions", locale: "en" },
        ], 2),
      );
      // singleByPath resolves each
      mockRequest.mockResolvedValueOnce(makeSingleByPathResponse(resolvedPage(42, "docs/guide", "Guide")));
      mockRequest.mockResolvedValueOnce(makeSingleByPathResponse(resolvedPage(99, "docs/faq", "FAQ")));

      const result = await api.searchPages("test query");

      expect(result.results).toHaveLength(2);
      expect(result.results[0].id).toBe(42);
      expect(result.results[1].id).toBe(99);
      expect(result.totalHits).toBe(2);
    });

    it("falls back to pages.list when singleByPath fails", async () => {
      // Search returns 1 result
      mockRequest.mockResolvedValueOnce(
        makeSearchResponse([
          { id: "abc-1", path: "docs/guide", title: "Guide", description: "A guide", locale: "en" },
        ]),
      );
      // singleByPath fails
      mockRequest.mockRejectedValueOnce(new Error("Forbidden"));
      // pages.list fallback returns matching page
      mockRequest.mockResolvedValueOnce(
        makePagesListResponse([resolvedPage(42, "docs/guide", "Guide")]),
      );

      const result = await api.searchPages("test query");

      expect(result.results).toHaveLength(1);
      expect(result.results[0].id).toBe(42);
      expect(result.results[0].path).toBe("docs/guide");
    });

    it("drops unresolvable results and returns totalHits", async () => {
      // Search returns 2 results
      mockRequest.mockResolvedValueOnce(
        makeSearchResponse([
          { id: "abc-1", path: "docs/missing1", title: "Missing 1", description: "Gone", locale: "en" },
          { id: "abc-2", path: "docs/missing2", title: "Missing 2", description: "Gone", locale: "en" },
        ], 2),
      );
      // Both singleByPath calls fail
      mockRequest.mockRejectedValueOnce(new Error("Not found"));
      mockRequest.mockRejectedValueOnce(new Error("Not found"));
      // pages.list doesn't contain either path
      mockRequest.mockResolvedValueOnce(
        makePagesListResponse([resolvedPage(999, "docs/other", "Other Page")]),
      );

      const result = await api.searchPages("test query");

      expect(result.results).toHaveLength(0);
      expect(result.totalHits).toBe(2);
    });

    it("makes singleByPath calls in parallel via Promise.allSettled", async () => {
      // Search returns 3 results
      mockRequest.mockResolvedValueOnce(
        makeSearchResponse([
          { id: "abc-1", path: "docs/a", title: "A", description: "Page A", locale: "en" },
          { id: "abc-2", path: "docs/b", title: "B", description: "Page B", locale: "en" },
          { id: "abc-3", path: "docs/c", title: "C", description: "Page C", locale: "en" },
        ]),
      );
      // All 3 singleByPath calls succeed
      mockRequest.mockResolvedValueOnce(makeSingleByPathResponse(resolvedPage(10, "docs/a", "A")));
      mockRequest.mockResolvedValueOnce(makeSingleByPathResponse(resolvedPage(20, "docs/b", "B")));
      mockRequest.mockResolvedValueOnce(makeSingleByPathResponse(resolvedPage(30, "docs/c", "C")));

      const result = await api.searchPages("test");

      // 1 search + 3 singleByPath = 4 total calls
      expect(mockRequest).toHaveBeenCalledTimes(4);
      expect(result.results).toHaveLength(3);
      expect(result.results.map((r) => r.id)).toEqual([10, 20, 30]);
    });

    it("returns empty results for empty search", async () => {
      mockRequest.mockResolvedValueOnce(
        makeSearchResponse([], 0),
      );

      const result = await api.searchPages("nonexistent");

      expect(result.results).toEqual([]);
      expect(result.totalHits).toBe(0);
      // Only the search call, no singleByPath or pages.list
      expect(mockRequest).toHaveBeenCalledTimes(1);
    });

    it("only calls pages.list fallback once for multiple unresolved results", async () => {
      // Search returns 3 results
      mockRequest.mockResolvedValueOnce(
        makeSearchResponse([
          { id: "abc-1", path: "docs/a", title: "A", description: "Page A", locale: "en" },
          { id: "abc-2", path: "docs/b", title: "B", description: "Page B", locale: "en" },
          { id: "abc-3", path: "docs/c", title: "C", description: "Page C", locale: "en" },
        ]),
      );
      // All 3 singleByPath calls fail
      mockRequest.mockRejectedValueOnce(new Error("Forbidden"));
      mockRequest.mockRejectedValueOnce(new Error("Forbidden"));
      mockRequest.mockRejectedValueOnce(new Error("Forbidden"));
      // pages.list resolves 2 of 3
      mockRequest.mockResolvedValueOnce(
        makePagesListResponse([
          resolvedPage(10, "docs/a", "A"),
          resolvedPage(20, "docs/b", "B"),
        ]),
      );

      const result = await api.searchPages("test");

      // 1 search + 3 singleByPath + 1 pages.list = 5 total calls
      expect(mockRequest).toHaveBeenCalledTimes(5);
      expect(result.results).toHaveLength(2);
      // docs/c was dropped (not in pages.list)
      expect(result.results.map((r) => r.path)).toEqual(["docs/a", "docs/b"]);
    });

    it("passes locale to singleByPath query", async () => {
      mockRequest.mockResolvedValueOnce(
        makeSearchResponse([
          { id: "abc-1", path: "docs/guide", title: "Guide", description: "A guide", locale: "fr" },
        ]),
      );
      mockRequest.mockResolvedValueOnce(makeSingleByPathResponse(resolvedPage(42, "docs/guide", "Guide")));

      await api.searchPages("guide");

      // The second call is the singleByPath query -- check it contains the locale
      const singleByPathQuery = mockRequest.mock.calls[1][0] as string;
      expect(singleByPathQuery).toContain("singleByPath");
      expect(singleByPathQuery).toContain('"fr"');
    });
  });
});
