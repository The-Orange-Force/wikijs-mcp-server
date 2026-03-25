# Stack Research: OAuth Authorization Proxy

**Domain:** OAuth 2.1 authorization proxy endpoints for MCP server
**Researched:** 2026-03-25
**Confidence:** HIGH

## Context: What This Covers

This research is scoped to the v2.2 OAuth Authorization Proxy milestone. The existing
application stack (TypeScript 5.3, Fastify 4, jose, Zod, Vitest, Docker) is validated
and not re-researched. The question is: what NEW dependencies and patterns are needed
to proxy OAuth authorize/token/registration/discovery requests to Azure AD?

**Existing stack (validated, not changed):**
- Fastify 4 (HTTP server)
- jose (JWT/JWKS validation -- continues to validate tokens from Azure AD)
- Zod (input validation)
- graphql-request (WikiJS API client)
- @modelcontextprotocol/sdk (MCP protocol)

**What we are adding:** OAuth proxy endpoints that sit between MCP clients (Claude
Desktop) and Azure AD, transforming scope names and managing the authorization flow.

## Recommended Stack Additions

### New Dependencies

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@fastify/formbody` | `^7.0.0` | Parse `application/x-www-form-urlencoded` request bodies on the `/token` endpoint | Fastify 4 only parses `application/json` and `text/plain` by default. OAuth token requests (RFC 6749 Section 4.1.3) MUST use `application/x-www-form-urlencoded`. This is the official Fastify plugin for this content type, maintained by the Fastify org. v7.x is the Fastify 4-compatible line. Uses Node's built-in `querystring.parse` -- zero additional transitive deps. |

### No New Dependencies Needed For

| Capability | Why No New Dep | What To Use Instead |
|------------|---------------|---------------------|
| HTTP client for token proxy | Node.js 20 ships stable `fetch()` (undici-backed) | `globalThis.fetch` with `URLSearchParams` body -- automatically sets `Content-Type: application/x-www-form-urlencoded;charset=UTF-8` |
| URL/query-string construction for authorization redirects | Node.js built-in `URL` and `URLSearchParams` | `new URL()` + `.searchParams.set()` for building Azure AD `/authorize` redirect URLs |
| PKCE code challenge generation | Not needed -- proxy passes through PKCE params | MCP client generates `code_challenge` + `code_verifier`; proxy forwards them unchanged to Azure AD |
| JSON response parsing from Azure AD token endpoint | Node.js `fetch()` built-in `.json()` | `response.json()` on the fetch response |
| OpenID Connect discovery JSON | Fastify's built-in JSON response | Static JSON object returned by route handler -- no library needed |
| Dynamic Client Registration | Static JSON response | Returns pre-configured Azure AD `client_id` -- no database or registration logic needed |
| Scope mapping (bare to fully-qualified) | Simple string concatenation | `wikijs:read` -> `api://${clientId}/wikijs:read` -- pure TypeScript, no library |

### Dependencies to REMOVE

| Dependency | Current Version | Why Remove |
|------------|----------------|------------|
| `@azure/msal-node` | `^5.1.1` | **Not imported anywhere in `src/`.** Only used by `get-token.mjs` (a standalone developer helper script). MSAL is designed for client-side token acquisition (device code flow, auth code flow), NOT for proxying. The proxy needs raw HTTP control over the authorize/token flow -- MSAL abstracts away the exact parameters we need to manipulate (scope mapping, redirect_uri rewriting). Removing it also eliminates the musl libc concern that forced `node:20-slim` over Alpine in Docker. If the `get-token.mjs` script is still needed, it can use `npx @azure/msal-node` or be moved to a separate devDependency. |

## Detailed Rationale

### Why `@fastify/formbody` (Not a Custom Content Type Parser)

Fastify supports registering custom content type parsers via `addContentTypeParser()`.
We could write a 5-line parser using `node:querystring`. However:

1. `@fastify/formbody` is an official Fastify org plugin with TypeScript types
2. It handles edge cases (body size limits, charset normalization)
3. It is a single dependency with zero transitive deps (uses Node built-in `querystring.parse`)
4. It is the conventional approach in the Fastify ecosystem -- makes the codebase readable to anyone familiar with Fastify

The plugin is registered at the Fastify instance level (or scoped to a plugin):

```typescript
import formbody from "@fastify/formbody";

// Register for OAuth routes that receive form-encoded bodies
server.register(formbody);
```

After registration, `request.body` on POST routes with `Content-Type: application/x-www-form-urlencoded` is a parsed object.

**Flat parsing only** -- `@fastify/formbody` uses `querystring.parse` which produces
flat key-value pairs (no nested objects). This is exactly what OAuth token requests
need: `grant_type`, `code`, `client_id`, `redirect_uri`, `code_verifier` are all flat
string values.

