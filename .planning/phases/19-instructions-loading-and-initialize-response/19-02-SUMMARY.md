---
phase: 19-instructions-loading-and-initialize-response
plan: 02
subsystem: api
tags: [mcp, instructions, initialize, fastify, version-bump]

# Dependency graph
requires:
  - phase: 19-01
    provides: "loadInstructions() and DEFAULT_INSTRUCTIONS from src/instructions.ts, config.instructionsPath"
provides:
  - "MCP initialize response includes instructions field with 5-topic wiki guidance"
  - "Instructions threaded from startup through buildApp, protectedRoutes, to McpServer constructor"
  - "Version 2.4.0 across package.json, mcp-tools.ts, public-routes.ts"
affects: [20-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Startup-loaded config value threaded through Fastify plugin options to per-request MCP server"

key-files:
  created: []
  modified:
    - src/server.ts
    - src/mcp-tools.ts
    - src/routes/mcp-routes.ts
    - src/routes/public-routes.ts
    - package.json
    - tests/helpers/build-test-app.ts
    - tests/smoke.test.ts

key-decisions:
  - "buildApp defaults instructions to DEFAULT_INSTRUCTIONS when not provided (test compatibility)"
  - "Instructions loaded once at startup and passed through plugin options (no per-request I/O)"

patterns-established:
  - "Threading startup-loaded values through Fastify plugin options to per-request handler instances"

requirements-completed: [INIT-01, INIT-02]

# Metrics
duration: 3min
completed: 2026-03-27
---

# Phase 19 Plan 02: Initialize Response Wiring Summary

**MCP initialize response wired with 5-topic instructions and version bumped to 2.4.0 across all files**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-27T09:26:27Z
- **Completed:** 2026-03-27T09:28:15Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Instructions string threaded from startup through buildApp, protectedRoutes, to McpServer constructor
- MCP initialize response now includes instructions field with all 5 topic areas (Mendix, clients, AI, Java, career)
- Version bumped to 2.4.0 in package.json, mcp-tools.ts, and public-routes.ts
- Integration tests verify instructions presence, content topics, and absence of tool names
- Full test suite green: 22 files, 314 tests

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire instructions through server, routes, and MCP tools + version bump** - `f0b821f` (feat)
2. **Task 2: Update test helpers and integration tests for instructions in initialize response** - `af01a58` (test)

## Files Created/Modified
- `src/server.ts` - Added loadInstructions import, instructions param to buildApp, startup loading in start()
- `src/mcp-tools.ts` - createMcpServer accepts instructions, passes to McpServer constructor, version 2.4.0
- `src/routes/mcp-routes.ts` - Added instructions to ProtectedRoutesOptions, destructured and passed to createMcpServer
- `src/routes/public-routes.ts` - Version bumped to 2.4.0 in GET / response
- `package.json` - Version bumped to 2.4.0
- `tests/helpers/build-test-app.ts` - Imports DEFAULT_INSTRUCTIONS, threads to protectedRoutes, accepts optional instructions param
- `tests/smoke.test.ts` - Added instructions assertions in initialize test, new INIT-01/02 describe block, version 2.4.0 assertions

## Decisions Made
- buildApp defaults instructions to DEFAULT_INSTRUCTIONS when not provided, ensuring test compatibility without requiring all callers to pass instructions
- Instructions loaded once at startup in start() and passed via plugin options, avoiding per-request file I/O

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 19 is fully complete: instructions loading (Plan 01) and initialize response wiring (Plan 02) both done
- Phase 20 can proceed with any remaining milestone work
- MCP_INSTRUCTIONS_PATH env var is available for custom instructions file override

## Self-Check: PASSED

- FOUND: src/server.ts
- FOUND: src/mcp-tools.ts
- FOUND: src/routes/mcp-routes.ts
- FOUND: src/routes/public-routes.ts
- FOUND: package.json
- FOUND: tests/helpers/build-test-app.ts
- FOUND: tests/smoke.test.ts
- FOUND: f0b821f (Task 1 commit)
- FOUND: af01a58 (Task 2 commit)

---
*Phase: 19-instructions-loading-and-initialize-response*
*Completed: 2026-03-27*
