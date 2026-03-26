# Phase 16: Tool Registration Consolidation - Research

**Researched:** 2026-03-26
**Domain:** MCP tool registration, Zod schema design, LLM-optimized tool descriptions
**Confidence:** HIGH

## Summary

Phase 16 replaces 17 MCP tool registrations in `src/mcp-tools.ts` with exactly 3 read-only tools (`get_page`, `list_pages`, `search_pages`). The existing code already uses the correct pattern (`mcpServer.registerTool` with Zod schemas and `wrapToolHandler`), so this phase is a rewrite-in-place, not a pattern change. The MCP SDK v1.27.1 `registerTool` API supports `description`, `inputSchema`, `annotations`, and `outputSchema` -- we use `description` + `inputSchema` + `annotations` (with `readOnlyHint: true`).

The primary work is: (1) delete 14 tool registrations and their constants, (2) rewrite 3 remaining tool handlers to use Phase 15's new API methods and return structured JSON, (3) update `SCOPE_TOOL_MAP` in `src/scopes.ts` to only list 3 tools (keeping 3-scope structure for Phase 17), (4) update all test files with hard-coded 17-tool counts, (5) clean up `mockWikiJsApi` stubs in both `tests/smoke.test.ts` and `tests/helpers/build-test-app.ts`.

**Primary recommendation:** Rewrite `mcp-tools.ts` from scratch with 3 tool registrations, verbose multi-sentence descriptions, Zod `.describe()` on every field, and `annotations: { readOnlyHint: true }` on all tools. Update scope maps and tests to match.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Tool descriptions: Usage-focused prose, 2-3 sentences per tool (what it does, what it returns, when to use it)
- Cross-reference other tools to guide LLM workflow (e.g., search_pages hints "use get_page with the returned ID for full content")
- Name key return fields in the description (e.g., "Returns title, path, content, description, isPublished, createdAt, updatedAt")
- Mention known limitations (e.g., search_pages only searches published pages, search index delay)
- `get_page`: ID only (integer), no path support
- `list_pages`: merge `includeUnpublished` flag from old `list_all_pages` (optional boolean, default false), keep `limit` and `orderBy`
- `search_pages`: default limit of 10 if not specified, `query` required
- Zod `.describe()` strings are detailed with usage hints (e.g., "Page database ID (get this from search_pages or list_pages results)")
- Structured JSON (`JSON.stringify(result, null, 2)`) for all 3 tools
- `get_page`: full page object with content
- `list_pages`: metadata only (id, title, path, description, isPublished, createdAt, updatedAt) -- no content field
- `search_pages`: metadata + content excerpts/snippets per result
- Error responses are contextual: include tool name and recovery hint
- Update 17 to 3 count assertions in smoke.test.ts and scopes.test.ts
- Rewrite tool invocation tests for the 3 new tools with new schemas and response structure validation
- One E2E integration test per tool via POST /mcp (tools/call with mockWikiJsApi)
- Basic description assertions: each tool description is multi-sentence and mentions key return fields
- Assert removed tools are absent from tools/list (no invocation-error tests needed)
- Update scope test counts (3 total tools) but leave 3-scope structure for Phase 17
- Clean up mockWikiJsApi in this phase: remove 14 unused stubs, update remaining 3 to match Phase 15 API

