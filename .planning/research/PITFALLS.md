# Domain Pitfalls

**Domain:** OAuth 2.1 JWT validation for MCP server with Azure AD (Microsoft Entra ID)
**Researched:** 2026-03-24
**Overall confidence:** HIGH (Azure AD behavior verified against Microsoft docs; jose library behavior verified against panva/jose GitHub; MCP spec verified against modelcontextprotocol.io)

---

## Critical Pitfalls

Mistakes that cause complete auth failure, security vulnerabilities, or require architectural rework.

### Pitfall 1: Azure AD Unverifiable Access Tokens (Missing Custom Scope)

**What goes wrong:** When no custom scope is configured in the Azure AD App Registration, Azure issues access tokens intended for Microsoft Graph API, not your API. These tokens have a `nonce` in the JWT header (breaking standard signature verification) and an audience claim of `00000003-0000-0000-c000-000000000000` (Microsoft Graph), not your application's client ID. The `jose` library's `jwtVerify()` throws `JWSSignatureVerificationFailed` even though the token is technically valid -- it was just never meant for your resource server to validate.

**Why it happens:** Azure AD treats token requests without a custom scope as requests for Microsoft Graph access. This is the single most common Azure AD + Node.js JWT validation failure, and it is documented but widely missed.

**Consequences:** Complete authentication failure. Every token is rejected with a cryptic signature verification error. Developers often waste hours debugging `jose`, JWKS endpoints, or key rotation when the root cause is the Azure AD App Registration configuration.

**Warning signs:**
- `jwtVerify()` throws `JWSSignatureVerificationFailed` for every token
- Decoded token header contains a `nonce` field (normal JWTs do not)
- Decoded token `aud` claim is `00000003-0000-0000-c000-000000000000` instead of your client ID or `api://` URI
- Token works fine when pasted into https://jwt.ms but fails programmatic validation

**Prevention:**
1. In Azure AD App Registration, go to "Expose an API" and define a custom scope (e.g., `api://{client-id}/mcp.access`)
2. Ensure the Claude Desktop OAuth configuration requests this custom scope, not just `openid` or `User.Read`
3. Validate early in development: decode a sample token with `jose.decodeJwt()` and check that `aud` matches your client ID before writing any verification logic
4. Add a startup check that logs the expected audience and issuer values

**Detection:** Decode any incoming token without verification first (for debugging only) and assert the `aud` claim matches `AZURE_CLIENT_ID` or `api://{AZURE_CLIENT_ID}`.

**Phase:** Must be addressed during Azure AD App Registration setup, before any server-side code. This is a prerequisite for the JWT middleware phase.

