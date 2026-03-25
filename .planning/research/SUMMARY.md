# Project Research Summary

**Project:** wikijs-mcp-server v2.2 — OAuth Authorization Proxy
**Domain:** OAuth 2.1 authorization proxy enabling MCP clients to authenticate against Azure AD
**Researched:** 2026-03-25
**Confidence:** HIGH

## Executive Summary

The wikijs-mcp-server already validates Azure AD JWTs (v2.0 milestone), but MCP clients like Claude Desktop and Claude Code cannot authenticate because Azure AD does not support RFC 7591 Dynamic Client Registration. The solution established by research is a thin OAuth proxy layer added directly to the MCP server: the server presents itself as an OAuth authorization server, performs scope mapping and redirect orchestration, and forwards everything to Azure AD behind the scenes. Azure AD continues to issue the actual tokens; the existing JWT validation middleware remains entirely unchanged.

The recommended approach is custom Fastify plugin routes — not the MCP SDK's Express-based `mcpAuthRouter`, not MSAL, and not a transparent reverse proxy. The proxy implements exactly four endpoint groups: two discovery paths (`/.well-known/oauth-authorization-server` and `/.well-known/openid-configuration`), `POST /register` (Dynamic Client Registration), `GET /authorize` (redirect to Azure AD), and `POST /token` (server-side proxy to Azure AD). There is no callback endpoint on the proxy: the client's `redirect_uri` is passed directly through to Azure AD, which redirects back to the client. The proxy's only role in the browser flow is the initial 302 redirect. The only new dependency is `@fastify/formbody@^7` for form-encoded token request parsing; `@azure/msal-node` is removed (unused in `src/`, wrong abstraction). All scope transformation is pure TypeScript.

The two highest risks are both well-understood and directly preventable. First, Claude.ai ignores discovery metadata and constructs endpoint URLs by appending `/authorize`, `/token`, and `/register` directly to the MCP server base URL — endpoints MUST be at root paths, not `/oauth/*` subpaths. Second, Azure AD rejects the RFC 8707 `resource` parameter with `AADSTS9010010` — the proxy must strip it before forwarding to Azure AD. Both are handled in the first proxy implementation phase.

---

## Key Findings

### Recommended Stack

The existing stack requires minimal change. One dependency is added (`@fastify/formbody@^7.0.0`) and one is removed (`@azure/msal-node`). Net effect: dependency count decreases by one; `node_modules` shrinks by ~2.5 MB; Alpine Docker base image becomes viable (msal-node forced `node:20-slim`).

**Core technologies:**
- `@fastify/formbody@^7.0.0`: parse `application/x-www-form-urlencoded` bodies on the token endpoint — official Fastify org plugin, zero transitive deps, Fastify 4-compatible
- `globalThis.fetch()` (Node.js 20 built-in): server-to-server HTTP calls to Azure AD token endpoint — full control over request body, no additional dependency
- `URL` / `URLSearchParams` (Node.js built-in): construct Azure AD authorization redirect URLs with correct encoding
- `jose` (existing, unchanged): continues to validate Azure AD JWTs issued to MCP clients
- `@fastify/formbody` scoped inside the OAuth proxy plugin only — does not affect the existing `/mcp` endpoint

**Removed:**
- `@azure/msal-node`: not imported anywhere in `src/`, abstracts away the HTTP parameters the proxy needs to control directly

See `.planning/research/STACK.md` for full dependency analysis and alternatives considered.

### Expected Features

**Must have (table stakes — missing any one breaks the auth flow):**
- `/.well-known/oauth-authorization-server` AND `/.well-known/openid-configuration` — both paths, same JSON response; MCP draft spec requires clients to try both in priority order
- `POST /register` — Dynamic Client Registration; stateless; always returns the pre-configured Azure AD `client_id`
- `GET /authorize` — 302 redirect to Azure AD with scope mapping, `resource` parameter stripped, `offline_access` appended
- `POST /token` — server-side proxy to Azure AD token endpoint with scope mapping; supports `authorization_code` and `refresh_token` grants
- Scope mapping (`wikijs:read` to `api://{client-id}/wikijs:read`) in both authorize redirect and token proxy
- `code_challenge_methods_supported: ["S256"]` explicitly in discovery document — Azure AD omits this field intermittently; the proxy must supply it
- Updated `/.well-known/oauth-protected-resource` — `authorization_servers` must change from Azure AD URL to self (`MCP_RESOURCE_URL`)

