# Phase 11: Discovery and Registration Endpoints - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Serve OAuth authorization server metadata at two .well-known endpoints and a Dynamic Client Registration endpoint. All three return static/pre-configured JSON responses. No outbound HTTP calls to Azure AD. All endpoints are publicly accessible without JWT authentication.

</domain>

<decisions>
## Implementation Decisions

### Discovery metadata fields
- Include all MCP-required fields: `authorization_endpoint`, `token_endpoint`, `registration_endpoint`, `response_types_supported`, `grant_types_supported`, `code_challenge_methods_supported: ["S256"]`
- Include `scopes_supported` listing all three MCP scopes (`wikijs:read`, `wikijs:write`, `wikijs:admin`)
- Include `issuer` set to `MCP_RESOURCE_URL` (self as authorization server)
- Include `token_endpoint_auth_methods_supported: ["none"]` to signal public client flow
- Include `Cache-Control: public, max-age=3600` header — consistent with existing protected-resource metadata
- `/.well-known/oauth-authorization-server` and `/.well-known/openid-configuration` return identical content

### Registration response shape
- Minimal static response: `client_id`, `token_endpoint_auth_method: "none"`, `grant_types: ["authorization_code", "refresh_token"]`, `response_types: ["code"]`
- No `client_id_issued_at` — the client_id is static/pre-configured, not dynamically issued
- Idempotent — every call returns the same response regardless of how many times called
- HTTP 201 Created status code per RFC 7591

### Registration validation
- Accept any valid JSON body — parse as JSON, reject non-JSON with 400
- Do not validate specific RFC 7591 fields in the request body
- Require `Content-Type: application/json` — return 415 Unsupported Media Type otherwise
- Log `client_name` field (if present) at info level for observability

### Route organization
- All OAuth proxy endpoints in new `src/routes/oauth-proxy.ts` Fastify plugin
- Protected-resource metadata stays in `public-routes.ts` (it's resource server metadata, not proxy metadata)
- Register `oauthProxyRoutes` plugin in `server.ts` during this phase (not deferred to Phase 14)
- Phase 12/13 add routes inside the same plugin; Phase 14 only updates protected-resource metadata
- `fetch` injection for Azure AD calls deferred to Phase 13 — not needed for static endpoints
- Update GET / server info endpoint to list new OAuth proxy endpoints

### Claude's Discretion
- Exact plugin options interface shape for oauthProxyRoutes
- Whether to use a shared metadata builder function or inline the JSON
- Test file organization (single test file or split by endpoint)
- Error response format for 400/415 on /register

</decisions>

<specifics>
## Specific Ideas

- Follow the same pattern as existing `/.well-known/oauth-protected-resource` in public-routes.ts — Cache-Control header, typed metadata object, clean Fastify route handler
- User consistently chose recommended/spec-compliant options, indicating preference for standard-conforming implementation

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `publicRoutes` plugin in `src/routes/public-routes.ts`: Template for unauthenticated route registration with typed options
- `AppConfig` in `src/config.ts`: Already has `azure.tenantId`, `azure.clientId`, `azure.resourceUrl` needed for metadata construction
- `SUPPORTED_SCOPES` from `src/scopes.ts`: Array of scope strings for `scopes_supported` field
- `buildTestApp()` in `tests/helpers/build-test-app.ts`: Will need to register the new oauth-proxy plugin

### Established Patterns
- Fastify plugin pattern with typed options interface (`PublicRoutesOptions`)
- Cache-Control headers on .well-known endpoints
- `buildLoggerConfig()` for structured pino logging
- Zod for input validation (could use for registration body parsing)

### Integration Points
- `server.ts:buildApp()` — register new `oauthProxyRoutes` plugin alongside existing public/protected routes
- `tests/helpers/build-test-app.ts` — register oauth-proxy plugin for test coverage
- `src/routes/public-routes.ts` GET `/` — update endpoints listing to include new routes
- Phase 12 adds GET `/authorize` inside oauth-proxy.ts
- Phase 13 adds POST `/token` and `fetch` injection inside oauth-proxy.ts
- Phase 14 updates `/.well-known/oauth-protected-resource` to point `authorization_servers` to self

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 11-discovery-and-registration-endpoints*
*Context gathered: 2026-03-25*