### Why Native `fetch()` (Not `@fastify/reply-from`, `axios`, or `undici` Direct)

The token proxy needs to:
1. Receive a form-encoded POST from the MCP client
2. Modify the scope parameter (prepend `api://{clientId}/`)
3. Forward to Azure AD's token endpoint
4. Return Azure AD's JSON response to the MCP client

This is NOT a reverse proxy (transparent pass-through). It is a **transform proxy**:
the request body is modified before forwarding. `@fastify/reply-from` and
`@fastify/http-proxy` are designed for transparent proxying with header rewriting --
they are overkill and the wrong abstraction for body transformation.

Native `fetch()` gives us:
- Full control over the outgoing request body (construct a new `URLSearchParams`)
- Clean error handling (`response.ok`, `response.status`)
- Zero additional dependencies
- Built into Node.js 20 (stable, no longer experimental)

```typescript
// Token proxy pattern -- transform and forward
const azureParams = new URLSearchParams();
azureParams.set("client_id", config.azure.clientId);
azureParams.set("grant_type", body.grant_type);
azureParams.set("code", body.code);
azureParams.set("redirect_uri", body.redirect_uri);
azureParams.set("scope", mapScopes(body.scope, config.azure.clientId));
if (body.code_verifier) azureParams.set("code_verifier", body.code_verifier);

const azureResponse = await fetch(
  `https://login.microsoftonline.com/${config.azure.tenantId}/oauth2/v2.0/token`,
  { method: "POST", body: azureParams }
);

const tokenResponse = await azureResponse.json();
```

`URLSearchParams` as the `fetch()` body automatically sets
`Content-Type: application/x-www-form-urlencoded;charset=UTF-8` -- no manual header
required.

### Why NOT `@azure/msal-node` for the Proxy

MSAL is a client-side authentication library. It is designed to:
- Acquire tokens for a client application
- Cache tokens in memory/disk
- Handle device code flow, auth code flow from the client perspective

The OAuth proxy needs to:
- Receive authorization/token requests from MCP clients
- Transform parameters (scope mapping, redirect_uri injection)
- Forward raw HTTP requests to Azure AD
- Return Azure AD's raw responses

MSAL abstracts away the HTTP layer we need to control. Using MSAL would mean fighting
the library to extract and modify the exact query/form parameters. Direct `fetch()` is
simpler, more transparent, and aligns with the proxy's role as a thin HTTP translator.

Additionally, `@azure/msal-node` adds ~2.5 MB to `node_modules` and was the reason
for choosing `node:20-slim` over `node:20-alpine` in Docker. Removing it opens the
door to switching to Alpine (smaller image, fewer CVEs) in a future milestone.

### Why `URL` and `URLSearchParams` (Not a URL Manipulation Library)

The authorization endpoint proxy needs to:
1. Parse the incoming request's query parameters
2. Modify the `scope` parameter
3. Add the `client_id` parameter (Azure AD's, not the MCP client's)
4. Construct a redirect URL to Azure AD's `/authorize` endpoint

Node.js built-in `URL` and `URLSearchParams` handle all of this:

```typescript
// Authorization redirect construction
const azureAuthUrl = new URL(
  `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`
);
azureAuthUrl.searchParams.set("client_id", azureClientId);
azureAuthUrl.searchParams.set("response_type", "code");
azureAuthUrl.searchParams.set("redirect_uri", redirectUri);
azureAuthUrl.searchParams.set("scope", mapScopes(requestedScope, azureClientId));
azureAuthUrl.searchParams.set("state", state);
azureAuthUrl.searchParams.set("code_challenge", codeChallenge);
azureAuthUrl.searchParams.set("code_challenge_method", "S256");

