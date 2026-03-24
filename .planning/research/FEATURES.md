# Feature Research: OAuth 2.1 Resource Server for MCP

**Domain:** OAuth 2.1 resource server authentication for a corporate MCP server with Azure AD
**Researched:** 2026-03-24
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Must Have or Auth Is Broken)

These are non-negotiable. Missing any of these means the authentication layer is insecure, non-functional, or non-compliant with the MCP authorization specification.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Protected Resource Metadata endpoint (RFC 9728)** | MCP spec MUST requirement. Clients discover auth server location from `GET /.well-known/oauth-protected-resource`. Without this, MCP clients cannot initiate the OAuth flow at all. | LOW | Returns JSON with `resource`, `authorization_servers`, `scopes_supported`, `bearer_methods_supported`. Static JSON response, trivially implemented as a Fastify GET route. |
| **Bearer token extraction from Authorization header** | OAuth 2.1 Section 5.1.1 mandates `Authorization: Bearer <token>` on every request. MCP spec explicitly forbids tokens in URI query strings. | LOW | Parse `Authorization` header, extract bearer token. Fastify `onRequest` hook is the right place -- runs before body parsing to avoid wasting resources on unauthorized requests. |
| **JWT signature verification via JWKS** | Without cryptographic verification, any forged token is accepted. Azure AD publishes RSA public keys at `https://login.microsoftonline.com/{tenant}/discovery/v2.0/keys`. The `jose` library's `createRemoteJWKSet` + `jwtVerify` handles this natively. | MEDIUM | `jose` has built-in JWKS caching with `cooldownDuration` to prevent excessive fetches. Keys are re-fetched only when no matching `kid` is found. Set `cacheMaxAge` to ~1 hour (3600000ms) to balance performance against Azure AD key rotation frequency. |
| **Audience claim (`aud`) validation** | MCP spec: servers MUST validate tokens were issued specifically for them. Without audience validation, tokens issued for other Azure AD apps could access this server -- the "confused deputy" problem. RFC 8707 and MCP spec are explicit: this is mandatory. | LOW | Azure AD v2.0 tokens set `aud` to the Application (client) ID of the registered app. Validate `aud === AZURE_CLIENT_ID`. |
| **Issuer claim (`iss`) validation** | Prevents tokens from other tenants or identity providers from being accepted. Azure AD v2.0 issuer format: `https://login.microsoftonline.com/{tenant-id}/v2.0`. | LOW | Pass `issuer` option to `jose` `jwtVerify`. Construct expected issuer from `AZURE_TENANT_ID` env var. |
| **Token expiry validation (`exp`, `nbf`)** | Accepting expired tokens defeats the purpose of short-lived access tokens. Also validates `nbf` (not-before) to reject tokens used before their validity window. | LOW | `jose` `jwtVerify` validates `exp` and `nbf` automatically when the `currentDate` option is used (defaults to `Date.now()`). No custom code needed. |
| **401 Unauthorized with WWW-Authenticate header** | MCP spec MUST requirement. When token is missing or invalid, the response MUST include `WWW-Authenticate: Bearer resource_metadata="<URL>"` so MCP clients can discover how to authenticate. Without this, clients have no way to initiate the OAuth flow. | LOW | Static header template. Include `resource_metadata` pointing to the Protected Resource Metadata URL. Optionally include `scope` to guide clients on what scopes to request. |
| **403 Forbidden for insufficient scopes** | MCP spec SHOULD. Differentiates "no/bad token" (401) from "valid token, wrong permissions" (403). Return `WWW-Authenticate: Bearer error="insufficient_scope", scope="<required>"` per RFC 6750. | LOW | Check `scp` claim from Azure AD token against required scopes. Return 403 with proper header if scopes are insufficient. |
| **Selective route protection** | Health check, metadata endpoints, and root info MUST remain unauthenticated. Only MCP transport routes (`POST /mcp`, `GET /mcp/events`) require tokens. A blanket auth-everything approach breaks discovery and health monitoring. | LOW | Fastify supports per-route hooks. Apply auth middleware via `onRequest` hook only on MCP routes. Health/metadata routes are registered without the hook. |
| **Environment-based configuration** | Deployment-specific values (tenant ID, client ID, resource URL) vary per environment. Hardcoding breaks deployment flexibility. | LOW | Three new env vars: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `MCP_RESOURCE_URL`. Validate at startup, fail fast if missing. |

