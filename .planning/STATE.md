---
gsd_state_version: 1.0
milestone: v2.1
milestone_name: Docker Deployment
status: ready_to_plan
stopped_at: null
last_updated: "2026-03-25T00:00:00Z"
last_activity: 2026-03-25 -- Roadmap created, Phase 9 ready to plan
progress:
  total_phases: 1
  completed_phases: 0
  total_plans: 1
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-25)

**Core value:** Only Azure AD-authenticated colleagues can invoke MCP tools against the company WikiJS instance
**Current focus:** v2.1 Docker Deployment — Phase 9: Docker Packaging

## Current Position

Phase: 9 of 9 (Docker Packaging)
Plan: 0 of 1 in current phase
Status: Ready to plan
Last activity: 2026-03-25 — Roadmap created for v2.1 milestone

Progress: [----------] 0%

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

Recent decisions affecting current work:
- node:20-slim chosen over node:20-alpine — @azure/msal-node has documented musl libc compatibility issues with Alpine; slim is Debian-based with glibc
- CMD ["node", "dist/server.js"] not npm start — npm adds shell/process indirection; SIGTERM from docker stop reaches npm instead of Node, causing hard kill
- No ports: mapping in docker-compose.yml — caddy_net network access only; publishing a port exposes JWT-protected MCP endpoint over plain HTTP, bypassing Caddy TLS

### Pending Todos

None.

### Blockers/Concerns

- [Phase 9]: caddy_net actual network name on target host must be confirmed before deploy (may differ from assumed name)
- [Phase 9]: WIKIJS_BASE_URL in production .env must not use localhost:3000 — that resolves to the container's own loopback, not Wiki.js
- [Phase 9]: Source maps (.js.map) will appear in runtime image unless explicitly deleted — acceptable for internal tool, decide during implementation

## Session Continuity

Last session: 2026-03-25
Stopped at: Roadmap written, requirements mapped, ready for /gsd:plan-phase 9
Resume file: None
