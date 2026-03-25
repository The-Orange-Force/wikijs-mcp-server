---
gsd_state_version: 1.0
milestone: v2.1
milestone_name: Docker Deployment
status: executing
stopped_at: "09-01-PLAN.md checkpoint:human-verify (Task 3 — Docker build and runtime verification)"
last_updated: "2026-03-25T13:10:11.549Z"
last_activity: 2026-03-25 — Executed 09-01, Tasks 1+2 complete
progress:
  total_phases: 1
  completed_phases: 1
  total_plans: 1
  completed_plans: 1
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-25)

**Core value:** Only Azure AD-authenticated colleagues can invoke MCP tools against the company WikiJS instance
**Current focus:** v2.1 Docker Deployment — Phase 9: Docker Packaging

## Current Position

Phase: 9 of 9 (Docker Packaging)
Plan: 1 of 1 in current phase (checkpoint: awaiting human-verify)
Status: In progress — Tasks 1 + 2 committed; Task 3 (human-verify) pending
Last activity: 2026-03-25 — Executed 09-01, Tasks 1+2 complete

Progress: [#####-----] 50%

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

Recent decisions affecting current work:
- node:20-slim chosen over node:20-alpine — @azure/msal-node has documented musl libc compatibility issues with Alpine; slim is Debian-based with glibc
- CMD ["node", "dist/server.js"] not npm start — npm adds shell/process indirection; SIGTERM from docker stop reaches npm instead of Node, causing hard kill
- No ports: mapping in docker-compose.yml — caddy_net network access only; publishing a port exposes JWT-protected MCP endpoint over plain HTTP, bypassing Caddy TLS
- [Phase 09-docker-packaging]: node:20-slim over Alpine — @azure/msal-node musl libc incompatibility; slim is Debian/glibc
- [Phase 09-docker-packaging]: node -e healthcheck (not curl/wget) — both are absent in node:20-slim; Node http module always available
- [Phase 09-docker-packaging]: Strip .map/.d.ts in builder stage via find — .dockerignore only filters host context, not generated files

### Pending Todos

None.

### Blockers/Concerns

- [Phase 9]: caddy_net actual network name on target host must be confirmed before deploy (may differ from assumed name) — documented in docker-compose.yml comment
- [Phase 9]: WIKIJS_BASE_URL in production .env must not use localhost:3000 — documented in docker-compose.yml comment
- [Phase 9 — resolved]: Source maps (.js.map) are explicitly stripped in builder stage via `find dist/ -name '*.map' | xargs rm -f`

## Session Continuity

Last session: 2026-03-25T13:10:11.547Z
Stopped at: 09-01-PLAN.md checkpoint:human-verify (Task 3 — Docker build and runtime verification)
Resume file: None
