/**
 * Phase 26 gap-fill tests.
 *
 * Covers four behaviors that were missing from the test suite after
 * src/__tests__/mcp-tools-gdpr.test.ts was deleted in Phase 27:
 *
 *  Gap 1 — Tool description contains "url" and does not contain "redact"
 *  Gap 2 — Error response (API throws) has isError:true and no "url" key
 *  Gap 3 — Config-driven URL uses custom baseUrl and locale
 *  Gap 4 — Redaction warnings trigger ctx.log.warn with pageId + warnings
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMcpServer } from "../mcp-tools.js";
import { WikiJsApi } from "../api.js";
import type { AppConfig } from "../config.js";
import { requestContext } from "../request-context.js";
import { REDACTION_PLACEHOLDER } from "../gdpr.js";
import type { WikiJsPage } from "../types.js";

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

/** Minimal valid AppConfig with default locale */
const defaultTestConfig: AppConfig = {
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
    jwksUri:
      "https://login.microsoftonline.com/550e8400-e29b-41d4-a716-446655440000/discovery/v2.0/keys",
    issuer:
      "https://login.microsoftonline.com/550e8400-e29b-41d4-a716-446655440000/v2.0",
  },
  instructionsPath: "/app/instructions.txt",
};

/** AppConfig with custom baseUrl and locale (Gap 3) */
const customUrlConfig: AppConfig = {
  ...defaultTestConfig,
  wikijs: {
    baseUrl: "https://wiki.custom.com",
    token: "test-token",
    locale: "nl",
  },
};

