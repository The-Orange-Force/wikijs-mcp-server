# Phase 4: JWT Authentication - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Build Bearer token validation middleware using jose and Azure AD JWKS. The middleware validates tokens, rejects unauthorized requests with spec-compliant error responses, and extracts authenticated user identity for downstream use. Route protection (applying middleware to specific routes) and structured observability are Phase 5.

</domain>

<decisions>
## Implementation Decisions

### Scope strategy
- Define v2 scopes now: wikijs:read, wikijs:write, wikijs:admin — hardcoded in code, not configurable via env
- v1 gate: require at least one of the three scopes in the token; any one suffices
- Check delegated user tokens only — scopes in the `scp` claim (not `roles`)
- Per-tool scope enforcement deferred to v2 (ADVN-01, ADVN-02)

### Error response detail
- Specific reasons in `error_description` — "token expired", "invalid audience", "invalid signature" (corporate server, debuggability > obscurity)
- Both WWW-Authenticate header AND JSON body `{ error, error_description }` on 401/403
- 403 (insufficient_scope) includes required scopes in WWW-Authenticate `scope` parameter and JSON body
- Log auth rejections server-side using Fastify's built-in logger (basic logging now, structured correlation IDs in Phase 5)

### Token claims and identity
- Extract four claims: oid, preferred_username, name, email
- Only `oid` is required — others extracted if present, undefined if not
- Expose via `request.user` using Fastify's `decorateRequest` pattern
- Define and export a TypeScript `AuthenticatedUser` interface from the middleware module
- Single tenant only — no `tid` extraction needed

### Validation strictness
- Clock skew: jose default (0 seconds tolerance) — corporate network with NTP, 1-hour token lifetime
- Token version: v2.0 only — issuer must match `https://login.microsoftonline.com/{tenant}/v2.0`
- Audience: validate `aud` matches AZURE_CLIENT_ID — no additional `azp` check
- JWKS fetch failure: return HTTP 503 Service Unavailable (not 401) — distinguishes infrastructure failure from auth failure

### Claude's Discretion
- Middleware internal structure (Fastify plugin vs standalone function)
- jose options beyond what's specified (algorithms, etc.)
- Error message exact wording
- Unit test approach and mocking strategy

</decisions>

<specifics>
## Specific Ideas

- Scopes follow the naming convention wikijs:read, wikijs:write, wikijs:admin — matching the v2 requirements (ADVN-01) so no rename needed later
- AuthenticatedUser interface should live in a shared location (e.g., alongside existing types.ts) so Phase 5 observability can import it
- Error JSON body format should match RFC 6750 field names exactly: `error` and `error_description`

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/types.ts`: Existing type definitions — AuthenticatedUser interface should follow same patterns
- `src/schemas.ts`: Zod schemas — could be used for validating extracted claims
- Fastify built-in logger: Already enabled (`{ logger: true }` in server.ts) — use for auth rejection logging

### Established Patterns
- Fastify 4.27 with ESM modules (`"type": "module"`)
- No existing middleware or hook patterns — this middleware will establish the pattern
- Zod for input validation — could inform claim validation approach

### Integration Points
- `src/server.ts`: Fastify instance where middleware will be registered
- Phase 2 provides: AZURE_TENANT_ID, AZURE_CLIENT_ID, MCP_RESOURCE_URL env vars and jose dependency
- Phase 3 provides: resource_metadata URL needed for WWW-Authenticate header
- Phase 5 consumes: request.user (AuthenticatedUser) for logging, middleware export for route-level application

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-jwt-authentication*
*Context gathered: 2026-03-24*
