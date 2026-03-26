---
gsd_state_version: 1.0
milestone: v2.2
milestone_name: OAuth Authorization Proxy
status: completed
stopped_at: Completed 14-01-PLAN.md
last_updated: "2026-03-26T08:05:37Z"
last_activity: "2026-03-26 — Executed 14-01: Wire-up and protected resource metadata switch"
progress:
  total_phases: 5
  completed_phases: 5
  total_plans: 5
  completed_plans: 5
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-26)

**Core value:** Only Azure AD-authenticated colleagues can invoke MCP tools against the company WikiJS instance
**Current focus:** v2.2 OAuth Authorization Proxy — Phase 14 complete, milestone complete

## Current Position

Phase: 14 of 14 (Wire-up and Protected Resource Metadata Switch)
Plan: 1 of 1 (complete)
Status: Phase 14 complete — milestone complete
Last activity: 2026-03-26 — Executed 14-01: Wire-up and protected resource metadata switch

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 5
- Average duration: 3min
- Total execution time: 15min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 10 | 1 | 2min | 2min |
| 11 | 1 | 2min | 2min |
| 12 | 1 | 3min | 3min |
| 13 | 1 | 5min | 5min |
| 14 | 1 | 3min | 3min |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

Recent decisions affecting current work:
- Root-level paths required: /authorize, /token, /register (not /oauth/*) — Claude.ai ignores metadata
- No callback endpoint — Azure AD redirects directly to client's redirect_uri
- Single Fastify plugin: src/routes/oauth-proxy.ts with fetch injection for testability
- @fastify/formbody scoped inside OAuth proxy plugin only
- Strip RFC 8707 `resource` parameter before all Azure AD requests (AADSTS9010010)
- Import SUPPORTED_SCOPES from existing scopes.ts for single source of truth
- OIDC_PASSTHROUGH as Set for O(1) lookup on openid/offline_access
- Unknown scopes pass through unchanged for transparent proxy behavior
- [Phase 11]: All metadata endpoint URLs point to self (MCP_RESOURCE_URL), not Azure AD
- [Phase 12]: Two-phase OAuth error handling — JSON 400 pre-redirect_uri, redirect errors post-redirect_uri
- [Phase 12]: Phase 11 oauth-proxy plugin prerequisite created inline (Rule 3 deviation)
- [Phase 13]: AADSTS-specific descriptions override generic ones for ambiguous codes
- [Phase 13]: @fastify/formbody registered inside oauth-proxy plugin scope (not global)
- [Phase 13]: fetch is optional in OAuthProxyOptions, defaults to globalThis.fetch
- [Phase 14]: PRM authorization_servers switched from Azure AD tenant URL to appConfig.azure.resourceUrl (self)
- [Phase 14]: Mock fetch captures outbound calls for assertion without returning fake token responses
- [Phase 14]: E2E test uses 6 sequential steps sharing state via let declarations to validate chain links

### Pending Todos

None.

### Blockers/Concerns

- Claude Desktop redirect_uri format needs live tenant testing (http://localhost port handling)
- Shared client_id token theft (Pitfall 6) deferred post-MVP — consent interstitial needed later

## Session Continuity

Last session: 2026-03-26T08:05:37Z
Stopped at: Completed 14-01-PLAN.md
Resume file: None