**Should have (robustness and observability):**
- Structured proxy logging with correlation IDs (consistent with existing observability patterns)
- Azure AD error normalization — map `AADSTS*` codes to standard OAuth 2.0 error responses before returning to client
- Azure AD connectivity check in `/health` endpoint
- 10–15 second timeout on outbound Azure AD requests with proper `server_error` OAuth response on timeout

**Defer to post-MVP:**
- User consent interstitial page (addresses Pitfall 6: shared-client-ID token theft) — important security hardening; not required for basic flow to work
- Rate limiting on DCR endpoint — Caddy reverse proxy handles this if needed
- `client_id_metadata_document_supported` support — newer MCP spec preference; defer until Claude clients ship support

**Explicitly excluded (anti-features):**
- `GET /oauth/callback` — NOT needed; Azure AD redirects directly to the client's `redirect_uri` (the Features research incorrectly included this endpoint)
- Token issuance by proxy (proxy issues its own JWTs) — doubles attack surface; existing JWKS validation handles real Azure AD tokens
- Dual-PKCE — only needed when proxy issues own tokens; not applicable here
- `/oauth/*` subpath routes — Claude.ai constructs paths from base URL; these cause 404s

See `.planning/research/FEATURES.md` for full feature dependency graph and client compatibility matrix.

### Architecture Approach

The proxy is a single Fastify plugin (`src/routes/oauth-proxy.ts`) registered at root scope in `server.ts`, alongside existing `publicRoutes` and `protectedRoutes`. Fastify's encapsulation model ensures `@fastify/formbody` applies only within the OAuth proxy plugin. Two pure-function modules extract reusable logic: `src/oauth/scope-mapper.ts` and `src/oauth/azure-endpoints.ts`. The `fetch` function is injected as a plugin option (`fetchFn?: typeof fetch`) for test isolation without real HTTP calls.

**Major components:**
1. `src/routes/oauth-proxy.ts` — Fastify plugin: discovery metadata, DCR, authorize redirect, token proxy; registered public (unauthenticated)
2. `src/oauth/scope-mapper.ts` — pure functions `mapToAzureScopes()` / `mapFromAzureScopes()`; unit-testable in isolation
3. `src/oauth/azure-endpoints.ts` — pure functions constructing Azure AD endpoint URLs from tenant ID
4. `src/routes/public-routes.ts` (modified) — `authorization_servers` changes from Azure AD URL to `MCP_RESOURCE_URL`
5. `src/server.ts` (modified) — registers `oauthProxyRoutes` plugin at root scope
6. `src/auth/middleware.ts` (unchanged) — JWT validation continues against Azure AD JWKS
7. `tests/oauth-proxy.test.ts` (new) — integration tests using injected mock `fetchFn`
8. `tests/oauth/scope-mapper.test.ts` (new) — unit tests for scope transformation

