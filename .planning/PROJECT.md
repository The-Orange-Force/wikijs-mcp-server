# WikiJS MCP Server — OAuth 2.1 Extension

## Current State

**Shipped:** v2.1 (2026-03-25)

The WikiJS MCP Server requires Azure AD authentication for all MCP tool invocations and is deployed as a Docker container behind Caddy. Only authenticated colleagues can access the company WikiJS instance via MCP clients.

**What's live:**
- MCP transport via Fastify (POST /mcp with stateless JSON responses)
- RFC 9728 Protected Resource Metadata at `/.well-known/oauth-protected-resource`
- JWT validation against Azure AD JWKS using jose
- Scope enforcement (wikijs:read, wikijs:write, wikijs:admin)
- Per-request correlation IDs and user identity logging
- Docker container deployment (multi-stage build, caddy_net, HEALTHCHECK)
- 97 passing tests, 4,133 lines of TypeScript

**Core value delivered:** Only Azure AD-authenticated colleagues can invoke MCP tools against the company WikiJS instance — without exposing the WikiJS API token to clients.

## Current Milestone: v2.2 OAuth Authorization Proxy

**Goal:** Implement an OAuth 2.1 authorization proxy so that Claude Desktop (and any spec-compliant MCP client) can complete the full auth flow without pre-configured client credentials.

**Target features:**
- OpenID Connect discovery endpoint (`.well-known/openid-configuration`) pointing to local proxy endpoints
- Dynamic Client Registration (RFC 7591) returning pre-configured Azure AD client_id
- Authorization endpoint proxying to Azure AD with scope mapping (bare → fully-qualified)
- Token endpoint proxying to Azure AD (authorization_code + refresh_token)
- Updated Protected Resource Metadata pointing to self as authorization server

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ WikiJS GraphQL API integration (page CRUD, search, user/group management)
- ✓ HTTP server with MCP JSON-RPC transport via Fastify
- ✓ Azure AD OAuth 2.1 authentication (v2.0)
- ✓ STDIO transport for editor integration
- ✓ Zod schema validation for all tool inputs/outputs
- ✓ Health check endpoint (unauthenticated)
- ✓ Environment-based configuration
- ✓ Docker container packaging with multi-stage build (v2.1)
- ✓ docker-compose.yml for caddy_net deployment (v2.1)
- ✓ Docker HEALTHCHECK using /health endpoint (v2.1)

### Active

<!-- Current scope. Building toward these. -->

- [ ] OpenID Connect discovery override pointing OAuth endpoints to self
- [ ] Dynamic Client Registration (RFC 7591) returning Azure AD client_id
- [ ] Authorization proxy endpoint with scope mapping
- [ ] Token proxy endpoint (authorization_code + refresh_token)
- [ ] Protected Resource Metadata updated to reference self as authorization server

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Per-user WikiJS permissions — everyone has equal access via shared API token
- STDIO transport OAuth — OAuth only applies to HTTP transport
- Dynamic Client Registration — manual client ID configuration is acceptable
- Token issuance — server is a resource server only, Azure AD issues tokens
- Rate limiting — can be added later, not part of auth proxy layer
- CORS configuration for browser clients — MCP clients are native apps
- Token storage/caching — proxy is stateless, passes tokens through
- Custom client_secret generation — Azure AD app is a public client

## Context

- Forked from heAdz0r/wikijs-mcp-server
- Azure AD (Microsoft Entra ID) is the identity provider, configured externally
- Colleagues configure Claude Desktop with OAuth settings pointing to the MCP server (which proxies to Azure AD)
- WikiJS API token (WIKIJS_TOKEN) remains server-side secret, never exposed to clients
- MCP protocol uses JSON-RPC 2.0 over HTTP POST with stateless JSON responses
- **MCP spec (2025-03-26 revision)** requires resource servers to provide OAuth proxy when IdP lacks dynamic client registration
- Claude Desktop discovers auth via `/.well-known/oauth-protected-resource` → `/.well-known/openid-configuration` → registration → authorize → token

## Constraints

- **Auth provider**: Azure AD (Microsoft Entra ID) — company standard, non-negotiable
- **JWT library**: `jose` — zero native deps, built-in JWKS support
- **Framework**: Fastify — unified server framework
- **Security**: Server acts as OAuth 2.1 resource server only — never issues tokens
- **Compatibility**: Must work with Claude Desktop's OAuth client flow (authorization_code + PKCE)
- **Scope mapping**: MCP clients send bare scopes (`wikijs:read`), Azure AD expects `api://{client_id}/wikijs:read`

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use `jose` over `jsonwebtoken` + `jwks-rsa` | Zero native deps, built-in JWKS auto-refresh, actively maintained | ✓ Shipped v2.0 |
| Port MCP transport into Fastify TypeScript server | Single unified server, type safety, easier to maintain | ✓ Shipped v2.0 |
| Resource URL via env var (MCP_RESOURCE_URL) | Varies per deployment, can't derive reliably from request | ✓ Shipped v2.0 |
| Single shared WikiJS API token | All users have equal access, no per-user mapping needed | ✓ Shipped v2.0 |
| Colon notation for scopes (wikijs:read) | OAuth 2.0 / Azure AD convention | ✓ Shipped v2.0 |
| Stateless MCP transport (no SSE) | Simpler architecture, matches SDK recommendations | ✓ Shipped v2.0 |
| node:20-slim over Alpine | @azure/msal-node musl libc compatibility issues | ✓ Shipped v2.1 |
| No host port exposure in Docker | Caddy handles ingress via caddy_net, bypassing TLS otherwise | ✓ Shipped v2.1 |

---
*Last updated: 2026-03-25 after v2.2 milestone start*