**Confidence:** HIGH -- verified via [panva/jose issue #564](https://github.com/panva/jose/issues/564), [Azure AD unverifiable access token writeup](https://tonesandtones.github.io/azure-ad-and-the-unvalidatable-access-token/), and [Microsoft identity platform access token docs](https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens).

---

### Pitfall 2: Token Version Mismatch (v1.0 vs v2.0 Issuer and Audience)

**What goes wrong:** Azure AD can issue either v1.0 or v2.0 tokens. Each version has a different `iss` (issuer) claim format and different `aud` (audience) claim behavior. If your JWT validation expects v2.0 format but receives v1.0 tokens (or vice versa), every token is rejected with issuer validation failure.

- **v1.0 issuer:** `https://sts.windows.net/{tenant-id}/`
- **v2.0 issuer:** `https://login.microsoftonline.com/{tenant-id}/v2.0`
- **v1.0 audience:** Can be the App ID URI (e.g., `api://{client-id}`) or the client ID, depending on how the client requested it
- **v2.0 audience:** Always the client ID of the API

**Why it happens:** The token version is controlled by the `accessTokenAcceptedVersion` property in the App Registration manifest. If this is `null` or `1`, Azure issues v1.0 tokens even when the client uses the v2.0 `/authorize` endpoint. Many developers assume that using the v2.0 endpoint means they get v2.0 tokens -- this is wrong.

**Consequences:** `jwtVerify()` throws issuer validation failure. Error messages like `"Expected: https://login.microsoftonline.com/{tid}/v2.0; Token: https://sts.windows.net/{tid}/"` appear in logs.

**Warning signs:**
- Token validation fails with "issuer validation failed" errors
- The `iss` claim in the decoded token does not match what you expected
- The App Registration manifest has `accessTokenAcceptedVersion: null`

**Prevention:**
1. Set `accessTokenAcceptedVersion` to `2` in the App Registration manifest (Azure Portal > App Registrations > Manifest)
2. Use the correct OIDC discovery endpoint for your token version:
   - v2.0: `https://login.microsoftonline.com/{tenant-id}/v2.0/.well-known/openid-configuration`
   - v2.0 JWKS: `https://login.microsoftonline.com/{tenant-id}/discovery/v2.0/keys`
3. Construct the expected issuer string dynamically: `` `https://login.microsoftonline.com/${AZURE_TENANT_ID}/v2.0` ``
4. In `jose.jwtVerify()`, explicitly pass the `issuer` option -- never skip issuer validation

**Detection:** Log the first token's `iss` claim during development and compare against your configured issuer string.

**Phase:** Azure AD App Registration configuration phase. Must be validated before the JWT middleware is written.

**Confidence:** HIGH -- verified via [Microsoft Learn: Access Tokens](https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens), [passport-azure-ad issue #396](https://github.com/AzureAD/passport-azure-ad/issues/396), [Microsoft Q&A: Issuer validation failure](https://learn.microsoft.com/en-us/answers/questions/1298931/jwt-validation-failed-issuer-validation-failure-er).

---

### Pitfall 3: Skipping Audience Validation (Accepting Tokens Meant for Other Services)

**What goes wrong:** The server accepts any valid Azure AD JWT without checking that the `aud` claim matches the server's own client ID. This means tokens issued for other Azure AD applications (potentially with different permissions and trust levels) are accepted.

**Why it happens:** During development, audience validation is sometimes disabled to "get things working" and never re-enabled. Or the `audience` option is omitted from `jwtVerify()` because signature + expiry validation alone "seems sufficient."

**Consequences:** Critical security vulnerability. Any Azure AD token from the same tenant (or even other tenants, if multi-tenant is accidentally enabled) can access MCP tools. This violates the MCP specification, which explicitly states: "MCP servers MUST validate that access tokens were issued specifically for them as the intended audience, according to RFC 8707 Section 2."

**Warning signs:**
- `jwtVerify()` call does not include `audience` option
- No test case that verifies a valid token with wrong audience is rejected
- Environment variable `AZURE_CLIENT_ID` is configured but not used in token validation

**Prevention:**
1. Always pass the `audience` option to `jose.jwtVerify()`:
   ```typescript
   await jwtVerify(token, JWKS, {
     issuer: `https://login.microsoftonline.com/${AZURE_TENANT_ID}/v2.0`,
     audience: AZURE_CLIENT_ID,
   });
   ```
2. Write an explicit test: generate or obtain a valid Azure AD token for a different app registration and confirm your server rejects it with 401
3. The MCP spec (RFC 8707) requires audience binding. This is not optional for production.

**Phase:** JWT middleware implementation phase. Must be part of the initial `jwtVerify()` call, not added later.

**Confidence:** HIGH -- MCP spec requirement per [MCP Authorization spec](https://modelcontextprotocol.io/specification/draft/basic/authorization), [RFC 6750](https://datatracker.ietf.org/doc/html/rfc6750).

---

### Pitfall 4: Wrong JWKS Endpoint URL (v1 vs v2, Missing /v2.0/)

**What goes wrong:** Using the v1.0 JWKS endpoint to validate v2.0 tokens, or vice versa. The signing keys may differ between the two endpoints, and using the wrong one causes signature verification failure.

**Why it happens:** Azure AD has multiple JWKS endpoints:
- v1.0: `https://login.microsoftonline.com/{tenant-id}/discovery/keys`
- v2.0: `https://login.microsoftonline.com/{tenant-id}/discovery/v2.0/keys`
- Common: `https://login.microsoftonline.com/common/discovery/v2.0/keys`

