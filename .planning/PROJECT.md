# WikiJS MCP Server — OAuth 2.1 Extension

## Current State

**Shipped:** v2.0 (2026-03-24)

The WikiJS MCP Server now requires Azure AD authentication for all MCP tool invocations. Only authenticated colleagues can access the company WikiJS instance via MCP clients (Claude Desktop, Claude Code).

**What's live:**
- MCP transport via Fastify (POST /mcp with stateless JSON responses)
- RFC 9728 Protected Resource Metadata at `/.well-known/oauth-protected-resource`
- JWT validation against Azure AD JWKS using jose
- Scope enforcement (wikijs:read, wikijs:write, wikijs:admin)
- Per-request correlation IDs and user identity logging
- 97 passing tests, 4,133 lines of TypeScript

**Core value delivered:** Only Azure AD-authenticated colleagues can invoke MCP tools against the company WikiJS instance — without exposing the WikiJS API token to clients.

## Current Milestone: v2.1 Docker Deployment

**Goal:** Package the MCP server as a Docker container for self-hosted deployment.

**Target features:**
- Multi-stage Dockerfile (TypeScript compile → slim runtime image)
- docker-compose.yml for single-service deployment (Wiki.js on separate host)
- .dockerignore to exclude dev artifacts from build context
- Docker HEALTHCHECK wired to existing /health endpoint

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

### Active

<!-- Current scope. Building toward these. -->

- [ ] Docker container packaging with multi-stage build
- [ ] docker-compose.yml for single-service deployment
- [ ] .dockerignore to exclude dev artifacts
- [ ] Docker HEALTHCHECK using /health endpoint

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Per-user WikiJS permissions — everyone has equal access via shared API token
- STDIO transport OAuth — OAuth only applies to HTTP transport
- Dynamic Client Registration — manual client ID configuration is acceptable
- Token issuance — server is a resource server only, Azure AD issues tokens
- Rate limiting — can be added later, not part of auth layer
- CORS configuration for browser clients — MCP clients are native apps

## Context

- Forked from heAdz0r/wikijs-mcp-server
- Azure AD (Microsoft Entra ID) is the identity provider, configured externally
- Colleagues configure Claude Desktop with OAuth settings pointing to Azure AD authorize/token URLs
- WikiJS API token (WIKIJS_TOKEN) remains server-side secret, never exposed to clients
- MCP protocol uses JSON-RPC 2.0 over HTTP POST with stateless JSON responses

## Constraints

- **Auth provider**: Azure AD (Microsoft Entra ID) — company standard, non-negotiable
- **JWT library**: `jose` — zero native deps, built-in JWKS support
- **Framework**: Fastify — unified server framework
- **Security**: Server acts as OAuth 2.1 resource server only — never issues tokens
- **Compatibility**: Must work with Claude Desktop's OAuth client flow (authorization_code + PKCE)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use `jose` over `jsonwebtoken` + `jwks-rsa` | Zero native deps, built-in JWKS auto-refresh, actively maintained | ✓ Shipped v2.0 |
| Port MCP transport into Fastify TypeScript server | Single unified server, type safety, easier to maintain | ✓ Shipped v2.0 |
| Resource URL via env var (MCP_RESOURCE_URL) | Varies per deployment, can't derive reliably from request | ✓ Shipped v2.0 |
| Single shared WikiJS API token | All users have equal access, no per-user mapping needed | ✓ Shipped v2.0 |
| Colon notation for scopes (wikijs:read) | OAuth 2.0 / Azure AD convention | ✓ Shipped v2.0 |
| Stateless MCP transport (no SSE) | Simpler architecture, matches SDK recommendations | ✓ Shipped v2.0 |

---
*Last updated: 2026-03-25 after v2.1 milestone start*
