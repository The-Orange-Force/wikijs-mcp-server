---
phase: 04-jwt-authentication
plan: 01
subsystem: auth
tags: [jwt, jose, rfc6750, rfc9728, azure-ad, typescript]

# Dependency graph
requires:
  - phase: 02-config-env
    provides: jose dependency, Azure AD env vars (AZURE_TENANT_ID, AZURE_CLIENT_ID, MCP_RESOURCE_URL)
  - phase: 03-discovery-metadata
    provides: resource_metadata URL for WWW-Authenticate headers
provides:
  - AuthenticatedUser interface for request.user typing
  - AzureAdPayload type for Azure AD JWT claim extraction
  - AuthError type for structured error mapping
  - mapJoseError function mapping jose errors to RFC 6750 tuples
  - WWW-Authenticate header builders (no-token, 401, 403)
  - Test token factory (createTestToken, createExpiredToken, createTokenWithClaims)
  - Local JWKS function for testing (getLocalJwks)
  - TEST_CONFIG with Azure AD v2.0 URLs
affects: [04-02-middleware, 05-route-protection]

# Tech tracking
tech-stack:
  added: []
  patterns: [jose-error-instanceof-mapping, rfc6750-www-authenticate-construction, real-crypto-test-tokens]

key-files:
  created:
    - src/auth/types.ts
    - src/auth/errors.ts
    - src/auth/__tests__/errors.test.ts
    - src/auth/__tests__/helpers.ts
  modified: []

key-decisions:
  - "jose v6 JWTExpired does not extend JWTClaimValidationFailed (instanceof returns false) -- order guard kept defensively"
  - "JWTClaimValidationFailed requires JWTPayload object as second constructor arg in jose v6"

patterns-established:
  - "jose error mapping: instanceof chain with specific-to-generic ordering for RFC 6750 error tuples"
  - "WWW-Authenticate builders: stateless functions accepting resource_metadata URL for RFC 9728 compliance"
  - "Test token helpers: lazy cached RS256 key pair with jose generateKeyPair/SignJWT/createLocalJWKSet"

requirements-completed: [AUTH-06]

# Metrics
duration: 3min
completed: 2026-03-24
---

# Phase 4 Plan 1: Auth Foundation Summary

**jose error-to-RFC 6750 mapper with typed AuthenticatedUser interface and real-crypto test token factory**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-24T20:22:08Z
- **Completed:** 2026-03-24T20:24:53Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- AuthenticatedUser, AzureAdPayload, and AuthError interfaces defining the auth module contract
- mapJoseError mapping all jose error classes to exact RFC 6750 status/error/description tuples (JWKSTimeout -> 503)
- WWW-Authenticate header builders with RFC 9728 resource_metadata parameter for 401 and 403 responses
- Test token factory producing cryptographically valid RS256-signed JWTs using jose primitives (no mocking)
- 12 unit tests covering all error mappings and header format specifications

## Task Commits

Each task was committed atomically:

1. **Task 1: Create auth types and jose error mapper with tests** - `6d85715` (feat)
2. **Task 2: Create test helpers for JWT token generation** - `f69ecb1` (feat)

_Note: Task 1 followed TDD (RED-GREEN-REFACTOR). RED confirmed tests fail without errors.ts, GREEN confirmed all 12 pass._

## Files Created/Modified
- `src/auth/types.ts` - AuthenticatedUser, AzureAdPayload, AuthError interfaces
- `src/auth/errors.ts` - mapJoseError function and three WWW-Authenticate header builders
- `src/auth/__tests__/errors.test.ts` - 12 unit tests for error mapping and header construction
- `src/auth/__tests__/helpers.ts` - Test token factory with lazy RS256 key pair and local JWKS

## Decisions Made
- jose v6 `JWTExpired` does not extend `JWTClaimValidationFailed` (instanceof returns false) -- kept the specific-before-generic ordering defensively for future-proofing
- `JWTClaimValidationFailed` constructor requires a `JWTPayload` object as second arg (not optional/undefined) -- test code passes `{}` as empty payload

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Types, error mapping, and test helpers ready for Plan 02 (Fastify middleware plugin)
- Plan 02 can import AuthenticatedUser, mapJoseError, and header builders from these modules
- Test helpers provide createTestToken, createExpiredToken, createTokenWithClaims, and getLocalJwks for middleware integration tests

## Self-Check: PASSED

All 4 created files verified on disk. Both task commits (6d85715, f69ecb1) found in git history.

---
*Phase: 04-jwt-authentication*
*Completed: 2026-03-24*
