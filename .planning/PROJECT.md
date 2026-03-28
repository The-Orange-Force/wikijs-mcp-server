# WikiJS MCP Server

## What This Is

A Model Context Protocol server that bridges AI assistants with Wiki.js, secured by Azure AD OAuth 2.1 authentication and deployed as a Docker container. Includes a built-in OAuth authorization proxy so Claude Desktop can complete the full auth flow without pre-configured client credentials. Returns contextual instructions in the MCP initialize response that guide Claude to auto-search the wiki for relevant topics. Enforces GDPR-compliant marker-based content redaction for sensitive data within wiki pages. Supplements GraphQL search with metadata fallback matching for acronyms, path segments, and short tokens.

## Core Value

Only Azure AD-authenticated colleagues can invoke MCP tools against the company WikiJS instance — without exposing the WikiJS API token to clients, and without requiring manual client credential configuration.

## Current State

**Latest shipped:** v2.7 Metadata Search Fallback (2026-03-28)
**Current milestone:** Planning next milestone

The MCP server is fully operational with OAuth 2.1 authentication, 3 read-only tools, marker-based GDPR content redaction, page URL injection, metadata search fallback for improved acronym/path/short-token discovery, and Docker deployment support.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ WikiJS GraphQL API integration (page CRUD, search, user/group management)
- ✓ HTTP server with MCP JSON-RPC transport via Fastify
- ✓ Azure AD OAuth 2.1 authentication — v2.0
- ✓ Zod schema validation for all tool inputs/outputs
- ✓ Health check endpoint (unauthenticated)
- ✓ Environment-based configuration
- ✓ Docker container packaging with multi-stage build — v2.1
- ✓ docker-compose.yml for caddy_net deployment — v2.1
- ✓ Docker HEALTHCHECK using /health endpoint — v2.1
- ✓ OpenID Connect discovery override pointing OAuth endpoints to self — v2.2
- ✓ Dynamic Client Registration (RFC 7591) returning Azure AD client_id — v2.2
- ✓ Authorization proxy endpoint with scope mapping — v2.2
- ✓ Token proxy endpoint (authorization_code + refresh_token) — v2.2
- ✓ Protected Resource Metadata updated to reference self as authorization server — v2.2
- ✓ Consolidated 3-tool model (get_page, list_pages, search_pages) — v2.3
- ✓ Path-based search ID resolution with singleByPath + pages.list fallback — v2.3
- ✓ Single-scope model (wikijs:read only) — v2.3
- ✓ STDIO transport removed, Alpine Docker image — v2.3
- ✓ Dead code removed (types, API methods, msal-node dependency) — v2.3
- ✓ MCP initialize response includes `instructions` field — v2.4
- ✓ Instructions loaded from file at startup with env-configurable path — v2.4
- ✓ Fallback default when instructions file is missing — v2.4
- ✓ Docker compose updated with volume mount for instructions file — v2.4
- ✓ Marker-based GDPR content redaction via <!-- gdpr-start/end --> markers — v2.6
- ✓ Page URL injection in get_page responses — v2.6
- ✓ Path-based filtering removed, all published pages accessible — v2.6
- ✓ Metadata search fallback supplements GraphQL search for short tokens and acronyms — v2.7
- ✓ Case-insensitive substring matching on page titles and paths — v2.7
- ✓ Deduplication, unpublished filtering, and limit enforcement for fallback — v2.7
- ✓ Structured info-level logging for metadata fallback activity — v2.7
- ✓ search_pages tool description updated for AI discoverability — v2.7

### Active

<!-- Current scope. Building toward these. -->

