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

- [x] **Phase 10: Scope Mapper and Azure Endpoint Utils** - Pure-function utilities for scope transformation and Azure AD URL construction (completed 2026-03-25)
- [x] **Phase 11: Discovery and Registration Endpoints** - OAuth metadata and Dynamic Client Registration serving static JSON responses (completed 2026-03-25)
- [x] **Phase 12: Authorization Redirect Endpoint** - GET /authorize redirecting to Azure AD with mapped scopes (completed 2026-03-25)
- [x] **Phase 13: Token Proxy Endpoint** - POST /token proxying authorization_code and refresh_token grants to Azure AD (completed 2026-03-25)
- [ ] **Phase 14: Wire Up and Protected Resource Metadata Switch** - Register proxy plugin in server, update metadata to reference self as authorization server

## Phase Details

### Phase 10: Scope Mapper and Azure Endpoint Utils
**Goal**: Scope transformation and Azure AD URL construction are available as tested pure functions
**Depends on**: Nothing (first phase in v2.2)
**Requirements**: SCOPE-01, SCOPE-02
**Success Criteria** (what must be TRUE):
  1. Bare MCP scopes (`wikijs:read`, `wikijs:write`, `wikijs:admin`) are mapped to Azure AD format (`api://{client_id}/wikijs:read`) while OIDC scopes (`openid`, `offline_access`) pass through unchanged
  2. The RFC 8707 `resource` parameter is identified and stripped from parameter sets before forwarding
  3. Azure AD authorization and token endpoint URLs are correctly constructed from tenant ID
  4. All scope mapping and URL construction functions have unit tests covering edge cases (empty scopes, mixed bare/OIDC, unknown scopes)
**Plans:** 1/1 plans complete
Plans:
- [ ] 10-01-PLAN.md — TDD: scope mapper, resource stripper, and Azure endpoint constructor

### Phase 11: Discovery and Registration Endpoints
**Goal**: MCP clients can discover the server's OAuth capabilities and register as clients
**Depends on**: Phase 10
**Requirements**: META-01, META-02, REGN-01
**Success Criteria** (what must be TRUE):
  1. GET `/.well-known/oauth-authorization-server` returns a valid OAuth authorization server metadata document with `authorization_endpoint`, `token_endpoint`, `registration_endpoint`, `response_types_supported`, `grant_types_supported`, and `code_challenge_methods_supported: ["S256"]`
  2. GET `/.well-known/openid-configuration` returns identical content to the above endpoint
  3. POST `/register` accepts an RFC 7591 DCR request body and returns a JSON response containing the pre-configured Azure AD `client_id` with no `client_secret` (public client)
  4. All three endpoints are publicly accessible without JWT authentication
**Plans:** 1/1 plans complete
Plans:
- [ ] 11-01-PLAN.md — OAuth proxy plugin with discovery metadata and DCR endpoints

### Phase 12: Authorization Redirect Endpoint
**Goal**: MCP clients can initiate the OAuth authorization code flow through the proxy
**Depends on**: Phase 10, Phase 11
**Requirements**: AUTHZ-01, AUTHZ-02
**Success Criteria** (what must be TRUE):
  1. GET `/authorize` with valid OAuth parameters returns a 302 redirect to the Azure AD authorization endpoint
  2. The redirect URL contains scopes mapped to Azure AD format with `offline_access` and `openid` appended, and the `resource` parameter stripped
  3. The client's `redirect_uri`, `state`, `code_challenge`, and `code_challenge_method` are passed through to Azure AD unchanged
  4. Requests missing required parameters (`client_id`, `redirect_uri`, `response_type`) receive an appropriate error response
**Plans:** 1/1 plans complete
Plans:
- [x] 12-01-PLAN.md — TDD: GET /authorize redirect proxy with scope mapping and validation

### Phase 13: Token Proxy Endpoint
**Goal**: MCP clients can exchange authorization codes and refresh tokens through the proxy
**Depends on**: Phase 10, Phase 11 (formbody plugin)
**Requirements**: TOKN-01, TOKN-02, TOKN-03
**Success Criteria** (what must be TRUE):
  1. POST `/token` with `grant_type=authorization_code` proxies the request to Azure AD and returns the token response (access_token, refresh_token, expires_in)
  2. POST `/token` with `grant_type=refresh_token` proxies the request to Azure AD and returns a refreshed token response
  3. Azure AD `AADSTS*` error responses are normalized to standard OAuth 2.0 error format (`error`, `error_description`) before returning to the client
  4. The `resource` parameter is stripped and scopes are mapped to Azure AD format before proxying
  5. The proxy uses injected `fetch` function for test isolation without real Azure AD calls
**Plans:** 1/1 plans complete
Plans:
- [ ] 13-01-PLAN.md — TDD: POST /token proxy with AADSTS normalization, scope mapping, and injected fetch

### Phase 14: Wire Up and Protected Resource Metadata Switch
**Goal**: Claude Desktop completes the full OAuth flow end-to-end against the running server
**Depends on**: Phase 11, Phase 12, Phase 13
**Requirements**: META-03, INTG-01, INTG-02
**Success Criteria** (what must be TRUE):
  1. `/.well-known/oauth-protected-resource` lists `MCP_RESOURCE_URL` (self) as the authorization server instead of Azure AD
  2. The `oauthProxyRoutes` plugin is registered in both the production server (`server.ts`) and test helper (`build-test-app.ts`)
  3. All proxy endpoints remain publicly accessible while `POST /mcp` continues to require JWT authentication
  4. The full discovery chain works: client reads protected resource metadata, follows to authorization server metadata, registers, authorizes, obtains tokens, and invokes MCP tools
**Plans:** 1 plan
Plans:
- [ ] 14-01-PLAN.md — Metadata switchover, mock fetch injection, test updates, and E2E discovery chain test

## Progress

**Execution Order:** Phase 10 -> 11 -> 12 -> 13 -> 14

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 10. Scope Mapper and Azure Endpoint Utils | 1/1 | Complete    | 2026-03-25 |
| 11. Discovery and Registration Endpoints | 1/1 | Complete    | 2026-03-25 |
| 12. Authorization Redirect Endpoint | 1/1 | Complete    | 2026-03-25 |
| 13. Token Proxy Endpoint | 1/1 | Complete    | 2026-03-25 |
| 14. Wire Up and Protected Resource Metadata Switch | 0/1 | Not started | - |

---
*Created: 2026-03-25*
*Last updated: 2026-03-25*
