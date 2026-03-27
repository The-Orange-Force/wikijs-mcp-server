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
      // Metadata fallback fetches pages.list independently (no cached allPages since step 3 didn't run)
      mockRequest.mockResolvedValueOnce(makePagesListResponse([]));

      const result = await api.searchPages("test");

      // 1 search + 3 singleByPath + 1 pages.list (metadata fallback) = 5 total calls
      expect(mockRequest).toHaveBeenCalledTimes(5);
      expect(result.results).toHaveLength(3);
      expect(result.results.map((r) => r.id)).toEqual([10, 20, 30]);
    });

    it("returns empty results for empty search", async () => {
      mockRequest.mockResolvedValueOnce(
        makeSearchResponse([], 0),
      );
      // After Phase 28: zero-result path triggers metadata fallback, fetching pages.list
      // Pages do NOT match "nonexistent", so results remain empty
      mockRequest.mockResolvedValueOnce(
        makePagesListResponse([
          resolvedPage(100, "docs/guide", "Guide"),
          resolvedPage(200, "docs/faq", "FAQ"),
        ]),
      );

      const result = await api.searchPages("nonexistent");

      expect(result.results).toEqual([]);
      expect(result.totalHits).toBe(0);
      // 1 search + 1 pages.list (metadata fallback) = 2 total calls
      expect(mockRequest).toHaveBeenCalledTimes(2);
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

    // -----------------------------------------------------------------------
    // searchPages - metadata fallback (Phase 28)
    // -----------------------------------------------------------------------
    describe("searchPages - metadata fallback", () => {
      it("returns title matches when GraphQL returns zero results (META-01, INTG-02)", async () => {
        // Search returns 0 results
        mockRequest.mockResolvedValueOnce(makeSearchResponse([], 0));
        // Metadata fallback fetches pages.list -- has pages with matching titles
        mockRequest.mockResolvedValueOnce(
          makePagesListResponse([
            resolvedPage(10, "docs/coa-guidelines", "COA Guidelines"),
            resolvedPage(20, "docs/other", "Other Page"),
          ]),
        );

        const result = await api.searchPages("COA", 10);

        expect(result.results).toHaveLength(1);
        expect(result.results[0].id).toBe(10);
        expect(result.results[0].title).toBe("COA Guidelines");
        expect(result.totalHits).toBe(1);
      });

      it("is case-insensitive (META-02)", async () => {
        // Search returns 0 results
        mockRequest.mockResolvedValueOnce(makeSearchResponse([], 0));
        // pages.list has page with title "COA Guidelines"
        mockRequest.mockResolvedValueOnce(
          makePagesListResponse([
            resolvedPage(10, "docs/coa-guidelines", "COA Guidelines"),
          ]),
        );

        // Query is lowercase "coa"
        const result = await api.searchPages("coa", 10);

        expect(result.results).toHaveLength(1);
        expect(result.results[0].id).toBe(10);
      });

      it("deduplicates against GraphQL results by page ID (META-03)", async () => {
        // Search returns 1 result (page ID 42 after singleByPath resolution)
        mockRequest.mockResolvedValueOnce(
          makeSearchResponse([
            { id: "abc-1", path: "docs/guide", title: "Guide", description: "A guide", locale: "en" },
          ]),
        );
        // singleByPath succeeds for page ID 42
        mockRequest.mockResolvedValueOnce(
          makeSingleByPathResponse(resolvedPage(42, "docs/guide", "Guide")),
        );
        // Metadata fallback fetches pages.list (step 4, allPages not cached since step 3 didn't run)
        // pages.list contains the same page (ID 42) plus a new metadata match
        mockRequest.mockResolvedValueOnce(
          makePagesListResponse([
            resolvedPage(42, "docs/guide", "Guide"),
            resolvedPage(99, "docs/guide-advanced", "Advanced Guide"),
          ]),
        );

        const result = await api.searchPages("guide", 10);

        // Page 42 appears only once (from GraphQL), page 99 appended via metadata
        expect(result.results).toHaveLength(2);
        expect(result.results[0].id).toBe(42);
        expect(result.results[1].id).toBe(99);
      });

      it("excludes unpublished pages from metadata results (META-04)", async () => {
        // Search returns 0 results
        mockRequest.mockResolvedValueOnce(makeSearchResponse([], 0));
        // pages.list has matching page but it's unpublished
        mockRequest.mockResolvedValueOnce(
          makePagesListResponse([
            {
              id: 10,
              path: "drafts/coa",
              title: "COA Draft",
              description: "Draft page",
              isPublished: false,
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-06-01T00:00:00Z",
            },
          ]),
        );

        const result = await api.searchPages("COA", 10);

        expect(result.results).toHaveLength(0);
        expect(result.totalHits).toBe(0);
      });

      it("total results never exceed requested limit (META-05)", async () => {
        // Search returns 2 results (limit=3)
        mockRequest.mockResolvedValueOnce(
          makeSearchResponse([
            { id: "abc-1", path: "docs/mendix-a", title: "Mendix A", description: "Page A", locale: "en" },
            { id: "abc-2", path: "docs/mendix-b", title: "Mendix B", description: "Page B", locale: "en" },
          ], 2),
        );
        // Both singleByPath succeed
        mockRequest.mockResolvedValueOnce(
          makeSingleByPathResponse(resolvedPage(10, "docs/mendix-a", "Mendix A")),
        );
        mockRequest.mockResolvedValueOnce(
          makeSingleByPathResponse(resolvedPage(20, "docs/mendix-b", "Mendix B")),
        );
        // Metadata fallback fetches pages.list -- has 5 matches
        mockRequest.mockResolvedValueOnce(
          makePagesListResponse([
            resolvedPage(30, "docs/mendix-c", "Mendix C"),
            resolvedPage(40, "docs/mendix-d", "Mendix D"),
            resolvedPage(50, "docs/mendix-e", "Mendix E"),
            resolvedPage(60, "docs/mendix-f", "Mendix F"),
            resolvedPage(70, "docs/mendix-g", "Mendix G"),
          ]),
        );

        const result = await api.searchPages("mendix", 3);

        // 2 from GraphQL + 1 from metadata = 3 (capped at limit)
        expect(result.results.length).toBeLessThanOrEqual(3);
        expect(result.results).toHaveLength(3);
      });

      it("adjusts totalHits via Math.max when metadata adds results (META-06)", async () => {
        // Search returns 0 results with totalHits=0
        mockRequest.mockResolvedValueOnce(makeSearchResponse([], 0));
        // Metadata finds 3 matches
        mockRequest.mockResolvedValueOnce(
          makePagesListResponse([
            resolvedPage(10, "docs/coa-1", "COA Report 1"),
            resolvedPage(20, "docs/coa-2", "COA Report 2"),
            resolvedPage(30, "docs/coa-3", "COA Report 3"),
          ]),
        );

        const result = await api.searchPages("COA", 10);

        expect(result.results).toHaveLength(3);
        expect(result.totalHits).toBe(3);
      });

      it("shares pages.list data from resolveViaPagesList without extra call (INTG-01)", async () => {
        // Search returns 2 results, both singleByPath fail
        mockRequest.mockResolvedValueOnce(
          makeSearchResponse([
            { id: "abc-1", path: "docs/mendix-a", title: "Mendix A", description: "Page A", locale: "en" },
            { id: "abc-2", path: "docs/mendix-b", title: "Mendix B", description: "Page B", locale: "en" },
          ], 2),
        );
        mockRequest.mockRejectedValueOnce(new Error("Forbidden"));
        mockRequest.mockRejectedValueOnce(new Error("Forbidden"));
        // pages.list resolves 1 of 2, plus has additional metadata match
        mockRequest.mockResolvedValueOnce(
          makePagesListResponse([
            resolvedPage(10, "docs/mendix-a", "Mendix A"),
            resolvedPage(30, "docs/mendix-guide", "Mendix Guide"),
          ]),
        );

        const result = await api.searchPages("mendix", 10);

        // 1 search + 2 singleByPath + 1 pages.list = 4 calls (NOT 5 -- no second pages.list)
        expect(mockRequest).toHaveBeenCalledTimes(4);
        // resolveViaPagesList resolved mendix-a, metadata found mendix-guide
        expect(result.results).toHaveLength(2);
        expect(result.results.map((r) => r.id)).toEqual([10, 30]);
      });

      it("ranks title matches before path-only matches", async () => {
        // Search returns 0 results
        mockRequest.mockResolvedValueOnce(makeSearchResponse([], 0));
        // pages.list: page A has title match, page B has path-only match
        mockRequest.mockResolvedValueOnce(
          makePagesListResponse([
            resolvedPage(20, "docs/mendix/setup", "Setup Instructions"),
            resolvedPage(10, "docs/other", "Mendix Best Practices"),
          ]),
        );

        const result = await api.searchPages("mendix", 10);

        expect(result.results).toHaveLength(2);
        // Title match ("Mendix Best Practices") should come before path-only match ("docs/mendix/setup")
        expect(result.results[0].id).toBe(10);
        expect(result.results[1].id).toBe(20);
      });

      it("fetches pages.list independently on zero-result path", async () => {
        // Search returns 0 results
        mockRequest.mockResolvedValueOnce(makeSearchResponse([], 0));
        // Metadata fallback fetches pages.list
        mockRequest.mockResolvedValueOnce(
          makePagesListResponse([
            resolvedPage(10, "docs/coa", "COA Overview"),
          ]),
        );

        const result = await api.searchPages("COA", 10);

        // 1 search + 1 pages.list = 2 calls total
        expect(mockRequest).toHaveBeenCalledTimes(2);
        expect(result.results).toHaveLength(1);
      });

      it("returns empty on pages.list failure (graceful degradation)", async () => {
        // Search returns 0 results
        mockRequest.mockResolvedValueOnce(makeSearchResponse([], 0));
        // pages.list throws error
        mockRequest.mockRejectedValueOnce(new Error("GraphQL Error"));

        const result = await api.searchPages("COA", 10);

        // Should not throw -- graceful degradation
        expect(result.results).toHaveLength(0);
        expect(result.totalHits).toBe(0);
      });

      it("returns path matches when query matches page paths (META-01)", async () => {
        // Search returns 0 results
        mockRequest.mockResolvedValueOnce(makeSearchResponse([], 0));
        // pages.list has pages with matching paths
        mockRequest.mockResolvedValueOnce(
          makePagesListResponse([
            resolvedPage(10, "clients/mendix/overview", "Overview"),
            resolvedPage(20, "docs/other", "Other Page"),
          ]),
        );

        const result = await api.searchPages("mendix", 10);

        expect(result.results).toHaveLength(1);
        expect(result.results[0].id).toBe(10);
        expect(result.results[0].path).toBe("clients/mendix/overview");
      });
    });
  });
});
