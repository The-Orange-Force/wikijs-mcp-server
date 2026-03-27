# Phase 27: Path Filter Removal and End-to-End Verification - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Remove all path-based GDPR filtering (isBlocked() and supporting code) from the codebase, and verify end-to-end that marker-based content redaction (Phase 25) + URL injection (Phase 26) work correctly as the sole GDPR mechanism. Every published wiki page must be accessible without path restrictions.

</domain>

<decisions>
## Implementation Decisions

### Test file strategy
- Delete all 3 GDPR test files entirely:
  - `src/__tests__/gdpr.test.ts` (isBlocked unit tests)
  - `src/__tests__/mcp-tools-gdpr.test.ts` (handler-level GDPR path filtering tests)
  - `tests/gdpr-filter.test.ts` (integration tests + instructions security audit)
- SEC-03 instructions keyword audit tests are dropped — nothing to hide with path-filtering gone
- Path-blocking is dead code; tests for dead code are dead tests

### E2E verification
- New file: `tests/e2e-redaction.test.ts` — dedicated end-to-end verification of complete v2.6 system
- All 4 scenarios covered:
  1. get_page with GDPR markers → content redacted, URL present, metadata intact
  2. get_page without markers → full content unchanged, URL present
  3. Formerly-blocked paths (Clients/AcmeCorp-style) accessible via all 3 tools (get_page, list_pages, search_pages)
  4. Malformed marker fail-safe → unclosed gdpr-start redacts to end of content
- Both regression guard (formerly-blocked paths) AND redaction flow verification

### Removal scope
- Delete `src/gdpr.ts` if it still only contains isBlocked() (if Phase 25 reused it for redactContent(), just remove isBlocked from it)
- Remove from `src/mcp-tools.ts`:
  - `import { isBlocked } from "./gdpr.js"`
  - `logBlockedAccess()` helper function
  - All isBlocked() checks in get_page, list_pages, search_pages handlers
- No replacement audit logging — trust Phase 25/26's own logging (REDACT-05 malformed marker warnings)
- No config changes needed — isBlocked() had no configuration

### Version bump
- Bump MCP server version in `createMcpServer()` from `2.4.0` to `2.6.0` — Phase 27 completes the v2.6 milestone

### Documentation updates
- Update PROJECT.md: change "GDPR-compliant path filtering" to "marker-based content redaction"
- Update any CLAUDE.md references to path-blocking
- Keep docs accurate as part of the removal sweep

### Claude's Discretion
- Exact test mock setup for E2E verification (page fixtures, marker content)
- Order of removal operations
- Whether to update instructions.txt.example references

</decisions>

<specifics>
## Specific Ideas

No specific requirements — straightforward removal + verification phase with clear success criteria from the roadmap.

</specifics>

<code_context>
## Existing Code Insights

### Files to Remove/Modify
- `src/gdpr.ts`: isBlocked() — only export, 20 lines — delete file if Phase 25 didn't add redactContent here
- `src/mcp-tools.ts`: lines 12 (import), 25-36 (logBlockedAccess), 91-96 (get_page check), 160-166 (list_pages filter), 219-226 (search_pages filter)
- `src/__tests__/gdpr.test.ts`: 96 lines — delete entirely
- `src/__tests__/mcp-tools-gdpr.test.ts`: 477 lines — delete entirely
- `tests/gdpr-filter.test.ts`: 425 lines — delete entirely

### Established Patterns
- Integration tests use `buildTestApp()` from `tests/helpers/build-test-app.js` with WikiJsApi mock override
- E2E tests follow the `callTool()` pattern: initialize → tools/call with Bearer token
- Test tokens generated via `createTestToken()` from auth test helpers

### Integration Points
- `src/mcp-tools.ts` createMcpServer() — where path checks are removed and version is bumped
- `tests/helpers/build-test-app.js` — shared test app builder for new E2E tests
- `.planning/PROJECT.md` and `CLAUDE.md` — docs to update

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 27-path-filter-removal-and-end-to-end-verification*
*Context gathered: 2026-03-27*
