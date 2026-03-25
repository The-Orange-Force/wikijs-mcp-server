---
phase: 10-scope-mapper-and-azure-endpoint-utils
plan: 01
subsystem: auth
tags: [oauth, azure-ad, scope-mapping, rfc-8707]

# Dependency graph
requires: []
provides:
  - "mapScopes() pure function — bare MCP to api://{clientId}/ Azure AD format"
  - "stripResourceParam() pure function — RFC 8707 resource key removal"
  - "buildAzureEndpoints() pure function — Azure AD v2.0 authorize/token URLs"
  - "AzureEndpoints interface for downstream type safety"
affects: [11-authorize-proxy, 12-token-proxy, 13-metadata-and-registration, 14-integration-testing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure function utilities in src/oauth-proxy/ directory for proxy layer"
    - "TDD with separate RED/GREEN commits per module"

key-files:
  created:
    - src/oauth-proxy/scope-mapper.ts
    - src/oauth-proxy/azure-endpoints.ts
    - src/oauth-proxy/__tests__/scope-mapper.test.ts
    - src/oauth-proxy/__tests__/azure-endpoints.test.ts
  modified: []

key-decisions:
  - "Import SUPPORTED_SCOPES from existing scopes.ts rather than duplicating scope list"
  - "OIDC_PASSTHROUGH as Set for O(1) lookup on openid/offline_access"
  - "Unknown scopes pass through unchanged for transparent proxy behavior"

patterns-established:
  - "OAuth proxy utilities are pure functions accepting primitive parameters (clientId, tenantId) not config singletons"
  - "src/oauth-proxy/ directory houses all proxy-layer code with co-located __tests__"

requirements-completed: [SCOPE-01, SCOPE-02]

# Metrics
duration: 2min
completed: 2026-03-25
---

# Phase 10 Plan 01: Scope Mapper and Azure Endpoint Utils Summary

**Pure-function scope mapper (bare MCP to Azure AD api:// format), RFC 8707 resource stripper, and Azure AD v2.0 endpoint URL constructor with 13 TDD tests**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-25T21:02:40Z
- **Completed:** 2026-03-25T21:04:33Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- mapScopes() correctly prefixes bare MCP scopes (wikijs:read/write/admin) with api://{clientId}/ while passing OIDC, unknown, and already-prefixed scopes through unchanged
- stripResourceParam() safely removes RFC 8707 resource key without mutating input (prevents Azure AD AADSTS9010010 error)
- buildAzureEndpoints() constructs correct Azure AD v2.0 authorize and token URLs from tenant ID
- 13 tests covering all edge cases: empty, single, mixed, OIDC passthrough, unknown passthrough, no double-prefix, resource removal

## Task Commits

Each task was committed atomically:

1. **Task 1: Scope mapper and resource parameter stripper**
   - `67faaa4` (test) — failing tests for scope mapper and resource stripper
   - `40c6544` (feat) — implement scope mapper and resource parameter stripper
2. **Task 2: Azure AD endpoint URL constructor**
   - `b9b9a6f` (test) — failing tests for Azure endpoint constructor
   - `08da535` (feat) — implement Azure AD endpoint URL constructor

_Note: TDD tasks have two commits each (RED test then GREEN implementation). No refactoring needed._

## Files Created/Modified
- `src/oauth-proxy/scope-mapper.ts` — mapScopes() and stripResourceParam() pure functions
- `src/oauth-proxy/azure-endpoints.ts` — buildAzureEndpoints() and AzureEndpoints interface
- `src/oauth-proxy/__tests__/scope-mapper.test.ts` — 10 tests for scope mapping and resource stripping
- `src/oauth-proxy/__tests__/azure-endpoints.test.ts` — 3 tests for Azure endpoint URL construction

## Decisions Made
- Imported SUPPORTED_SCOPES from existing scopes.ts to maintain single source of truth for known MCP scopes
- Used a Set for OIDC passthrough scopes (openid, offline_access) for O(1) lookup
- Unknown scopes pass through unchanged — proxy stays transparent per locked decision

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Both modules exported and ready for import by Phase 11 (authorize proxy) and Phase 12 (token proxy)
- AzureEndpoints interface provides type safety for downstream URL consumption
- Full test suite passes: 110 tests (97 existing + 13 new), zero regressions

## Self-Check: PASSED

- All 5 files exist on disk
- All 4 task commits verified in git log
- Both modules export expected functions (2 exports each)
- Full test suite: 110 tests passing, zero regressions

---
*Phase: 10-scope-mapper-and-azure-endpoint-utils*
*Completed: 2026-03-25*
