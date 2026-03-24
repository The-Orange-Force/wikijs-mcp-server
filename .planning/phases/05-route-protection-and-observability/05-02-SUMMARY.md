---
phase: 05-route-protection-and-observability
plan: 02
subsystem: auth
tags: [fastify-plugin, route-protection, correlation-id, pino, asynclocalstorage, tool-timing, rfc6750]

# Dependency graph
requires:
  - phase: 05-route-protection-and-observability
    provides: RFC 6750 error mapping, AsyncLocalStorage request context, Fastify logger config with genReqId
  - phase: 04-jwt-authentication
    provides: JWT auth middleware plugin (fastify-plugin) with token validation and user decoration
provides:
  - Protected MCP routes via Fastify encapsulated plugin with scoped auth preHandler
  - Public routes plugin (/, /health, /.well-known) outside auth scope
  - wrapToolHandler utility for tool invocation timing and logging via requestContext
  - Restructured server.ts with buildLoggerConfig, global X-Request-ID hook, plugin registration
  - Integration tests for route protection (13 tests) and observability (8 tests)
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [Fastify encapsulated plugin for scoped auth, reply.raw.setHeader for MCP transport bypass, requestContext.run() in route handler wrapping transport.handleRequest]

key-files:
  created:
    - src/routes/mcp-routes.ts
    - src/routes/public-routes.ts
    - src/tool-wrapper.ts
    - tests/route-protection.test.ts
    - tests/observability.test.ts
    - tests/helpers/build-test-app.ts
  modified:
    - src/server.ts
    - src/request-context.ts
    - tests/smoke.test.ts
    - tests/discovery.test.ts

key-decisions:
  - "Phase 4 auth plugin registered within encapsulated protectedRoutes scope (not global) for clean route-level auth"
  - "reply.raw.setHeader used alongside reply.header for X-Request-ID because MCP transport writes directly to raw response"
  - "RequestContext.log type changed from pino Logger to FastifyBaseLogger for type compatibility"
  - "Shared buildTestApp helper created to centralize test app construction with local JWKS"

patterns-established:
  - "Fastify encapsulated plugin for scoped auth: register auth plugin inside route plugin, not globally"
  - "reply.raw.setHeader for headers needed on raw-stream routes (MCP transport bypass)"
  - "buildTestApp helper pattern: all integration tests share consistent app construction with local JWKS"

requirements-completed: [PROT-01, PROT-02, PROT-03, PROT-04, OBSV-01]

# Metrics
duration: 7min
completed: 2026-03-24
---

# Phase 5 Plan 02: Route Protection and Observability Wiring Summary

**Protected MCP routes with scoped JWT auth, public routes plugin, tool invocation timing wrapper, and 21 integration tests for route protection and observability**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-24T20:46:01Z
- **Completed:** 2026-03-24T20:53:16Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments
- POST /mcp and GET /mcp protected by scoped Phase 4 JWT auth middleware via Fastify encapsulated plugin
- GET /, GET /health, GET /.well-known/oauth-protected-resource serve without auth (public routes plugin)
- GET / returns version 2.0.0 with auth_required and protected_resource_metadata discovery hints
- wrapToolHandler logs toolName, duration (integer ms), userId, username via requestContext.getStore()
- Every response includes X-Request-ID header with validated UUID correlation ID
- Auth failures logged at warn level (pino level 40), not error level
- 106 total tests passing (21 new + 85 existing updated for auth architecture)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create route modules, tool wrapper, and restructure server.ts** - `44c2497` (feat)
2. **Task 2: Integration tests for route protection** - `3d99dd5` (test)
3. **Task 3: Observability integration tests** - `a78ed71` (test)

