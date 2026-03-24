---
phase: 05-route-protection-and-observability
plan: 01
subsystem: auth
tags: [jwt, rfc6750, jose, correlation-id, asynclocalstorage, pino, uuid]

# Dependency graph
requires:
  - phase: 04-jwt-authentication
    provides: jose dependency and JWT validation error types for error mapping
provides:
  - RFC 6750 error mapping (mapJoseErrorToRfc6750, mapMissingTokenError, mapInsufficientScopeError)
  - AsyncLocalStorage-based request context for MCP SDK tool handler propagation
  - Fastify logger config with correlation ID generation and X-Request-ID validation
affects: [05-route-protection-and-observability]

# Tech tracking
tech-stack:
  added: [uuid]
  patterns: [RFC 6750 jose error mapping via instanceof, AsyncLocalStorage request context propagation, genReqId UUID validation]

key-files:
  created:
    - src/auth-errors.ts
    - src/request-context.ts
    - src/logging.ts
    - tests/auth-errors.test.ts
  modified:
    - package.json

key-decisions:
  - "uuid package installed as direct dependency (was not previously installed despite plan claiming it existed)"
  - "requestIdHeader set to false with manual X-Request-ID validation in genReqId to prevent log injection"

patterns-established:
  - "RFC 6750 error mapping: instanceof checks on jose error classes, not string matching"
  - "AsyncLocalStorage bridge pattern: requestContext.run() in route handler, getStore() in tool handler"
  - "genReqId validates client X-Request-ID as UUID format before accepting"

requirements-completed: [OBSV-02, OBSV-03]

# Metrics
duration: 3min
completed: 2026-03-24
---

# Phase 5 Plan 01: RFC 6750 Error Mapping and Request Context Summary

**Jose error-to-RFC 6750 mapping with 13 test cases, AsyncLocalStorage request context bridge, and Fastify logger config with UUID-validated correlation IDs**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-24T20:40:22Z
- **Completed:** 2026-03-24T20:42:55Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Complete RFC 6750 error mapping for all 5 jose error types (JWTExpired, JWTClaimValidationFailed, JWSSignatureVerificationFailed, JWKSNoMatchingKey, JWKSTimeout) plus missing-token and insufficient-scope helpers
- AsyncLocalStorage-based request context module ready for Plan 02 integration (bridges Fastify request context to MCP SDK tool handlers)
- Fastify logger configuration with genReqId that validates X-Request-ID as UUID format and falls back to uuid v4 generation

## Task Commits

Each task was committed atomically:

1. **Task 1: Create RFC 6750 error mapping module with tests** (TDD)
   - `1746aaa` (test: add failing tests for RFC 6750 error mapping)
   - `4eb1a98` (feat: implement RFC 6750 error mapping for jose validation errors)
2. **Task 2: Create request context and logging configuration modules** - `d4874b3` (feat)

_TDD task 1 has separate RED and GREEN commits._

## Files Created/Modified
- `src/auth-errors.ts` - Jose error-to-RFC 6750 mapping with Rfc6750Error type, mapJoseErrorToRfc6750, mapMissingTokenError, mapInsufficientScopeError
- `src/request-context.ts` - AsyncLocalStorage instance and RequestContext interface for MCP SDK tool handler context propagation
- `src/logging.ts` - buildLoggerConfig with genReqId UUID validation, UUID_REGEX constant, correlationId log label
- `tests/auth-errors.test.ts` - 13 unit tests covering all jose error types, missing token, and insufficient scope mapping
- `package.json` - Added uuid dependency

## Decisions Made
- **uuid installed as direct dependency:** Plan stated uuid was "already in dependencies" but it was not installed. Installed uuid and @types/uuid (deviation Rule 3 -- blocking issue).
- **requestIdHeader: false with manual validation:** Disabled Fastify's automatic X-Request-ID header acceptance to prevent log injection. genReqId reads and validates the header manually against UUID_REGEX.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed missing uuid dependency**
- **Found during:** Task 2 (logging configuration module)
- **Issue:** Plan stated uuid was already in dependencies, but `import { v4 as uuidv4 } from "uuid"` failed with ERR_MODULE_NOT_FOUND
- **Fix:** Ran `npm install uuid` and `npm install --save-dev @types/uuid`
- **Files modified:** package.json
- **Verification:** uuid import succeeds, uuidv4() generates valid UUIDs
- **Committed in:** d4874b3 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential for uuid import to work. No scope creep.

## Issues Encountered
None beyond the uuid dependency deviation.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three foundational modules (auth-errors, request-context, logging) are ready for Plan 02 integration
- Plan 02 will wire auth hooks to MCP routes using these modules and restructure server.ts
- No blockers or concerns

## Self-Check: PASSED

- All 4 created files exist on disk
- All 3 task commits verified in git log (1746aaa, 4eb1a98, d4874b3)

---
*Phase: 05-route-protection-and-observability*
*Completed: 2026-03-24*
