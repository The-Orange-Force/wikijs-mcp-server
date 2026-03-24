# Requirements: WikiJS MCP Server — OAuth 2.1 Extension

**Defined:** 2026-03-24
**Core Value:** Only Azure AD-authenticated colleagues can invoke MCP tools against the company WikiJS instance

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### MCP Transport

- [ ] **TRNS-01**: MCP JSON-RPC handler (POST /mcp) ported from lib/fixed_mcp_http_server.js into Fastify TypeScript server
- [ ] **TRNS-02**: SSE events endpoint (GET /mcp/events) ported into Fastify TypeScript server
- [ ] **TRNS-03**: MCP initialize, tools/list, and tools/call methods work correctly after port

### OAuth Configuration

- [ ] **CONF-01**: Server reads AZURE_TENANT_ID from environment variables
- [ ] **CONF-02**: Server reads AZURE_CLIENT_ID from environment variables
- [ ] **CONF-03**: Server reads MCP_RESOURCE_URL from environment variables
- [ ] **CONF-04**: Server fails fast at startup with clear error if any OAuth env var is missing
- [ ] **CONF-05**: example.env updated with all new environment variables

### Discovery

- [ ] **DISC-01**: GET /.well-known/oauth-protected-resource returns RFC 9728 Protected Resource Metadata JSON
- [ ] **DISC-02**: Metadata includes resource URL, authorization_servers, scopes_supported, bearer_methods_supported
- [ ] **DISC-03**: Discovery endpoint remains unauthenticated

### Authentication

- [ ] **AUTH-01**: Server extracts Bearer token from Authorization header on protected routes
- [ ] **AUTH-02**: Server validates JWT signature against Azure AD JWKS using jose createRemoteJWKSet
- [ ] **AUTH-03**: Server validates audience claim (aud) matches AZURE_CLIENT_ID
- [ ] **AUTH-04**: Server validates issuer claim (iss) matches Azure AD v2.0 issuer format
- [ ] **AUTH-05**: Server validates token expiry (exp) and not-before (nbf) claims
- [ ] **AUTH-06**: Missing or invalid token returns HTTP 401 with WWW-Authenticate header containing resource_metadata URL
- [ ] **AUTH-07**: Valid token with insufficient scopes returns HTTP 403 with WWW-Authenticate error="insufficient_scope"

### Route Protection

- [ ] **PROT-01**: POST /mcp requires valid Bearer token
- [ ] **PROT-02**: GET /mcp/events requires valid Bearer token
- [ ] **PROT-03**: GET /health remains unauthenticated
- [ ] **PROT-04**: GET /.well-known/oauth-protected-resource remains unauthenticated

### Observability

- [ ] **OBSV-01**: Validated JWT user identity (oid/preferred_username) logged with each MCP tool invocation
- [ ] **OBSV-02**: Unique correlation ID generated per request and included in logs and error responses
- [ ] **OBSV-03**: jose validation errors mapped to structured RFC 6750 error responses (error, error_description)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Auth

- **ADVN-01**: Per-tool scope enforcement (wikijs:read, wikijs:write, wikijs:admin)
- **ADVN-02**: Scope challenge / step-up authorization for MCP clients
- **ADVN-03**: Token validation metrics (counters for validated/rejected tokens, latency)

### Operational

- **OPER-01**: JWKS pre-warming at server startup to eliminate cold-start latency

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Token issuance / Authorization Server | Server is resource server only; Azure AD issues tokens |
| Dynamic Client Registration (DCR) | Azure AD doesn't support DCR; MCP spec lists as MAY; pre-registered client IDs suffice |
| Per-user WikiJS permissions | All users share equal access via single WikiJS API token |
| CORS for browser clients | MCP clients are native apps (Claude Desktop/Code), not browsers |
| Rate limiting | Orthogonal to auth; can be added later via @fastify/rate-limit |
| Token caching / session management | JWT validation with cached JWKS is sub-millisecond; caching adds revocation risk |
| mTLS / DPoP proof-of-possession | MCP clients don't support it; Bearer tokens sufficient for corporate network |
| OpenID Connect userinfo endpoint | Not a resource server responsibility; Azure AD provides userinfo |
| STDIO transport OAuth | OAuth only applies to HTTP transport per project scope |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| TRNS-01 | — | Pending |
| TRNS-02 | — | Pending |
| TRNS-03 | — | Pending |
| CONF-01 | — | Pending |
| CONF-02 | — | Pending |
| CONF-03 | — | Pending |
| CONF-04 | — | Pending |
| CONF-05 | — | Pending |
| DISC-01 | — | Pending |
| DISC-02 | — | Pending |
| DISC-03 | — | Pending |
| AUTH-01 | — | Pending |
| AUTH-02 | — | Pending |
| AUTH-03 | — | Pending |
| AUTH-04 | — | Pending |
| AUTH-05 | — | Pending |
| AUTH-06 | — | Pending |
| AUTH-07 | — | Pending |
| PROT-01 | — | Pending |
| PROT-02 | — | Pending |
| PROT-03 | — | Pending |
| PROT-04 | — | Pending |
| OBSV-01 | — | Pending |
| OBSV-02 | — | Pending |
| OBSV-03 | — | Pending |

**Coverage:**
- v1 requirements: 25 total
- Mapped to phases: 0
- Unmapped: 25 ⚠️

---
*Requirements defined: 2026-03-24*
*Last updated: 2026-03-24 after initial definition*
