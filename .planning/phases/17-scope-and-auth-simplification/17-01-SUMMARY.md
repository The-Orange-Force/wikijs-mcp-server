---
phase: 17-scope-and-auth-simplification
plan: 01
subsystem: auth
tags: [oauth, scopes, single-scope, simplification]

# Dependency graph
requires:
  - phase: 16-tool-registration-consolidation
    provides: 3-tool model (get_page, list_pages, search_pages)
provides:
  - Single-scope model (wikijs:read only)
  - Simplified auth middleware scope validation
  - Updated test assertions for single-scope reality
affects: [auth, oauth-proxy, discovery]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Single-scope enforcement (wikijs:read only)
    - Auto-propagation via SUPPORTED_SCOPES import

key-files:
  created: []
  modified:
    - src/scopes.ts
    - src/oauth-proxy/scope-mapper.ts
    - tests/scopes.test.ts
    - src/auth/__tests__/helpers.ts
    - src/auth/__tests__/middleware.test.ts
    - src/auth/__tests__/errors.test.ts
    - tests/discovery.test.ts
    - src/oauth-proxy/__tests__/scope-mapper.test.ts

key-decisions:
  - "Collapse from 3 scopes to 1 scope (wikijs:read) since all remaining tools are read-only"
  - "Keep TOOL_SCOPE_MAP derivation pattern for future extensibility"

patterns-established:
  - "SUPPORTED_SCOPES as single source of truth - consumer files auto-propagate changes"

requirements-completed: [SCOP-01, SCOP-02]

# Metrics
duration: 1min
completed: 2026-03-26
---

# Phase 17 Plan 01: Scope Simplification Summary

**Collapsed scope model from 3 scopes (wikijs:read, wikijs:write, wikijs:admin) to single wikijs:read scope, with all test assertions updated to match the single-scope reality**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-26T14:34:33Z
- **Completed:** 2026-03-26T14:34:50Z
- **Tasks:** 2 (both pre-completed as deviations in earlier phases)
- **Files modified:** 8

## Accomplishments

- Single-scope model implemented (wikijs:read only)
- All 6 consumer files auto-propagate changes via SUPPORTED_SCOPES import
- Full test suite (227 tests) passes with updated assertions
- Tokens with wikijs:write or wikijs:admin only are now rejected with 403

## Task Commits

Most work was pre-completed as Rule 3 deviations during Phases 15-16. This plan formalized the final test updates:

1. **Task 1: Simplify scopes.ts and update scope-mapper JSDoc** - Pre-completed in earlier phases (production code)
2. **Task 2: Update all test files for single-scope model** - `84e7246` (test)

**Plan metadata:** `4b05af9` (docs: complete plan)

## Files Created/Modified

- `src/scopes.ts` - Single-scope model with only READ key mapping to 3 tools
- `src/oauth-proxy/scope-mapper.ts` - JSDoc updated to mention only wikijs:read
- `tests/scopes.test.ts` - Full rewrite for single-scope assertions
- `src/auth/__tests__/helpers.ts` - Default test token uses scp: 'wikijs:read'
- `src/auth/__tests__/middleware.test.ts` - 403 rejection tests for wikijs:write/admin
- `src/auth/__tests__/errors.test.ts` - buildWwwAuthenticate403 uses only wikijs:read
- `tests/discovery.test.ts` - scopes_supported equals ["wikijs:read"]
- `src/oauth-proxy/__tests__/scope-mapper.test.ts` - Tests for single-scope prefixing

## Decisions Made

- Kept TOOL_SCOPE_MAP derivation pattern (not hardcoded) for future extensibility
- Used SUPPORTED_SCOPES as single source of truth - all consumer files import and auto-propagate

## Deviations from Plan

None - plan executed exactly as specified.

Note: Most implementation work was pre-completed as Rule 3 deviations during Phases 15-01, 15-02, and 16-02 execution. This plan formalized the remaining test file updates.

## Issues Encountered

None - straightforward execution.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Single-scope model complete and verified
- All tests passing (227 tests)
- Ready for Phase 18 or milestone completion

---
*Phase: 17-scope-and-auth-simplification*
*Completed: 2026-03-26*

## Self-Check: PASSED

- SUMMARY.md exists: FOUND
- Task commit 84e7246: FOUND
- Plan commit 4b05af9: FOUND
- src/scopes.ts exists: FOUND
- All tests pass: 227 passed
