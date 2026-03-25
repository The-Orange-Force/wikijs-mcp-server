# Roadmap: WikiJS MCP Server

## Milestones

- [v2.0 OAuth 2.1 Extension](./milestones/v2-ROADMAP.md) — Azure AD authentication for MCP tools (2026-03-24)
- [v2.1 Docker Deployment](./milestones/v2.1-ROADMAP.md) — Docker container packaging for Caddy deployment (2026-03-25)
- **v2.2 OAuth Authorization Proxy** — In progress

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

<details>
<summary>v2.1 Docker Deployment (Phase 9) — SHIPPED 2026-03-25</summary>

See [milestones/v2.1-ROADMAP.md](./milestones/v2.1-ROADMAP.md) for full details.

Phase 9: Docker Packaging — .dockerignore, Dockerfile (multi-stage node:20-slim), docker-compose.yml (caddy_net)

</details>

## Active Milestone: v2.2 OAuth Authorization Proxy

**Milestone Goal:** Implement an OAuth 2.1 authorization proxy so Claude Desktop can complete the full auth flow against Azure AD without dynamic client registration support.

### Phases

(Pending — roadmap creation in progress)

---
*Last updated: 2026-03-25*
