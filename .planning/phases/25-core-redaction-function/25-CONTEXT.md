# Phase 25: Core Redaction Function - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Pure `redactContent()` function that replaces content between `<!-- gdpr-start -->` and `<!-- gdpr-end -->` HTML comment markers with a redaction placeholder. Comprehensive test coverage. No handler wiring (Phase 26) or path filter removal (Phase 27).

</domain>

<decisions>
## Implementation Decisions

### Return value shape
- Structured result: `RedactionResult { content, redactionCount, warnings }`
- Warnings are structured objects: `RedactionWarning { message, pageId, path }`
- Types exported from gdpr.ts alongside the function
- Function accepts separate params: `redactContent(content: string, pageId: number, path: string)`
- Null/undefined/empty content handled gracefully — returns `{ content: "", redactionCount: 0, warnings: [] }`

### Logging approach
- Function is pure — returns warnings in the result, does not log directly
- Caller logs warnings as a single batched log entry per page (not one per warning)
- Only log when warnings exist — successful redaction is silent
- Logging responsibility is Phase 26 (caller in get_page handler)

### Module placement
- Add `redactContent()` to existing `src/gdpr.ts` alongside `isBlocked()`
- `RedactionResult` and `RedactionWarning` interfaces exported from gdpr.ts
- Phase 27 will rename gdpr.ts to redact.ts after isBlocked() removal

### Nested and edge-case markers
- First-start to first-end pairing: left-to-right scan, nested start markers are just redacted content
- Orphaned gdpr-end (no preceding start): ignore content but emit a warning
- Markers are replaced along with redacted content — clean output with no marker noise
- Unclosed gdpr-start: redact from marker to end of content (REDACT-04 fail-closed)

### Claude's Discretion
- Regex pattern design for marker matching with case/whitespace tolerance
- Test structure and organization
- Exact warning message wording

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/gdpr.ts`: isBlocked() — 20-line module, same file will host redactContent()
- `src/types.ts`: WikiJsPage with `content?: string` field — the content being redacted
- `src/__tests__/gdpr.test.ts`: Existing test patterns for gdpr.ts (null safety, case sensitivity, edge cases)

### Established Patterns
- isBlocked() is a pure predicate with null safety — redactContent() should follow same defensive coding style
- Security-sensitive code uses minimal public API surface (isBlocked is the only export from gdpr.ts currently)
- All imports use `.js` extensions (NodeNext module resolution)

### Integration Points
- Phase 26 will import redactContent() from gdpr.ts into mcp-tools.ts get_page handler
- get_page handler (mcp-tools.ts:87-113) is the single call site — processes WikiJsPage.content before JSON serialization
- requestContext logger available at call site for warning logging

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 25-core-redaction-function*
*Context gathered: 2026-03-27*
