---
phase: 06-scope-format-alignment
plan: 01
subsystem: auth
tags: [oauth, scopes, rfc9728, azure-ad]

# Dependency graph
requires:
  - phase: 04-jwt-authentication
    provides: Auth middleware with scope validation and scopes.ts scope constants
  - phase: 03-discovery-endpoint
    provides: RFC 9728 discovery endpoint serving scopes_supported
provides:
  - Unified colon-notation scope strings across discovery and auth middleware
  - Single source of truth for scope constants in src/scopes.ts
  - Middleware imports SUPPORTED_SCOPES from canonical source
affects: [07-wire-tool-observability, 08-tool-scope-enforcement]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single source of truth: all scope strings derive from src/scopes.ts SCOPES constant"
    - "Import over duplication: middleware imports SUPPORTED_SCOPES rather than defining its own array"

key-files:
  created: []
  modified:
    - src/scopes.ts
    - src/auth/middleware.ts
    - tests/scopes.test.ts
    - tests/discovery.test.ts

key-decisions:
  - "Colon notation (wikijs:read) chosen over dot notation (wikijs.read) per OAuth 2.0 / Azure AD convention"
  - "VALID_SCOPES removed entirely from middleware rather than kept as re-export to prevent future drift"

patterns-established:
  - "Scope source of truth: src/scopes.ts SCOPES constant is the only place scope strings are defined"

requirements-completed: [DISC-02]

# Metrics
duration: 2min
completed: 2026-03-24
---

# Phase 6 Plan 1: Scope Format Alignment Summary

**Standardized scope notation to colon format (wikijs:read) with single source of truth in src/scopes.ts, eliminating mismatch between discovery endpoint and auth middleware**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-24T21:49:57Z
- **Completed:** 2026-03-24T21:51:46Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Changed src/scopes.ts SCOPES constants from dot notation (wikijs.read) to colon notation (wikijs:read)
- Removed duplicate VALID_SCOPES array from auth middleware, replaced with import of SUPPORTED_SCOPES from src/scopes.ts
- Updated all test assertions in scopes and discovery tests to use colon notation
- Full test suite passes (106 tests), zero dot-notation scope strings remain in src/ or tests/

## Task Commits

Each task was committed atomically:

1. **Task 1: Align scopes.ts to colon notation and update middleware import** - `a4495b9` (feat)
2. **Task 2: Update test assertions from dot to colon notation** - `c9009c7` (test)

## Files Created/Modified
- `src/scopes.ts` - Changed SCOPES constants from dot to colon notation (wikijs:read, wikijs:write, wikijs:admin)
- `src/auth/middleware.ts` - Removed VALID_SCOPES definition, added import of SUPPORTED_SCOPES from src/scopes.ts, replaced all 3 usages
- `tests/scopes.test.ts` - Updated all scope string assertions and test descriptions to colon notation
- `tests/discovery.test.ts` - Updated scopes_supported assertion to colon notation

## Decisions Made
- Colon notation chosen as the standard format per OAuth 2.0 / Azure AD convention (aligns with what Azure AD tokens actually contain)
- VALID_SCOPES deleted entirely from middleware.ts rather than kept as alias/re-export, to enforce single source of truth

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Scope notation is now consistent across discovery endpoint and auth middleware
- Clients following RFC 9728 discovery document will request correct colon-notation scopes from Azure AD
- Ready for tool-level scope enforcement in subsequent phases

## Self-Check: PASSED

- All 4 modified files exist on disk
- Both task commits (a4495b9, c9009c7) found in git log
- Full test suite: 106 tests passing
- Zero dot-notation scope strings in src/ or tests/

---
*Phase: 06-scope-format-alignment*
*Completed: 2026-03-24*