Developers often copy the wrong URL from documentation examples, or use the "common" endpoint when they should use the tenant-specific one.

**Consequences:** Intermittent or total signature verification failures. Using the common endpoint means accepting tokens from any Azure AD tenant, which is a security issue for single-tenant apps.

**Warning signs:**
- `ERR_JWKS_NO_MATCHING_KEY` errors from `jose`
- JWKS URL does not contain `/v2.0/` when `accessTokenAcceptedVersion` is 2
- JWKS URL uses `common` instead of the specific tenant ID

**Prevention:**
1. Derive the JWKS URL from the OIDC discovery document, not from hardcoded strings:
   ```typescript
   const discoveryUrl = `https://login.microsoftonline.com/${AZURE_TENANT_ID}/v2.0/.well-known/openid-configuration`;
   // Fetch and extract jwks_uri from the response
   ```
2. Or hardcode consistently: if `accessTokenAcceptedVersion` is 2, always use the v2.0 JWKS endpoint with the specific tenant ID
3. Never use the `common` endpoint for a single-tenant application

**Phase:** JWT middleware implementation, specifically when constructing `createRemoteJWKSet()`.

**Confidence:** HIGH -- verified via [Microsoft Learn: OIDC](https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc), [Microsoft Q&A: JWKS URI](https://learn.microsoft.com/en-us/answers/questions/1163810/where-can-i-find-the-jwks-uri-for-azure-ad).

---

### Pitfall 5: SSE Connection Token Expiry Without Reconnection Handling

**What goes wrong:** The MCP protocol uses Server-Sent Events (SSE) for server-to-client streaming via `GET /mcp/events`. JWT validation happens only at connection establishment. Azure AD access tokens have a default lifetime of 60-90 minutes. If an SSE connection outlives the token, the connection remains open with an expired token, or the client cannot reconnect without re-authentication.

**Why it happens:** SSE connections are long-lived by design. The `EventSource` API does not support custom headers natively, and token refresh logic is not built into the SSE reconnection flow. The current MCP server implementation (lib/fixed_mcp_http_server.js) has no token lifecycle management on SSE connections.

**Consequences:** Either: (a) expired tokens are silently accepted on existing SSE connections (security issue), or (b) SSE connections drop after token expiry and clients cannot reconnect smoothly (usability issue). The MCP spec states "authorization MUST be included in every HTTP request from client to server, even if they are part of the same logical session" -- but SSE is a single long-lived HTTP request.

**Warning signs:**
- SSE connections drop after ~1 hour with no clear error
- No token expiry check after SSE connection is established
- Tests only cover short-lived request/response patterns, not long-lived streaming

**Prevention:**
1. Validate the token at SSE connection establishment (in the `onRequest` hook)
2. Accept that SSE connections will outlive tokens -- this is inherent to SSE + JWT
3. Document the expected behavior: when the token expires, the SSE connection may be dropped, and the client must reconnect with a fresh token
4. Consider periodically checking token expiry on active SSE connections and sending a close event before expiry, giving the client time to reconnect with a refreshed token
5. For the MCP transport specifically, POST /mcp requests are short-lived and always carry a fresh Authorization header -- these are the primary security boundary. The SSE channel is read-only (server to client) and lower risk.

**Phase:** MCP transport porting phase (when unifying the HTTP server into Fastify). This is an architectural decision that should be made early.

**Confidence:** MEDIUM -- Azure AD token lifetimes verified via [Microsoft Learn: Configurable Token Lifetimes](https://learn.microsoft.com/en-us/entra/identity-platform/configurable-token-lifetimes). SSE + token interaction is based on protocol analysis; no direct MCP spec guidance on SSE token lifecycle found.

---

## Moderate Pitfalls

Mistakes that cause bugs, degraded security, or unnecessary complexity but are recoverable without rework.

### Pitfall 6: Using `preHandler` Instead of `onRequest` for JWT Auth in Fastify

**What goes wrong:** JWT authentication is placed in a `preHandler` hook instead of `onRequest`. This means Fastify parses the full request body before checking authentication. A malicious user can send large payloads that are fully parsed and buffered in memory before being rejected.

**Why it happens:** Many Fastify JWT examples use `preHandler` because it is more commonly shown in tutorials. The distinction is subtle and not obvious from the Fastify docs at first glance.

**Prevention:**
1. Use `onRequest` for all JWT validation since the token is in the `Authorization` header, not the body:
   ```typescript
   fastify.addHook('onRequest', async (request, reply) => {
     // JWT validation here -- body is not parsed yet
   });
   ```
2. Or apply it at the route/plugin level for selective protection:
   ```typescript
   fastify.register(async function protectedRoutes(instance) {
     instance.addHook('onRequest', jwtAuthHook);
     instance.post('/mcp', mcpHandler);
     instance.get('/mcp/events', sseHandler);
   });
   ```

**Phase:** JWT middleware implementation phase.

**Confidence:** HIGH -- verified via [Fastify Hooks documentation](https://fastify.dev/docs/latest/Reference/Hooks/), [Fastify discussion #3772](https://github.com/fastify/fastify/discussions/3772).

---

### Pitfall 7: Not Caching JWKS Keys / Hammering the JWKS Endpoint

**What goes wrong:** Every incoming request triggers a fresh HTTP call to Azure AD's JWKS endpoint to fetch signing keys. This creates latency on every request and can cause rate limiting or transient failures.

**Why it happens:** Developers create a new `createRemoteJWKSet()` instance per request instead of creating it once at module scope.

**Prevention:**
1. Create the JWKS function once at module/application scope:
   ```typescript
   // Create once, reuse for all requests
   const JWKS = createRemoteJWKSet(
     new URL(`https://login.microsoftonline.com/${AZURE_TENANT_ID}/discovery/v2.0/keys`)
   );
   ```
2. The `jose` library handles caching internally:
   - Default `cacheMaxAge`: 600,000ms (10 minutes) -- keys are re-fetched at most every 10 minutes
   - Default `cooldownDuration`: 30,000ms (30 seconds) -- prevents re-fetching more than once per 30 seconds even on cache miss
   - On unknown `kid`, it re-fetches once (handling key rotation) but respects the cooldown
3. Do NOT wrap `createRemoteJWKSet` in additional caching logic -- this is already handled

**Phase:** JWT middleware implementation phase.

**Confidence:** HIGH -- verified via [jose createRemoteJWKSet docs](https://github.com/panva/jose/blob/main/docs/jwks/remote/functions/createRemoteJWKSet.md).

---

### Pitfall 8: Malformed WWW-Authenticate Header on 401 Response

**What goes wrong:** The server returns 401 without a proper `WWW-Authenticate` header, or includes it in a non-standard format. The MCP spec requires this header with the `resource_metadata` parameter pointing to the Protected Resource Metadata URL. Claude Desktop relies on parsing this header to discover OAuth endpoints and initiate the authorization flow.

**Why it happens:** Developers return a plain 401 JSON error without the header, or omit the `resource_metadata` parameter, or use wrong RFC 6750 error code formatting.

**Consequences:** Claude Desktop cannot discover how to authenticate. The user sees a generic "unauthorized" error with no way to log in. The entire OAuth flow never starts.

**Warning signs:**
- Claude Desktop shows "unauthorized" but never prompts for login
- 401 response missing `WWW-Authenticate` header entirely
- Header present but missing `resource_metadata` parameter

**Prevention:**
1. Follow the MCP spec format exactly:
   ```
   HTTP/1.1 401 Unauthorized
   WWW-Authenticate: Bearer resource_metadata="https://your-server/.well-known/oauth-protected-resource"
   ```
2. For invalid/expired tokens, include the error code per RFC 6750:
   ```
   WWW-Authenticate: Bearer resource_metadata="...", error="invalid_token", error_description="Token expired"
   ```
3. For missing tokens (no Authorization header), do NOT include an error code -- just the bearer challenge with resource_metadata
4. Test with a raw HTTP client (curl) to verify the header is present and correctly formatted before testing with Claude Desktop

**Phase:** OAuth middleware implementation, specifically the 401 response handler.

**Confidence:** HIGH -- verified via [MCP Authorization spec](https://modelcontextprotocol.io/specification/draft/basic/authorization), [RFC 6750](https://datatracker.ietf.org/doc/html/rfc6750).

---

### Pitfall 9: Protected Resource Metadata Endpoint Missing or Incorrect

**What goes wrong:** The `GET /.well-known/oauth-protected-resource` endpoint is missing, returns wrong content, or is itself behind authentication (requiring a token to discover how to get a token).

**Why it happens:** The RFC 9728 Protected Resource Metadata endpoint is a relatively new requirement in the MCP spec. Developers either forget to implement it, accidentally apply the auth middleware to all routes (including the metadata endpoint), or return a malformed response.

**Consequences:** Claude Desktop cannot discover the authorization server and cannot initiate the OAuth flow.

**Warning signs:**
- `GET /.well-known/oauth-protected-resource` returns 404 or 401
- The response is missing `authorization_servers` field
- The `resource` field does not match the server's canonical URL

**Prevention:**
1. Ensure the metadata endpoint is explicitly excluded from authentication middleware:
   ```typescript
   // Register BEFORE the auth middleware, or in a separate unprotected plugin scope
   fastify.get('/.well-known/oauth-protected-resource', async () => ({
     resource: MCP_RESOURCE_URL,
     authorization_servers: [
       `https://login.microsoftonline.com/${AZURE_TENANT_ID}/v2.0`
     ],
     scopes_supported: ['api://' + AZURE_CLIENT_ID + '/mcp.access'],
     bearer_methods_supported: ['header'],
   }));
   ```
2. Also exclude `/health` from auth middleware
3. The `resource` value MUST match what the MCP client sends as the `resource` parameter in RFC 8707

**Phase:** OAuth middleware implementation, first endpoint to build and test.

**Confidence:** HIGH -- verified via [MCP Authorization spec](https://modelcontextprotocol.io/specification/draft/basic/authorization), [RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728).

---

### Pitfall 10: Signing Key Rotation Causes Transient Failures

**What goes wrong:** Azure AD periodically rotates its signing keys. If the application caches keys forever (or does not handle the `ERR_JWKS_NO_MATCHING_KEY` error gracefully), tokens signed with the new key are rejected until the application is restarted.

**Why it happens:** Microsoft explicitly states there is "no set or guaranteed time between key rolls" and that keys "could be rolled over immediately" in an emergency. Applications that hardcode keys or use aggressive caching without fallback will fail.

**Prevention:**
1. Use `jose.createRemoteJWKSet()` -- it handles key rotation automatically:
   - When a token arrives with an unknown `kid`, it re-fetches the JWKS (subject to `cooldownDuration`)
   - Default `cacheMaxAge` of 10 minutes ensures regular refresh
2. Never download keys manually and cache them indefinitely
3. Never hardcode key material or thumbprints
4. Test by simulating an unknown `kid` and verifying the library re-fetches

**Phase:** JWT middleware implementation. This is handled correctly by default if using `createRemoteJWKSet()` at module scope -- the main risk is someone "optimizing" the caching and breaking it.

**Confidence:** HIGH -- verified via [Microsoft Learn: Signing Key Rollover](https://learn.microsoft.com/en-us/entra/identity-platform/signing-key-rollover), [jose createRemoteJWKSet docs](https://github.com/panva/jose/blob/main/docs/jwks/remote/functions/createRemoteJWKSet.md).

---

## Minor Pitfalls

Issues that cause confusion, minor bugs, or suboptimal behavior.

### Pitfall 11: Leaking Sensitive Info in Error Responses

**What goes wrong:** JWT validation error messages (including token contents, claim values, or internal stack traces) are returned to the client in the 401 response body.

**Prevention:**
1. Return generic error messages to clients: `{ "error": "unauthorized" }`
2. Log detailed error information server-side only (using Fastify's logger)
3. Never echo the token or its decoded contents back in error responses

**Phase:** OAuth middleware implementation.

---

### Pitfall 12: Forgetting `type: "module"` Implications for jose Import

**What goes wrong:** The project uses `"type": "module"` in package.json (confirmed in the existing codebase). The `jose` library supports ESM natively, but developers may try to use CommonJS-style `require('jose')` or import from the wrong subpath.

**Prevention:**
1. Use ESM imports: `import { jwtVerify, createRemoteJWKSet } from 'jose';`
2. The project already uses ESM (`"type": "module"` in package.json) -- maintain consistency
3. Ensure `jose` version is 5.x+ which has clean ESM support

**Phase:** Dependencies installation phase.

---

### Pitfall 13: Not Handling the Authorization Header Case-Insensitively

**What goes wrong:** The middleware checks for `Authorization` (capitalized) but some HTTP clients or proxies may send `authorization` (lowercase). While Fastify normalizes header names to lowercase, code that directly accesses `request.headers['Authorization']` (capitalized) will get `undefined`.

**Prevention:**
1. Fastify lowercases all header names. Always use `request.headers['authorization']` (lowercase)
2. Use a robust Bearer token extraction pattern:
   ```typescript
   const authHeader = request.headers['authorization'];
   if (!authHeader?.startsWith('Bearer ')) {
     // return 401
   }
   const token = authHeader.slice(7);
   ```

**Phase:** JWT middleware implementation.

---

### Pitfall 14: Missing Environment Variable Validation at Startup

**What goes wrong:** The server starts without `AZURE_TENANT_ID` or `AZURE_CLIENT_ID` being set, then fails with cryptic errors on the first authenticated request (e.g., the JWKS URL becomes `https://login.microsoftonline.com/undefined/discovery/v2.0/keys`).

