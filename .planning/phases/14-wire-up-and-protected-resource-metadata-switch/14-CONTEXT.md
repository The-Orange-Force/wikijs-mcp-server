# Phase 14: Wire Up and Protected Resource Metadata Switch - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Register the OAuth proxy plugin (`oauthProxyRoutes`) in the production server and test helper, switch `/.well-known/oauth-protected-resource` to reference self as the authorization server, and verify the full discovery chain works end-to-end. This is the final integration step that makes the Claude Desktop OAuth flow operational.

</domain>

<decisions>
## Implementation Decisions

### E2E validation strategy
- Automated integration test in a new dedicated file: `tests/e2e-flow.test.ts`
- Test walks the full discovery chain as sequential `it()` blocks: discovers protected resource -> follows to auth server metadata -> registers client -> builds authorize redirect -> proxies token request
- Each step is independently debuggable
- Mock fetch injected to capture outbound requests to Azure AD — assert correct URL, headers, and mapped scopes (no fake token response needed)
- No manual Claude Desktop test procedure — rely on automated integration test

### Metadata switchover
- `authorization_servers` in `/.well-known/oauth-protected-resource` switches entirely to `[MCP_RESOURCE_URL]` (self only, no Azure AD fallback)
- Endpoint stays in `public-routes.ts` where it already lives — just update the `authorization_servers` value
- Keep all existing metadata fields: `resource`, `authorization_servers`, `scopes_supported`, `bearer_methods_supported`, `resource_signing_alg_values_supported`, `resource_documentation`
- Use `MCP_RESOURCE_URL` as-is from appConfig (no trailing slash normalization — Zod URL validation handles this)

### Server info endpoint
- Update GET `/` to list all new OAuth proxy endpoints: `/authorize`, `/token`, `/register`, `/.well-known/oauth-authorization-server`, `/.well-known/openid-configuration`
- Add `authorization_server_metadata` field pointing to `/.well-known/oauth-authorization-server` alongside existing `protected_resource_metadata`
- Annotate each endpoint with access level (unauthenticated / requires Bearer token) — extend existing pattern
- Keep version at `2.0.0` — don't bump

### Existing test updates
- Update `discovery.test.ts` assertions in place: change expected `authorization_servers` from Azure AD URL to `MCP_RESOURCE_URL` (self)
- `buildTestApp()` always registers the OAuth proxy plugin — mirrors production parity, no opt-in flag
- Inject a capture-only mock fetch in `buildTestApp()` that records all calls and returns generic 400 — prevents accidental real Azure AD calls, tests needing specific responses override it
- Add proxy endpoint access tests to `route-protection.test.ts` confirming `/authorize`, `/token`, `/register`, discovery endpoints are accessible without Bearer token (INTG-01)

### Claude's Discretion
- Exact mock fetch implementation details in buildTestApp
- How to pass the mock fetch to the oauth proxy plugin (constructor option, plugin option, etc.)
- Whether to extract mock fetch as a shared test helper or inline in buildTestApp

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `public-routes.ts:73-95`: Existing `/.well-known/oauth-protected-resource` handler — update `authorization_servers` value in place
- `build-test-app.ts`: Already mirrors production plugin registration pattern — add oauthProxyRoutes alongside publicRoutes and protectedRoutes
- `mockWikiJsApi` pattern in `build-test-app.ts`: Established pattern for test mocks — follow same style for mock fetch

### Established Patterns
- Fastify encapsulated plugins: `publicRoutes` (no auth) and `protectedRoutes` (auth scoped) — oauthProxyRoutes follows the publicRoutes pattern (no auth)
- `server.ts:44-58`: Plugin registration order — publicRoutes, protectedRoutes, add oauthProxyRoutes
- Test helpers in `src/auth/__tests__/helpers.ts`: Token generation for JWT tests — E2E test can reuse these

### Integration Points
- `server.ts` `buildApp()`: Register `oauthProxyRoutes` plugin
- `build-test-app.ts` `buildTestApp()`: Register same plugin with mock fetch
- `public-routes.ts`: Modify `authorization_servers` array value
- `route-protection.test.ts`: Add public access assertions for proxy endpoints
- `discovery.test.ts`: Update `authorization_servers` assertion

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 14-wire-up-and-protected-resource-metadata-switch*
*Context gathered: 2026-03-25*
