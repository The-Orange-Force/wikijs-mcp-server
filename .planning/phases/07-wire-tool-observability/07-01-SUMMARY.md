---
phase: 07-wire-tool-observability
plan: 01
subsystem: observability
tags: [pino, async-local-storage, mcp-tools, wrapToolHandler, debug-logging]

# Dependency graph
requires:
  - phase: 05-route-protection-and-observability
    provides: "wrapToolHandler, requestContext AsyncLocalStorage, tool invocation logging infrastructure"
provides:
  - "All 17 MCP tool handlers wrapped with wrapToolHandler for timing and identity logging"
  - "Debug-level pre-invocation logging with toolName and args for crash diagnostics"
  - "Integration tests proving end-to-end observability for get_page, search_pages, list_users"
affects: [08-dead-code-tech-debt-cleanup]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TOOL_* SCREAMING_SNAKE constants for tool name deduplication"
    - "wrapToolHandler wrapping pattern for MCP SDK registerTool handlers"
    - "debug-level pre-invocation log for crash diagnostics"

key-files:
  created: []
  modified:
    - "src/tool-wrapper.ts"
    - "src/mcp-tools.ts"
    - "tests/observability.test.ts"

key-decisions:
  - "Debug log emitted before performance.now() start -- timing excludes debug log overhead"
  - "Existing tests updated to filter by info level (30) since debug logs now also contain toolName"

patterns-established:
  - "TOOL_* constants: tool names defined once, used in both registerTool and wrapToolHandler"
  - "Debug-level pre-invocation log: { toolName, args } at level 20 before handler execution"

requirements-completed: [OBSV-01]

# Metrics
duration: 4min
completed: 2026-03-24
---

# Phase 7 Plan 1: Wire Tool Observability Summary

**All 17 MCP tool handlers wrapped with wrapToolHandler for user identity + timing logging, plus debug-level pre-invocation args log for crash diagnostics**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-24T22:01:49Z
- **Completed:** 2026-03-24T22:05:42Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added debug-level log (pino level 20) with { toolName, args } before every tool handler invocation
- Wrapped all 17 registerTool() handlers in mcp-tools.ts with wrapToolHandler()
- Added 17 TOOL_* SCREAMING_SNAKE constants to eliminate tool name string duplication
- Added 3 integration tests proving end-to-end observability through the full MCP stack
- Closed OBSV-01 requirement

## Task Commits

Each task was committed atomically:

1. **Task 1: Add debug log to wrapper and wrap all 17 tool handlers**
   - `c9297af` test(07-01): add failing test for debug-level args logging (RED)
   - `25c2f16` feat(07-01): add debug log to wrapper and wrap all 17 tool handlers (GREEN)
2. **Task 2: Add debug args unit test and integration tests for 3 representative tools** - `d32727d` (test)

_Note: Task 1 used TDD (test -> feat). Task 2 integration tests passed immediately since infrastructure was wired in Task 1._

## Files Created/Modified
- `src/tool-wrapper.ts` - Added debug-level log line before handler invocation
- `src/mcp-tools.ts` - Added wrapToolHandler import, 17 TOOL_* constants, wrapped all 17 handlers
- `tests/observability.test.ts` - Added debug args unit test, 3 integration tests (get_page, search_pages, list_users)

## Decisions Made
- Debug log emitted before performance.now() start so timing measurement excludes debug log overhead
- Existing tests that filtered by toolName only were updated to also filter by level (30) since debug logs now also contain toolName field

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed existing tests broken by debug log addition**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** Two existing tests ("duration" and "user identity") filtered logs by `toolName` without `level`, now matching 2 entries (debug + info) instead of 1
- **Fix:** Added `l.level === 30 &&` filter to both tests so they only match info-level logs
- **Files modified:** tests/observability.test.ts
- **Verification:** All 12 tests pass
- **Committed in:** 25c2f16 (part of Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minimal -- existing test assertions needed level filter after debug log was added. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 7 complete -- all 17 tools now have full observability (debug args + info timing + user identity)
- Ready for Phase 8: Dead Code & Tech Debt Cleanup

## Self-Check: PASSED

All files found, all commits verified.

---
*Phase: 07-wire-tool-observability*
*Completed: 2026-03-24*
