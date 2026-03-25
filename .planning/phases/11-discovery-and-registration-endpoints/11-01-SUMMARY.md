---
phase: 11-discovery-and-registration-endpoints
plan: 01
subsystem: auth
tags: [oauth, rfc-8414, rfc-7591, discovery, dcr, fastify-plugin]

# Dependency graph
requires:
  - phase: 10-scope-mapper-and-azure-endpoint-utils
    provides: SUPPORTED_SCOPES array, AppConfig type
provides:
  - GET /.well-known/oauth-authorization-server endpoint (RFC 8414 AS metadata)
  - GET /.well-known/openid-configuration endpoint (OIDC Discovery alias)
  - POST /register endpoint (RFC 7591 Dynamic Client Registration)
  - oauthProxyRoutes Fastify plugin with OAuthProxyOptions interface
  - 24 integration tests covering all three endpoints
affects: [12-authorize-proxy, 13-token-proxy, 14-wire-up-and-protected-resource-metadata-switch]

# Tech tracking
tech-stack:
  added: []
  patterns: [static-metadata-at-registration-time, self-referencing-endpoint-urls]

key-files:
  created:
    - tests/oauth-proxy-discovery.test.ts
  modified:
    - src/routes/oauth-proxy.ts
    - src/server.ts
    - tests/helpers/build-test-app.ts
    - src/routes/public-routes.ts

key-decisions:
  - "All metadata endpoint URLs point to self (MCP_RESOURCE_URL), not Azure AD"
  - "Metadata object built once at plugin registration time, not per-request"
  - "POST /register manually validates Content-Type for 415 instead of relying on Fastify defaults"

patterns-established:
  - "Self-referencing metadata: discovery endpoints return this server's URLs as the authorize/token/register endpoints"
  - "OAuth proxy plugin pattern: oauthProxyRoutes registered alongside publicRoutes and protectedRoutes"

requirements-completed: [META-01, META-02, REGN-01]

# Metrics
duration: 2min
completed: 2026-03-25
---

# Phase 11 Plan 01: Discovery and Registration Endpoints Summary

**RFC 8414 AS metadata and RFC 7591 DCR endpoints in oauthProxyRoutes Fastify plugin with 24 integration tests**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-25T21:18:23Z
- **Completed:** 2026-03-25T21:21:16Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- GET /.well-known/oauth-authorization-server returns all 9 required metadata fields with Cache-Control header
- GET /.well-known/openid-configuration returns identical content (OIDC Discovery alias)
- POST /register returns 201 with client_id, no client_secret, token_endpoint_auth_method "none"
- POST /register returns 415 for non-JSON content types
- All three endpoints accessible without JWT authentication
- GET / updated to list the three new OAuth proxy endpoints
- Full test suite passes: 134 tests across 11 files (24 new, 110 existing)

## Task Commits

Each task was committed atomically:

1. **Task 1: Write failing integration tests (TDD RED)** - `93fcc10` (test)
2. **Task 2: Implement and verify (TDD GREEN)** - No new commit needed; implementation pre-existed from Phase 10 research scaffolding

**Plan metadata:** (pending final commit)

_Note: The oauthProxyRoutes plugin, server registration, test helper registration, and GET / endpoint updates were already in place from Phase 10 research. Task 2 verified the existing implementation passes all 24 tests with zero regressions._

## Files Created/Modified
- `tests/oauth-proxy-discovery.test.ts` - 24 integration tests covering META-01, META-02, REGN-01
- `src/routes/oauth-proxy.ts` - OAuth proxy Fastify plugin with discovery and registration routes (pre-existing)
- `src/server.ts` - Registers oauthProxyRoutes plugin (pre-existing)
- `tests/helpers/build-test-app.ts` - Registers oauthProxyRoutes for test apps (pre-existing)
- `src/routes/public-routes.ts` - GET / lists new endpoints (pre-existing)

## Decisions Made
- All metadata endpoint URLs point to self (MCP_RESOURCE_URL), not Azure AD -- MCP clients need to discover this proxy server's endpoints, not Azure directly
- Metadata object built once at plugin registration time for efficiency
- POST /register manually validates Content-Type header (returns 415 for non-JSON) rather than relying on Fastify's default body parser behavior

## Deviations from Plan

### Pre-existing Implementation

The implementation files (oauth-proxy.ts, server.ts registration, build-test-app.ts registration, public-routes.ts endpoint listing) were already in place from Phase 10 research scaffolding. Task 2 did not require any code changes -- only verification that the existing implementation satisfied all 24 test cases.

**Impact on plan:** Positive -- research phase work reduced execution time. All tests pass, all success criteria met.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- oauthProxyRoutes plugin is registered and tested, ready for Phase 12 (GET /authorize proxy) and Phase 13 (POST /token proxy) additions
- Metadata endpoints correctly advertise /authorize and /token as self-URLs, which Phase 12/13 will implement
- POST /register returns the shared client_id that will be used in authorization flows

## Self-Check: PASSED

- FOUND: tests/oauth-proxy-discovery.test.ts
- FOUND: src/routes/oauth-proxy.ts
- FOUND: 11-01-SUMMARY.md
- FOUND: commit 93fcc10 (Task 1 TDD RED)

---
*Phase: 11-discovery-and-registration-endpoints*
*Completed: 2026-03-25*