**Prevention:**
1. Validate all required OAuth environment variables at startup, before registering routes:
   ```typescript
   const required = ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'MCP_RESOURCE_URL'];
   for (const key of required) {
     if (!process.env[key]) {
       throw new Error(`Missing required environment variable: ${key}`);
     }
   }
   ```
2. Use Zod or a similar schema validator for env vars (the project already uses Zod)
3. Log the configured OAuth settings at startup (tenant ID, expected audience, JWKS URL) -- but never log secrets

**Phase:** Server configuration phase, before any OAuth code.

---

### Pitfall 15: Dual Server Architecture Creates Auth Bypass

**What goes wrong:** The current codebase has two separate servers: Fastify (src/server.ts, port 8000) for REST endpoints and raw Node.js HTTP (lib/fixed_mcp_http_server.js, port 3200) for MCP transport. If auth middleware is only applied to one server, the other remains unprotected. Even if both are protected, maintaining auth logic in two places is error-prone.

**Why it happens:** This is the existing architecture. The PROJECT.md correctly identifies the need to "Port MCP transport into Fastify TypeScript server" to unify them.

**Prevention:**
1. Complete the transport unification BEFORE implementing OAuth middleware
2. If transport unification is deferred, ensure both servers share the exact same auth middleware module
3. The raw HTTP server in lib/fixed_mcp_http_server.js must not be exposed on any port after the Fastify port takes over MCP routes

