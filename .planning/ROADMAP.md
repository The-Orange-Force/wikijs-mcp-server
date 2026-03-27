# Roadmap: WikiJS MCP Server

## Milestones

- [v2.0 OAuth 2.1 Extension](./milestones/v2-ROADMAP.md) -- Azure AD authentication for MCP tools (2026-03-24)
- [v2.1 Docker Deployment](./milestones/v2.1-ROADMAP.md) -- Docker container packaging for Caddy deployment (2026-03-25)
- [v2.2 OAuth Authorization Proxy](./milestones/v2.2-ROADMAP.md) -- OAuth proxy for Claude Desktop auth flow (2026-03-26)
- [v2.3 Tool Consolidation](./milestones/v2.3-ROADMAP.md) -- Consolidate 17 tools to 3 read-only page tools (2026-03-26)
- **v2.4 MCP Instructions Field** -- Instructions in MCP initialize response for auto-guided Claude behavior (in progress)

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

## v2.4 MCP Instructions Field

**Milestone Goal:** Add an `instructions` field to the MCP initialize response so Claude automatically searches the wiki for relevant topics without users needing to prompt it.

## Phases

- [ ] **Phase 19: Instructions Loading and Initialize Response** - Load instructions from configurable file path with fallback default and return in MCP initialize response
- [ ] **Phase 20: Docker Integration and Default Instructions** - Ship default instructions file and wire docker-compose volume mount

## Phase Details

### Phase 19: Instructions Loading and Initialize Response
**Goal**: MCP clients receive contextual instructions that guide Claude to auto-search the wiki for relevant topics
**Depends on**: Phase 18 (v2.3 codebase)
**Requirements**: INIT-01, INIT-02, FILE-01, FILE-02, FILE-03
**Success Criteria** (what must be TRUE):
  1. When an MCP client sends an initialize request, the response includes an `instructions` field with text content
  2. The instructions text mentions specific topic areas (Mendix, client names, AI, Java, career) that Claude should proactively search for
  3. When `MCP_INSTRUCTIONS_PATH` env var points to a valid file, the server uses that file's content as instructions
  4. When the instructions file is missing or unreadable, the server starts successfully and returns hardcoded default instructions
  5. When falling back to defaults, the server logs a warning message indicating the file could not be loaded
**Plans**: TBD

Plans:
- [ ] 19-01: TBD
- [ ] 19-02: TBD

### Phase 20: Docker Integration and Default Instructions
**Goal**: Deployers can customize instructions via volume mount without rebuilding the Docker image
**Depends on**: Phase 19
**Requirements**: DOCK-01, DOCK-02
**Success Criteria** (what must be TRUE):
  1. A default `instructions.txt` file exists in the repository with meaningful content matching the hardcoded fallback
  2. `docker-compose.yml` mounts the instructions file into the container at the path the server expects
  3. A deployer can replace the instructions file on the host and restart the container to change Claude's behavior
**Plans**: 1 plan

Plans:
- [ ] 20-01-PLAN.md -- Ship default instructions.txt, wire docker-compose volume mount, update documentation

## Progress

**Execution Order:** 19 -> 20

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 19. Instructions Loading and Initialize Response | 0/? | Not started | - |
| 20. Docker Integration and Default Instructions | 0/1 | Not started | - |

---
*Last updated: 2026-03-27*