reply.redirect(302, azureAuthUrl.toString());
```

No URL manipulation library needed. `URL` handles encoding, normalization, and
construction correctly per the WHATWG URL Standard.

## Integration Points with Existing Fastify Server

### Route Registration Pattern

The OAuth proxy endpoints should be registered as a new Fastify plugin, following the
existing pattern of `publicRoutes` and `protectedRoutes`:

```typescript
// New plugin: OAuth proxy routes (unauthenticated -- these ARE the auth endpoints)
server.register(oauthProxyRoutes, {
  appConfig,
});
```

These routes are **unauthenticated** -- they are the mechanism by which MCP clients
obtain tokens. The JWT auth middleware must NOT apply to them.

### New Routes

| Method | Path | Content-Type In | Content-Type Out | Purpose |
|--------|------|-----------------|------------------|---------|
| GET | `/.well-known/openid-configuration` | N/A | `application/json` | OIDC discovery metadata pointing to local proxy endpoints |
| POST | `/oauth/register` | `application/json` | `application/json` | Dynamic Client Registration -- returns pre-configured Azure AD client_id |
| GET | `/oauth/authorize` | N/A (query params) | 302 redirect | Redirect to Azure AD `/authorize` with scope mapping |
| POST | `/oauth/token` | `application/x-www-form-urlencoded` | `application/json` | Forward token request to Azure AD with scope mapping |

### Configuration Additions

New environment variables needed:

| Variable | Purpose | Example |
|----------|---------|---------|
| None new | Tenant ID, Client ID, Resource URL already exist | All Azure AD details already in `config.ts` |

The proxy uses existing config values:
- `AZURE_TENANT_ID` -- for constructing Azure AD endpoint URLs
- `AZURE_CLIENT_ID` -- returned by Dynamic Client Registration; used as `client_id` in Azure AD requests
- `MCP_RESOURCE_URL` -- for constructing local endpoint URLs in discovery metadata

### Scope Mapping Logic

This is the core transformation the proxy performs:

```typescript
// Bare MCP scope -> Fully-qualified Azure AD scope
function mapScopes(bareScopes: string, clientId: string): string {
  return bareScopes
    .split(" ")
    .map(scope => {
      // Standard OIDC scopes pass through unchanged
      if (["openid", "profile", "email", "offline_access"].includes(scope)) {
        return scope;
      }
      // Custom scopes get the api:// prefix
      return `api://${clientId}/${scope}`;
    })
    .join(" ");
}
```

This function uses the existing `AZURE_CLIENT_ID` to construct fully-qualified scope
names that Azure AD expects.

### Protected Resource Metadata Update

The existing `/.well-known/oauth-protected-resource` endpoint in `public-routes.ts`
currently points `authorization_servers` to Azure AD directly. For the proxy, it must
point to self:

```typescript
authorization_servers: [appConfig.azure.resourceUrl]
```

This tells MCP clients to discover OAuth endpoints at this server (not Azure AD).

### `@fastify/formbody` Scoping

Register `@fastify/formbody` only within the OAuth proxy plugin scope to avoid
affecting the existing `/mcp` endpoint (which expects `application/json`):

```typescript
async function oauthProxyRoutes(fastify: FastifyInstance, opts: OAuthProxyOptions) {
  // Scoped registration -- only affects routes in this plugin
  fastify.register(formbody);

  fastify.post("/oauth/token", async (request, reply) => {
    const body = request.body as Record<string, string>;
    // ... proxy logic
  });
}
```

Fastify's plugin encapsulation ensures the formbody parser only applies to routes
registered inside this plugin.

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@azure/msal-node` (keep existing) | Not used in `src/`, wrong abstraction for proxying, adds 2.5 MB, forced slim Docker image | Remove from dependencies; use `fetch()` for direct HTTP calls to Azure AD |
| `axios` or `got` | Adds unnecessary dependency when Node.js 20 has stable `fetch()` | `globalThis.fetch()` |
| `@fastify/http-proxy` or `@fastify/reply-from` | Designed for transparent reverse proxying, not body transformation | Direct `fetch()` calls with constructed request bodies |
| `qs` (nested query string parser) | OAuth token parameters are flat key-value pairs; nested parsing is unnecessary and a security risk (prototype pollution) | `@fastify/formbody` with default `querystring.parse` |
| `openid-client` | Full OIDC client library -- we are building a proxy, not a client. Would fight the library's abstractions. | Manual endpoint implementation (4 simple routes) |
| `oauth4webapi` | Same problem as `openid-client` -- client-side abstraction over what we need to control server-side | Manual implementation |
| `express` middleware (e.g., `body-parser`) | Project uses Fastify; mixing middleware frameworks is an anti-pattern | `@fastify/formbody` (Fastify-native) |
| Session/state management library | The proxy is stateless. Authorization `state` parameter is generated by the MCP client and passed through. No server-side session state is needed. | Stateless pass-through of state/PKCE params |
| Token caching library | PROJECT.md explicitly puts token storage/caching out of scope. The proxy passes Azure AD's response through to the MCP client unchanged. | Direct pass-through |

## MCP Spec Alignment

The MCP authorization specification (draft, 2025-11-25 revision) has evolved:

1. **Dynamic Client Registration is now OPTIONAL** (MAY support). The spec prefers
   Client ID Metadata Documents. However, Claude Desktop currently uses DCR as a
   fallback, so we implement it for compatibility.

2. **The proxy pattern is explicitly supported**: the MCP server lists itself as the
   authorization server in Protected Resource Metadata, exposes OIDC discovery pointing
   to local endpoints, and forwards authorization/token requests to the real IdP.

3. **PKCE is MUST for MCP clients**: Claude Desktop sends `code_challenge` and
   `code_challenge_method=S256`. The proxy passes these through unchanged to Azure AD.
   No PKCE generation or validation logic is needed on the proxy.

