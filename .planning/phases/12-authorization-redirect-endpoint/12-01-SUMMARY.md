---
phase: 12-authorization-redirect-endpoint
plan: 01
subsystem: auth
tags: [oauth, fastify, azure-ad, redirect, pkce, scope-mapping]

# Dependency graph
requires:
  - phase: 10-scope-mapper-and-azure-endpoint-utils
    provides: mapScopes, stripResourceParam, buildAzureEndpoints utilities
  - phase: 11-discovery-and-registration-endpoints
    provides: oauth-proxy Fastify plugin shell, server/test registration
provides:
  - GET /authorize endpoint that redirects MCP clients to Azure AD with mapped scopes
  - Parameter whitelist dropping unknown query params
  - Two-phase error handling (JSON pre-redirect, redirect post-redirect_uri validation)
affects: [13-token-proxy-endpoint, 14-wire-up-and-protected-resource-metadata-switch]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-phase OAuth error handling: JSON errors pre-redirect_uri, redirect errors post-redirect_uri"
    - "Parameter whitelist with URLSearchParams for safe URL construction"
    - "Scope deduplication: filter openid/offline_access, append at end"

key-files:
  created:
    - src/routes/oauth-proxy.ts
    - tests/authorize.test.ts
  modified:
    - src/server.ts
    - tests/helpers/build-test-app.ts
    - src/routes/public-routes.ts

key-decisions:
  - "Phase 11 prerequisite created inline (Rule 3 deviation) since oauth-proxy plugin did not exist yet"
  - "No Zod schema for query validation -- business logic validates in handler per plan spec"
  - "redirectError helper function scoped inside handler for clean redirect-based error flow"

patterns-established:
  - "OAuth error response pattern: validate client_id + redirect_uri first (JSON 400), then redirect errors to validated redirect_uri"
  - "Scope transformation pipeline: split -> mapScopes -> filter OIDC -> append OIDC -> join"

requirements-completed: [AUTHZ-01, AUTHZ-02]

# Metrics
duration: 3min
completed: 2026-03-25
---

# Phase 12 Plan 01: Authorization Redirect Endpoint Summary

**GET /authorize proxy redirecting to Azure AD with mapScopes-transformed scopes, parameter whitelist, and RFC 6749 two-phase error handling**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-25T21:18:46Z
- **Completed:** 2026-03-25T21:22:00Z
- **Tasks:** 1 feature (TDD: RED + GREEN)
- **Files modified:** 5

## Accomplishments
- GET /authorize returns 302 redirect to Azure AD authorize endpoint with properly mapped scopes
- Scopes mapped via mapScopes(), openid + offline_access deduplicated and appended at end
- redirect_uri, state, code_challenge, code_challenge_method, nonce, prompt, login_hint passed through unchanged
- Resource parameter stripped (whitelist policy excludes it)
- Unknown query parameters dropped with debug-level logging
- Two-phase error handling: JSON 400 for missing/wrong client_id and missing redirect_uri; redirect errors for invalid response_type
- 26 new integration tests, full suite 160/160 green

## Task Commits

Each task was committed atomically:

1. **Phase 11 prerequisite: oauth-proxy plugin shell** - `eef5c56` (feat -- Rule 3 deviation)
2. **TDD RED: failing authorize tests** - `a327f7e` (test)
3. **TDD GREEN: GET /authorize implementation** - `a7e9650` (feat)

## Files Created/Modified
- `src/routes/oauth-proxy.ts` - OAuth proxy Fastify plugin with discovery, registration, and GET /authorize endpoints
- `tests/authorize.test.ts` - 26 integration tests covering AUTHZ-01, AUTHZ-02, and validation edge cases
- `src/server.ts` - Register oauthProxyRoutes plugin
- `tests/helpers/build-test-app.ts` - Register oauthProxyRoutes in test app
- `src/routes/public-routes.ts` - Updated GET / endpoint listing with new OAuth proxy routes

## Decisions Made
- Created Phase 11 oauth-proxy plugin shell as a Rule 3 deviation since the plan depends on it and it had not been executed
- Used handler-level business validation instead of Zod schema for query params (Zod schema would be too permissive for the two-phase error pattern)
- Azure authorize URL computed once at plugin registration time (not per-request) for performance

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created Phase 11 oauth-proxy plugin prerequisite**
- **Found during:** Pre-task analysis
- **Issue:** Plan depends_on Phase 11 which creates src/routes/oauth-proxy.ts, but Phase 11 had not been executed. The file did not exist.
- **Fix:** Created oauth-proxy.ts with discovery metadata and DCR endpoints per Phase 11 plan spec. Registered in server.ts and build-test-app.ts. Updated GET / endpoint listing.
- **Files modified:** src/routes/oauth-proxy.ts, src/server.ts, tests/helpers/build-test-app.ts, src/routes/public-routes.ts
- **Verification:** Full test suite 134/134 passing after prerequisite (no regressions)
- **Committed in:** eef5c56

---

**Total deviations:** 1 auto-fixed (1 blocking prerequisite)
**Impact on plan:** Necessary to unblock execution. Phase 11 work created inline following its plan spec.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- GET /authorize endpoint complete and tested
- oauth-proxy.ts plugin ready for Phase 13 to add POST /token endpoint
- Phase 14 can update protected-resource metadata to point authorization_servers to self

---
*Phase: 12-authorization-redirect-endpoint*
*Completed: 2026-03-25*
