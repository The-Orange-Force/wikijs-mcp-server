---
phase: 14-wire-up-and-protected-resource-metadata-switch
plan: 01
subsystem: auth
tags: [oauth, discovery, prm, e2e, metadata, mock-fetch]

# Dependency graph
requires:
  - phase: 11-oauth-discovery-dcr-authorize
    provides: oauthProxyRoutes plugin with metadata, DCR, authorize endpoints
  - phase: 13-token-proxy-endpoint
    provides: POST /token proxy with AADSTS normalization
provides:
  - Self-referencing authorization_servers in protected resource metadata
  - Mock fetch injection in test helper preventing real Azure AD calls
  - E2E discovery chain integration test validating full OAuth flow
  - GET / with authorization_server_metadata field and all 10 endpoints listed
affects: [claude-desktop-integration, live-tenant-testing]

# Tech tracking
tech-stack:
  added: []
  patterns: [mock-fetch-injection, sequential-e2e-chain-testing, captured-fetch-assertions]

key-files:
  created:
    - tests/e2e-flow.test.ts
  modified:
    - src/routes/public-routes.ts
    - tests/helpers/build-test-app.ts
    - tests/discovery.test.ts
    - tests/route-protection.test.ts

key-decisions:
  - "PRM authorization_servers switched from Azure AD tenant URL to appConfig.azure.resourceUrl (self)"
  - "Mock fetch captures outbound calls for assertion without returning fake token responses"
  - "E2E test uses 6 sequential steps sharing state via let declarations to validate chain links"

patterns-established:
  - "CapturedFetchCall interface + capturedFetchCalls array for asserting outbound HTTP in tests"
  - "Sequential it() blocks sharing state for chain-validation integration tests"

requirements-completed: [META-03, INTG-01, INTG-02]

# Metrics
duration: 3min
completed: 2026-03-26
---

# Phase 14 Plan 01: Wire-up and Protected Resource Metadata Switch Summary

**Self-referencing PRM metadata switchover with mock fetch test infrastructure and 6-step E2E discovery chain integration test**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-26T08:03:05Z
- **Completed:** 2026-03-26T08:05:37Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Switched protected resource metadata authorization_servers from Azure AD to self (MCP_RESOURCE_URL), making MCP clients discover this server as their authorization server proxy
- Added mock fetch injection to buildTestApp preventing accidental real Azure AD calls during tests
- Created comprehensive E2E test validating the full discovery chain: PRM -> AS metadata -> DCR -> authorize redirect -> token proxy -> authenticated MCP call
- Updated GET / to include authorization_server_metadata field and list all 10 endpoints with access annotations

## Task Commits

Each task was committed atomically:

1. **Task 1: Metadata switchover, mock fetch injection, existing test updates** - `a9509c0` (feat)
2. **Task 2: E2E discovery chain integration test** - `182e037` (test)

## Files Created/Modified
- `src/routes/public-routes.ts` - Switched authorization_servers to self, added authorization_server_metadata and proxy endpoints to GET /
- `tests/helpers/build-test-app.ts` - Added CapturedFetchCall interface, capturedFetchCalls array, mockFetch function, updated oauthProxyRoutes registration
- `tests/discovery.test.ts` - Updated authorization_servers assertion to check for FAKE_RESOURCE_URL (self)
- `tests/route-protection.test.ts` - Added 5 proxy endpoint public-access tests, updated GET / assertion
- `tests/e2e-flow.test.ts` - New 6-step E2E discovery chain integration test

## Decisions Made
- PRM authorization_servers switched from Azure AD tenant URL to appConfig.azure.resourceUrl (self) -- this is the key metadata switchover that makes the proxy operational
- Mock fetch captures outbound calls for assertion without returning fake token responses -- simpler and sufficient for chain validation
- E2E test uses 6 sequential steps sharing state via let declarations to validate chain links, not hardcoded paths

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All OAuth proxy endpoints are wired up and discoverable via standard metadata
- Full test coverage at 209 tests across 15 test files
- Ready for live tenant testing with Claude Desktop
- Remaining concern: Claude Desktop redirect_uri format needs live tenant testing (http://localhost port handling)

## Self-Check: PASSED

All 5 files verified present. Both task commits (a9509c0, 182e037) verified in git history. 209 tests passing across 15 test files.

---
*Phase: 14-wire-up-and-protected-resource-metadata-switch*
*Completed: 2026-03-26*