### Claude's Discretion
- Exact wording of tool descriptions (within the constraints above)
- Order of fields in response objects
- Specific Zod schema refinements (e.g., max limits)
- wrapToolHandler usage pattern (keep or simplify)
- How to structure the E2E test file (new file vs extend smoke.test.ts)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TOOL-03 | All write tools removed (create_page, update_page, delete_page, force_delete_page, publish_page) | Delete 5 write tool registrations from mcp-tools.ts, remove from SCOPE_TOOL_MAP, remove mock stubs |
| TOOL-04 | All user/group tools removed (list_users, search_users, create_user, update_user, list_groups) | Delete 5 user/group tool registrations from mcp-tools.ts, remove from SCOPE_TOOL_MAP, remove mock stubs |
| SRCH-03 | All 3 tools have verbose LLM-optimized descriptions | Multi-sentence descriptions with return fields, cross-references, and limitations per CONTEXT.md decisions |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@modelcontextprotocol/sdk` | ^1.27.1 | MCP server + tool registration | Already installed; `registerTool` API is the non-deprecated way to register tools |
| `zod` | (peer dep) | Input schema validation + `.describe()` | Already used; SDK depends on it for input schema definition |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `wrapToolHandler` (local) | N/A | Timing + structured logging wrapper | Wrap every tool handler -- keep existing pattern |
| `requestContext` (local) | N/A | AsyncLocalStorage for correlation IDs | Already wired in mcp-routes.ts, transparent to tool code |

### Alternatives Considered
None -- this phase uses the existing stack. No new dependencies needed.

## Architecture Patterns

### registerTool API Shape (MCP SDK v1.27.1)

The current codebase uses `registerTool` correctly. The full config signature:

```typescript
mcpServer.registerTool(
  name: string,
  config: {
    title?: string;        // Human-readable title (separate from name)
    description?: string;  // LLM-facing description (the focus of SRCH-03)
    inputSchema?: ZodRawShapeCompat;  // Zod shape object (not z.object())
    outputSchema?: ZodRawShapeCompat; // Optional output schema
    annotations?: ToolAnnotations;    // Behavioral hints for clients
  },
  cb: ToolCallback
);
```

**ToolAnnotations available:**
```typescript
{
  title?: string;           // Human-readable title
  readOnlyHint?: boolean;   // Tool does not modify state (TRUE for all 3)
  destructiveHint?: boolean; // Tool may cause irreversible changes (FALSE)
  idempotentHint?: boolean; // Same input = same result (TRUE for all 3)
  openWorldHint?: boolean;  // Tool accesses external systems (TRUE -- Wiki.js)
}
```

**Confidence:** HIGH -- verified from SDK type definitions in `node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.d.ts` and `types.d.ts`.

### Recommended Tool Registration Pattern

```typescript
// Source: existing codebase pattern + SDK type definitions
mcpServer.registerTool(
  "get_page",
  {
    description: "Retrieve a Wiki.js page by its database ID. Returns the full page including title, path, description, markdown content, publication status (isPublished), and timestamps (createdAt, updatedAt). Use this tool when you need the actual content of a page. Get page IDs from search_pages or list_pages results.",
    inputSchema: {
      id: z.number().int().positive().describe(
        "Page database ID (get this from search_pages or list_pages results)"
      ),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  wrapToolHandler("get_page", async ({ id }) => {
    try {
      const page = await wikiJsApi.getPageById(id);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(page, null, 2) }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{
          type: "text" as const,
          text: `Error in get_page: ${String(error)}. Verify the ID using search_pages or list_pages.`,
        }],
      };
    }
  }),
);
```

### File Structure After Phase 16

```
src/
  mcp-tools.ts       # 3 tool registrations (was 17)
  scopes.ts           # SCOPE_TOOL_MAP updated: 3 tools under wikijs:read, write/admin arrays empty
  api.ts              # Unchanged (Phase 15 delivers new methods)
  tool-wrapper.ts     # Unchanged (reused for all 3 tools)
  types.ts            # Unchanged (cleanup deferred to Phase 18)
tests/
  smoke.test.ts       # Updated: 3-tool count, rewritten invocation tests
  scopes.test.ts      # Updated: 3-tool total count, read scope has 3 tools
  helpers/
    build-test-app.ts # Updated: mockWikiJsApi trimmed to 3 stubs + checkConnection
