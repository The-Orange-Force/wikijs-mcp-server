# WikiJS MCP Server — OAuth 2.1 Extension

## What This Is

A TypeScript MCP server that exposes WikiJS content via GraphQL to AI assistants (Claude Desktop, Claude Code). Deployed as a shared remote HTTP server inside the company network. This milestone adds OAuth 2.1 authentication so only authorized colleagues can use the MCP tools.

## Core Value

Only Azure AD-authenticated colleagues can invoke MCP tools against the company WikiJS instance — without exposing the WikiJS API token to clients.

## Requirements

### Validated

<!-- Shipped and confirmed valuable — inferred from existing codebase. -->

- ✓ WikiJS GraphQL API integration (page CRUD, search, user/group management) — existing
- ✓ HTTP server with REST tool endpoints via Fastify — existing
- ✓ MCP JSON-RPC transport with SSE events (lib/fixed_mcp_http_server.js) — existing
- ✓ STDIO transport for editor integration — existing
- ✓ Zod schema validation for all tool inputs/outputs — existing
- ✓ Health check endpoint — existing
- ✓ Environment-based configuration (PORT, WIKIJS_BASE_URL, WIKIJS_TOKEN) — existing

### Active

<!-- Current scope. Building toward these. -->

- [ ] Port MCP transport (POST /mcp, GET /mcp/events) into Fastify TypeScript server
- [ ] Protected Resource Metadata endpoint (GET /.well-known/oauth-protected-resource) per RFC 9728
- [ ] JWT validation middleware using `jose` library
- [ ] Azure AD JWKS integration (fetch public keys, verify signatures)
- [ ] Token audience claim validation against registered app client ID
- [ ] OAuth middleware applied to MCP routes only (POST /mcp, GET /mcp/events)
- [ ] Health check and metadata endpoints remain unauthenticated
- [ ] 401 responses with WWW-Authenticate header pointing to Protected Resource Metadata URL
- [ ] New env vars: AZURE_TENANT_ID, AZURE_CLIENT_ID, MCP_RESOURCE_URL
- [ ] Updated example.env with new variables

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
- Server uses Fastify (src/server.ts) for REST endpoints and raw Node.js HTTP (lib/fixed_mcp_http_server.js) for MCP transport — these need to be unified
- Azure AD (Microsoft Entra ID) is the identity provider, configured externally
- Colleagues configure Claude Desktop with OAuth settings pointing to Azure AD authorize/token URLs
- WikiJS API token (WIKIJS_TOKEN) remains server-side secret, never exposed to clients
- MCP protocol uses JSON-RPC 2.0 over HTTP POST, with SSE for server-to-client events
- Express is installed as a dependency but unused — Fastify is the active framework

## Constraints

- **Auth provider**: Azure AD (Microsoft Entra ID) — company standard, non-negotiable
- **JWT library**: `jose` — chosen for zero native deps, built-in JWKS support
- **Framework**: Fastify — existing server framework, MCP transport to be ported into it
- **Security**: Server acts as OAuth 2.1 resource server only — never issues tokens
- **Compatibility**: Must work with Claude Desktop's OAuth client flow (authorization_code + PKCE)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use `jose` over `jsonwebtoken` + `jwks-rsa` | Zero native deps, built-in JWKS auto-refresh, actively maintained | — Pending |
| Port MCP transport into Fastify TypeScript server | Single unified server, type safety, easier to maintain | — Pending |
| Resource URL via env var (MCP_RESOURCE_URL) | Varies per deployment, can't derive reliably from request | — Pending |
| Single shared WikiJS API token | All users have equal access, no per-user mapping needed | — Pending |

---
*Last updated: 2026-03-24 after initialization*
