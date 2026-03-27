---
phase: 20-docker-integration-and-default-instructions
plan: 01
subsystem: infra
tags: [docker, docker-compose, instructions, mcp, volume-mount]

# Dependency graph
requires:
  - phase: 19-instructions-loading-and-initialize-response
    provides: MCP_INSTRUCTIONS_PATH env var and instructions loading module
provides:
  - Default instructions.txt template with [TOPIC] placeholders
  - Docker Compose volume mount for runtime instructions customization
  - MCP_INSTRUCTIONS_PATH documented across all config references
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Runtime-mounted config files via Docker Compose volumes (read-only)"
    - ".dockerignore exclusion for runtime-mounted files"

key-files:
  created:
    - instructions.txt
  modified:
    - docker-compose.yml
    - .dockerignore
    - .env.example
    - CLAUDE.md
    - README.md

key-decisions:
  - "instructions.txt uses directive tone with [TOPIC] placeholders for easy deployer customization"
  - "Volume mount is read-only (:ro) to prevent container from modifying host file"
  - "instructions.txt excluded from Docker build context since it is mounted at runtime"

patterns-established:
  - "Runtime config pattern: host file mounted read-only into container via docker-compose volumes"

requirements-completed: [DOCK-01, DOCK-02]

# Metrics
duration: 2min
completed: 2026-03-27
---

# Phase 20 Plan 01: Docker Integration and Default Instructions Summary

**Default instructions.txt template with [TOPIC] placeholders, mounted read-only into Docker container via docker-compose volume, with MCP_INSTRUCTIONS_PATH documented in .env.example, CLAUDE.md, and README.md**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-27T09:08:21Z
- **Completed:** 2026-03-27T09:10:49Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Created instructions.txt template at repo root with generic [TOPIC] placeholders and directive tone for deployer customization
- Added read-only volume mount in docker-compose.yml mapping ./instructions.txt to /app/instructions.txt
- Excluded instructions.txt from Docker build context via .dockerignore (runtime-mounted, not baked in)
- Documented MCP_INSTRUCTIONS_PATH as optional env var in .env.example, CLAUDE.md, and README.md

## Task Commits

Each task was committed atomically:

1. **Task 1: Create instructions.txt and update Docker configuration** - `9e1792b` (feat)
2. **Task 2: Document MCP_INSTRUCTIONS_PATH in .env.example, CLAUDE.md, and README.md** - `97f85ef` (docs)

## Files Created/Modified
- `instructions.txt` - Default MCP instructions template with [TOPIC] placeholders for deployer customization
- `docker-compose.yml` - Added volumes section with read-only mount for instructions.txt
- `.dockerignore` - Added instructions.txt exclusion (runtime-mounted, not built into image)
- `.env.example` - Added commented MCP_INSTRUCTIONS_PATH with default path documentation
- `CLAUDE.md` - Added MCP_INSTRUCTIONS_PATH row to environment variables table
- `README.md` - Added MCP_INSTRUCTIONS_PATH row to environment variables table

## Decisions Made
- instructions.txt uses directive tone with [TOPIC] placeholders for easy deployer customization
- Volume mount is read-only (:ro) to prevent container from modifying host file
- instructions.txt excluded from Docker build context since it is mounted at runtime

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 20 plan 01 is complete; instructions template and Docker wiring are ready
- Deployers can now edit instructions.txt on the host and restart the container to update Claude's behavioral guidance without rebuilding the image

## Self-Check: PASSED

All 7 artifacts verified present. Both task commits (9e1792b, 97f85ef) confirmed in git log. Build passes, 314 tests pass.

---
*Phase: 20-docker-integration-and-default-instructions*
*Completed: 2026-03-27*