```

### SCOPE_TOOL_MAP Update Pattern

Per CONTEXT.md: "Update scope test counts (3 total tools) but leave 3-scope structure for Phase 17."

```typescript
export const SCOPE_TOOL_MAP: Record<Scope, readonly string[]> = {
  [SCOPES.READ]: [
    "get_page",
    "list_pages",
    "search_pages",
  ],
  [SCOPES.WRITE]: [],   // Empty -- all write tools removed
  [SCOPES.ADMIN]: [],   // Empty -- all admin tools removed
} as const;
```

This keeps the 3-scope structure (SCOPES constant, Scope type, SUPPORTED_SCOPES) intact for Phase 17 to simplify. The empty arrays mean the reverse mapping (TOOL_SCOPE_MAP) will only have 3 entries.

### Anti-Patterns to Avoid
- **Removing SCOPES.WRITE/ADMIN in this phase:** Phase 17 handles scope simplification. This phase only empties the tool arrays.
- **Creating a new test file for E2E tests:** The existing `smoke.test.ts` already has the E2E pattern with `mcpPost()` helper and full server lifecycle. Extend it rather than duplicating setup.
- **Leaving old mock stubs in place:** The 14 unused stubs (`createPage`, `updatePage`, `deletePage`, `getUsersList`, `searchUsers`, `getGroupsList`, `createUser`, `updateUser`, `getAllPagesList`, `searchUnpublishedPages`, `forceDeletePage`, `getPageStatus`, `publishPage`, `getPageContent`) should be removed. The mock should only have: `checkConnection`, `getPageById`, `listPages` (renamed from `getPagesList`), `searchPages`.
- **Short tool descriptions:** The entire point of SRCH-03 is verbose, LLM-optimized descriptions. Each description must be multi-sentence.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tool input validation | Manual type checks | Zod schemas via `inputSchema` | SDK does validation automatically; `.describe()` feeds LLM |
| Tool timing/logging | Per-tool `performance.now()` | `wrapToolHandler()` | Already exists, tested, includes user identity propagation |
| Error formatting | Ad-hoc string building | Consistent pattern with tool name + recovery hint | LLM self-correction requires predictable error format |

## Common Pitfalls

### Pitfall 1: Mock Method Names Must Match Phase 15 API Changes
**What goes wrong:** Phase 15 renames API methods (e.g., `getPagesList` -> `listPages`, merged `getAllPagesList` into `listPages`). If mocks still use old method names, tests pass but production will fail when Phase 15 code is integrated.
**Why it happens:** Mocks are `as unknown as WikiJsApi` casts, so TypeScript won't catch mismatched method names.
**How to avoid:** After Phase 15 completes, verify the exact method names in `api.ts` and match them in mocks. If Phase 15 is not yet merged, use the current method names and add a TODO comment for the rename.
**Warning signs:** Tests pass but tool handlers throw "is not a function" errors at runtime.

### Pitfall 2: Scope Test Assertions Reference Specific Tool Names
**What goes wrong:** `tests/scopes.test.ts` has assertions like `expect(readTools).toContain("get_page_content")` (line 46) and `expect(readTools).toHaveLength(7)` (line 52). Forgetting to update these causes test failures.
**Why it happens:** The scope tests are very specific -- they enumerate every tool by name in each scope.
**How to avoid:** Rewrite the scope tests to check: (1) 3 total tools, (2) all 3 under READ scope, (3) WRITE and ADMIN scopes are empty arrays, (4) no duplicate tools.
**Warning signs:** `npm test` fails immediately in scopes.test.ts.

### Pitfall 3: Observability Tests Reference Removed Tools
**What goes wrong:** `tests/observability.test.ts` line 509-523 tests `list_users` tool invocation logging. This tool no longer exists after Phase 16.
**Why it happens:** The observability integration tests call specific tools by name.
**How to avoid:** Replace `list_users` test with a test for `list_pages` (or keep existing `get_page` and `search_pages` tests which are already there). The `list_users` test was for "zero-arg tool" coverage -- `list_pages` with no args also works.
**Warning signs:** Observability test `list_users: logs toolName...` fails with tool-not-found error.

### Pitfall 4: smoke.test.ts Has Two Invocation Tests for Removed Tools
**What goes wrong:** `tests/smoke.test.ts` line 234-261 tests `list_users` tool invocation. This needs replacement.
**Why it happens:** Smoke test was written for the 17-tool set.
**How to avoid:** Replace with invocation tests for all 3 new tools. Each test should validate: (1) status 200, (2) JSON-RPC response structure, (3) `result.content` array with text type, (4) parseable JSON in the text content, (5) expected fields in the parsed response.
**Warning signs:** Smoke test fails on tools/call with "Unknown tool: list_users".

### Pitfall 5: Two Copies of mockWikiJsApi Need Coordinated Updates
**What goes wrong:** There are two mockWikiJsApi objects: one in `tests/smoke.test.ts` (lines 16-53) and one in `tests/helpers/build-test-app.ts` (lines 41-78). Updating one but not the other causes inconsistent behavior.
**Why it happens:** The smoke test was written before `buildTestApp()` was created, so it has its own inline mock.
**How to avoid:** Either (a) migrate smoke.test.ts to use `buildTestApp()` and delete its inline mock, or (b) update both mocks identically. Option (a) is preferred -- it removes the duplication.
**Warning signs:** Tests pass in one file but fail in another for the same tool.

### Pitfall 6: Phase 15 Dependency -- API Method Signatures May Not Exist Yet
**What goes wrong:** Phase 16 depends on Phase 15's consolidated API methods. If Phase 15 is not yet implemented, the new tool handlers can't call methods that don't exist.
**Why it happens:** Phases execute sequentially but may be planned in parallel.
**How to avoid:** Tool handlers should call the API methods that Phase 15 will deliver. If coding before Phase 15 merges, use the current method names (`getPageById`, `getPagesList`, `searchPages`) and note which will be renamed. The critical new behaviors (single-call get_page with content+isPublished, listPages with includeUnpublished) are what matter.
**Warning signs:** TypeScript compilation errors on method calls.

## Code Examples

### Tool 1: get_page

```typescript
// Based on CONTEXT.md decisions + existing patterns in mcp-tools.ts
const TOOL_GET_PAGE = "get_page";

