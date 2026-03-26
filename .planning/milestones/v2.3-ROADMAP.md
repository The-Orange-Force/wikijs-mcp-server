# Roadmap: WikiJS MCP Server

## Milestones

- [v2.0 OAuth 2.1 Extension](./milestones/v2-ROADMAP.md) -- Azure AD authentication for MCP tools (2026-03-24)
- [v2.1 Docker Deployment](./milestones/v2.1-ROADMAP.md) -- Docker container packaging for Caddy deployment (2026-03-25)
- [v2.2 OAuth Authorization Proxy](./milestones/v2.2-ROADMAP.md) -- OAuth proxy for Claude Desktop auth flow (2026-03-26)
- **v2.3 Tool Consolidation** -- Consolidate 17 tools to 3 read-only page tools (SHIPPED 2026-03-26)

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

## v2.3 Tool Consolidation

**Milestone Goal:** Consolidate 17 MCP tools down to 3 read-only page tools (`get_page`, `list_pages`, `search_pages`), fix search ID resolution, simplify scopes to read-only, and remove all dead code.

## Phases

**Phase Numbering:**
- Integer phases (15, 16, 17, 18): Planned milestone work
- Decimal phases (e.g., 15.1): Urgent insertions (marked with INSERTED)

- [x] **Phase 15: API Layer Consolidation** - Build consolidated GraphQL methods for get, list, and search with path-based ID resolution (completed 2026-03-26)
- [x] **Phase 16: Tool Registration Consolidation** - Replace 17 tool registrations with 3 read-only tools with verbose descriptions (completed 2026-03-26)
- [x] **Phase 17: Scope and Auth Simplification** - Reduce scope model from 3 scopes to wikijs:read only (completed 2026-03-26)
- [x] **Phase 18: Cleanup** - Remove STDIO transport, dead dependencies, and unused code (completed 2026-03-26)

## Phase Details

### Phase 15: API Layer Consolidation
**Goal**: WikiJsApi provides stable methods for consolidated page access and search with correct ID resolution
**Depends on**: Nothing (first phase of v2.3)
**Requirements**: TOOL-01, TOOL-02, SRCH-01, SRCH-02
**Success Criteria** (what must be TRUE):
  1. Calling getPageById returns metadata, content, and isPublished in a single GraphQL call
  2. Calling listPages with includeUnpublished=false returns only published pages; with includeUnpublished=true returns all pages
  3. Calling searchPages returns results where each result's ID is the real database page ID (not the search index ID)
  4. When singleByPath fails for a search result, the fallback cross-references pages.list to resolve the correct ID
**Plans:** 2/2 plans complete
Plans:
- [ ] 15-01-PLAN.md -- Extend WikiJsPage interface, consolidate getPageById and listPages methods
- [ ] 15-02-PLAN.md -- Implement search ID resolution with singleByPath + pages.list fallback

### Phase 16: Tool Registration Consolidation
**Goal**: MCP server exposes exactly 3 tools (get_page, list_pages, search_pages) with clear LLM-optimized descriptions
**Depends on**: Phase 15
**Requirements**: TOOL-03, TOOL-04, SRCH-03
**Success Criteria** (what must be TRUE):
  1. MCP tools/list returns exactly 3 tools: get_page, list_pages, search_pages
  2. No write tools (create_page, update_page, delete_page, force_delete_page, publish_page) appear in tools/list
  3. No user/group tools (list_users, search_users, create_user, update_user, list_groups) appear in tools/list
  4. Each tool's description is multi-sentence, explaining what it returns and when to use it
**Plans:** 2/2 plans complete
Plans:
- [ ] 16-01-PLAN.md -- Rewrite mcp-tools.ts with 3 read-only tools and update SCOPE_TOOL_MAP
- [ ] 16-02-PLAN.md -- Update all test files for 3-tool consolidation

### Phase 17: Scope and Auth Simplification
**Goal**: Scope enforcement uses a single wikijs:read scope for all 3 tools
**Depends on**: Phase 16
**Requirements**: SCOP-01, SCOP-02
**Success Criteria** (what must be TRUE):
  1. SCOPE_TOOL_MAP contains only wikijs:read mapping to all 3 tools
  2. A token with wikijs:read scope can invoke all 3 tools
  3. A token missing wikijs:read scope is rejected for all 3 tools
  4. The scopes_supported field in discovery metadata lists only wikijs:read
**Plans:** 1/1 plans complete
Plans:
- [x] 17-01-PLAN.md -- Simplify scopes to wikijs:read only and update all test assertions

### Phase 18: Cleanup
**Goal**: All dead code, unused dependencies, and legacy transport removed
**Depends on**: Phase 17
**Requirements**: CLEN-01, CLEN-02, CLEN-03
**Success Criteria** (what must be TRUE):
  1. lib/mcp_wikijs_stdin.js does not exist and no code references STDIO transport
  2. @azure/msal-node does not appear in package.json or node_modules
  3. WikiJsUser, WikiJsGroup, ResponseResult types do not exist in types.ts
  4. All removed API methods (createPage, updatePage, deletePage, etc.) are gone from api.ts
  5. npm test passes with no failures and npm run build compiles cleanly
**Plans:** 3/3 plans complete
Plans:
- [x] 18-01-PLAN.md -- Remove dead source code (types, API methods, scopes) and sync version to 2.3.0 (completed 2026-03-26)
- [x] 18-02-PLAN.md -- Remove STDIO transport, uninstall msal-node, switch Dockerfile to Alpine (completed 2026-03-26)
- [x] 18-03-PLAN.md -- Update all tests for 3-tool/1-scope model and rewrite documentation (completed 2026-03-26)

## Progress

**Execution Order:**
Phases execute in numeric order: 15 -> 16 -> 17 -> 18

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 15. API Layer Consolidation | 2/2 | Complete    | 2026-03-26 |
| 16. Tool Registration Consolidation | 2/2 | Complete    | 2026-03-26 |
| 17. Scope and Auth Simplification | 1/1 | Complete    | 2026-03-26 |
| 18. Cleanup | 3/3 | Complete   | 2026-03-26 |

---
*Created: 2026-03-26*
*Last updated: 2026-03-26 -- Phase 18 complete (v2.3 Tool Consolidation shipped)*
