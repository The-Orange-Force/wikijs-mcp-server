---
phase: 01-mcp-transport-port
plan: 02
subsystem: api
tags: [mcp-sdk, fastify, streamable-http, transport, stateless]

# Dependency graph
requires:
  - phase: 01-mcp-transport-port
    provides: createMcpServer() factory with all 17 tools registered (Plan 01)
provides:
  - Fastify server with POST /mcp, GET /mcp, GET /health, GET / routes
  - StreamableHTTPServerTransport wiring in stateless JSON response mode
  - buildServer() factory for testable server creation
  - 7 passing smoke tests covering all MCP protocol flows
  - Legacy code fully removed (9 files deleted, shell scripts updated)
affects: [phase-02, phase-05, phase-03]

# Tech tracking
tech-stack:
  added: []
  patterns: ["per-request McpServer+transport creation for stateless mode", "enableJsonResponse for JSON POST responses", "buildServer() factory with VITEST guard"]

key-files:
  created: []
  modified: ["src/server.ts", "tests/smoke.test.ts", "scripts/start_http.sh", "scripts/stop_server.sh", "scripts/start_typescript.sh", "scripts/setup.sh", "package.json"]

key-decisions:
  - "Create per-request McpServer+transport pairs instead of reusing a single McpServer (SDK Protocol enforces single-transport ownership)"
  - "Enable enableJsonResponse on StreamableHTTPServerTransport for direct JSON responses instead of SSE streaming"
  - "Guard start() with VITEST env check to prevent auto-start during test imports"
  - "Use GET /mcp (not GET /mcp/events) per MCP 2025-03-26 spec compliance"

patterns-established:
  - "Server testing: buildServer(mockApi) + server.listen({port:0}) + fetch for integration tests"
  - "MCP POST requires Accept: application/json, text/event-stream header"
  - "Stateless mode: sessionIdGenerator: undefined, fresh server+transport per request"

requirements-completed: [TRNS-01, TRNS-02]

# Metrics
duration: 8min
completed: 2026-03-24
---

# Phase 1 Plan 02: MCP Transport Wiring Summary

**Fastify MCP routes with StreamableHTTPServerTransport in stateless JSON mode, 7 passing smoke tests, and full legacy cleanup (9 files deleted)**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-24T19:41:27Z
- **Completed:** 2026-03-24T19:50:13Z
- **Tasks:** 2
- **Files modified:** 7 modified, 9 deleted

## Accomplishments
- Rewrote src/server.ts with 4 MCP routes (POST /mcp, GET /mcp, GET /health, GET /) replacing all 17+ legacy REST routes
- Implemented 7 passing smoke tests covering initialize, tools/list (17 tools), tools/call, GET /mcp 405, server info, and health check
- Deleted 9 legacy files (2,294 lines removed) and updated 4 shell scripts to reference Fastify dist/server.js

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite server.ts with MCP routes and implement smoke tests** - `5318b56` (feat)
2. **Task 2: Delete legacy files and update shell scripts** - `506bfc2` (chore)

## Files Created/Modified
- `src/server.ts` - Rewritten with buildServer() factory, 4 MCP routes, per-request McpServer+transport
- `tests/smoke.test.ts` - 7 integration smoke tests with mock WikiJsApi against live Fastify server
- `scripts/start_http.sh` - Updated to use dist/server.js, English messages, port 3200 default
- `scripts/stop_server.sh` - Updated pkill targets to dist/server.js, English messages
- `scripts/start_typescript.sh` - Updated default port to 3200, English messages
- `scripts/setup.sh` - Removed Cursor references, English messages
- `package.json` - Removed .cursor/ from files array

## Decisions Made
- Created per-request McpServer+transport pairs instead of reusing a single McpServer instance, because the SDK's Protocol base class enforces single-transport ownership and throws "Already connected" on concurrent requests
- Enabled `enableJsonResponse: true` on StreamableHTTPServerTransport to return plain JSON responses instead of SSE for POST /mcp, which is simpler for clients and testing
- Used `process.env.VITEST` check instead of import.meta.url comparison to guard start() from running during test imports (more reliable across ESM environments)
- Used `GET /mcp` per MCP 2025-03-26 spec instead of `GET /mcp/events` mentioned in CONTEXT.md (spec compliance; returns 405 in stateless mode regardless)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed per-request McpServer creation for stateless mode**
- **Found during:** Task 1
- **Issue:** Plan specified creating one McpServer at startup and reusing it. The SDK Protocol class throws "Already connected to a transport" when connect() is called while a previous transport is still connected. In stateless mode with per-request transports, this causes failures on the second request.
- **Fix:** Create a fresh McpServer per request in the POST /mcp handler. Each request gets its own McpServer+transport pair. McpServer is closed in the reply.raw "close" event handler.
- **Files modified:** src/server.ts
- **Verification:** All 7 smoke tests pass with sequential requests
- **Committed in:** 5318b56

**2. [Rule 3 - Blocking] Added required Accept header to smoke tests**
- **Found during:** Task 1
- **Issue:** MCP SDK requires POST requests to include `Accept: application/json, text/event-stream` header. Tests were failing with 406 Not Acceptable.
- **Fix:** Added proper Accept header to mcpPost() test helper function
- **Files modified:** tests/smoke.test.ts
- **Verification:** All MCP POST tests pass with 200 status
- **Committed in:** 5318b56

**3. [Rule 3 - Blocking] Enabled enableJsonResponse for JSON POST responses**
- **Found during:** Task 1
- **Issue:** Default SSE streaming response mode made it impossible to parse responses as simple JSON in tests and clients
- **Fix:** Set `enableJsonResponse: true` on StreamableHTTPServerTransport constructor
- **Files modified:** src/server.ts
- **Verification:** POST /mcp returns Content-Type: application/json with direct JSON body
- **Committed in:** 5318b56

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking)
**Impact on plan:** All auto-fixes necessary for correct MCP SDK integration. No scope creep.

## Issues Encountered
- The MCP SDK's Protocol base class enforces single-transport ownership, which conflicts with the "create one McpServer, reuse across requests" pattern recommended in the plan's research. Resolved by creating per-request McpServer instances in stateless mode.
- src/agent.ts had a pre-existing TypeScript error (missing node-fetch) after Plan 01 removed the dependency. Resolved by deleting agent.ts in Task 2 as planned.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 1 complete: all MCP tools accessible via POST /mcp, legacy code removed
- POST /mcp endpoint ready for Fastify hook-based auth middleware (Phase 2-4)
- buildServer() factory enables easy testing of future auth middleware integration
- STDIO transport (lib/mcp_wikijs_stdin.js) remains functional and untouched

## Self-Check: PASSED

- All 8 key files verified on disk
- Both task commits (5318b56, 506bfc2) verified in git log

---
*Phase: 01-mcp-transport-port*
*Completed: 2026-03-24*