### Differentiators (Competitive Advantage / Nice-to-Have)

Features that elevate the implementation above a minimal resource server. Valuable for production corporate deployments but not strictly required for functional auth.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Per-tool scope enforcement** | Instead of a single "can access MCP" gate, validate scopes per tool category (e.g., `wikijs:read`, `wikijs:write`, `wikijs:admin`). Enables least-privilege access: read-only users cannot create/delete pages. Aligns with MCP best practice: "split access per tool or capability." | MEDIUM | Extract `scp` claim from Azure AD v2.0 token (space-delimited string). Map each MCP tool to a required scope. Return 403 with `insufficient_scope` error when the token lacks the needed scope. Requires Azure AD app registration to define custom scopes (e.g., `api://{client-id}/wikijs.read`). |
| **Authenticated user identity in logs** | Extract `oid` (object ID), `preferred_username`, or `sub` from validated JWT. Log which user invoked which tool. Essential for corporate audit requirements and incident investigation. | LOW | After `jwtVerify` succeeds, extract claims and attach to Fastify request context. Include in structured log entries. Never log the token itself. |
| **Request correlation IDs** | Generate or propagate a unique correlation ID per request. Thread through logs, error responses, and SSE events. Enables tracing a single MCP invocation across the request lifecycle. | LOW | Use `crypto.randomUUID()` or accept `X-Request-ID` header. Attach to Fastify request decorator. Include in all log entries and error responses. |
| **JWKS pre-warming at startup** | Fetch Azure AD JWKS endpoint during server startup rather than on first request. Eliminates cold-start latency for the first authenticated request (~200-500ms network call). | LOW | Call `createRemoteJWKSet` at startup and trigger an initial fetch by verifying a dummy header. Or simply call the JWKS URL with `fetch` and log success/failure. |
| **Graceful token expiry handling** | When a token is close to expiry (within 5-minute window), log a warning but still accept it. Helps diagnose "token expired during long SSE session" issues common with MCP's streaming transport. | LOW | After `jwtVerify`, check `exp - now < 300` and log a warning. The token is still valid, so process normally. Helps operators understand token lifecycle. |
| **Structured error responses** | Return RFC 6750-compliant error bodies with `error`, `error_description`, and correlation IDs. Generic messages to clients, detailed reasons in server logs. Prevents information leakage while aiding debugging. | LOW | Define a consistent error response shape. Map `jose` errors (JWTExpired, JWTClaimValidationFailed, JWKSNoMatchingKey) to appropriate HTTP status codes and RFC 6750 error codes. |
| **Scope challenge / step-up authorization** | When a user's token lacks scopes for a specific tool, return 403 with the required scopes in `WWW-Authenticate`. MCP clients that support step-up auth can then re-authorize with broader scopes. Enables progressive permission escalation. | MEDIUM | Requires mapping tools to scopes and including `scope` parameter in 403 responses. Only useful if per-tool scope enforcement is implemented. Depends on MCP client support for step-up flows. |
| **Token validation metrics** | Track and expose metrics: tokens validated, tokens rejected (expired, bad audience, bad signature), validation latency. Useful for operational dashboards. | MEDIUM | Increment counters in the auth middleware. Expose via `/health` endpoint or a dedicated `/metrics` endpoint. Could integrate with Prometheus format if monitoring infrastructure exists. |

### Anti-Features (Deliberately NOT Build)