All endpoint paths are root-level: `/authorize`, `/token`, `/register`. The `/oauth/*` subpath pattern is explicitly rejected because Claude.ai constructs paths from the base URL (verified: claude-ai-mcp#82). No new environment variables are needed — existing `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, and `MCP_RESOURCE_URL` provide all values.

See `.planning/research/ARCHITECTURE.md` for component boundaries, data flow diagrams, code patterns, and build ordering rationale.

### Critical Pitfalls

1. **Azure AD rejects `resource` parameter (AADSTS9010010)** — Strip RFC 8707 `resource` before forwarding to Azure AD on both `/authorize` and `/token`. MCP clients (especially Cursor) send it unconditionally; Azure AD v2.0 returns HTTP 400. Must be addressed in the authorization endpoint phase.

2. **Claude.ai constructs paths from base URL, ignores discovery metadata** — Endpoints must be at `/authorize`, `/token`, `/register` (root). `/oauth/*` prefix causes silent split failure: Claude Code CLI works, Claude.ai gets 404. Verified via claude-ai-mcp#82.

3. **Scope format mismatch (AADSTS70011)** — Bare scope `wikijs:read` must become `api://{AZURE_CLIENT_ID}/wikijs:read`. OIDC scopes (`openid`, `offline_access`, `profile`, `email`) pass through unchanged, never prefixed.

4. **Proxy endpoints must not be in the protected route scope** — Accidentally registering `oauthProxyRoutes` inside `protectedRoutes` returns 401 on all OAuth endpoints, creating an unresolvable bootstrap deadlock. Register at root scope alongside `publicRoutes`.

5. **Azure AD omits `code_challenge_methods_supported`** — The proxy's discovery document must explicitly include `["S256"]`. Azure AD's own metadata omits this field intermittently by region; never relay Azure AD's metadata verbatim.

6. **Shared client_id enables cross-client token theft** — All DCR registrations return the same Azure AD `client_id`. Without a consent interstitial, a malicious client shares the same ID and may bypass consent prompts. Deferred post-MVP but documented.

See `.planning/research/PITFALLS.md` for all 16 pitfalls with detection strategies, phase warnings, and source citations.

---

## Implications for Roadmap

The architecture research establishes a 5-phase build order governed by two hard constraints: (a) pure-function utilities must exist before routes can use them; (b) the `authorization_servers` metadata update must happen LAST — switching it to point to self before proxy endpoints exist would break all existing clients.

### Phase 1: Foundation — Scope Mapper + Azure Endpoint Utils

**Rationale:** Zero external dependencies. Pure functions required by Phases 3 and 4. Safest first step — no HTTP, no Azure AD, no routing changes, no risk to existing functionality.
**Delivers:** `src/oauth/scope-mapper.ts`, `src/oauth/azure-endpoints.ts`, full unit test coverage
**Addresses:** Pitfall 2 (scope format), Pitfall 1 (`resource` param stripping), Pitfall 12 (`offline_access` injection)
**Research flag:** Standard patterns — skip research phase

### Phase 2: Discovery + Registration Endpoints

**Rationale:** Static JSON responses, no Azure AD calls, no browser flow. Fast to build and test. Unblocks client discovery immediately.
**Delivers:** `/.well-known/oauth-authorization-server`, `/.well-known/openid-configuration` (both paths, same handler), `POST /register`
**Uses:** `oauthProxyRoutes` plugin scaffold, `@fastify/formbody` scoped registration, Zod validation for DCR request body
**Addresses:** Pitfall 4 (`code_challenge_methods_supported`), Pitfall 9 (required discovery fields), Pitfall 16 (DCR response format)
**Avoids:** Pitfall 5 — plugin registered at root scope from the start, not inside `protectedRoutes`
**Research flag:** Standard patterns — skip research phase

### Phase 3: Authorization Redirect Endpoint

**Rationale:** A 302 redirect with no server-to-server HTTP. Depends on scope mapper from Phase 1. Simpler than the token proxy.
**Delivers:** `GET /authorize` — validates request with Zod, strips `resource`, maps scopes, redirects 302 to Azure AD
**Uses:** `mapToAzureScopes()` from Phase 1, `azureAuthorizeUrl()` from Phase 1
**Addresses:** Pitfall 1 (`resource` rejection), Pitfall 2 (scope mapping), Pitfall 3 (root path `/authorize`), Pitfall 12 (`offline_access` in forwarded scopes)
**Note:** No callback endpoint — Azure AD redirects directly to client's `redirect_uri` passed through unchanged
**Research flag:** Validate Azure AD redirect_uri pass-through behavior with a live tenant (ephemeral port handling, Pitfall 7)

### Phase 4: Token Proxy Endpoint

**Rationale:** Most complex phase — server-to-server HTTP proxy with form body parsing and error normalization. Depends on scope mapper and `@fastify/formbody`.
**Delivers:** `POST /token` — parses form body, maps scopes, proxies to Azure AD, normalizes errors; handles `authorization_code` and `refresh_token` grants
**Uses:** `@fastify/formbody` (form body parsing), `fetch()` (HTTP proxy), `mapToAzureScopes()`, injected `fetchFn` for testability
**Addresses:** Pitfall 8 (Azure AD error leakage), Pitfall 15 (PKCE `code_verifier` pass-through), Pitfall 14 (upstream timeout handling)
**Research flag:** Validate AADSTS error-to-OAuth mapping with deliberate error injection against a real tenant

### Phase 5: Wire Up + Protected Resource Metadata Switch

**Rationale:** MUST be last. Changing `authorization_servers` to point to self before proxy endpoints exist breaks all auth flows. Switch only after all proxy endpoints are tested.
**Delivers:** Updated `/.well-known/oauth-protected-resource`, `oauthProxyRoutes` registered in `server.ts` and `tests/helpers/build-test-app.ts`, end-to-end discovery chain test
**Addresses:** Pitfall 10 (`authorization_servers` pointing to self), Pitfall 5 (correct Fastify plugin registration order)
**Note:** Consider reducing `Cache-Control: max-age` temporarily during rollout to accelerate metadata cache expiry for existing clients
**Research flag:** Standard patterns — skip research phase

### Phase Ordering Rationale

- Phase 1 first: no dependencies; needed by Phases 3 and 4; establishes correct scope transformation before any routing exists
- Phase 2 before Phases 3 and 4: static endpoints deployed and tested without Azure AD; gets DCR working immediately for client testing
- Phase 3 before Phase 4: redirect construction (no outbound HTTP) before HTTP proxying (more complex); both depend on Phase 1
- Phase 5 last: `authorization_servers` metadata update is a breaking change for existing clients; proxy must be fully operational before the switch

The no-callback architecture simplifies Phases 3 and 4 considerably — no transaction state storage, no callback handler, no proxy-side `redirect_uri` rewriting.

### Research Flags Summary

| Phase | Research Needed? | Reason |
|-------|-----------------|--------|
| Phase 1 | No | Pure functions; transformation rules fully specified in research |
| Phase 2 | No | Static JSON; required fields enumerated in PITFALLS.md Pitfall 9 |
| Phase 3 | Validate with live tenant | Azure AD redirect_uri port-agnostic matching in practice (Pitfall 7) |
| Phase 4 | Validate error mapping | AADSTS error codes and standard OAuth mapping (Pitfall 8) |
| Phase 5 | No | Mechanical wiring and config update |

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All recommendations verified against official Fastify, Node.js 20, and MCP spec docs. Removal of `@azure/msal-node` is conservative and reversible. |
| Features | HIGH | Table stakes derived from MCP spec (2025-03-26); client behaviors verified via GitHub issues. Correction applied: no callback endpoint needed (direct `redirect_uri` pass-through). |
| Architecture | HIGH | Verified against MCP SDK source code (local `node_modules`), MCP spec, Azure AD docs, and Claude client GitHub issues. Root-path requirement verified via claude-ai-mcp#82. |
| Pitfalls | HIGH | 6 of 16 pitfalls verified against specific GitHub issues with reproduction steps. Azure AD `resource` rejection, scope format, and path construction are all HIGH confidence. |

**Overall confidence:** HIGH

### Corrections Applied During Synthesis

The following discrepancies between research files were resolved:

1. **No callback endpoint** — ARCHITECTURE.md is correct: the client's `redirect_uri` is passed directly to Azure AD, which redirects back to the client. FEATURES.md incorrectly described a `GET /oauth/callback` endpoint with transaction state. That handler is excluded from the roadmap.

2. **Root-level paths required** — All endpoints at `/authorize`, `/token`, `/register` (not `/oauth/*`). STACK.md's route table initially showed `/oauth/authorize` etc.; this conflicts with ARCHITECTURE.md's finding from claude-ai-mcp#82. Root paths are correct and the only option compatible with all MCP clients.

3. **Both discovery paths required** — `/.well-known/openid-configuration` AND `/.well-known/oauth-authorization-server` must both be served (same response). The MCP draft spec requires clients to try both in priority order. FEATURES.md anti-feature section was wrong to exclude the OIDC discovery path.

4. **`resource` parameter must be stripped** — The `resource` parameter must be removed before forwarding to Azure AD on both authorize and token requests. It cannot be passed through — Azure AD v2.0 rejects it with AADSTS9010010.

### Gaps to Address During Implementation

- **Azure AD localhost redirect URI matching during code exchange (Phase 4):** Azure AD ignores port for localhost matching at the authorize step, but exact behavior during token exchange `redirect_uri` validation with ephemeral ports needs live tenant verification.
- **Metadata cache overlap during Phase 5 switchover:** Clients that cached the old `authorization_servers` URL pointing to Azure AD will bypass the proxy for up to 1 hour. Reduce `max-age` temporarily during rollout.
- **Consent interstitial (deferred):** Pitfall 6 (shared client_id token theft) is a known security gap deferred post-MVP. Must be tracked explicitly so it is not forgotten after the basic flow ships.

---

## Sources

### Primary (HIGH confidence)
- [MCP Authorization Spec 2025-03-26](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization) — proxy pattern, PKCE requirements, DCR, endpoint requirements
- [MCP Authorization Spec Draft](https://modelcontextprotocol.io/specification/draft/basic/authorization) — RFC 9728, resource indicators, dual-discovery path requirement
- [Azure AD OAuth 2.0 Auth Code Flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow) — token endpoint parameters, form-encoded body format, PKCE
- [Azure AD Redirect URI Rules](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url) — localhost port-agnostic matching, platform type behavior
- [Azure AD Scopes and Permissions](https://learn.microsoft.com/en-us/entra/identity-platform/scopes-oidc) — `api://` prefix requirements, OIDC scope pass-through
- [anthropics/claude-ai-mcp#82](https://github.com/anthropics/claude-ai-mcp/issues/82) — Claude.ai constructs `/authorize`, `/token`, `/register` from base URL; ignores metadata endpoints
- [anthropics/claude-code#2527](https://github.com/anthropics/claude-code/issues/2527) — Azure AD DCR complexity, redirect_uri behavior with ephemeral ports
- [MCP TypeScript SDK#832](https://github.com/modelcontextprotocol/typescript-sdk/issues/832) — Azure AD missing `code_challenge_methods_supported`
- [MCP TypeScript SDK#862](https://github.com/modelcontextprotocol/typescript-sdk/issues/862) — Azure AD workarounds needed for MCP servers
- [IBM/mcp-context-forge#2881](https://github.com/IBM/mcp-context-forge/issues/2881) — AADSTS9010010 `resource` + `scope` conflict
- [@fastify/formbody](https://github.com/fastify/fastify-formbody) — v7.x for Fastify 4, zero transitive deps, TypeScript types included
- [MCP SDK ProxyOAuthServerProvider source](node_modules/@modelcontextprotocol/sdk/dist/esm/server/auth/providers/proxyProvider.js) — verified locally
- [Obsidian Security: MCP OAuth Pitfalls](https://www.obsidiansecurity.com/blog/when-mcp-meets-oauth-common-pitfalls-leading-to-one-click-account-takeover) — shared client_id token theft, CSRF via state parameter

### Secondary (MEDIUM confidence)
- [Logto: MCP Auth Spec Review](https://blog.logto.io/mcp-auth-spec-review-2025-03-26) — proxy architecture complexity, dual-role design tradeoffs
- [FastMCP Azure OAuth Proxy](https://gofastmcp.com/integrations/azure) — reference scope mapping pattern, AzureProvider
- [Aaron Parecki: OAuth for MCP](https://aaronparecki.com/2025/04/03/15/oauth-for-model-context-protocol) — RFC 9728 proposal background, architectural critique
- [Microsoft ISE: MCP Server with OAuth 2.1](https://devblogs.microsoft.com/ise/aca-secure-mcp-server-oauth21-azure-ad/) — enterprise Azure AD MCP deployment patterns
- [Microsoft Q&A: OIDC metadata inconsistency](https://learn.microsoft.com/en-us/answers/questions/5576009/oidc-discovery-metadata-inconsistent-across-region) — regional `code_challenge_methods_supported` rollout status

### Tertiary (LOW confidence, needs validation)
- [CVE-2025-69196: FastMCP OAuth Proxy token reuse](https://advisories.gitlab.com/pkg/pypi/fastmcp/CVE-2025-69196/) — token reuse in proxy implementations; relevant for understanding attack surface

---
*Research completed: 2026-03-25*
*Ready for roadmap: yes*
