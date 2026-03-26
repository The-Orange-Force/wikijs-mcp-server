# Phase 12: Authorization Redirect Endpoint - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

GET `/authorize` endpoint that redirects MCP clients to Azure AD's authorization endpoint with mapped scopes, stripped resource parameter, and PKCE passthrough. This phase implements AUTHZ-01 and AUTHZ-02. Token exchange (Phase 13) and metadata updates (Phase 14) are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Error responses
- When redirect_uri IS present and valid: redirect errors via 302 to redirect_uri with `?error=invalid_request&error_description=...` (OAuth 2.1 spec, RFC 6749 §4.1.2.1)
- When redirect_uri is missing or invalid: HTTP 400 JSON `{"error": "invalid_request", "error_description": "missing required parameter: redirect_uri"}`
- When client_id doesn't match: HTTP 400 JSON `{"error": "invalid_client", "error_description": "unknown client_id"}` — no redirect (can't trust redirect_uri from unknown client)
- Validate response_type locally — reject non-"code" values immediately with error redirect (don't forward unsupported flows to Azure AD)
- Error descriptions include specific field names (e.g., "missing required parameter: client_id") to help developers debug integration issues

### Validation order
- Validate in sequence: client_id → redirect_uri → response_type → other params
- client_id and redirect_uri failures return JSON errors (no redirect)
- After client_id and redirect_uri pass, subsequent errors redirect to the validated redirect_uri

### Scope handling
- No scope parameter: forward with just openid + offline_access (Azure AD uses app registration defaults)
- Unknown scopes: pass through to Azure AD — let Azure AD reject them (proxy stays stateless)
- Deduplication: ensure openid and offline_access appear exactly once in forwarded scope string
- Ordering: preserve client's original scope ordering, append openid + offline_access at the end

### Parameter passthrough
- Whitelist policy: only forward known OAuth params, drop everything else
- Whitelisted params: client_id, redirect_uri, response_type, scope, state, code_challenge, code_challenge_method, nonce, prompt, login_hint
- Resource parameter: strip before forwarding (already decided — AADSTS9010010)
- Dropped params: log at debug level for troubleshooting
- Resource param strip: also log at debug level for consistency

### Client ID validation
- Validate incoming client_id matches AZURE_CLIENT_ID env var
- Mismatch: HTTP 400 JSON error, no redirect, log at warn level (potential misconfiguration or probing)

### Logging
- Mismatched client_id: warn level (includes received client_id — not a secret)
- Dropped/stripped params: debug level
- Successful redirects: info level (standard request logging)

### Claude's Discretion
- Exact Zod schema shape for query parameter validation
- URL construction implementation details (URLSearchParams vs template)
- Test structure and assertion patterns
- How to integrate with the oauth-proxy.ts plugin from Phase 10/11

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The key priority is OAuth 2.1 spec compliance with clear, developer-friendly error messages.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/config.ts`: Already exposes `azure.tenantId` and `azure.clientId` — enough to construct Azure AD authorize URL
- `src/scopes.ts`: Has bare scope constants (SCOPES.READ, etc.) and SUPPORTED_SCOPES array
- `src/routes/public-routes.ts`: Pattern for unauthenticated Fastify plugin routes
- `src/logging.ts` + `src/request-context.ts`: Pino logger with correlation IDs for structured logging

### Established Patterns
- Routes are Fastify plugins registered in `buildApp()` (server.ts)
- Public routes don't require JWT auth (registered outside protectedRoutes scope)
- Config validated via Zod at startup, accessed as typed `AppConfig` object
- Test infra: `buildTestApp()` creates full Fastify app with local JWKS

### Integration Points
- Phase 10 provides scope mapping functions and Azure AD URL construction utils
- Phase 11 provides discovery/registration endpoints in the same oauth-proxy.ts plugin
- This endpoint will be registered as part of the oauth-proxy.ts Fastify plugin (per STATE.md decision)
- `buildTestApp()` in tests/helpers/ will need to register the oauth-proxy plugin

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 12-authorization-redirect-endpoint*
*Context gathered: 2026-03-25*
