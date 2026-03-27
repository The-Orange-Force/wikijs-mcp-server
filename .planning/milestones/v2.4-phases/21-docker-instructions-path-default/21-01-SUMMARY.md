---
phase: 21-docker-instructions-path-default
plan: 01
subsystem: infra
tags: [zod, config, docker, instructions, mcp]

# Dependency graph
requires:
  - phase: 20-docker-integration
    provides: Docker volume mount ./instructions.txt:/app/instructions.txt:ro
provides:
  - Zod default '/app/instructions.txt' for MCP_INSTRUCTIONS_PATH in envSchema
  - docker-compose up with customized instructions.txt works without any extra env var
affects: [config, docker, server-startup]

# Tech tracking
tech-stack:
  added: []
  patterns: [Zod .default() for container-friendly filesystem paths]

key-files:
  created: []
  modified:
    - src/config.ts
    - tests/config.test.ts
    - tests/helpers/build-test-app.ts
    - .env.example

key-decisions:
  - "Zod .default('/app/instructions.txt') closes Docker flow gap — mount exists but config silently ignored missing var"
  - "makeTestConfig() gets explicit instructionsPath field to satisfy AppConfig type after optional→default change"
  - ".env.example gains empty-value comment to document local dev workaround (MCP_INSTRUCTIONS_PATH= skips loading)"

patterns-established:
  - "Container-friendly defaults: Zod defaults match volume mount paths so deployers need zero extra env vars"

requirements-completed: [DOCK-01]

# Metrics
duration: 2min
completed: 2026-03-27
---

# Phase 21 Plan 01: Docker Instructions Path Default Summary

**Zod default '/app/instructions.txt' for MCP_INSTRUCTIONS_PATH closes Docker volume mount gap so deployers get custom instructions without setting any env var**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-27T11:20:09Z
- **Completed:** 2026-03-27T11:22:01Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Changed `MCP_INSTRUCTIONS_PATH` from `z.string().optional()` to `z.string().default('/app/instructions.txt')` in envSchema
- Updated config.test.ts: renamed test description and changed assertion from `toBeUndefined()` to `toBe('/app/instructions.txt')`
- Added `instructionsPath: '/app/instructions.txt'` to `makeTestConfig()` satisfying the AppConfig type requirement
- Added empty-value suppression comment to `.env.example` for local dev guidance

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Zod default and fix downstream type errors** - `c550246` (feat, TDD)
2. **Task 2: Update .env.example and verify full suite** - `252cd66` (chore)

**Plan metadata:** (docs commit follows)

_Note: Task 1 used TDD — test updated first (RED), then implementation (GREEN)._

## Files Created/Modified
- `src/config.ts` - Changed MCP_INSTRUCTIONS_PATH from .optional() to .default('/app/instructions.txt')
- `tests/config.test.ts` - Updated test name and assertion for no-env-var case
- `tests/helpers/build-test-app.ts` - Added instructionsPath field to makeTestConfig() return object
- `.env.example` - Added empty-value comment for local dev suppression

## Decisions Made
- Used Zod `.default()` (not a fallback in transform) so the default is visible in the schema type signature and auto-reflected in AppConfig
- No change needed to `server.ts` or `instructions.ts` — `config.instructionsPath` was already passed through correctly; only the type changed from `string | undefined` to `string`
- `.env.example` gets both comment forms: the Docker default and the empty-value local dev escape hatch

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- v2.4 milestone (MCP Instructions Field) is now fully complete
- Docker deployers can mount `./instructions.txt:/app/instructions.txt:ro` and get custom instructions in the MCP initialize response with zero extra env vars
- Full test suite (321 tests, 23 files) passes; `npm run build` exits 0

---
*Phase: 21-docker-instructions-path-default*
*Completed: 2026-03-27*
