---
gsd_state_version: 1.0
milestone: v2.2
milestone_name: OAuth Authorization Proxy
status: defining
last_updated: "2026-03-25"
last_activity: 2026-03-25 — Milestone v2.2 started
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-25)

**Core value:** Only Azure AD-authenticated colleagues can invoke MCP tools against the company WikiJS instance
**Current focus:** v2.2 OAuth Authorization Proxy — Defining requirements

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-03-25 — Milestone v2.2 started

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

Recent decisions affecting current work:
- MCP spec (2025-03-26 revision) requires resource servers to proxy OAuth when IdP lacks dynamic client registration
- Azure AD does not support Dynamic Client Registration (RFC 7591) — server must proxy
- Azure AD app registration is a public client (no client_secret) with PKCE enforced
- Scope mapping: bare `wikijs:read` → fully-qualified `api://{client_id}/wikijs:read` at proxy layer

### Pending Todos

None.

### Blockers/Concerns

- Claude Desktop's exact redirect_uri format needs testing (http://localhost vs http://localhost/callback vs http://127.0.0.1)
- Azure AD's "Mobile and desktop applications" platform with http://localhost may or may not support arbitrary paths/ports

## Session Continuity

Last session: 2026-03-25
Stopped at: —
Resume file: None