Features that seem useful but create problems, conflict with project constraints, or fall outside the resource server role.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Token issuance / Authorization Server** | "We need the server to issue tokens." | The MCP server is a resource server only. Azure AD issues tokens. Building token issuance duplicates Azure AD, creates a massive security surface, and violates the OAuth 2.1 role separation. The MCP spec explicitly separates these roles. | Azure AD handles all token issuance. Configure app registration there. |
| **Dynamic Client Registration (DCR) endpoint** | Claude Code historically required DCR. Some MCP clients may expect a `/register` endpoint. | Azure AD does not support DCR. Implementing a fake DCR proxy is a fragile hack (see anthropics/claude-code#2527, closed as "not planned"). The MCP spec lists DCR as MAY, not MUST. Claude Code is moving toward supporting pre-registered clients and Client ID Metadata Documents. | Pre-register the client in Azure AD. Configure Claude Desktop with the client ID. Use Client ID Metadata Documents if supported. |
| **Per-user WikiJS permissions mapping** | "Different users should see different WikiJS pages based on their Azure AD groups." | The existing architecture uses a single shared WikiJS API token. Mapping Azure AD identities to WikiJS permissions requires a permission model that doesn't exist yet, and adds enormous complexity. Explicitly listed as out-of-scope in PROJECT.md. | All authenticated users get equal access via the shared token. If needed in the future, this is a separate milestone. |
| **Token introspection endpoint** | "We should provide an introspection endpoint for other services." | This is an authorization server responsibility, not a resource server responsibility. The MCP server should consume tokens, not expose introspection of them. Building this conflates roles. | Azure AD provides its own introspection capabilities. |
| **CORS configuration for browser clients** | "What if someone builds a web UI?" | MCP clients are native apps (Claude Desktop, Claude Code, VS Code), not browser apps. CORS adds complexity and attack surface for no current use case. Explicitly out-of-scope per PROJECT.md. | If browser clients are needed in the future, add CORS as a separate concern. The existing `Access-Control-Allow-Origin: *` in the old JS server should be REMOVED, not extended. |
| **Rate limiting in the auth layer** | "We should rate-limit per user." | Rate limiting is an orthogonal concern to authentication. Mixing it into the auth middleware creates coupling. PROJECT.md explicitly defers this. Can be added as a separate Fastify plugin later without touching auth code. | Add `@fastify/rate-limit` as a separate middleware in a future milestone. |
| **Token caching / session management** | "Cache validated tokens to avoid re-verifying on every request." | JWT validation with cached JWKS keys is already sub-millisecond. Adding a token cache introduces state, cache invalidation problems, and a window where revoked tokens are still accepted. The MCP spec says auth MUST be included in every HTTP request. | Rely on `jose`'s built-in JWKS caching. Validate every token on every request. It's fast enough. |
| **mTLS / DPoP proof-of-possession** | "Add extra token binding for security." | Massive complexity increase. Requires certificate management infrastructure. MCP clients (Claude Desktop, Claude Code) don't support mTLS or DPoP. No benefit for the current deployment scenario (corporate network, native clients). | Bearer tokens with audience validation are sufficient for corporate internal use. |
| **OpenID Connect userinfo endpoint** | "Expose user profile info from the MCP server." | Not a resource server responsibility. The MCP server should not be an identity provider. MCP clients don't need userinfo from the resource server -- they get it from Azure AD directly. | Azure AD provides userinfo. Extract what you need from the JWT claims directly. |

## Feature Dependencies

```
Protected Resource Metadata (RFC 9728)
    (standalone, no dependencies, implement first)

Bearer Token Extraction
    |
    +--requires--> JWT Signature Verification (JWKS)
    |                  |
    |                  +--requires--> Audience Validation (aud claim)
    |                  |
    |                  +--requires--> Issuer Validation (iss claim)
    |                  |
    |                  +--requires--> Expiry Validation (exp/nbf)
    |                  |
    |                  +--enhances--> JWKS Pre-warming at Startup
    |
    +--requires--> 401 Response with WWW-Authenticate
    |
    +--enhances--> Authenticated User Identity in Logs

Selective Route Protection
    +--requires--> Bearer Token Extraction
    +--requires--> JWT Signature Verification

Per-tool Scope Enforcement
    +--requires--> JWT Signature Verification (to extract scp claim)
    +--requires--> 403 Response with insufficient_scope
    +--enhances--> Scope Challenge / Step-up Authorization

Environment-based Configuration
    (standalone, affects all auth features)

Request Correlation IDs
    (standalone, enhances all logging)
```

### Dependency Notes

- **Protected Resource Metadata has no dependencies:** It is a static JSON endpoint that can be implemented and tested independently of all token validation logic. Implement it first.
- **JWT Signature Verification is the critical path:** All claim validations (audience, issuer, expiry) are performed as part of `jose` `jwtVerify`. They are configured as options to a single function call, not separate steps. Implement them together.
- **Per-tool Scope Enforcement requires base auth:** Cannot check scopes without first having a validated token with extracted claims. Implement after base auth works.
- **Scope Challenge / Step-up requires per-tool scopes:** Only meaningful if tools have different scope requirements. Without per-tool enforcement, there is nothing to "step up" to.
- **Logging features are independent but benefit from auth:** Correlation IDs and user identity in logs are valuable regardless of auth but become most useful when auth provides user context.

## MVP Definition

### Launch With (v1)

Minimum viable auth layer -- what's needed for the OAuth flow to work end-to-end with Claude Desktop and Azure AD.

- [ ] **Protected Resource Metadata endpoint** -- Without this, no MCP client can discover auth requirements
- [ ] **Bearer token extraction** -- Parse `Authorization: Bearer <token>` from requests
- [ ] **JWT validation (signature + aud + iss + exp)** -- Single `jwtVerify` call with `jose` handles all of these
- [ ] **401 with WWW-Authenticate header** -- Enables MCP client discovery flow
- [ ] **Selective route protection** -- Auth on MCP routes only, health/metadata stay open
- [ ] **Environment configuration** -- `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `MCP_RESOURCE_URL`

### Add After Validation (v1.x)

Features to add once base auth is working and tested with real Azure AD tokens.

- [ ] **Authenticated user identity in logs** -- Add after first successful end-to-end auth flow; immediate value for operations
- [ ] **Request correlation IDs** -- Add alongside user identity logging; low effort, high debugging value
- [ ] **Structured error responses** -- Refine error messages after encountering real-world failure modes
- [ ] **JWKS pre-warming at startup** -- Add if cold-start latency is noticeable in practice
- [ ] **403 with insufficient_scope** -- Add when scope model is defined

### Future Consideration (v2+)

Features to defer until the base auth is proven and there is a clear need.

- [ ] **Per-tool scope enforcement** -- Defer until there is a concrete need for differentiated access levels among users. Requires Azure AD app registration changes (custom scopes) and a scope-to-tool mapping. Only worth the complexity if different user roles need different tool access.
- [ ] **Scope challenge / step-up authorization** -- Depends on per-tool scopes and MCP client support. Defer until both are in place.
- [ ] **Token validation metrics** -- Defer until monitoring infrastructure exists to consume metrics

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Protected Resource Metadata | HIGH | LOW | P1 |
| Bearer token extraction | HIGH | LOW | P1 |
| JWT validation (signature + claims) | HIGH | MEDIUM | P1 |
| 401 with WWW-Authenticate | HIGH | LOW | P1 |
| Selective route protection | HIGH | LOW | P1 |
| Environment configuration | HIGH | LOW | P1 |
| 403 with insufficient_scope | MEDIUM | LOW | P1 |
| Authenticated user identity in logs | MEDIUM | LOW | P2 |
| Request correlation IDs | MEDIUM | LOW | P2 |
| Structured error responses | MEDIUM | LOW | P2 |
| JWKS pre-warming | LOW | LOW | P2 |
| Per-tool scope enforcement | MEDIUM | MEDIUM | P3 |
| Scope challenge / step-up | LOW | MEDIUM | P3 |
| Token validation metrics | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch -- auth is broken without these
- P2: Should have, add in first iteration after base auth works
- P3: Nice to have, future consideration when there is concrete demand

## Competitor / Reference Implementation Analysis

| Feature | MCP Spec Reference (Keycloak) | Microsoft ISE Blog (Azure AD) | MCP SDK (TypeScript) | Our Approach |
|---------|-------------------------------|-------------------------------|----------------------|--------------|
| PRM endpoint | Full RFC 9728 implementation | Full RFC 9728 implementation | Built into `mcpAuthMetadataRouter` | Implement manually in Fastify -- simpler than pulling in SDK router |
| Token validation | Token introspection via Keycloak | JWT validation via JWKS with `jose` | `requireBearerAuth` middleware with pluggable verifier | Direct `jose` `jwtVerify` with `createRemoteJWKSet` -- no introspection needed, Azure AD tokens are self-contained JWTs |
| Audience validation | Custom audience mapper in Keycloak | `aud` claim check against client ID | `checkResourceAllowed` utility | `jose` `jwtVerify` `audience` option set to `AZURE_CLIENT_ID` |
| Scope enforcement | Single `mcp:tools` scope | `api://{client-id}/access_as_user` scope | `requiredScopes` in middleware config | Start with single scope, evolve to per-tool if needed |
| JWKS caching | N/A (uses introspection) | 1-hour cache with `jose` | Delegated to verifier | `jose` built-in caching via `createRemoteJWKSet` with `cacheMaxAge: 3600000` |
| Error handling | Standard OAuth errors | 5-minute expiry buffer, detailed logging | SDK handles error responses | Map `jose` errors to RFC 6750 responses, correlation IDs in logs |
| DCR support | Built into Keycloak | Not addressed | Full DCR support | Not implemented -- pre-registered client only. DCR is a MAY in MCP spec and Azure AD does not support it. |

## Sources

### HIGH Confidence (Official Specifications)
- [MCP Authorization Specification (draft)](https://modelcontextprotocol.io/specification/draft/basic/authorization) -- Authoritative MCP auth requirements
- [RFC 9728: OAuth 2.0 Protected Resource Metadata](https://datatracker.ietf.org/doc/rfc9728/) -- Protected Resource Metadata standard
- [OAuth 2.1 Draft](https://datatracker.ietf.org/doc/draft-ietf-oauth-v2-1/) -- OAuth 2.1 framework
- [Microsoft Entra ID Access Token Claims Reference](https://learn.microsoft.com/en-us/entra/identity-platform/access-token-claims-reference) -- Azure AD token claim structure
- [jose library: createRemoteJWKSet](https://github.com/panva/jose/blob/main/docs/jwks/remote/functions/createRemoteJWKSet.md) -- JWKS fetch/cache API

### MEDIUM Confidence (Verified Reference Implementations)
- [MCP Authorization Tutorial](https://modelcontextprotocol.io/docs/tutorials/security/authorization) -- Official MCP implementation guide with Keycloak example
- [Building a Secure MCP Server with OAuth 2.1 and Azure AD (Microsoft ISE Blog)](https://devblogs.microsoft.com/ise/aca-secure-mcp-server-oauth21-azure-ad/) -- Microsoft reference architecture for Azure AD + MCP
- [Building Claude-Ready Entra ID-Protected MCP Servers with Azure APIM](https://developer.microsoft.com/blog/claude-ready-secure-mcp-apim) -- Microsoft's APIM-based approach

### LOW Confidence (Community / Needs Validation)
- [Claude Code Azure AD DCR issue #2527](https://github.com/anthropics/claude-code/issues/2527) -- Closed as "not planned", but documents the DCR compatibility gap with Azure AD. Status may have changed since February 2026.

---
*Feature research for: OAuth 2.1 resource server for WikiJS MCP Server with Azure AD*
*Researched: 2026-03-24*
