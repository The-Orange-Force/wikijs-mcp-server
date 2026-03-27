# Roadmap: WikiJS MCP Server

## Milestones

- ✅ [v2.0 OAuth 2.1 Extension](./milestones/v2-ROADMAP.md) -- Azure AD authentication for MCP tools (2026-03-24)
- ✅ [v2.1 Docker Deployment](./milestones/v2.1-ROADMAP.md) -- Docker container packaging for Caddy deployment (2026-03-25)
- ✅ [v2.2 OAuth Authorization Proxy](./milestones/v2.2-ROADMAP.md) -- OAuth proxy for Claude Desktop auth flow (2026-03-26)
- ✅ [v2.3 Tool Consolidation](./milestones/v2.3-ROADMAP.md) -- Consolidate 17 tools to 3 read-only page tools (2026-03-26)
- ✅ [v2.4 MCP Instructions Field](./milestones/v2.4-ROADMAP.md) -- Instructions in MCP initialize response for auto-guided Claude behavior (2026-03-27)
- ✅ [v2.5 GDPR Path Filter](./milestones/v2.5-ROADMAP.md) -- GDPR-compliant path filtering for client directory pages (2026-03-27)
- 🚧 **v2.6 GDPR Content Redaction** -- Phases 25-27 (in progress)

## Completed Milestones

<details>
<summary>v2.0 OAuth 2.1 Extension (Phases 1-8) -- SHIPPED 2026-03-24</summary>

See [milestones/v2-ROADMAP.md](./milestones/v2-ROADMAP.md) for full details.

Phase 1: MCP Transport Port -- Port MCP tools to Fastify TypeScript
Phase 2: OAuth Configuration -- Zod-validated Azure AD config with fail-fast startup
Phase 3: Discovery Metadata -- RFC 9728 protected resource metadata endpoint
Phase 4: JWT Authentication -- Bearer token validation using jose
Phase 5: Route Protection and Observability -- Auth on MCP routes, correlation IDs
Phase 6: Scope Format Alignment -- Colon notation unification
Phase 7: Wire Tool Observability -- All 17 handlers wrapped with user identity and timing
Phase 8: Dead Code Cleanup -- Orphaned files and stale references removed

</details>

<details>
<summary>v2.1 Docker Deployment (Phase 9) -- SHIPPED 2026-03-25</summary>

See [milestones/v2.1-ROADMAP.md](./milestones/v2.1-ROADMAP.md) for full details.

Phase 9: Docker Packaging -- .dockerignore, Dockerfile (multi-stage node:20-slim), docker-compose.yml (caddy_net)

</details>

<details>
<summary>v2.2 OAuth Authorization Proxy (Phases 10-14) -- SHIPPED 2026-03-26</summary>

See [milestones/v2.2-ROADMAP.md](./milestones/v2.2-ROADMAP.md) for full details.

Phase 10: Scope Mapper and Azure Endpoint Utils -- Pure-function scope transformation and Azure AD URL construction
Phase 11: Discovery and Registration Endpoints -- OAuth AS metadata, OIDC discovery, Dynamic Client Registration
Phase 12: Authorization Redirect Endpoint -- GET /authorize with scope mapping, PKCE passthrough
Phase 13: Token Proxy Endpoint -- POST /token with AADSTS normalization, bidirectional scope mapping
Phase 14: Wire Up and Protected Resource Metadata Switch -- Self-referencing PRM, E2E flow validation

</details>

<details>
<summary>v2.3 Tool Consolidation (Phases 15-18) -- SHIPPED 2026-03-26</summary>

See [milestones/v2.3-ROADMAP.md](./milestones/v2.3-ROADMAP.md) for full details.

Phase 15: API Layer Consolidation -- getPageById, listPages with includeUnpublished, search ID resolution
Phase 16: Tool Registration Consolidation -- 3 read-only tools with LLM-optimized descriptions
Phase 17: Scope and Auth Simplification -- Single wikijs:read scope
Phase 18: Cleanup -- STDIO removal, Alpine Docker, dead code removal, documentation rewrite

</details>

<details>
<summary>v2.4 MCP Instructions Field (Phases 19-21) -- SHIPPED 2026-03-27</summary>

See [milestones/v2.4-ROADMAP.md](./milestones/v2.4-ROADMAP.md) for full details.

Phase 19: Instructions Loading and Initialize Response -- loadInstructions module with file/fallback, MCP initialize response wiring
Phase 20: Docker Integration and Default Instructions -- instructions.txt template, docker-compose volume mount
Phase 21: Docker Instructions Path Default -- Zod default for MCP_INSTRUCTIONS_PATH, zero-config Docker deploys

</details>

<details>
<summary>v2.5 GDPR Path Filter (Phases 22-24) -- SHIPPED 2026-03-27</summary>

