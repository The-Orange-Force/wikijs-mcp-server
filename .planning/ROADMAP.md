# Roadmap: WikiJS MCP Server

## Milestones

- [v2.0 OAuth 2.1 Extension](./milestones/v2-ROADMAP.md) — Azure AD authentication for MCP tools (2026-03-24)
- **v2.1 Docker Deployment** — Phases 9 (in progress)

## Completed Milestones

<details>
<summary>v2.0 OAuth 2.1 Extension (Phases 1-8) — SHIPPED 2026-03-24</summary>

See [milestones/v2-ROADMAP.md](./milestones/v2-ROADMAP.md) for full details.

Phase 1: MCP Transport Port — Port MCP tools to Fastify TypeScript
Phase 2: OAuth Configuration — Zod-validated Azure AD config with fail-fast startup
Phase 3: Discovery Metadata — RFC 9728 protected resource metadata endpoint
Phase 4: JWT Authentication — Bearer token validation using jose
Phase 5: Route Protection and Observability — Auth on MCP routes, correlation IDs
Phase 6: Scope Format Alignment — Colon notation unification
Phase 7: Wire Tool Observability — All 17 handlers wrapped with user identity and timing
Phase 8: Dead Code Cleanup — Orphaned files and stale references removed

</details>

## Active Milestone: v2.1 Docker Deployment

**Milestone Goal:** Package the MCP server as a Docker container for self-hosted deployment behind Caddy.

### Phases

- [x] **Phase 9: Docker Packaging** - Three-file Docker configuration: .dockerignore, Dockerfile (multi-stage), docker-compose.yml (completed 2026-03-25)

### Phase Details

#### Phase 9: Docker Packaging
**Goal**: Operator can deploy the MCP server as a Docker container reachable by Caddy on caddy_net with no host port exposure
**Depends on**: Nothing (standalone infrastructure work, no application code changes)
**Requirements**: DOCK-01, DOCK-02, DOCK-03, DOCK-04, DOCK-05, DOCK-06, DOCK-07
**Success Criteria** (what must be TRUE):
  1. `docker compose build` completes without error and produces a tagged image containing only `dist/` and production dependencies
  2. `docker history wikijs-mcp:latest` contains no `.env` values, TypeScript source files, or devDependencies in any layer
  3. `docker compose up -d` starts the container and the HTTP server binds to `0.0.0.0:PORT` — confirmed by `curl http://localhost:PORT/health` returning 200 from within the container network
  4. `docker inspect wikijs-mcp-server --format '{{.State.Health.Status}}'` returns `healthy` after the HEALTHCHECK start period
  5. Caddy proxies requests to the container via `wikijs-mcp-server:PORT` on `caddy_net` — no port published to the Docker host
**Plans**: 1 plan

Plans:
- [~] 09-01-PLAN.md — Create .dockerignore, Dockerfile (two-stage node:20-slim), and docker-compose.yml (Tasks 1+2 done; Task 3 checkpoint pending human-verify)

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 9. Docker Packaging | 1/1 | Complete   | 2026-03-25 | - |

---
*Last updated: 2026-03-25*
