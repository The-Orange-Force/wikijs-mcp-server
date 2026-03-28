# Roadmap: WikiJS MCP Server

## Milestones

- ✅ [v2.0 OAuth 2.1 Extension](./milestones/v2-ROADMAP.md) -- Azure AD authentication for MCP tools (2026-03-24)
- ✅ [v2.1 Docker Deployment](./milestones/v2.1-ROADMAP.md) -- Docker container packaging for Caddy deployment (2026-03-25)
- ✅ [v2.2 OAuth Authorization Proxy](./milestones/v2.2-ROADMAP.md) -- OAuth proxy for Claude Desktop auth flow (2026-03-26)
- ✅ [v2.3 Tool Consolidation](./milestones/v2.3-ROADMAP.md) -- Consolidate 17 tools to 3 read-only page tools (2026-03-26)
- ✅ [v2.4 MCP Instructions Field](./milestones/v2.4-ROADMAP.md) -- Instructions in MCP initialize response for auto-guided Claude behavior (2026-03-27)
- ✅ [v2.5 GDPR Path Filter](./milestones/v2.5-ROADMAP.md) -- GDPR-compliant path filtering for client directory pages (2026-03-27)
- ✅ [v2.6 GDPR Content Redaction](./milestones/v2.6-ROADMAP.md) -- Marker-based content redaction replacing path-based blocking (2026-03-27)
- 🚧 **v2.7 Metadata Search Fallback** -- Phases 28-29 (in progress)

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

<details>
<summary>v2.6 GDPR Content Redaction (Phases 25-27) -- SHIPPED 2026-03-27</summary>

See [milestones/v2.6-ROADMAP.md](./milestones/v2.6-ROADMAP.md) for full details.

Phase 25: Core Redaction Function -- redactContent() with two-pass regex redaction and 26 unit tests
Phase 26: Redaction Wiring and URL Injection -- buildPageUrl() helper, config extension, handler wiring
Phase 27: Path Filter Removal and E2E Verification -- isBlocked() removal, 6-test E2E suite, version 2.6.0

</details>

## v2.7 Metadata Search Fallback

**Milestone Goal:** Supplement the GraphQL search with a metadata fallback that matches queries against page paths, titles, and descriptions -- so acronyms, path segments, and short tokens always surface results.

## Phases

- [x] **Phase 28: Metadata Fallback Implementation** - Private searchPagesByMetadata() method wired into searchPages() pipeline with deduplication, unpublished filtering, and limit enforcement (completed 2026-03-27)
- [x] **Phase 29: Test Coverage, Observability, and Tool Description** - Full test matrix for all fallback scenarios, structured logging, and updated search_pages description (completed 2026-03-28)

## Phase Details

### Phase 28: Metadata Fallback Implementation
**Goal**: Searching for acronyms, path segments, and short tokens that previously returned zero results now returns matching pages
**Depends on**: Nothing (first phase in v2.7)
**Requirements**: META-01, META-02, META-03, META-04, META-05, META-06, INTG-01, INTG-02
**Success Criteria** (what must be TRUE):
  1. Searching for a known acronym (e.g., "COA") that exists in page paths or titles returns matching pages instead of zero results
  2. Metadata matching is case-insensitive -- searching "coa" and "COA" returns identical results
  3. A page that appears in both GraphQL results and metadata fallback appears only once in the response (no duplicates)
  4. Unpublished pages never appear in fallback results, even when they match the query
  5. Total results never exceed the requested limit, regardless of how many metadata matches exist
**Plans**: 1 plan

Plans:
- [ ] 28-01-PLAN.md -- Implement searchPagesByMetadata() method, extend resolveViaPagesList() return type, wire into searchPages() pipeline, and add unit tests

### Phase 29: Test Coverage, Observability, and Tool Description
**Goal**: All fallback correctness requirements are verified by automated tests, fallback activity is observable in logs, and AI assistants know the search tool handles acronyms and path queries
**Depends on**: Phase 28
**Requirements**: OBSV-01, TOOL-01
**Success Criteria** (what must be TRUE):
  1. When the metadata fallback fires and adds results, an info-level log entry records the query, the number of metadata hits, and the total resolved count
  2. The search_pages tool description mentions that searches match against page paths, titles, and descriptions
  3. The existing 366-test suite remains green (no regressions from Phase 28 or 29 changes)
**Plans**: 1 plan

Plans:
- [ ] 29-01-PLAN.md -- Add metadata fallback logging, update search_pages tool description, bump version to 2.7.0, create dedicated test file with full fallback matrix

## Progress

**Execution Order:**
Phases execute in numeric order: 28 -> 29

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-8. OAuth Foundation | v2.0 | 12/12 | Complete | 2026-03-24 |
| 9. Docker Packaging | v2.1 | 1/1 | Complete | 2026-03-25 |
| 10-14. OAuth Proxy | v2.2 | 5/5 | Complete | 2026-03-26 |
| 15-18. Tool Consolidation | v2.3 | 8/8 | Complete | 2026-03-26 |
| 19-21. MCP Instructions | v2.4 | 4/4 | Complete | 2026-03-27 |
| 22-24. GDPR Path Filter | v2.5 | 3/3 | Complete | 2026-03-27 |
| 25-27. GDPR Content Redaction | v2.6 | 4/4 | Complete | 2026-03-27 |
| 28. Metadata Fallback Implementation | 1/1 | Complete    | 2026-03-27 | - |
| 29. Test Coverage, Observability, and Tool Description | 1/1 | Complete    | 2026-03-28 | - |

---
*Last updated: 2026-03-28 after Phase 29 planning completed*
