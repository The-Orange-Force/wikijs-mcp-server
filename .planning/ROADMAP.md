# Roadmap: WikiJS MCP Server

## Milestones

- [v2.0 OAuth 2.1 Extension](./milestones/v2-ROADMAP.md) — Azure AD authentication for MCP tools (2026-03-24)
- [v2.1 Docker Deployment](./milestones/v2.1-ROADMAP.md) — Docker container packaging for Caddy deployment (2026-03-25)
- [v2.2 OAuth Authorization Proxy](./milestones/v2.2-ROADMAP.md) — OAuth proxy for Claude Desktop auth flow (2026-03-26)

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

<details>
<summary>v2.2 OAuth Authorization Proxy (Phases 10-14) — SHIPPED 2026-03-26</summary>

See [milestones/v2.2-ROADMAP.md](./milestones/v2.2-ROADMAP.md) for full details.

Phase 10: Scope Mapper and Azure Endpoint Utils — Pure-function scope transformation and Azure AD URL construction
Phase 11: Discovery and Registration Endpoints — OAuth AS metadata, OIDC discovery, Dynamic Client Registration
Phase 12: Authorization Redirect Endpoint — GET /authorize with scope mapping, PKCE passthrough
Phase 13: Token Proxy Endpoint — POST /token with AADSTS normalization, bidirectional scope mapping
Phase 14: Wire Up and Protected Resource Metadata Switch — Self-referencing PRM, E2E flow validation

</details>

---
*Created: 2026-03-24*
*Last updated: 2026-03-26 after v2.2 milestone completion*
