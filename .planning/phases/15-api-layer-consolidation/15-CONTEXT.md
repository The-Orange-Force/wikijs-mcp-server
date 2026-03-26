# Phase 15: API Layer Consolidation - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Build consolidated GraphQL methods in WikiJsApi for get, list, and search page access. Fix search ID resolution so returned IDs are real database page IDs. This phase changes only the API layer (src/api.ts and src/types.ts) — tool registration changes happen in Phase 16.

</domain>

<decisions>
## Implementation Decisions

### get_page response shape
- Minimal fields only: id, path, title, description, content, isPublished, createdAt, updatedAt
- No locale, editor, tags, or author fields
- Single GraphQL query (merge metadata + content + isPublished into one pages.single call)
- Replace existing getPageById() method in-place (don't create a new method)
- Extend WikiJsPage interface with required content and isPublished fields (no separate PageDetail type)

### Search ID resolution failures
- Drop unresolvable results silently from the response (AI gets fewer but reliable results)
- Log a warning server-side for each dropped result (path + original search index ID)
- Return wrapper object: `{ results: [...], totalHits: N }` so AI can see if results were dropped
- totalHits comes from Wiki.js search response, results array contains only resolved items

### list_pages default behavior
- includeUnpublished defaults to false (published pages only)
- Merge getPagesList() and getAllPagesList() into a single listPages(limit, orderBy, includeUnpublished) method
- Always include isPublished field in response regardless of filter setting (consistent shape)
- Metadata only in list results (no content) — use get_page for full page content

### Search resolution strategy
- Try singleByPath first for each search result (parallel via Promise.allSettled)
- If singleByPath fails (permission error or not found), fall back to a single pages.list batch call
- Cross-reference all remaining unresolved results against the pages.list response by path matching
- Log a warning if singleByPath fails due to missing permissions (manage:pages + delete:pages)
- pages.list fallback limit: Claude's discretion based on wiki size and performance trade-offs

### Claude's Discretion
- pages.list fallback limit for cross-reference (balance coverage vs performance)
- Internal error handling patterns (how to detect permission errors vs not-found)
- Whether to cache the pages.list result if multiple search results need fallback
- Exact logging format for dropped results and permission warnings

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `WikiJsApi` class (src/api.ts): All GraphQL calls centralized here — modify in-place
- `WikiJsPage` interface (src/types.ts): Extend with content + isPublished fields
- `wrapToolHandler` (src/tool-wrapper.ts): Timing + structured logging for tool handlers
- `requestContext` (src/request-context.ts): AsyncLocalStorage for correlation IDs in log warnings

### Established Patterns
- GraphQL queries use template string interpolation with JSON.stringify for values
- Response types use `any` cast on GraphQL response then return typed objects
- Client-side filtering for isPublished (no server-side filter on pages.list)
- Error handling: try/catch returning `{ isError: true, content: [...] }`

### Integration Points
- `getPageById()` called by TOOL_GET_PAGE and TOOL_GET_PAGE_CONTENT handlers in mcp-tools.ts
- `getPagesList()` called by TOOL_LIST_PAGES handler
- `getAllPagesList()` called by TOOL_LIST_ALL_PAGES and searchUnpublishedPages handlers
- `searchPages()` called by TOOL_SEARCH_PAGES handler
- Mock stubs in tests/helpers/build-test-app.ts — mockWikiJsApi needs matching method signatures

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 15-api-layer-consolidation*
*Context gathered: 2026-03-26*
