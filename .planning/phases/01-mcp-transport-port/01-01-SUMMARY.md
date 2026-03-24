---
phase: 01-mcp-transport-port
plan: 01
subsystem: api
tags: [mcp-sdk, vitest, zod, tool-registration]

# Dependency graph
requires:
  - phase: none
    provides: first plan in project
provides:
  - createMcpServer() factory with all 17 WikiJS tools registered via MCP SDK
  - vitest test infrastructure with smoke test stubs
  - Clean dependency set (express/cors/node-fetch/uuid removed)
affects: [01-02-PLAN, phase-02, phase-05]

# Tech tracking
tech-stack:
  added: ["@modelcontextprotocol/sdk@^1.27.1", "vitest@^4.1.1"]
  patterns: ["registerTool() with flat Zod input schemas", "MCP-spec response format with try/catch", "createMcpServer factory pattern"]

key-files:
  created: ["src/mcp-tools.ts", "tests/smoke.test.ts", "vitest.config.ts"]
  modified: ["package.json"]

key-decisions:
  - "Defined all Zod input schemas inline in registerTool() calls rather than importing from schemas.ts (SDK requires flat shape objects, not z.object wrappers)"
  - "Used type assertion 'as const' on content type literals to satisfy MCP SDK TypeScript types"

patterns-established:
  - "Tool registration: registerTool(name, {description, inputSchema: {flat zod shapes}}, async handler)"
  - "Handler response: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }"
  - "Error response: { content: [{ type: 'text', text: 'Error: ...' }], isError: true }"

requirements-completed: [TRNS-03]

# Metrics
duration: 6min
completed: 2026-03-24
---

# Phase 1 Plan 01: MCP SDK Tool Registration Summary

**MCP SDK integration with all 17 WikiJS tools registered via registerTool() API, vitest test scaffold, and dependency cleanup**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-24T19:31:26Z
- **Completed:** 2026-03-24T19:37:52Z
- **Tasks:** 2
- **Files modified:** 4 created, 1 modified

## Accomplishments
- Installed @modelcontextprotocol/sdk and vitest; removed 5 unused packages (express, @types/express, cors, node-fetch, uuid)
- Created src/mcp-tools.ts (488 lines) with createMcpServer() factory registering all 17 tools using flat Zod schemas
- Created vitest test infrastructure with smoke test stubs for TRNS-01/02/03 plus one passing import test
- Updated package.json scripts for vitest (test, test:smoke, test:watch) and removed 6 obsolete scripts

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies and test infrastructure** - `c260815` (chore)
2. **Task 2: Create MCP tool registration module** - `a0916a2` (feat)

## Files Created/Modified
- `src/mcp-tools.ts` - MCP SDK tool registration module with createMcpServer() factory and all 17 tools
- `tests/smoke.test.ts` - Smoke test stubs for TRNS-01/02/03 plus real createMcpServer import test
- `vitest.config.ts` - Vitest configuration for ESM TypeScript project
- `package.json` - Updated dependencies and scripts

## Decisions Made
- Defined Zod input schemas inline in each registerTool() call rather than importing from schemas.ts, because the SDK requires flat shape objects (not z.object() wrappers)
- Used `as const` type assertion on content type string literals to satisfy MCP SDK TypeScript response types
- Logged pre-existing agent.ts/demo.ts compile errors as deferred items (Plan 02 will delete these files)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- After removing node-fetch (per plan), `npx tsc --noEmit` reports an error in src/agent.ts which imports node-fetch. This is expected: agent.ts is scheduled for deletion in Plan 01-02. Logged to deferred-items.md. No impact on new code.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- src/mcp-tools.ts is ready for Plan 01-02 to wire into Fastify route handlers
- createMcpServer() factory accepts a WikiJsApi instance and returns a configured McpServer
- Plan 01-02 will create StreamableHTTPServerTransport wiring, remove REST routes, and delete legacy files

## Self-Check: PASSED

- All 4 created files verified on disk
- Both task commits (c260815, a0916a2) verified in git log

---
*Phase: 01-mcp-transport-port*
*Completed: 2026-03-24*
