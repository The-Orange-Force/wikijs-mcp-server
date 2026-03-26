---
phase: 13-token-proxy-endpoint
plan: 01
subsystem: auth
tags: [oauth, token-proxy, azure-ad, aadsts, scope-mapping, zod, fetch]

# Dependency graph
requires:
  - phase: 10-scope-mapper-and-azure-endpoint-utils
    provides: mapScopes(), stripResourceParam(), buildAzureEndpoints()
  - phase: 11-oauth-discovery-and-registration
    provides: oauth-proxy.ts plugin scaffold, OAuthProxyOptions interface
  - phase: 12-authorization-redirect-endpoint
    provides: GET /authorize route in oauth-proxy.ts
provides:
  - unmapScopes() function for reverse scope mapping (Azure AD to bare MCP)
  - handleTokenRequest() with AADSTS normalization, Zod validation, Azure AD proxying
  - POST /token route handler in oauth-proxy.ts
  - AADSTS_TO_OAUTH lookup table for error code mapping
  - Optional fetch injection in OAuthProxyOptions for testability
affects: [14-server-wiring-and-e2e]

# Tech tracking
tech-stack:
  added: ["@fastify/formbody@^7.0.0"]
  patterns: [injected-fetch-for-testability, zod-per-grant-type-validation, aadsts-error-normalization]

key-files:
  created:
    - src/oauth-proxy/token-proxy.ts
    - src/oauth-proxy/__tests__/token-proxy.test.ts
    - tests/token-proxy-integration.test.ts
  modified:
    - src/oauth-proxy/scope-mapper.ts
    - src/oauth-proxy/__tests__/scope-mapper.test.ts
    - src/routes/oauth-proxy.ts
    - package.json

key-decisions:
  - "AADSTS-specific descriptions for ambiguous codes (e.g., AADSTS700082 gets 'The refresh token has expired.' instead of generic invalid_grant message)"
  - "formbody registered inside oauth-proxy plugin (scoped, not global) to avoid affecting /mcp JSON endpoint"
  - "fetch injection via optional OAuthProxyOptions.fetch defaulting to globalThis.fetch -- existing registrations unmodified"

patterns-established:
  - "Injected fetch pattern: pass fetch as plugin option, default to globalThis.fetch, tests provide vi.fn() mock"
  - "AADSTS normalization: const lookup table + generic descriptions + AADSTS-specific overrides"
  - "Per-grant-type Zod schemas: separate schemas for authorization_code and refresh_token grants"

requirements-completed: [TOKN-01, TOKN-02, TOKN-03]

# Metrics
duration: 5min
completed: 2026-03-25
---

# Phase 13 Plan 01: Token Proxy Endpoint Summary

**POST /token proxy with AADSTS error normalization, per-grant Zod validation, and bidirectional scope mapping via injected fetch**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-25T21:30:07Z
- **Completed:** 2026-03-25T21:35:33Z
- **Tasks:** 1 (TDD feature with RED/GREEN phases)
- **Files modified:** 7

## Accomplishments
- POST /token endpoint proxies authorization_code and refresh_token grants to Azure AD
- AADSTS error codes normalized to standard OAuth 2.0 format with generic descriptions
- Bidirectional scope mapping: bare MCP scopes mapped to api:// on outbound, reversed on response
- Cache-Control, Pragma, Content-Type, X-Upstream-Duration-Ms headers on all responses
- 48 new tests (5 unmapScopes, 24 token-proxy unit, 9 integration), 198 total suite passing

## Task Commits

Each task was committed atomically:

1. **RED: Failing tests** - `5f1a667` (test)
2. **GREEN: Implementation** - `b5730fd` (feat)

_TDD task: test-first, then implementation. No refactor needed._

## Files Created/Modified
- `src/oauth-proxy/token-proxy.ts` - Core token proxy logic: handleTokenRequest(), AADSTS_TO_OAUTH mapping, Zod schemas, normalizeAzureError()
- `src/oauth-proxy/scope-mapper.ts` - Added unmapScopes() for reverse scope mapping
- `src/routes/oauth-proxy.ts` - Added POST /token route, fetch injection, @fastify/formbody registration
- `src/oauth-proxy/__tests__/token-proxy.test.ts` - 24 unit tests for handleTokenRequest with mock fetch
- `src/oauth-proxy/__tests__/scope-mapper.test.ts` - 5 new unmapScopes tests added to existing file
- `tests/token-proxy-integration.test.ts` - 9 integration tests via Fastify inject
- `package.json` - Added @fastify/formbody dependency

## Decisions Made
- AADSTS-specific descriptions override generic ones for codes where the generic message would be misleading (e.g., AADSTS700082 gets "The refresh token has expired." instead of the generic invalid_grant message about authorization codes)
- @fastify/formbody registered inside oauth-proxy plugin scope (not globally) to avoid affecting the /mcp JSON endpoint
- fetch is optional in OAuthProxyOptions, defaulting to globalThis.fetch, so existing server.ts and build-test-app.ts registrations compile without modification

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed missing @fastify/formbody dependency**
- **Found during:** GREEN phase (integration test failed on import)
- **Issue:** @fastify/formbody was not installed despite plan stating "installed by Phase 11"
- **Fix:** Ran `npm install @fastify/formbody@^7.0.0` and registered it inside oauth-proxy plugin
- **Files modified:** package.json, src/routes/oauth-proxy.ts
- **Verification:** All 198 tests pass, TypeScript compiles cleanly
- **Committed in:** b5730fd (GREEN commit)

**2. [Rule 3 - Blocking] Removed duplicate formbody registration from integration test**
- **Found during:** GREEN phase (plugin registers formbody internally)
- **Issue:** Integration test registered formbody at top level AND plugin registered it internally, causing conflict
- **Fix:** Removed explicit formbody import/registration from integration test since plugin handles it
- **Files modified:** tests/token-proxy-integration.test.ts
- **Verification:** Integration tests pass
- **Committed in:** b5730fd (GREEN commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes were necessary for the code to compile and tests to run. No scope creep.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- POST /token endpoint complete and tested, ready for Phase 14 (server wiring and E2E)
- OAuthProxyOptions.fetch is optional -- Phase 14 can update build-test-app.ts to pass an explicit mockFetch for test isolation
- @fastify/formbody is now installed and scoped inside the oauth-proxy plugin

---
*Phase: 13-token-proxy-endpoint*
*Completed: 2026-03-25*