See [milestones/v2.5-ROADMAP.md](./milestones/v2.5-ROADMAP.md) for full details.

Phase 22: Core GDPR Predicate -- isBlocked() utility with path normalization and full unit test coverage
Phase 23: Tool Handler Integration -- GDPR filter in all 3 tool handlers with timing-safe responses and audit logging
Phase 24: Integration Tests and Security Hygiene -- E2E MCP response verification and instructions security audit

</details>

## 🚧 v2.6 GDPR Content Redaction

**Milestone Goal:** Replace path-based page blocking with surgical marker-based content redaction, and inject page URLs into get_page responses.

## Phases

- [x] **Phase 25: Core Redaction Function** - Pure redactContent() function with marker-based content redaction and comprehensive test coverage (completed 2026-03-27)
- [ ] **Phase 26: Redaction Wiring and URL Injection** - Wire redaction into get_page handler and inject page URLs with configurable base URL
- [ ] **Phase 27: Path Filter Removal and End-to-End Verification** - Remove isBlocked() filtering and verify the complete system end-to-end

## Phase Details

### Phase 25: Core Redaction Function
**Goal**: Content between GDPR markers is correctly redacted by a pure, tested function before any integration work begins
**Depends on**: Nothing (first phase of v2.6)
**Requirements**: REDACT-01, REDACT-02, REDACT-03, REDACT-04, REDACT-05, REDACT-06
**Success Criteria** (what must be TRUE):
  1. Content between `<!-- gdpr-start -->` and `<!-- gdpr-end -->` markers is replaced with the redaction placeholder
  2. Multiple separate marker pairs on a single page each produce independent redactions with public content between them preserved
  3. An unclosed `<!-- gdpr-start -->` without matching end marker causes everything from that marker to end of content to be redacted (fail-closed)
  4. Malformed markers produce a warning log entry containing page ID and path
  5. Markers with varying case and whitespace around the tag name are matched correctly
**Plans**: 1 plan

Plans:
- [ ] 25-01-PLAN.md -- TDD: redactContent() function with two-pass regex redaction and comprehensive unit tests

### Phase 26: Redaction Wiring and URL Injection
**Goal**: The get_page tool returns redacted content and a clickable page URL, with the wiki base URL driven by configuration
**Depends on**: Phase 25
**Requirements**: URL-01, URL-02
**Success Criteria** (what must be TRUE):
  1. get_page response includes a `url` field containing a direct link to the wiki page
  2. The wiki page base URL used for URL construction is a server configuration value, not hardcoded inline
  3. get_page content passes through redactContent() before being returned to the client
**Plans**: 2 plans

Plans:
- [ ] 26-01-PLAN.md -- Config extension (WIKIJS_LOCALE, trailing slash normalization) and buildPageUrl() helper with unit tests
- [ ] 26-02-PLAN.md -- Wire redaction and URL into get_page handler, update createMcpServer call chain, integration tests

### Phase 27: Path Filter Removal and End-to-End Verification
**Goal**: All path-based GDPR filtering is removed and every published wiki page is accessible, with marker-based redaction as the sole GDPR mechanism
**Depends on**: Phase 26
**Requirements**: FILTER-01, FILTER-02
**Success Criteria** (what must be TRUE):
  1. isBlocked() and all path-check logic are removed from the codebase
  2. get_page, list_pages, and search_pages return results for all published pages without path restrictions
  3. get_page for a page with GDPR markers returns redacted content and a URL (end-to-end verification of Phase 25 + 26 combined)
  4. get_page for a page without GDPR markers returns full content unchanged
**Plans**: 1 plan

Plans:
- [ ] 27-01-PLAN.md -- Remove path-filtering code, create E2E verification tests, bump version to 2.6.0

## Progress

**Execution Order:**
Phases execute in numeric order: 25 -> 26 -> 27

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-8. OAuth Foundation | v2.0 | 12/12 | Complete | 2026-03-24 |
| 9. Docker Packaging | v2.1 | 1/1 | Complete | 2026-03-25 |
| 10-14. OAuth Proxy | v2.2 | 5/5 | Complete | 2026-03-26 |
| 15-18. Tool Consolidation | v2.3 | 8/8 | Complete | 2026-03-26 |
| 19-21. MCP Instructions | v2.4 | 4/4 | Complete | 2026-03-27 |
| 22-24. GDPR Path Filter | v2.5 | 3/3 | Complete | 2026-03-27 |
| 25. Core Redaction Function | 1/1 | Complete    | 2026-03-27 | - |
| 26. Redaction Wiring and URL Injection | 1/2 | In Progress|  | - |
| 27. Path Filter Removal and E2E Verification | v2.6 | 0/1 | Not started | - |

---
*Last updated: 2026-03-27 after Phase 26 planning*
