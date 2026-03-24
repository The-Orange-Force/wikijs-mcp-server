---
phase: 04-jwt-authentication
plan: 02
subsystem: auth
tags: [jwt, fastify-plugin, middleware, azure-ad, rfc6750, rfc9728, scope-validation]

# Dependency graph
requires:
  - phase: 04-jwt-authentication
    plan: 01
    provides: AuthenticatedUser/AzureAdPayload types, mapJoseError, WWW-Authenticate header builders, test token factory
  - phase: 02-config-env
    provides: jose dependency, Azure AD env vars, createRemoteJWKSet JWKS resolver
  - phase: 03-discovery-metadata
    provides: resource_metadata URL for WWW-Authenticate headers
provides:
  - Fastify auth plugin (default export) validating Azure AD Bearer tokens via jose jwtVerify
  - AuthPluginOptions interface for dependency-injected JWKS, issuer, audience, resourceMetadataUrl
  - VALID_SCOPES constant (wikijs:read, wikijs:write, wikijs:admin)
  - request.user decoration with AuthenticatedUser | null
  - Fastify declaration merging for typed request.user access
  - 21 integration tests with real signed JWT tokens (no jose mocking)
affects: [05-route-protection]

# Tech tracking
tech-stack:
  added: [fastify-plugin@^4.5.0]
  patterns: [fastify-plugin-encapsulation-breaking, onRequest-hook-jwt-validation, jwks-dependency-injection]

key-files:
  created:
    - src/auth/middleware.ts
    - src/auth/__tests__/middleware.test.ts
  modified:
    - package.json

key-decisions:
  - "jose v6 removed KeyLike type -- AuthPluginOptions.jwks typed as JWTVerifyGetKey (function form only, matches createRemoteJWKSet/createLocalJWKSet return type)"
  - "fastify-plugin v4.5 wraps auth plugin for encapsulation breaking so request.user decorator is visible across all routes"

patterns-established:
  - "Auth middleware: Fastify plugin with onRequest hook for Bearer token validation before body parsing"
  - "JWKS injection: AuthPluginOptions accepts JWTVerifyGetKey enabling local JWKS in tests, remote JWKS in production"
  - "Error response pattern: both WWW-Authenticate header and JSON body on all 401/403 responses"
  - "Scope validation: scp claim string split by space, any one of VALID_SCOPES suffices"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07]

# Metrics
duration: 4min
completed: 2026-03-24
---

# Phase 4 Plan 2: Auth Middleware Summary

**Fastify JWT auth middleware plugin validating Azure AD Bearer tokens with scope enforcement, RFC 6750 + RFC 9728 error responses, and JWKS dependency injection for testability**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-24T20:28:17Z
- **Completed:** 2026-03-24T20:33:16Z
- **Tasks:** 1 (TDD: RED-GREEN-REFACTOR)
- **Files modified:** 3

## Accomplishments
- Fastify auth plugin decorating request.user with validated Azure AD identity (oid, preferred_username, name, email)
- onRequest hook validating Bearer tokens via jose jwtVerify with audience/issuer/expiry/signature checks
- Scope validation from scp claim (space-delimited string) requiring any one of wikijs:read/write/admin
- RFC 6750 + RFC 9728 compliant error responses: 401 with specific error descriptions, 403 with insufficient_scope and required scopes, all containing resource_metadata URL
- JWKS fetch failure returns 503 (not 401) distinguishing infrastructure failure from auth failure
- 21 integration tests using real signed JWT tokens via Fastify inject()

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Add failing integration tests for auth middleware** - `f353ee1` (test)
2. **Task 1 (GREEN+REFACTOR): Implement JWT auth middleware with fastify-plugin** - `66b325f` (feat)

_Note: TDD task with RED and GREEN+REFACTOR as separate commits._

## Files Created/Modified
- `src/auth/middleware.ts` - Fastify plugin: onRequest hook for JWT validation, request.user decoration, scope enforcement (149 lines)
- `src/auth/__tests__/middleware.test.ts` - 21 integration tests covering valid tokens, error scenarios, scope validation, response format (324 lines)
- `package.json` - Added fastify-plugin@^4.5.0 dependency

## Decisions Made
- jose v6 removed `KeyLike` type -- `AuthPluginOptions.jwks` typed as `JWTVerifyGetKey` (function form only) which is the return type of both `createRemoteJWKSet` and `createLocalJWKSet`
- fastify-plugin v4.5 wraps the auth plugin for encapsulation breaking, ensuring `request.user` decorator is visible to all routes registered after the plugin

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed jose v6 type incompatibility with KeyLike**
- **Found during:** Task 1 (GREEN phase, tsc --noEmit)
- **Issue:** Plan referenced `KeyLike` type from jose which was removed in v6. Also used `GetKeyFunction<FlattenedJWSInput, JWSHeaderParameters>` which created union type incompatible with jwtVerify's overloaded signatures.
- **Fix:** Typed `jwks` as `JWTVerifyGetKey` which matches the function signature of both `createRemoteJWKSet` and `createLocalJWKSet` return values and is directly compatible with `jwtVerify`'s second overload.
- **Files modified:** src/auth/middleware.ts
- **Verification:** `npx tsc --noEmit` passes, all 21 tests pass
- **Committed in:** 66b325f (part of GREEN+REFACTOR commit)

---

**Total deviations:** 1 auto-fixed (1 bug -- jose v6 API change)
**Impact on plan:** Type fix necessary for TypeScript compilation. No scope creep.

## Issues Encountered

None beyond the jose v6 type deviation documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Auth middleware plugin ready for registration in Phase 5 (route protection)
- Plugin accepts dependency-injected options (jwks, issuer, audience, resourceMetadataUrl) for flexible registration
- VALID_SCOPES exported for potential per-route scope enforcement in v2
- All 72 tests across the full suite remain green (6 test files)
- TypeScript compiles with zero errors

## Self-Check: PASSED

All 3 created files verified on disk. Both task commits (f353ee1, 66b325f) found in git history.

---
*Phase: 04-jwt-authentication*
*Completed: 2026-03-24*
