# Phase 23: Tool Handler Integration - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Apply the `isBlocked()` predicate (from Phase 22) in all 3 MCP tool handlers (`get_page`, `list_pages`, `search_pages`) so that blocked client directory pages are invisible to MCP clients. Includes timing-safe error responses for `get_page` and structured audit logging for all blocked access attempts.

</domain>

<decisions>
## Implementation Decisions

### Audit logging
- One structured log entry per blocked page (not summary counts)
- Log level: `warn`
- No path information in logs — message is generic "GDPR path blocked" with no path hint
- Structured field `gdprBlocked: true` in the pino log object for easy filtering/alerting
- Log payload includes: `toolName`, `userId`, `username`, `correlationId`, `gdprBlocked: true`

### search totalHits handling
- Adjust `totalHits` downward after filtering blocked pages (subtract filtered count from raw WikiJS value)
- Prevents information leak — client never sees a mismatch between results.length and totalHits
- `list_pages` returns the filtered array as-is (no count metadata to adjust)

### search filter placement
- Filter once at the end in `mcp-tools.ts` on the final resolved `WikiJsPage[]` array after `searchPages()` returns
- Keeps `api.ts` policy-neutral (per prior decision from STATE.md)
- Catches all resolution paths (GraphQL, singleByPath, resolveViaPagesList) in one place

### get_page error alignment
- Blocked page response matches existing catch block format exactly: `isError: true`, text: `"Error in get_page: Page not found. Verify the page ID using search_pages or list_pages."`
- Byte-identical to genuine absent page error — indistinguishable to MCP client
- Flow: always call `getPageById(id)` first (satisfies SEC-01 timing requirement), then check `isBlocked(page.path)` on the result
- If API returns null/undefined, skip `isBlocked` check and return data as-is (no path to check)

### Filter code organization
- Inline filtering in each handler body (~3-5 lines per handler)
- Small local `logBlockedAccess(toolName)` helper function at the top of `mcp-tools.ts`
- `isBlocked()` imported from whatever module Phase 22 creates

### Claude's Discretion
- Module name for `isBlocked()` import (Phase 22 decides this)
- Exact variable naming and code style within handlers
- Error handling edge cases not covered by the decisions above

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `requestContext.getStore()`: Provides `correlationId`, `userId`, `username`, and pino `log` — all needed for audit logging
- `wrapToolHandler()`: Already wraps all 3 handlers with timing and structured logging; filter runs inside the wrapped handler
- `WikiJsPage.path`: The field checked against `isBlocked()` — available on all page objects

### Established Patterns
- Tool handlers in `mcp-tools.ts` follow a consistent try/catch pattern with `isError: true` error responses
- Logging uses pino via `requestContext` with structured fields (`toolName`, `duration`, `userId`, `username`)
- `api.ts` is policy-neutral — returns raw WikiJS data; filtering happens in `mcp-tools.ts`

### Integration Points
- `mcp-tools.ts` line 63: `get_page` handler — add `isBlocked()` check after `getPageById()` call
- `mcp-tools.ts` line 121: `list_pages` handler — filter `pages` array before JSON serialization
- `mcp-tools.ts` line 176: `search_pages` handler — filter `result.results` array and adjust `result.totalHits`
- `isBlocked()` from Phase 22 module (not yet created)

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

*Phase: 23-tool-handler-integration*
*Context gathered: 2026-03-27*