**Phase:** This is a pre-requisite phase. Transport unification should be the first milestone task, before OAuth middleware.

**Confidence:** HIGH -- based on direct codebase analysis.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Azure AD App Registration | Pitfall 1 (unverifiable tokens), Pitfall 2 (token version) | Set `accessTokenAcceptedVersion: 2`, create custom scope under "Expose an API", verify a sample token before writing server code |
| Transport Unification | Pitfall 15 (dual server bypass) | Must complete before OAuth layer. Single Fastify server handles all routes. |
| Environment Configuration | Pitfall 14 (missing env vars) | Validate AZURE_TENANT_ID, AZURE_CLIENT_ID, MCP_RESOURCE_URL at startup with Zod |
| Protected Resource Metadata | Pitfall 9 (missing/incorrect metadata), Pitfall 8 (WWW-Authenticate) | Implement and test `/.well-known/oauth-protected-resource` first. Verify with curl before Claude Desktop. |
| JWT Middleware (core) | Pitfall 3 (audience), Pitfall 4 (JWKS URL), Pitfall 6 (hook choice), Pitfall 7 (caching) | Use `onRequest` hook, single `createRemoteJWKSet()` instance, always validate issuer + audience |
| JWT Middleware (edge cases) | Pitfall 10 (key rotation), Pitfall 13 (header case) | Trust jose's built-in caching. Use lowercase header access. |
| SSE / Streaming | Pitfall 5 (token expiry on SSE) | Validate on connect, accept expiry-driven disconnects, document reconnection behavior |
| Error Handling | Pitfall 8 (WWW-Authenticate), Pitfall 11 (info leakage) | Follow RFC 6750 format exactly. Never echo tokens or claims in responses. |
| Integration Testing | All pitfalls | Test with: expired token, wrong-audience token, missing token, malformed token, token from wrong tenant |

