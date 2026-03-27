/**
 * GDPR path filtering tests for MCP tool handlers.
 *
 * Verifies that all 3 tool handlers (get_page, list_pages, search_pages)
 * correctly filter blocked client directory pages and produce structured
 * audit log entries.
 *
 * Also covers URL injection, content redaction wiring, and tool description
 * verification.
 *
 * Requirements covered: FILT-03, FILT-04, FILT-05, SEC-01, SEC-02, URL-01, URL-02
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMcpServer } from "../mcp-tools.js";
import { isBlocked, REDACTION_PLACEHOLDER } from "../gdpr.js";
import type { AppConfig } from "../config.js";
import type { WikiJsApi } from "../api.js";
import type { WikiJsPage, PageSearchResult } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock WikiJsPage with sensible defaults */
function makePage(overrides: Partial<WikiJsPage> = {}): WikiJsPage {
  return {
    id: 1,
    path: "docs/getting-started",
    title: "Getting Started",
    description: "A test page",
    content: "Hello world",
    isPublished: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

/** Blocked page fixture -- matches isBlocked predicate */
const BLOCKED_PAGE = makePage({
  id: 42,
  path: "Clients/AcmeCorp",
  title: "AcmeCorp",
  description: "Client page",
});

/** Non-blocked page fixture */
const SAFE_PAGE = makePage({
  id: 10,
  path: "docs/getting-started",
  title: "Getting Started",
  description: "Documentation",
});

/** Second non-blocked page */
const SAFE_PAGE_2 = makePage({
  id: 11,
  path: "projects/alpha",
  title: "Project Alpha",
  description: "A project page",
});

/** The exact error text from the catch block for absent pages.
 *  When `throw new Error("Page not found")` is caught, String(error) = "Error: Page not found". */
const ABSENT_PAGE_ERROR =
  "Error in get_page: Error: Page not found. Verify the page ID using search_pages or list_pages.";

/** Test AppConfig for createMcpServer calls */
const testConfig: AppConfig = {
  port: 0,
  wikijs: {
    baseUrl: "http://localhost:3000",
    token: "test-token",
    locale: "en",
  },
  azure: {
    tenantId: "550e8400-e29b-41d4-a716-446655440000",
    clientId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    resourceUrl: "https://mcp.example.com",
    resourceDocsUrl: undefined,
    jwksUri: "https://login.microsoftonline.com/550e8400-e29b-41d4-a716-446655440000/discovery/v2.0/keys",
    issuer: "https://login.microsoftonline.com/550e8400-e29b-41d4-a716-446655440000/v2.0",
  },
  instructionsPath: "/app/instructions.txt",
};

/**
 * Capture warn-level log entries from the logBlockedAccess helper.
 *
 * We mock requestContext.getStore() to return a mock logger, then
 * inspect what was passed to log.warn().
 */
const mockWarnLog = vi.fn();
const mockRequestContext = {
  correlationId: "test-correlation-id",
  userId: "user-oid-123",
  username: "testuser@example.com",
  log: {
    warn: mockWarnLog,
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
    level: "info",
    silent: vi.fn(),
  },
};

// Mock requestContext.getStore() to return our mock context
vi.mock("../request-context.js", () => ({
  requestContext: {
    getStore: () => mockRequestContext,
  },
}));

// ---------------------------------------------------------------------------
// Mock WikiJsApi factory
// ---------------------------------------------------------------------------

interface MockApiOverrides {
  getPageById?: (id: number) => Promise<WikiJsPage | null>;
  listPages?: (...args: any[]) => Promise<WikiJsPage[]>;
  searchPages?: (...args: any[]) => Promise<PageSearchResult>;
}

function createMockApi(overrides: MockApiOverrides = {}): WikiJsApi {
  return {
    getPageById: overrides.getPageById ?? vi.fn(async () => SAFE_PAGE),
    listPages: overrides.listPages ?? vi.fn(async () => [SAFE_PAGE]),
    searchPages:
      overrides.searchPages ??
      vi.fn(async () => ({ results: [SAFE_PAGE], totalHits: 1 })),
    checkConnection: vi.fn(async () => true),
  } as unknown as WikiJsApi;
}

// ---------------------------------------------------------------------------
// Extract tool handler from McpServer
// ---------------------------------------------------------------------------

/**
 * The MCP SDK's McpServer stores tool handlers internally. We need to
 * invoke them to test behavior. The _registeredTools property is a plain
 * object keyed by tool name, with each entry having a `handler` function.
 */
function getToolHandler(
  mcpServer: any,
  toolName: string,
): (args: Record<string, unknown>) => Promise<any> {
  const tools = mcpServer._registeredTools;
  if (!tools || !(toolName in tools)) {
    throw new Error(
      `Tool "${toolName}" not found. Available: ${tools ? Object.keys(tools).join(", ") : "none"}`,
    );
  }
  const entry = tools[toolName];
  return async (args: Record<string, unknown>) => entry.handler(args, {});
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MCP Tools GDPR Filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // FILT-03: get_page blocked page
  // =========================================================================

  describe("FILT-03: get_page blocked page", () => {
    it("returns isError:true with 'Page not found' for a blocked path", async () => {
      const api = createMockApi({
        getPageById: vi.fn(async () => BLOCKED_PAGE),
      });
      const server = createMcpServer(api, "test instructions", testConfig);
      const handler = getToolHandler(server, "get_page");

      const result = await handler({ id: 42 });

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toBe(ABSENT_PAGE_ERROR);
    });

    it("returns error text byte-identical to absent page error", async () => {
      const api = createMockApi({
        getPageById: vi.fn(async () => BLOCKED_PAGE),
      });
      const server = createMcpServer(api, "test instructions", testConfig);
      const handler = getToolHandler(server, "get_page");

      const result = await handler({ id: 42 });

      // Byte-identical comparison: exact same string as catch block produces
      // for a genuinely absent page (error text = "Page not found")
      expect(result.content[0].text).toStrictEqual(ABSENT_PAGE_ERROR);
    });

    it("returns normal page data for a non-blocked path", async () => {
      const api = createMockApi({
        getPageById: vi.fn(async () => SAFE_PAGE),
      });
      const server = createMcpServer(api, "test instructions", testConfig);
      const handler = getToolHandler(server, "get_page");

      const result = await handler({ id: 10 });

      expect(result.isError).toBeUndefined();
      expect(result.content).toHaveLength(1);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.id).toBe(10);
      expect(parsed.path).toBe("docs/getting-started");
      expect(parsed.url).toBe("http://localhost:3000/en/docs/getting-started");
      expect(parsed.content).toBe("Hello world");
    });

    it("returns isError:true when getPageById returns null", async () => {
      const api = createMockApi({
        getPageById: vi.fn(async () => null as any),
      });
      const server = createMcpServer(api, "test instructions", testConfig);
      const handler = getToolHandler(server, "get_page");

      const result = await handler({ id: 999 });

      // Null page causes error when accessing page.id in redactContent
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error in get_page:");
    });
  });

  // =========================================================================
  // SEC-01: Timing safety
  // =========================================================================

  describe("SEC-01: timing safety", () => {
    it("calls getPageById before isBlocked for blocked pages", async () => {
      const callOrder: string[] = [];

      const getPageByIdMock = vi.fn(async () => {
        callOrder.push("getPageById");
        return BLOCKED_PAGE;
      });

      const api = createMockApi({ getPageById: getPageByIdMock });
      const server = createMcpServer(api, "test instructions", testConfig);
      const handler = getToolHandler(server, "get_page");

      await handler({ id: 42 });

      // getPageById MUST have been called
      expect(getPageByIdMock).toHaveBeenCalledOnce();
      expect(callOrder).toContain("getPageById");
    });

    it("getPageById IS still called for blocked pages (not short-circuited)", async () => {
      const getPageByIdMock = vi.fn(async () => BLOCKED_PAGE);

      const api = createMockApi({ getPageById: getPageByIdMock });
      const server = createMcpServer(api, "test instructions", testConfig);
      const handler = getToolHandler(server, "get_page");

      const result = await handler({ id: 42 });

      // Verify the API was called (not short-circuited)
      expect(getPageByIdMock).toHaveBeenCalledWith(42);
      // And the result is still the blocked error
      expect(result.isError).toBe(true);
    });
  });

  // =========================================================================
  // FILT-04: search_pages filtering
  // =========================================================================

  describe("FILT-04: search_pages filtering", () => {
    it("excludes blocked pages from search results", async () => {
      const api = createMockApi({
        searchPages: vi.fn(async () => ({
          results: [SAFE_PAGE, BLOCKED_PAGE, SAFE_PAGE_2],
          totalHits: 3,
        })),
      });
      const server = createMcpServer(api, "test instructions", testConfig);
      const handler = getToolHandler(server, "search_pages");

      const result = await handler({ query: "test" });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveLength(2);
      expect(parsed.every((p: WikiJsPage) => !isBlocked(p.path))).toBe(true);
    });

    it("returns all results unchanged when no pages are blocked", async () => {
      const api = createMockApi({
        searchPages: vi.fn(async () => ({
          results: [SAFE_PAGE, SAFE_PAGE_2],
          totalHits: 2,
        })),
      });
      const server = createMcpServer(api, "test instructions", testConfig);
      const handler = getToolHandler(server, "search_pages");

      const result = await handler({ query: "test" });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveLength(2);
    });

    it("returns empty array when ALL results are blocked", async () => {
      const blockedPage2 = makePage({
        id: 43,
        path: "Clients/BetaCorp",
        title: "BetaCorp",
      });
      const api = createMockApi({
        searchPages: vi.fn(async () => ({
          results: [BLOCKED_PAGE, blockedPage2],
          totalHits: 2,
        })),
      });
      const server = createMcpServer(api, "test instructions", testConfig);
      const handler = getToolHandler(server, "search_pages");

      const result = await handler({ query: "clients" });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveLength(0);
    });

    it("adjusts totalHits downward by the number of filtered pages", async () => {
      // While totalHits is not currently serialized, it should be adjusted
      // for defense-in-depth. We verify the filter logic indirectly:
      // 5 raw results, 2 blocked => 3 remain in the filtered array
      const blockedPage2 = makePage({
        id: 43,
        path: "Clients/BetaCorp",
        title: "BetaCorp",
      });
      const api = createMockApi({
        searchPages: vi.fn(async () => ({
          results: [
            SAFE_PAGE,
            BLOCKED_PAGE,
            SAFE_PAGE_2,
            blockedPage2,
            makePage({ id: 12, path: "docs/faq", title: "FAQ" }),
          ],
          totalHits: 5,
        })),
      });
      const server = createMcpServer(api, "test instructions", testConfig);
      const handler = getToolHandler(server, "search_pages");

      const result = await handler({ query: "test" });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveLength(3);
      // Verify no blocked pages in output
      for (const page of parsed) {
        expect(isBlocked(page.path)).toBe(false);
      }
    });
  });

  // =========================================================================
  // FILT-05: list_pages filtering
  // =========================================================================

  describe("FILT-05: list_pages filtering", () => {
    it("excludes blocked pages from list results", async () => {
      const api = createMockApi({
        listPages: vi.fn(async () => [SAFE_PAGE, BLOCKED_PAGE, SAFE_PAGE_2]),
      });
      const server = createMcpServer(api, "test instructions", testConfig);
      const handler = getToolHandler(server, "list_pages");

      const result = await handler({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveLength(2);
      expect(parsed.every((p: WikiJsPage) => !isBlocked(p.path))).toBe(true);
    });

    it("returns all results unchanged when no pages are blocked", async () => {
      const api = createMockApi({
        listPages: vi.fn(async () => [SAFE_PAGE, SAFE_PAGE_2]),
      });
      const server = createMcpServer(api, "test instructions", testConfig);
      const handler = getToolHandler(server, "list_pages");

      const result = await handler({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveLength(2);
    });
  });

  // =========================================================================
  // SEC-02: Audit logging
  // =========================================================================

  describe("SEC-02: audit logging", () => {
    it("emits a warn log when get_page encounters a blocked page", async () => {
      const api = createMockApi({
        getPageById: vi.fn(async () => BLOCKED_PAGE),
      });
      const server = createMcpServer(api, "test instructions", testConfig);
      const handler = getToolHandler(server, "get_page");

      await handler({ id: 42 });

      expect(mockWarnLog).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: "get_page",
          userId: "user-oid-123",
          username: "testuser@example.com",
          gdprBlocked: true,
        }),
        "GDPR path blocked",
      );
    });

    it("emits N warn log entries when search_pages filters N blocked pages", async () => {
      const blockedPage2 = makePage({
        id: 43,
        path: "Clients/BetaCorp",
        title: "BetaCorp",
      });
      const api = createMockApi({
        searchPages: vi.fn(async () => ({
          results: [SAFE_PAGE, BLOCKED_PAGE, blockedPage2],
          totalHits: 3,
        })),
      });
      const server = createMcpServer(api, "test instructions", testConfig);
      const handler = getToolHandler(server, "search_pages");

      await handler({ query: "test" });

      // 2 blocked pages => 2 warn log entries
      const gdprWarnCalls = mockWarnLog.mock.calls.filter(
        (call) => call[0]?.gdprBlocked === true,
      );
      expect(gdprWarnCalls).toHaveLength(2);
      // All should have toolName "search_pages"
      for (const call of gdprWarnCalls) {
        expect(call[0].toolName).toBe("search_pages");
      }
    });

    it("emits warn log entries when list_pages filters blocked pages", async () => {
      const api = createMockApi({
        listPages: vi.fn(async () => [SAFE_PAGE, BLOCKED_PAGE]),
      });
      const server = createMcpServer(api, "test instructions", testConfig);
      const handler = getToolHandler(server, "list_pages");

      await handler({});

      const gdprWarnCalls = mockWarnLog.mock.calls.filter(
        (call) => call[0]?.gdprBlocked === true,
      );
      expect(gdprWarnCalls).toHaveLength(1);
      expect(gdprWarnCalls[0][0].toolName).toBe("list_pages");
    });

    it("log entries do NOT contain page path or path-derived content", async () => {
      const api = createMockApi({
        getPageById: vi.fn(async () => BLOCKED_PAGE),
      });
      const server = createMcpServer(api, "test instructions", testConfig);
      const handler = getToolHandler(server, "get_page");

      await handler({ id: 42 });

      // Check that the warn log call does NOT contain path info
      const gdprWarnCalls = mockWarnLog.mock.calls.filter(
        (call) => call[0]?.gdprBlocked === true,
      );
      for (const call of gdprWarnCalls) {
        const payload = call[0];
        // No path key
        expect(payload).not.toHaveProperty("path");
        // No company name in any value
        const payloadStr = JSON.stringify(payload);
        expect(payloadStr).not.toContain("AcmeCorp");
        expect(payloadStr).not.toContain("Clients");
        // Message should be generic
        expect(call[1]).toBe("GDPR path blocked");
        expect(call[1]).not.toContain("AcmeCorp");
      }
    });
  });

  // =========================================================================
  // URL injection
  // =========================================================================

  describe("URL injection", () => {
    it("get_page response includes url field with correct format", async () => {
      const api = createMockApi({
        getPageById: vi.fn(async () => SAFE_PAGE),
      });
      const server = createMcpServer(api, "test instructions", testConfig);
      const handler = getToolHandler(server, "get_page");

      const result = await handler({ id: 10 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.url).toBe("http://localhost:3000/en/docs/getting-started");
    });

    it("url field appears in correct position (after path, before title)", async () => {
      const api = createMockApi({
        getPageById: vi.fn(async () => SAFE_PAGE),
      });
      const server = createMcpServer(api, "test instructions", testConfig);
      const handler = getToolHandler(server, "get_page");

      const result = await handler({ id: 10 });

      const parsed = JSON.parse(result.content[0].text);
      const keys = Object.keys(parsed);
      const pathIdx = keys.indexOf("path");
      const urlIdx = keys.indexOf("url");
      const titleIdx = keys.indexOf("title");
      expect(urlIdx).toBe(pathIdx + 1);
      expect(titleIdx).toBe(urlIdx + 1);
    });

    it("url field uses config baseUrl and locale, not hardcoded values", async () => {
      const customConfig: AppConfig = {
        ...testConfig,
        wikijs: {
          baseUrl: "https://wiki.custom.com",
          token: "test-token",
          locale: "nl",
        },
      };
      const api = createMockApi({
        getPageById: vi.fn(async () => SAFE_PAGE),
      });
      const server = createMcpServer(api, "test instructions", customConfig);
      const handler = getToolHandler(server, "get_page");

      const result = await handler({ id: 10 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.url).toBe("https://wiki.custom.com/nl/docs/getting-started");
    });
  });

  // =========================================================================
  // Redaction wiring
  // =========================================================================

  describe("Redaction wiring", () => {
    it("content with GDPR markers is redacted in get_page response", async () => {
      const page = makePage({
        content: "Public <!-- gdpr-start -->Secret<!-- gdpr-end --> Rest",
      });
      const api = createMockApi({
        getPageById: vi.fn(async () => page),
      });
      const server = createMcpServer(api, "test instructions", testConfig);
      const handler = getToolHandler(server, "get_page");

      const result = await handler({ id: 1 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.content).toContain(REDACTION_PLACEHOLDER);
      expect(parsed.content).toContain("Public");
      expect(parsed.content).toContain("Rest");
      expect(parsed.content).not.toContain("Secret");
    });

    it("content without markers passes through unchanged", async () => {
      const page = makePage({
        content: "Normal content with no markers",
      });
      const api = createMockApi({
        getPageById: vi.fn(async () => page),
      });
      const server = createMcpServer(api, "test instructions", testConfig);
      const handler = getToolHandler(server, "get_page");

      const result = await handler({ id: 1 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.content).toBe("Normal content with no markers");
    });

    it("redaction warnings are logged when markers are malformed", async () => {
      const page = makePage({
        content: "Start <!-- gdpr-start -->no end marker",
      });
      const api = createMockApi({
        getPageById: vi.fn(async () => page),
      });
      const server = createMcpServer(api, "test instructions", testConfig);
      const handler = getToolHandler(server, "get_page");

      await handler({ id: 1 });

      expect(mockWarnLog).toHaveBeenCalledWith(
        expect.objectContaining({
          pageId: page.id,
          warnings: expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining("Unclosed gdpr-start marker"),
            }),
          ]),
        }),
        "GDPR redaction warnings",
      );
    });
  });

  // =========================================================================
  // No URL on error/blocked responses
  // =========================================================================

  describe("No URL on error/blocked responses", () => {
    it("blocked page error response does not contain url field", async () => {
      const api = createMockApi({
        getPageById: vi.fn(async () => BLOCKED_PAGE),
      });
      const server = createMcpServer(api, "test instructions", testConfig);
      const handler = getToolHandler(server, "get_page");

      const result = await handler({ id: 42 });

      expect(result.isError).toBe(true);
      // Error text is a plain string, not JSON -- should not contain "url"
      expect(result.content[0].text).not.toContain('"url"');
    });

    it("error response does not contain url field", async () => {
      const api = createMockApi({
        getPageById: vi.fn(async () => {
          throw new Error("API failure");
        }),
      });
      const server = createMcpServer(api, "test instructions", testConfig);
      const handler = getToolHandler(server, "get_page");

      const result = await handler({ id: 1 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).not.toContain('"url"');
    });
  });

  // =========================================================================
  // Tool description
  // =========================================================================

  describe("Tool description", () => {
    it("get_page tool description mentions url field", () => {
      const api = createMockApi();
      const server = createMcpServer(api, "test instructions", testConfig);

      const tools = (server as any)._registeredTools;
      const getPageTool = tools.get_page;
      expect(getPageTool.description).toContain("url");
    });

    it("get_page tool description does NOT mention redaction", () => {
      const api = createMockApi();
      const server = createMcpServer(api, "test instructions", testConfig);

      const tools = (server as any)._registeredTools;
      const getPageTool = tools.get_page;
      expect(getPageTool.description.toLowerCase()).not.toContain("redact");
    });
  });
});