mcpServer.registerTool(
  TOOL_GET_PAGE,
  {
    description:
      "Retrieve a Wiki.js page by its database ID. Returns the full page object including title, path, description, markdown content, publication status (isPublished), and timestamps (createdAt, updatedAt). Use this tool when you need the actual content of a specific page. Get page IDs from search_pages or list_pages results.",
    inputSchema: {
      id: z.number().int().positive().describe(
        "Page database ID (get this from search_pages or list_pages results)"
      ),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  wrapToolHandler(TOOL_GET_PAGE, async ({ id }) => {
    try {
      const page = await wikiJsApi.getPageById(id);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(page, null, 2) }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{
          type: "text" as const,
          text: `Error in get_page: ${String(error)}. Verify the page ID using search_pages or list_pages.`,
        }],
      };
    }
  }),
);
```

### Tool 2: list_pages

```typescript
const TOOL_LIST_PAGES = "list_pages";

mcpServer.registerTool(
  TOOL_LIST_PAGES,
  {
    description:
      "List Wiki.js pages with optional filtering and sorting. Returns page metadata (id, title, path, description, isPublished, createdAt, updatedAt) without content. Use this tool to browse available pages or find a specific page by title. For full page content, use get_page with the page ID from these results.",
    inputSchema: {
      limit: z.number().int().positive().max(100).optional().describe(
        "Maximum number of pages to return (default: 50, max: 100)"
      ),
      orderBy: z.enum(["TITLE", "CREATED", "UPDATED"]).optional().describe(
        "Sort order: TITLE (alphabetical), CREATED (newest first), or UPDATED (recently modified first)"
      ),
      includeUnpublished: z.boolean().optional().describe(
        "Include unpublished draft pages in results (default: false, published pages only)"
      ),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  wrapToolHandler(TOOL_LIST_PAGES, async ({ limit, orderBy, includeUnpublished }) => {
    try {
      // Phase 15 provides listPages(limit, orderBy, includeUnpublished)
      const pages = await wikiJsApi.listPages(limit, orderBy, includeUnpublished);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(pages, null, 2) }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{
          type: "text" as const,
          text: `Error in list_pages: ${String(error)}. Try reducing the limit or changing the sort order.`,
        }],
      };
    }
  }),
);
```

### Tool 3: search_pages

```typescript
const TOOL_SEARCH_PAGES = "search_pages";

