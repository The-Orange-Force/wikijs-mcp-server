# Milestones

## v2.3 Tool Consolidation (Shipped: 2026-03-26)

**Phases:** 15-18 (4 phases, 8 plans)
**Tests:** 304 passing across 21 files
**LOC:** 6,305 TypeScript
**Timeline:** 1 day (2026-03-26)
**Requirements:** 12/12 satisfied
**Audit:** Passed (v2.3-MILESTONE-AUDIT.md)

**Delivered:** Consolidated 17 MCP tools to 3 read-only page tools with simplified scope model and clean codebase.

**Key accomplishments:**
1. Consolidated 17 MCP tools to 3 read-only tools (get_page, list_pages, search_pages)
2. Fixed search ID resolution with singleByPath + pages.list fallback for correct database IDs
3. Simplified scope model from 3 scopes (read/write/admin) to single wikijs:read
4. Removed STDIO transport and switched Docker to Alpine base image
5. Removed dead code (WikiJsUser/WikiJsGroup types, unused API methods, msal-node dependency)
6. Rewrote documentation for 3-tool, 1-scope architecture

**Archives:** [ROADMAP](milestones/v2.3-ROADMAP.md) | [REQUIREMENTS](milestones/v2.3-REQUIREMENTS.md) | [AUDIT](milestones/v2.3-MILESTONE-AUDIT.md)

---

## v2.2 OAuth Authorization Proxy (Shipped: 2026-03-26)

**Phases:** 10-14 (5 phases, 5 plans)
**Tests:** 209 passing across 15 files
**LOC:** 6,583 TypeScript
**Timeline:** 2 days (2026-03-25 → 2026-03-26)
**Commits:** 42 | **Files changed:** 46 (+7,949 / -75)
**Requirements:** 13/13 satisfied
**Audit:** Passed (v2.2-MILESTONE-AUDIT.md)

**Delivered:** OAuth 2.1 authorization proxy enabling Claude Desktop to complete the full auth flow against Azure AD without pre-configured client credentials.

**Key accomplishments:**
1. Pure-function scope mapping (MCP bare → Azure AD `api://` format) with RFC 8707 resource stripping
2. OAuth AS metadata and OpenID Connect discovery at well-known endpoints
3. Dynamic Client Registration returning pre-configured Azure AD client_id (public client)
4. GET /authorize redirect proxy with PKCE passthrough and two-phase error handling
5. POST /token proxy with AADSTS error normalization and bidirectional scope mapping
6. Full E2E discovery chain: PRM → AS metadata → DCR → authorize → token → MCP call

**Archives:** [ROADMAP](milestones/v2.2-ROADMAP.md) | [REQUIREMENTS](milestones/v2.2-REQUIREMENTS.md) | [AUDIT](milestones/v2.2-MILESTONE-AUDIT.md)

---