/** Helper: create a minimal WikiJsPage */
function makePage(overrides: Partial<WikiJsPage> = {}): WikiJsPage {
  return {
    id: 1,
    path: "docs/getting-started",
    title: "Getting Started",
    description: "A guide",
    content: "Hello world",
    isPublished: true,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

/** Helper: make a mock WikiJsApi whose getPageById resolves to the given page */
function makeApiReturning(page: WikiJsPage): WikiJsApi {
  return {
    getPageById: async () => page,
  } as unknown as WikiJsApi;
}

/** Helper: make a mock WikiJsApi whose getPageById always throws */
function makeApiThrowing(message = "GraphQL error: page not found"): WikiJsApi {
  return {
    getPageById: async () => {
      throw new Error(message);
    },
  } as unknown as WikiJsApi;
}

/** Helper: call the get_page tool on a McpServer instance via MCP JSON-RPC */
async function callGetPage(
  server: ReturnType<typeof createMcpServer>,
  id: number,
): Promise<unknown> {
  // Access the internal registered tools object directly (public enough for tests)
  const tools = (server as unknown as { _registeredTools: Record<string, { handler: (args: unknown) => Promise<unknown> }> })._registeredTools;
  const tool = tools["get_page"];
  return tool.handler({ id });
}

// ---------------------------------------------------------------------------
// Gap 1 — Tool description mentions "url" and omits "redact"
// ---------------------------------------------------------------------------

describe("Gap 1: get_page tool description content", () => {
  it("tool description contains the word 'url'", () => {
    const server = createMcpServer(
      makeApiReturning(makePage()),
      "test instructions",
      defaultTestConfig,
    );

    const tools = (server as unknown as { _registeredTools: Record<string, { description?: string }> })
      ._registeredTools;

    const description = tools["get_page"]?.description ?? "";
    expect(description.toLowerCase()).toContain("url");
  });

  it("tool description does NOT contain the word 'redact'", () => {
    const server = createMcpServer(
      makeApiReturning(makePage()),
      "test instructions",
      defaultTestConfig,
    );

    const tools = (server as unknown as { _registeredTools: Record<string, { description?: string }> })
      ._registeredTools;

    const description = tools["get_page"]?.description ?? "";
    expect(description.toLowerCase()).not.toContain("redact");
  });
});

// ---------------------------------------------------------------------------
// Gap 2 — Error response has isError:true and no "url" key
// ---------------------------------------------------------------------------

describe("Gap 2: get_page error response excludes url field", () => {
  it("returns isError:true when the API throws", async () => {
    const server = createMcpServer(
      makeApiThrowing(),
      "test instructions",
      defaultTestConfig,
    );

    const result = await callGetPage(server, 99) as { isError?: boolean; content: Array<{ type: string; text: string }> };

    expect(result.isError).toBe(true);
  });

  it("error response content does not contain a 'url' key", async () => {
    const server = createMcpServer(
      makeApiThrowing("page not found"),
      "test instructions",
      defaultTestConfig,
    );

    const result = await callGetPage(server, 99) as { isError?: boolean; content: Array<{ type: string; text: string }> };

    // The error response is a plain error string, NOT JSON with page fields
    const text = result.content[0].text;

    // It must not be parseable JSON that includes a url field
    // (either it isn't JSON at all, or if it is JSON, no url key)
    let parsedObj: Record<string, unknown> | null = null;
    try {
      parsedObj = JSON.parse(text);
    } catch {
      // Not JSON — fine, definitely no url key
    }

    if (parsedObj !== null) {
      expect(Object.prototype.hasOwnProperty.call(parsedObj, "url")).toBe(false);
    }
    // If we reach here with parsedObj === null, the assertion passes by construction
  });
});

// ---------------------------------------------------------------------------
// Gap 3 — Config-driven URL uses custom baseUrl and locale
// ---------------------------------------------------------------------------

describe("Gap 3: get_page URL uses config baseUrl and locale", () => {
  it("url field reflects custom baseUrl and locale from config", async () => {
    const page = makePage({ path: "docs/getting-started" });
    const server = createMcpServer(
      makeApiReturning(page),
      "test instructions",
      customUrlConfig,
    );

    const result = await callGetPage(server, 1) as { content: Array<{ type: string; text: string }> };
    const parsed = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(parsed["url"]).toBe("https://wiki.custom.com/nl/docs/getting-started");
  });

  it("url field uses default locale 'en' from default config", async () => {
    const page = makePage({ path: "docs/getting-started" });
    const server = createMcpServer(
      makeApiReturning(page),
      "test instructions",
      defaultTestConfig,
    );

    const result = await callGetPage(server, 1) as { content: Array<{ type: string; text: string }> };
    const parsed = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(parsed["url"]).toBe("http://localhost:3000/en/docs/getting-started");
  });
});

// ---------------------------------------------------------------------------
// Gap 4 — Redaction warnings trigger ctx.log.warn with pageId + warnings
// ---------------------------------------------------------------------------

describe("Gap 4: redaction warnings are logged via ctx.log.warn", () => {
  it("calls ctx.log.warn with pageId and warnings array when markers are malformed", async () => {
    const mockWarn = vi.fn();
    const mockCtx = {
      correlationId: "test-corr-id",
      log: {
        warn: mockWarn,
        info: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        trace: vi.fn(),
        fatal: vi.fn(),
        child: vi.fn(),
        level: "info",
        silent: vi.fn(),
      },
    };

    const pageWithUnclosedMarker = makePage({
      id: 10,
      path: "clients/acme",
      content: "Public info <!-- gdpr-start -->Secret without end marker",
    });

    const server = createMcpServer(
      makeApiReturning(pageWithUnclosedMarker),
      "test instructions",
      defaultTestConfig,
    );

    // Run within a requestContext so ctx.log.warn is accessible
    await requestContext.run(mockCtx as Parameters<typeof requestContext.run>[0], async () => {
      await callGetPage(server, 10);
    });

    expect(mockWarn).toHaveBeenCalledOnce();

    const [bindings, message] = mockWarn.mock.calls[0] as [Record<string, unknown>, string];
    expect(bindings["pageId"]).toBe(10);
    expect(Array.isArray(bindings["warnings"])).toBe(true);
    expect((bindings["warnings"] as unknown[]).length).toBeGreaterThan(0);
    expect(message).toMatch(/GDPR redaction warnings/i);
  });

  it("does NOT call ctx.log.warn when content has no malformed markers", async () => {
    const mockWarn = vi.fn();
    const mockCtx = {
      correlationId: "test-corr-id",
      log: {
        warn: mockWarn,
        info: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        trace: vi.fn(),
        fatal: vi.fn(),
        child: vi.fn(),
        level: "info",
        silent: vi.fn(),
      },
    };

    const normalPage = makePage({
      content: "Normal content with no gdpr markers.",
    });

    const server = createMcpServer(
      makeApiReturning(normalPage),
      "test instructions",
      defaultTestConfig,
    );

    await requestContext.run(mockCtx as Parameters<typeof requestContext.run>[0], async () => {
      await callGetPage(server, 1);
    });

    expect(mockWarn).not.toHaveBeenCalled();
  });

  it("content from unclosed marker is replaced with REDACTION_PLACEHOLDER in response", async () => {
    const pageWithUnclosedMarker = makePage({
      id: 10,
      path: "clients/acme",
      content: "Public part <!-- gdpr-start -->Secret info without end",
    });

    const server = createMcpServer(
      makeApiReturning(pageWithUnclosedMarker),
      "test instructions",
      defaultTestConfig,
    );

    const result = await callGetPage(server, 10) as { content: Array<{ type: string; text: string }> };
    const parsed = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(parsed["content"]).toContain("Public part");
    expect(parsed["content"]).not.toContain("Secret info without end");
    expect(parsed["content"]).toContain(REDACTION_PLACEHOLDER);
  });
});