mcpServer.registerTool(
  TOOL_SEARCH_PAGES,
  {
    description:
      "Search Wiki.js pages by keyword query. Returns matching pages with metadata and content excerpts. Only searches published pages (unpublished pages are not indexed). Note: recently published pages may take a moment to appear in search results due to indexing delay. Use get_page with a result's ID to retrieve the full page content.",
    inputSchema: {
      query: z.string().min(1).describe(
        "Search query string (searches page titles, content, and descriptions)"
      ),
      limit: z.number().int().positive().max(50).optional().describe(
        "Maximum number of search results to return (default: 10, max: 50)"
      ),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  wrapToolHandler(TOOL_SEARCH_PAGES, async ({ query, limit }) => {
    try {
      const results = await wikiJsApi.searchPages(query, limit);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{
          type: "text" as const,
          text: `Error in search_pages: ${String(error)}. Try a different search query or use list_pages to browse.`,
        }],
      };
    }
  }),
);
```

### Updated mockWikiJsApi (for tests/helpers/build-test-app.ts)

```typescript
// Only stubs needed for the 3 tools + checkConnection for health endpoint
export const mockWikiJsApi = {
  checkConnection: async () => true,
  getPageById: async (id: number) => ({
    id,
    path: "test/page",
    title: "Test Page",
    description: "A test page",
    content: "# Test Content\n\nThis is test content.",
    isPublished: true,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  }),
  listPages: async () => [
    {
      id: 1,
      path: "test",
      title: "Test",
      description: "Test page",
      isPublished: true,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    },
  ],
  searchPages: async () => ({
    results: [
      {
        id: 1,
        path: "test",
        title: "Test",
        description: "Test page",
        locale: "en",
      },
    ],
    totalHits: 1,
  }),
} as unknown as WikiJsApi;
```

**Note on mock method names:** The mock uses `listPages` (Phase 15's renamed method). If Phase 15 is not yet merged and the code still uses `getPagesList`, adjust accordingly. The key is that mock method names must match what the tool handlers actually call.

### Scope Test Updates (scopes.test.ts)

```typescript
it("maps exactly 3 tools total", () => {
  const allTools = Object.values(SCOPE_TOOL_MAP).flat();
  expect(allTools).toHaveLength(3);
});

it("assigns all 3 tools to wikijs:read", () => {
  const readTools = SCOPE_TOOL_MAP[SCOPES.READ];
  expect(readTools).toContain("get_page");
  expect(readTools).toContain("list_pages");
  expect(readTools).toContain("search_pages");
  expect(readTools).toHaveLength(3);
});

it("wikijs:write scope has no tools", () => {
  expect(SCOPE_TOOL_MAP[SCOPES.WRITE]).toHaveLength(0);
});

