# Requirements: WikiJS MCP Server — v2.2 OAuth Authorization Proxy

**Defined:** 2026-03-25
**Core Value:** Only Azure AD-authenticated colleagues can invoke MCP tools against the company WikiJS instance

## v2.2 Requirements

### Scope Mapping

- [x] **SCOPE-01**: Proxy maps bare MCP scopes (`wikijs:read`) to Azure AD format (`api://{client_id}/wikijs:read`) in all outbound requests, preserving OIDC scopes (`openid`, `offline_access`) unprefixed
- [x] **SCOPE-02**: Proxy strips RFC 8707 `resource` parameter before forwarding to Azure AD

### Metadata

- [x] **META-01**: Server serves OAuth authorization server metadata at both `/.well-known/oauth-authorization-server` and `/.well-known/openid-configuration` with identical content
- [x] **META-02**: Discovery document includes `code_challenge_methods_supported: ["S256"]` and all MCP-required fields (`authorization_endpoint`, `token_endpoint`, `registration_endpoint`, `response_types_supported`, `grant_types_supported`)
- [x] **META-03**: Protected Resource Metadata (`/.well-known/oauth-protected-resource`) references self (`MCP_RESOURCE_URL`) as authorization server

### Registration

- [x] **REGN-01**: `POST /register` accepts RFC 7591 DCR request and returns pre-configured Azure AD `client_id` with no `client_secret` (public client)

### Authorization

- [x] **AUTHZ-01**: `GET /authorize` redirects (302) to Azure AD authorization endpoint with mapped scopes, stripped `resource` parameter, and appended `offline_access` + `openid`
- [x] **AUTHZ-02**: Authorization redirect preserves client's `redirect_uri`, `state`, `code_challenge`, and `code_challenge_method` parameters unchanged

### Token

- [x] **TOKN-01**: `POST /token` proxies `authorization_code` grant to Azure AD token endpoint and returns the response
- [x] **TOKN-02**: `POST /token` proxies `refresh_token` grant to Azure AD token endpoint and returns the response
- [x] **TOKN-03**: Token endpoint normalizes Azure AD `AADSTS*` error responses to standard OAuth 2.0 error format

### Integration

- [x] **INTG-01**: All proxy endpoints are public (unauthenticated) — existing JWT validation on `POST /mcp` is unchanged
- [x] **INTG-02**: Claude Desktop completes full OAuth flow and successfully invokes MCP tools

## Future Requirements

### Security Hardening

- **CONSENT-01**: User consent interstitial page before redirecting to Azure AD (prevents shared-client-ID token theft)
- **HEALTH-01**: Azure AD connectivity check in `/health` endpoint

## Out of Scope

| Feature | Reason |
|---------|--------|
| Token issuance by proxy | Proxy passes through Azure AD tokens; issuing own tokens doubles attack surface |
| `/oauth/*` subpath routes | Claude.ai constructs paths from base URL, ignoring metadata; root-level paths required |
| Callback endpoint (`/oauth/callback`) | Azure AD redirects directly to client's `redirect_uri`; no server-side callback needed |
| Dual-PKCE (proxy-side + Azure AD-side) | Only needed when proxy issues own tokens; not applicable |
| Rate limiting on proxy endpoints | Caddy reverse proxy handles rate limiting if needed |
| CORS headers on OAuth endpoints | MCP clients are native apps, not browser-based |
| `client_id_metadata_document_supported` | Newer MCP spec feature; defer until Claude clients ship support |
| MSAL library usage | Wrong abstraction — MSAL manages client-side flows, not server-side proxying |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCOPE-01 | Phase 10 | Complete |
| SCOPE-02 | Phase 10 | Complete |
| META-01 | Phase 11 | Complete |
| META-02 | Phase 11 | Complete |
| META-03 | Phase 14 | Complete |
| REGN-01 | Phase 11 | Complete |
| AUTHZ-01 | Phase 12 | Complete |
| AUTHZ-02 | Phase 12 | Complete |
| TOKN-01 | Phase 13 | Complete |
| TOKN-02 | Phase 13 | Complete |
| TOKN-03 | Phase 13 | Complete |
| INTG-01 | Phase 14 | Complete |
| INTG-02 | Phase 14 | Complete |

**Coverage:**
- v2.2 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0

---
*Requirements defined: 2026-03-25*
*Last updated: 2026-03-25 after roadmap creation*