(Planning next milestone)

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Per-user WikiJS permissions — everyone has equal access via shared API token
- Token issuance — server is a resource server only, Azure AD issues tokens
- Rate limiting — Caddy handles rate limiting if needed
- CORS configuration for browser clients — MCP clients are native apps
- Token storage/caching — proxy is stateless, passes tokens through
- Custom client_secret generation — Azure AD app is a public client
- MSAL library usage — wrong abstraction for server-side proxying
- `/oauth/*` subpath routes — Claude Desktop constructs paths from base URL, ignoring metadata; root-level paths required
- Dual-PKCE — only needed when proxy issues own tokens
- `client_id_metadata_document_supported` — defer until Claude clients ship support
- Write operations (create/update/delete pages) — use case is AI reading wiki, not authoring
- User/group management tools — not needed for read-only wiki access
- `search_unpublished_pages` — unreliable (Wiki.js doesn't index unpublished pages for search)
- STDIO transport — removed in v2.3; HTTP-only simplifies codebase
- Dynamic instructions generation from wiki content at startup — static file sufficient for v2.4
- Hot-reload of instructions without restart — startup-time loading is simpler and sufficient
- Dynamic GDPR marker rules via runtime config — code change with tests is safer for compliance
- Per-user path permissions for GDPR — shared API token model, no per-user mapping
- Full content search in metadata fallback — requires N getPageById calls per search, impractical
- Fuzzy/Levenshtein matching in fallback — false positives for structured token search
- Regex-based query syntax — ReDoS exposure from user-controlled pattern input
- Separate search_metadata MCP tool — fallback must be automatic and transparent

## Context

- Forked from heAdz0r/wikijs-mcp-server
- Azure AD (Microsoft Entra ID) is the identity provider, configured externally
- Colleagues configure Claude Desktop with OAuth settings pointing to the MCP server (which proxies to Azure AD)
- WikiJS API token (WIKIJS_TOKEN) remains server-side secret, never exposed to clients
- MCP protocol uses JSON-RPC 2.0 over HTTP POST with stateless JSON responses
- **MCP spec (2025-03-26 revision)** requires resource servers to provide OAuth proxy when IdP lacks dynamic client registration
- Claude Desktop discovers auth via `/.well-known/oauth-protected-resource` → `/.well-known/openid-configuration` → registration → authorize → token
- **v2.3 consolidation:** 3 read-only tools (get_page, list_pages, search_pages), single wikijs:read scope
- **v2.4 instructions:** MCP initialize response includes instructions field, file-based customization via MCP_INSTRUCTIONS_PATH, Docker volume mount
- **v2.5→v2.6 GDPR:** Marker-based content redaction replaces path-blocking; all published pages accessible with PII surgically redacted
- **v2.7 metadata fallback:** searchPagesByMetadata() supplements GraphQL search with title/path substring matching, two integration points (zero-result and under-limit), data sharing with resolveViaPagesList
- **Codebase:** ~8,000 LOC TypeScript, 441 tests across 26 files
- **Tech stack:** TypeScript, Fastify, @modelcontextprotocol/sdk, graphql-request, jose, Zod, Vitest

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
| Root-level OAuth paths (/authorize, /token, /register) | Claude Desktop ignores metadata, constructs paths from base URL | ✓ Shipped v2.2 |
| No callback endpoint | Azure AD redirects directly to client's redirect_uri | ✓ Shipped v2.2 |
| Single Fastify plugin for all proxy routes | src/routes/oauth-proxy.ts with fetch injection for testability | ✓ Shipped v2.2 |
| @fastify/formbody scoped inside OAuth proxy plugin | Avoids global body parsing side effects | ✓ Shipped v2.2 |
| Strip RFC 8707 resource parameter | Azure AD rejects unknown params (AADSTS9010010) | ✓ Shipped v2.2 |
| Self-referencing PRM authorization_servers | Claude Desktop follows PRM → AS metadata chain; self-reference completes the loop | ✓ Shipped v2.2 |
| Two-phase OAuth error handling | JSON 400 pre-redirect_uri, redirect errors post-redirect_uri (RFC 6749 compliance) | ✓ Shipped v2.2 |
| AADSTS-specific error descriptions | Ambiguous Azure codes get clearer descriptions for MCP client display | ✓ Shipped v2.2 |
| Read-only tools only | AI use case is reading wiki content, not authoring; write tools had bugs and added attack surface | ✓ Shipped v2.3 |
| Path-based search ID resolution | Wiki.js search returns index IDs not DB IDs; resolve via path matching | ✓ Shipped v2.3 |
| Single wikijs:read scope | All remaining tools are read-only; no need for write/admin scopes | ✓ Shipped v2.3 |
| Alpine Docker image | Switched from node:20-slim after msal-node removal eliminated glibc dependency | ✓ Shipped v2.3 |
| Remove STDIO transport | HTTP-only simplifies codebase; OAuth only applies to HTTP transport | ✓ Shipped v2.3 |
| File-based instructions with default fallback | Simpler than dynamic generation; deployers can customize without code changes | ✓ Shipped v2.4 |
| Startup-loaded instructions threaded via plugin options | No per-request file I/O; single load at startup | ✓ Shipped v2.4 |
| console.warn for instructions fallback (not pino) | Lightweight module, no pino dependency needed | ✓ Shipped v2.4 |
| Zod default '/app/instructions.txt' | Docker volume mount works out-of-the-box without extra env var | ✓ Shipped v2.4 |
| Read-only Docker volume mount for instructions | Prevent container from modifying host file | ✓ Shipped v2.4 |
| isBlocked() as only export, normalizePath private | Minimal API surface for security-sensitive code | Superseded by v2.6 marker-based redaction |
| "clients" literal hardcoded, not configurable | Code change with tests is safer than runtime config for GDPR compliance | Superseded by v2.6 marker-based redaction |
| Post-fetch path check (timing-safe) | Prevents timing oracle that could reveal blocked page existence | Superseded by v2.6 marker-based redaction |
| Structured audit logging without path content | GDPR compliance — log blocked access but never leak company names | Superseded by v2.6 marker-based redaction |
| Case-insensitive matching via toLowerCase + includes | No regex to avoid ReDoS risk from user-controlled query input | ✓ Shipped v2.7 |
| resolved.length < limit as metadata trigger | Supplements results when GraphQL returns fewer than requested (not just zero) | ✓ Shipped v2.7 |
| Data sharing via extended return type | resolveViaPagesList returns allPages for searchPagesByMetadata reuse; no duplicate GraphQL call | ✓ Shipped v2.7 |
| Capability-only tool description wording | No mention of "fallback" implementation detail; describes what it does, not how | ✓ Shipped v2.7 |
| Graceful degradation on pages.list failure | try-catch returns empty array; search works without metadata fallback if pages.list fails | ✓ Shipped v2.7 |

## Known Issues

- Claude Desktop redirect_uri format needs live tenant testing (http://localhost port handling)
- Shared client_id token theft deferred — consent interstitial needed later (CONSENT-01)
- Pre-existing: tests/docker-config.test.ts fails (instructions.txt missing at repo root)
- search_pages description mentions "descriptions" but metadata fallback only matches title/path (locked design decision)

---
*Last updated: 2026-03-28 after v2.7 milestone*