it("wikijs:admin scope has no tools", () => {
  expect(SCOPE_TOOL_MAP[SCOPES.ADMIN]).toHaveLength(0);
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `mcpServer.tool()` (positional args) | `mcpServer.registerTool()` (config object) | MCP SDK v1.x | Old `tool()` method is deprecated; `registerTool` supports annotations |
| No tool annotations | `annotations: { readOnlyHint, destructiveHint, ... }` | MCP protocol 2025-03-26 | Clients can use hints for better UX (e.g., skip confirmation for read-only) |
| Single-line descriptions | Multi-sentence LLM-optimized descriptions | Community best practice | Verbose descriptions improve tool selection accuracy by LLM clients |

**Deprecated/outdated:**
- `mcpServer.tool()` -- deprecated in favor of `registerTool()` (already not used in this codebase)
- `get_page_content` as separate tool -- merged into `get_page` (Phase 15's single-call API)

## Open Questions

1. **Phase 15 Method Names**
   - What we know: Phase 15 CONTEXT.md says "Merge getPagesList() and getAllPagesList() into a single listPages()" and replaces getPageById to include content+isPublished.
   - What's unclear: The exact method signature after Phase 15 implementation (Phase 15 hasn't been coded yet).
   - Recommendation: Code the tool handlers against the Phase 15 API contract described in 15-CONTEXT.md. If Phase 15 renames methods, the tool handler calls must match. If Phase 15 is still using old names at implementation time, match those and rename later.

2. **search_pages Response Shape**
   - What we know: Phase 15 CONTEXT.md says search returns `{ results: [...], totalHits: N }` wrapper. Phase 16 CONTEXT.md says "metadata + content excerpts/snippets per result."
   - What's unclear: Whether the search results from Phase 15 include content excerpts (Wiki.js search API does return snippets in some configurations).
   - Recommendation: The tool handler should pass through whatever Phase 15's `searchPages()` returns. The mock in tests should include the `{ results, totalHits }` wrapper shape.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TOOL-03 | Write tools absent from tools/list | integration | `npx vitest run tests/smoke.test.ts -t "returns exactly 3 tools" -x` | Will update existing |
| TOOL-04 | User/group tools absent from tools/list | integration | `npx vitest run tests/smoke.test.ts -t "removed tools" -x` | Will add new test |
| SRCH-03 | All 3 tools have verbose LLM-optimized descriptions | integration | `npx vitest run tests/smoke.test.ts -t "description" -x` | Will add new test |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] Update `tests/smoke.test.ts` -- change 17-tool count to 3, rewrite tool invocation tests
- [ ] Update `tests/scopes.test.ts` -- change 17-tool count to 3, update per-scope tool lists
- [ ] Update `tests/observability.test.ts` -- replace `list_users` integration test with `list_pages`
- [ ] Update `tests/helpers/build-test-app.ts` -- trim mockWikiJsApi to 3 stubs
- [ ] Update `tests/smoke.test.ts` inline mockWikiJsApi -- or migrate to use buildTestApp

### Files Requiring Modification

| File | What Changes | Lines Affected |
|------|-------------|----------------|
| `src/mcp-tools.ts` | Rewrite: 17 registrations to 3, verbose descriptions, annotations | Entire file (~509 lines -> ~120 lines) |
| `src/scopes.ts` | Update SCOPE_TOOL_MAP: READ gets 3 tools, WRITE/ADMIN get empty arrays | Lines 18-41 |
| `tests/smoke.test.ts` | Update: tool count 17->3, tool name list, invocation tests, mockWikiJsApi | Lines 16-53 (mock), 181-262 (tests) |
| `tests/scopes.test.ts` | Update: all assertions referencing 17 tools or specific removed tool names | Lines 24-73 (most of the file) |
| `tests/helpers/build-test-app.ts` | Update: trim mockWikiJsApi to 3 API method stubs | Lines 41-78 |
| `tests/observability.test.ts` | Update: replace `list_users` integration test (line 509-523) | Lines 509-523 |

## Sources

### Primary (HIGH confidence)
- MCP SDK type definitions: `node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.d.ts` -- registerTool signature, ToolAnnotations
- MCP SDK type definitions: `node_modules/@modelcontextprotocol/sdk/dist/esm/types.d.ts` -- ToolAnnotationsSchema fields
- Source code: `src/mcp-tools.ts` -- current 17 tool registrations pattern
- Source code: `src/scopes.ts` -- current SCOPE_TOOL_MAP structure
- Source code: `tests/smoke.test.ts` -- current test patterns and assertions
- Source code: `tests/scopes.test.ts` -- current scope test assertions
- Source code: `tests/helpers/build-test-app.ts` -- current mockWikiJsApi stubs
- Source code: `tests/observability.test.ts` -- tool-specific integration tests

### Secondary (MEDIUM confidence)
- Phase 15 CONTEXT.md -- API method signatures and response shapes (Phase 15 not yet implemented)
- Phase 16 CONTEXT.md -- user decisions on descriptions, schemas, response format, test strategy

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, verified SDK types in node_modules
- Architecture: HIGH -- extending existing pattern (registerTool + wrapToolHandler), verified API shape
- Pitfalls: HIGH -- identified from direct code inspection of all affected files with line numbers
- Test changes: HIGH -- enumerated every assertion that references 17 tools or removed tool names

**Research date:** 2026-03-26
**Valid until:** 2026-04-26 (stable -- MCP SDK and codebase patterns are locked)