## Files Created/Modified
- `src/routes/mcp-routes.ts` - Protected MCP routes with scoped auth, requestContext.run() wrapping
- `src/routes/public-routes.ts` - Public routes (/, /health, /.well-known) outside auth scope
- `src/tool-wrapper.ts` - wrapToolHandler with performance.now() timing and requestContext logging
- `src/server.ts` - Restructured with buildLoggerConfig, global X-Request-ID hook, plugin registration
- `src/request-context.ts` - Updated Logger type to FastifyBaseLogger for compatibility
- `tests/route-protection.test.ts` - 13 integration tests for auth enforcement and correlation IDs
- `tests/observability.test.ts` - 8 tests for correlation ID propagation and tool invocation logging
- `tests/helpers/build-test-app.ts` - Shared test app builder with local JWKS
- `tests/smoke.test.ts` - Updated for auth-protected architecture with Bearer token
- `tests/discovery.test.ts` - Updated to use shared buildTestApp helper

## Decisions Made
- **Phase 4 auth plugin scoped to protectedRoutes:** Registered within encapsulated plugin scope rather than globally, so auth hooks only apply to MCP routes. This is cleaner than global URL-based auth checking.
- **reply.raw.setHeader for X-Request-ID:** The MCP SDK's transport.handleRequest() writes directly to Node.js http.ServerResponse, bypassing Fastify's reply.header(). Added reply.raw.setHeader() alongside reply.header() to ensure X-Request-ID appears on all responses.
- **FastifyBaseLogger for RequestContext:** Changed from pino Logger to FastifyBaseLogger to avoid TypeScript assignability issues between Fastify's internal logger type and pino's more specific Logger type.
- **Shared buildTestApp helper:** Centralized test app construction in tests/helpers/build-test-app.ts to avoid duplicating JWKS setup, plugin registration, and hook configuration across test files.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated smoke tests for auth-protected architecture**
- **Found during:** Task 1
- **Issue:** Existing smoke tests assumed unauthenticated access to POST /mcp and checked version "1.3.0". After restructuring with auth, MCP routes return 401 without token, and version is now "2.0.0".
- **Fix:** Updated smoke tests to use buildTestApp with local JWKS and include Bearer tokens for MCP requests. Updated version expectation to "2.0.0".
- **Files modified:** tests/smoke.test.ts
- **Committed in:** 44c2497

**2. [Rule 1 - Bug] Updated discovery tests for new plugin architecture**
- **Found during:** Task 1
- **Issue:** Discovery tests used buildApp(makeConfig()) which now requires JWKS for the auth plugin registration. Tests failed with JWKS resolution errors.
- **Fix:** Updated discovery tests to use shared buildTestApp helper with local JWKS.
- **Files modified:** tests/discovery.test.ts
- **Committed in:** 44c2497

**3. [Rule 1 - Bug] Fixed RequestContext type incompatibility**
- **Found during:** Task 1
- **Issue:** pino Logger type is not assignable from FastifyBaseLogger (TypeScript compilation error). The requestContext.run() call in mcp-routes.ts passed request.log (FastifyBaseLogger) but RequestContext expected pino Logger.
- **Fix:** Changed RequestContext.log type from `Logger` (pino) to `FastifyBaseLogger` (fastify) which is the actual type provided by request.log.
- **Files modified:** src/request-context.ts
- **Committed in:** 44c2497

**4. [Rule 1 - Bug] Fixed X-Request-ID missing on raw-stream MCP responses**
- **Found during:** Task 3
- **Issue:** MCP transport.handleRequest writes directly to reply.raw, bypassing Fastify's managed headers. X-Request-ID set via reply.header() was not included in raw responses.
- **Fix:** Added reply.raw.setHeader("x-request-id", ...) alongside reply.header() in the global onRequest hook.
- **Files modified:** src/server.ts, tests/helpers/build-test-app.ts
- **Committed in:** a78ed71

---

**Total deviations:** 4 auto-fixed (4 bugs caused by current task's architectural changes)
**Impact on plan:** All fixes necessary for correctness. No scope creep. Existing tests updated to match new auth-protected architecture.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 5 phases complete. The project is fully implemented with JWT auth protecting MCP routes.
- 106 tests passing across 9 test files
- No blockers or outstanding work

## Self-Check: PASSED

- All 10 created/modified files exist on disk
- All 3 task commits verified in git log (44c2497, 3d99dd5, a78ed71)

---
*Phase: 05-route-protection-and-observability*
*Completed: 2026-03-24*