4. **Resource Indicators (RFC 8707)**: MCP clients MUST include a `resource` parameter
   in authorization and token requests. Azure AD may or may not support this -- the
   proxy should forward it and handle Azure AD's response gracefully.

5. **Protected Resource Metadata (RFC 9728) is MUST**: Already implemented. Needs
   update to point `authorization_servers` to self instead of Azure AD.

## Version Compatibility Matrix

| Package | Version | Fastify 4 | Node.js 20 | TypeScript 5.3 | ESM |
|---------|---------|-----------|------------|----------------|-----|
| `@fastify/formbody` | `^7.0.0` | Yes (v7.x line) | Yes | Yes (ships types) | Yes |
| `globalThis.fetch` | Built-in | N/A | Stable since 18.0 | N/A | N/A |
| `URL` / `URLSearchParams` | Built-in | N/A | Stable | N/A | N/A |

## Installation

```bash
# Single new dependency
npm install @fastify/formbody@^7.0.0

# Remove unused dependency
npm uninstall @azure/msal-node
```

Net effect: dependency count decreases by 1 (remove msal-node, add formbody).
`node_modules` size decreases significantly (msal-node is ~2.5 MB vs formbody ~15 KB).

## Alternatives Considered

| Category | Recommended | Alternative | Why Not Alternative |
|----------|-------------|-------------|---------------------|
| Form body parsing | `@fastify/formbody` | Custom `addContentTypeParser()` | 5 lines of code but loses type safety, body limit handling, and ecosystem familiarity. Not worth the marginal dependency savings. |
| HTTP client for proxy | `globalThis.fetch()` | `undici.request()` (direct) | Undici is already bundled in Node.js 20 and powers `fetch()`. Direct undici usage gives lower-level control but fetch's ergonomics are better for our use case (simple POST, read JSON response). No benefit to going lower-level. |
| HTTP client for proxy | `globalThis.fetch()` | `@fastify/reply-from` | Designed for transparent proxying (pipe request through). We need to transform the request body (scope mapping) before forwarding. Wrong abstraction. |
| Token endpoint auth | No `client_secret` (public client) | `client_secret_post` | Azure AD app is configured as a public client (no secret). MCP clients are native desktop apps -- they cannot securely store a client secret. PKCE provides the security. |
| Discovery endpoint | `/.well-known/openid-configuration` | `/.well-known/oauth-authorization-server` | MCP spec requires clients to support both. Azure AD uses OIDC discovery natively. Using the same convention reduces cognitive overhead. Implement OIDC discovery; MCP clients will find it. |
| Scope mapping | String manipulation in TypeScript | Zod transform | Zod transform would validate AND transform scopes. However, the mapping is a simple `api://{id}/` prefix. Zod is better used for validating the incoming request shape; scope mapping is business logic, not validation. Keep them separate. |

## Sources

- [MCP Authorization Specification (draft)](https://modelcontextprotocol.io/specification/draft/basic/authorization) -- Authoritative spec for OAuth proxy pattern, endpoint requirements, PKCE, scope handling. HIGH confidence.
- [MCP Authorization Spec Update (Nov 2025)](https://aaronparecki.com/2025/11/25/1/mcp-authorization-spec-update) -- Client ID Metadata Documents replacing DCR as primary registration mechanism. MEDIUM confidence (blog post, verified against spec).
- [Logto: MCP Auth Spec Review (2025-03-26 edition)](https://blog.logto.io/mcp-auth-spec-review-2025-03-26) -- Detailed analysis of proxy pattern, scope mapping, token handling. MEDIUM confidence.
- [Microsoft: OAuth 2.0 authorization code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow) -- Azure AD token endpoint parameters, form-encoded body format, PKCE support. HIGH confidence (official docs, updated 2026-01-09).
- [Azure AD OpenID Configuration](https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration) -- Verified: no `registration_endpoint` in Azure AD (confirms need for proxy DCR), no `code_challenge_methods_supported` in metadata. HIGH confidence (live endpoint).
- [@fastify/formbody GitHub](https://github.com/fastify/fastify-formbody) -- Version matrix (v7.x for Fastify 4), uses `querystring.parse`, TypeScript types included. HIGH confidence (official Fastify org repo).
- [@fastify/formbody npm](https://www.npmjs.com/package/@fastify/formbody) -- Latest v7 is `7.0.2`, v8.0.2 is for Fastify 5. HIGH confidence.
- [Node.js Fetch API](https://nodejs.org/en/learn/getting-started/fetch) -- Stable in Node.js 18+, `URLSearchParams` body auto-sets form-urlencoded Content-Type. HIGH confidence (official Node.js docs).
- [MDN: Using the Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch) -- `URLSearchParams` as body, Content-Type automatic. HIGH confidence.

---
*Stack research for: OAuth Authorization Proxy -- wikijs-mcp-server v2.2*
*Researched: 2026-03-25*
