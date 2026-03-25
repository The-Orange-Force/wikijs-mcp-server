# Phase 13: Token Proxy Endpoint - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

POST /token endpoint that proxies authorization_code and refresh_token grants to Azure AD. Handles scope mapping (bare to Azure AD format), resource parameter stripping, AADSTS error normalization, and response passthrough. This phase does NOT cover authorization redirects (Phase 12), discovery endpoints (Phase 11), or server wiring (Phase 14).

</domain>

<decisions>
## Implementation Decisions

### Error Normalization
- Minimal client-facing errors: map AADSTS codes to standard OAuth 2.0 error codes (invalid_grant, invalid_request, etc.) with generic error_description — no Azure AD leakage
- Mirror Azure AD's HTTP status codes (400 stays 400, 401 stays 401)
- Non-AADSTS failures (network timeouts, 500s, HTML error pages) return `server_error` with generic description "Authorization server unavailable"
- AADSTS-to-OAuth mapping via a const lookup table — unknown codes fall back to `invalid_request`
- Always log full AADSTS code + original description server-side when normalizing for client

### Grant Type Handling
- Reject unsupported grant types locally — only allow `authorization_code` and `refresh_token`, return `unsupported_grant_type` immediately for anything else
- Validate required parameters per grant type with Zod schemas before forwarding (`code` + `redirect_uri` for authorization_code, `refresh_token` for refresh_token grant)
- Pass through PKCE `code_verifier` as-is to Azure AD — proxy doesn't validate it
- Enforce `client_id` matches configured `AZURE_CLIENT_ID` — reject mismatches to prevent proxy misuse

### Token Response Shape
- Pass through Azure AD's JSON response body verbatim (access_token, refresh_token, id_token, expires_in, ext_expires_in, etc.)
- Reverse-map scopes in response from Azure AD format (`api://{client_id}/wikijs:read`) back to bare format (`wikijs:read`) using Phase 10 scope mapper
- Explicitly set `Content-Type: application/json` on all token responses
- Set `Cache-Control: no-store` and `Pragma: no-cache` per RFC 6749 section 5.1

### Proxy Observability
- Basic Fastify logging (no AsyncLocalStorage requestContext) — token proxy is public/unauthenticated, no user identity to track
- Log on every request: grant_type, Azure AD response status code, round-trip duration in ms
- On error: also log AADSTS code and original Azure error description server-side
- Add `X-Upstream-Duration-Ms` response header with Azure AD round-trip timing
- Never log tokens, authorization codes, or request bodies

### Claude's Discretion
- Internal function organization within the oauth-proxy plugin
- Exact set of AADSTS codes in the lookup table (cover the common ones)
- Zod schema structure for per-grant-type validation
- Test fixture design for injected fetch mocking

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/config.ts`: AppConfig with azure.tenantId, azure.clientId — needed for token endpoint URL construction and client_id enforcement
- `src/scopes.ts`: SUPPORTED_SCOPES, SCOPE_TOOL_MAP — Phase 10 will add scope mapping functions that this phase consumes
- Fastify plugin pattern (publicRoutes, protectedRoutes) — oauth-proxy follows the same registration pattern
- `tests/helpers/build-test-app.ts`: buildTestApp with mock injection — will need to register oauthProxyRoutes (Phase 14, but fetch injection pattern useful here)

### Established Patterns
- Fastify plugin registration with options interface (see PublicRoutesOptions)
- Global onRequest hook for x-request-id correlation
- Zod schemas for input validation (envSchema pattern in config.ts)
- Test helpers with local JWKS and mock objects

### Integration Points
- Phase 10: scope mapper functions (mapToAzureScopes, mapFromAzureScopes) and Azure endpoint URL construction (azureTokenEndpoint)
- Phase 11: @fastify/formbody plugin already registered in oauth-proxy plugin — POST /token receives form-encoded body
- Phase 14: oauthProxyRoutes plugin registered in server.ts and build-test-app.ts
- Injected fetch function: passed as plugin option for test isolation (no real Azure AD calls in tests)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 13-token-proxy-endpoint*
*Context gathered: 2026-03-25*
