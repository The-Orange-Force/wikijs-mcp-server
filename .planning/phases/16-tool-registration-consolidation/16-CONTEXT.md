# Phase 16: Tool Registration Consolidation - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace 17 tool registrations in `mcp-tools.ts` with exactly 3 read-only tools (`get_page`, `list_pages`, `search_pages`) with verbose LLM-optimized descriptions. Remove all write, user, and group tool registrations. Update tests and mocks to match.

</domain>

<decisions>
## Implementation Decisions

### Tool descriptions
- Usage-focused prose: 2-3 sentences per tool (what it does, what it returns, when to use it)
- Cross-reference other tools to guide LLM workflow (e.g., search_pages hints "use get_page with the returned ID for full content")
- Name key return fields in the description (e.g., "Returns title, path, content, description, isPublished, createdAt, updatedAt")
- Mention known limitations (e.g., search_pages only searches published pages, search index delay)

### Input schema design
- `get_page`: ID only (integer), no path support
- `list_pages`: merge `includeUnpublished` flag from old `list_all_pages` (optional boolean, default false), keep `limit` and `orderBy`
- `search_pages`: default limit of 10 if not specified, `query` required
- Zod `.describe()` strings are detailed with usage hints (e.g., "Page database ID (get this from search_pages or list_pages results)")

### Response format
- Structured JSON (`JSON.stringify(result, null, 2)`) for all 3 tools
- `get_page`: full page object with content
- `list_pages`: metadata only (id, title, path, description, isPublished, createdAt, updatedAt) — no content field
- `search_pages`: metadata + content excerpts/snippets per result
- Error responses are contextual: include tool name and recovery hint (e.g., "Error in get_page: Page with ID 999 not found. Verify the ID using search_pages or list_pages.")

### Test strategy
- Update 17→3 count assertions in smoke.test.ts and scopes.test.ts
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

</decisions>

<specifics>
## Specific Ideas

- Descriptions should read like API docs for an LLM consumer, not a human developer
- Search results with excerpts help the LLM decide which page to fetch without fetching all of them
- Error messages should guide the LLM to self-correct (e.g., suggest using search_pages if get_page fails)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `wrapToolHandler()` in `src/tool-wrapper.ts`: timing + structured logging wrapper, reuse for all 3 tools
- `SCOPE_TOOL_MAP` / `TOOL_SCOPE_MAP` in `src/scopes.ts`: authoritative scope mapping, update to 3 tools
- `requestContext` in `src/request-context.ts`: AsyncLocalStorage for correlation IDs, used by tool wrapper
- `buildTestApp()` in `tests/helpers/build-test-app.ts`: test Fastify app with local JWKS and mockWikiJsApi
- `createTestToken()` in `src/auth/__tests__/helpers.ts`: JWT helper for integration tests

### Established Patterns
- Tool registration: `mcpServer.registerTool(name, { description, inputSchema }, wrapToolHandler(name, handler))`
- Error handling: try/catch returning `{ isError: true, content: [{ type: "text", text: "Error: ..." }] }`
- Response format: `{ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }`
- Zod schemas for input validation with `.describe()` on each field

### Integration Points
- `src/mcp-tools.ts`: main file being rewritten (17 registrations → 3)
- `src/scopes.ts`: SCOPE_TOOL_MAP needs tool list updated (remove write/admin tools)
- `src/api.ts`: Phase 15 delivers new API methods this phase consumes
- `tests/smoke.test.ts`: 17-tool count assertion at line 197, tool invocation tests
- `tests/scopes.test.ts`: 17-tool count assertion at line 26
- `tests/helpers/build-test-app.ts`: mockWikiJsApi stubs need cleanup

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 16-tool-registration-consolidation*
*Context gathered: 2026-03-26*
