# Requirements: WikiJS MCP Server — v2.1 Docker Deployment

**Defined:** 2026-03-25
**Core Value:** Only Azure AD-authenticated colleagues can invoke MCP tools against the company WikiJS instance

## v2.1 Requirements

### Docker

- [ ] **DOCK-01**: Operator can build a production Docker image with `docker compose build`
- [ ] **DOCK-02**: Built image contains only compiled output (`dist/`) and production dependencies — no TypeScript source, dev deps, or `.env` secrets
- [ ] **DOCK-03**: Container starts the HTTP server on startup, binding to `0.0.0.0` on the configured `PORT`
- [ ] **DOCK-04**: Docker reports the container healthy via HEALTHCHECK against `/health`
- [ ] **DOCK-05**: Container is reachable by Caddy on the `caddy_net` network by service name `wikijs-mcp-server` — no port published to the host
- [ ] **DOCK-06**: Container restarts automatically on failure (`restart: unless-stopped`)
- [ ] **DOCK-07**: Operator provides all environment variables via a `.env` file referenced in `docker-compose.yml`

## Future Requirements

None identified for v2.2+ at this time.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Host port exposure | Caddy handles ingress via caddy_net — publishing a port bypasses TLS termination |
| Docker secrets / secret management | .env file sufficient for self-hosted single-server deployment |
| Multi-container compose (Wiki.js) | Wiki.js runs on a separate host |
| Kubernetes / Helm | Single-server deployment; compose is sufficient |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DOCK-01 | Phase 9 | Pending |
| DOCK-02 | Phase 9 | Pending |
| DOCK-03 | Phase 9 | Pending |
| DOCK-04 | Phase 9 | Pending |
| DOCK-05 | Phase 9 | Pending |
| DOCK-06 | Phase 9 | Pending |
| DOCK-07 | Phase 9 | Pending |

**Coverage:**
- v2.1 requirements: 7 total
- Mapped to phases: 7
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-25*
*Last updated: 2026-03-25 after initial definition*
