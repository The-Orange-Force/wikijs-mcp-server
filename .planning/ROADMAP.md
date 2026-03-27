# Roadmap: WikiJS MCP Server

## Milestones

- ✅ [v2.0 OAuth 2.1 Extension](./milestones/v2-ROADMAP.md) -- Azure AD authentication for MCP tools (2026-03-24)
- ✅ [v2.1 Docker Deployment](./milestones/v2.1-ROADMAP.md) -- Docker container packaging for Caddy deployment (2026-03-25)
- ✅ [v2.2 OAuth Authorization Proxy](./milestones/v2.2-ROADMAP.md) -- OAuth proxy for Claude Desktop auth flow (2026-03-26)
- ✅ [v2.3 Tool Consolidation](./milestones/v2.3-ROADMAP.md) -- Consolidate 17 tools to 3 read-only page tools (2026-03-26)
- ✅ [v2.4 MCP Instructions Field](./milestones/v2.4-ROADMAP.md) -- Instructions in MCP initialize response for auto-guided Claude behavior (2026-03-27)
- 🚧 **v2.5 GDPR Path Filter** -- Block access to GDPR-sensitive client directory pages at the MCP tool layer (Phases 22-24)

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

## v2.5 GDPR Path Filter

**Milestone Goal:** Block access to direct client directory pages (`Clients/<CompanyName>`) at the MCP server level to comply with GDPR, independent of WikiJS permissions.

### Phases

- [x] **Phase 22: Core GDPR Predicate** - `isBlocked()` utility with path normalization and full unit test coverage (completed 2026-03-27)
- [ ] **Phase 23: Tool Handler Integration** - Apply GDPR filter in all 3 tool handlers with timing-safe error responses and audit logging
- [ ] **Phase 24: Integration Tests and Security Hygiene** - End-to-end MCP response verification and instructions file compliance audit

## Phase Details

### Phase 22: Core GDPR Predicate
**Goal**: A hardened, fully-tested path-blocking predicate exists as the single source of truth for GDPR path filtering
**Depends on**: Nothing (first phase of v2.5)
**Requirements**: FILT-01, FILT-02
**Success Criteria** (what must be TRUE):
  1. `isBlocked("Clients/AcmeCorp")` returns true for paths with exactly 2 segments where the first is "Clients"
  2. `isBlocked()` correctly handles all normalization variants (leading/trailing slashes, double slashes, case folding of first segment) and returns the same result regardless of path format
  3. `isBlocked("Clients")` returns false for 1-segment paths, and `isBlocked("Clients/Acme/SubPage")` returns false for 3+ segment paths
  4. Unit tests cover all edge cases with full branch coverage, following the existing `scope-mapper.test.ts` pattern
**Plans:** 1/1 plans complete

Plans:
- [x] 22-01-PLAN.md -- TDD isBlocked() predicate with full edge-case unit tests

### Phase 23: Tool Handler Integration
**Goal**: All three MCP tools enforce GDPR path filtering so that blocked client pages are invisible to MCP clients
**Depends on**: Phase 22
**Requirements**: FILT-03, FILT-04, FILT-05, SEC-01, SEC-02
**Success Criteria** (what must be TRUE):
  1. `get_page` for a blocked page returns a generic "Page not found." error indistinguishable from a genuinely absent page (same text, same response shape)
  2. `get_page` always completes the upstream WikiJS API call before checking `isBlocked()`, so blocked pages and absent pages have equivalent response timing
  3. `search_pages` results never include blocked pages, regardless of which search resolution path (primary GraphQL, metadata, HTTP content, or `resolveViaPagesList` fallback) produced them
  4. `list_pages` results never include blocked pages
  5. Blocked access attempts produce a structured server-side log entry containing tool name, user identity, and correlation ID -- but never the company name segment of the path
**Plans:** 1 plan

Plans:
- [ ] 23-01-PLAN.md -- TDD GDPR filtering in all 3 tool handlers with audit logging

### Phase 24: Integration Tests and Security Hygiene
**Goal**: End-to-end verification confirms that GDPR filtering works correctly from the MCP client perspective, and no information about the filter leaks through side channels
**Depends on**: Phase 23
**Requirements**: SEC-03
**Success Criteria** (what must be TRUE):
  1. Integration tests using Fastify `inject()` verify that all three tools return correct MCP response shapes for both blocked and non-blocked paths
  2. Integration tests confirm that `get_page` blocked responses are byte-identical to genuine "not found" responses
  3. The MCP instructions file (`instructions.txt`) does not contain references to "Clients", blocked paths, GDPR filtering, or any hint of the filter's existence or structure
**Plans:** 1 plan

Plans:
- [ ] 24-01-PLAN.md -- GDPR integration tests and instructions security audit

## Progress

**Execution Order:**
Phases execute in numeric order: 22 -> 23 -> 24

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-8. OAuth Foundation | v2.0 | 12/12 | Complete | 2026-03-24 |
| 9. Docker Packaging | v2.1 | 1/1 | Complete | 2026-03-25 |
| 10-14. OAuth Proxy | v2.2 | 5/5 | Complete | 2026-03-26 |
| 15-18. Tool Consolidation | v2.3 | 8/8 | Complete | 2026-03-26 |
| 19-21. MCP Instructions | v2.4 | 4/4 | Complete | 2026-03-27 |
| 22. Core GDPR Predicate | v2.5 | Complete    | 2026-03-27 | 2026-03-27 |
| 23. Tool Handler Integration | v2.5 | 0/1 | Planning | - |
| 24. Integration Tests and Security Hygiene | v2.5 | 0/1 | Planning | - |

---
*Last updated: 2026-03-27 after Phase 22 execution*
