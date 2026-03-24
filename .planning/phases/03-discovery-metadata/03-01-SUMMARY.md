---
phase: 03-discovery-metadata
plan: 01
subsystem: api
tags: [rfc9728, oauth, scopes, fastify, discovery, metadata]

# Dependency graph
requires:
  - phase: 02-oauth-config
    provides: "AppConfig with Azure AD tenant/client IDs, Zod-validated env schema"
provides:
  - "RFC 9728 Protected Resource Metadata endpoint at /.well-known/oauth-protected-resource"
  - "Scope-to-tool mapping module (SCOPES, SCOPE_TOOL_MAP, TOOL_SCOPE_MAP, SUPPORTED_SCOPES)"
  - "buildApp(config) factory for testable Fastify server creation"
affects: [04-token-validation, 05-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: [buildApp factory for DI, Fastify inject() integration tests, scope mapping as single source of truth]

key-files:
  created:
    - src/scopes.ts
    - tests/scopes.test.ts
    - tests/discovery.test.ts
  modified:
    - src/server.ts
    - src/config.ts
    - example.env

key-decisions:
  - "buildApp(config, wikiJsApi?) factory replaces module-level server creation for testability"
  - "Optional wikiJsApi parameter preserves backward compatibility with existing smoke tests"
  - "resource_documentation field omitted (not null) when MCP_RESOURCE_DOCS_URL unset per RFC 9728"

patterns-established:
  - "buildApp factory: All new routes registered inside buildApp(), config injected as parameter"
  - "Scope constants: Import from src/scopes.ts -- single source of truth for tool-to-scope mapping"
  - "Integration tests: Use Fastify inject() with fake AppConfig, no real server or external services"

requirements-completed: [DISC-01, DISC-02, DISC-03]

# Metrics
duration: 3min
completed: 2026-03-24
---

# Phase 3 Plan 1: Discovery & Metadata Summary

**RFC 9728 Protected Resource Metadata endpoint with scope-to-tool mapping for 17 tools across 3 scopes**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-24T20:12:54Z
- **Completed:** 2026-03-24T20:16:11Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Created scope-to-tool mapping module (src/scopes.ts) mapping all 17 tools to 3 scopes (read/write/admin)
- Implemented RFC 9728 discovery endpoint at GET /.well-known/oauth-protected-resource with all required fields
- Refactored server.ts into buildApp(config) factory for dependency injection and test isolation
- Added optional MCP_RESOURCE_DOCS_URL config field (omitted from response when unset)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create scope-to-tool mapping module with unit tests** - `271e841` (feat)
2. **Task 2: Implement RFC 9728 discovery endpoint with buildApp factory and integration tests** - `23ff8fc` (feat)

_Note: TDD tasks each went through RED (failing tests) -> GREEN (implementation) flow._

## Files Created/Modified
- `src/scopes.ts` - Scope constants, forward SCOPE_TOOL_MAP, reverse TOOL_SCOPE_MAP, SUPPORTED_SCOPES array
- `tests/scopes.test.ts` - 10 unit tests for scope mapping completeness and correctness
- `tests/discovery.test.ts` - 11 integration tests for RFC 9728 metadata endpoint via Fastify inject()
- `src/server.ts` - Refactored to buildApp(config, wikiJsApi?) factory; added discovery route; preserved buildServer() compat
- `src/config.ts` - Added optional MCP_RESOURCE_DOCS_URL to Zod env schema and AppConfig type
- `example.env` - Added commented MCP_RESOURCE_DOCS_URL documentation

## Decisions Made
- buildApp(config, wikiJsApi?) accepts optional WikiJsApi override parameter so existing smoke tests can inject mocks while new discovery tests use config-only injection
- resource_documentation key is fully omitted from JSON response when MCP_RESOURCE_DOCS_URL is not set (not set to null/empty), following RFC 9728 convention for optional fields
- authorization_servers uses the issuer identifier format (https://login.microsoftonline.com/{tenant}/v2.0), not the authorization endpoint URL

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed buildServer backward compatibility for smoke tests**
- **Found during:** Task 2 (buildApp refactoring)
- **Issue:** Refactoring to buildApp(config) broke existing smoke tests that pass a mock WikiJsApi to buildServer()
- **Fix:** Added optional wikiJsApi parameter to buildApp(); updated buildServer() to forward the mock through
- **Files modified:** src/server.ts
- **Verification:** All 39 tests pass (including 7 existing smoke tests)
- **Committed in:** 23ff8fc (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix to preserve existing test suite. No scope creep.

## Issues Encountered
None beyond the deviation documented above.

## User Setup Required
None - no external service configuration required. MCP_RESOURCE_DOCS_URL is optional.

## Next Phase Readiness
- buildApp(config) factory ready for Phase 4 to add JWT validation middleware
- SCOPE_TOOL_MAP and TOOL_SCOPE_MAP exported for Phase 4/5 scope enforcement
- All tests passing (39 total across 4 test files)
- TypeScript compiles clean with --noEmit

## Self-Check: PASSED

All created files verified on disk. All commit hashes found in git log.

---
*Phase: 03-discovery-metadata*
*Completed: 2026-03-24*