---

## Sources

### Official Documentation (HIGH confidence)
- [Microsoft Learn: Access Tokens in the Microsoft Identity Platform](https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens)
- [Microsoft Learn: Signing Key Rollover](https://learn.microsoft.com/en-us/entra/identity-platform/signing-key-rollover)
- [Microsoft Learn: OpenID Connect on Microsoft Identity Platform](https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc)
- [Microsoft Learn: Configurable Token Lifetimes](https://learn.microsoft.com/en-us/entra/identity-platform/configurable-token-lifetimes)
- [MCP Specification: Authorization](https://modelcontextprotocol.io/specification/draft/basic/authorization)
- [RFC 6750: OAuth 2.0 Bearer Token Usage](https://datatracker.ietf.org/doc/html/rfc6750)
- [RFC 9728: OAuth 2.0 Protected Resource Metadata](https://datatracker.ietf.org/doc/html/rfc9728)
- [Fastify Hooks Documentation](https://fastify.dev/docs/latest/Reference/Hooks/)

### Library Documentation (HIGH confidence)
- [jose: createRemoteJWKSet](https://github.com/panva/jose/blob/main/docs/jwks/remote/functions/createRemoteJWKSet.md)
- [jose: jwtVerify](https://github.com/panva/jose/blob/main/docs/jwt/verify/functions/jwtVerify.md)
- [jose issue #564: Can't verify Azure token](https://github.com/panva/jose/issues/564)

### Community Analysis (MEDIUM confidence)
- [Azure AD and the Un-validatable Access Token](https://tonesandtones.github.io/azure-ad-and-the-unvalidatable-access-token/)
- [passport-azure-ad issue #396: Token version mismatch](https://github.com/AzureAD/passport-azure-ad/issues/396)
- [Microsoft Q&A: Issuer validation failure](https://learn.microsoft.com/en-us/answers/questions/1298931/jwt-validation-failed-issuer-validation-failure-er)
- [Fastify discussion #3772: preHandler vs onRequest](https://github.com/fastify/fastify/discussions/3772)
- [Building Claude-Ready Entra ID-Protected MCP Servers](https://developer.microsoft.com/blog/claude-ready-secure-mcp-apim)
