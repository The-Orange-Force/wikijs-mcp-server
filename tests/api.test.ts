/**
 * Unit tests for WikiJsApi consolidated methods: getPageById and listPages.
 *
 * Tests mock the GraphQL client directly to verify query structure,
 * field selection, and client-side filtering logic.
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
});
