# Domain Pitfalls: OAuth Authorization Proxy with Azure AD

**Domain:** Adding OAuth 2.1 authorization proxy endpoints to an existing MCP server backed by Azure AD (Microsoft Entra ID)
**Researched:** 2026-03-25
**Overall confidence:** HIGH (Azure AD behaviors verified via Microsoft Learn docs; MCP spec verified via modelcontextprotocol.io draft spec; Claude Desktop/Code behaviors verified via GitHub issues #82 on claude-ai-mcp, #2527 on claude-code, #832 and #862 on typescript-sdk)

**Context:** The wikijs-mcp-server already validates Azure AD JWTs (shipped in v2.0). This research covers pitfalls specific to ADDING an OAuth proxy layer that helps MCP clients OBTAIN tokens, without breaking the existing JWT validation.

---

## Critical Pitfalls

Mistakes that cause complete auth flow failure, security vulnerabilities, or require architectural rework.

### Pitfall 1: Azure AD Rejects the RFC 8707 `resource` Parameter

**What goes wrong:** The MCP spec (2025-11-25 draft) requires clients to include the `resource` parameter (RFC 8707) in both authorization and token requests. However, Azure AD v2.0 endpoints do NOT support RFC 8707. When an MCP client sends `resource=https://mcp.example.com` alongside v2-style scope parameters, Azure AD returns error `AADSTS9010010` ("The resource parameter provided in the request doesn't match with the requested scopes") with HTTP 400.

**Why it happens:** Azure AD v1.0 used a `resource` parameter for a different purpose (identifying the target API). The v2.0 endpoint replaced this with fully-qualified scope strings (e.g., `api://client-id/wikijs:read`). The two cannot coexist. MCP clients like Cursor unconditionally send `resource`, which Azure AD v2.0 rejects.

**Consequences:** The entire authorization flow fails at the authorization request step. Users see an Azure AD error page. No token is ever issued.

**Warning signs:**
- Azure AD returns `AADSTS9010010` or `invalid_target` during authorization
- The error only appears when the `resource` parameter is present in the authorization URL

**Prevention:**
1. The authorization proxy endpoint MUST strip the `resource` parameter from requests before forwarding to Azure AD
2. Instead, encode the resource identity into the scope parameter: transform bare scopes like `wikijs:read` into `api://{client-id}/wikijs:read`
3. Test with and without the `resource` parameter to verify the proxy handles both cases

**Detection:** Monitor proxy logs for Azure AD 400 responses containing `AADSTS9010010`

**Phase:** Authorization endpoint proxy (scope mapping phase). This must be addressed in the same phase that builds the `/authorize` proxy.

**Confidence:** HIGH -- verified via [IBM/mcp-context-forge#2881](https://github.com/IBM/mcp-context-forge/issues/2881) and [MCP TypeScript SDK#862](https://github.com/modelcontextprotocol/typescript-sdk/issues/862)

---

### Pitfall 2: Scope Format Mismatch -- Bare Scopes vs Fully-Qualified `api://` Scopes

**What goes wrong:** MCP clients send bare scope names like `wikijs:read wikijs:write`. Azure AD v2.0 requires fully-qualified scope strings: `api://{client-id}/wikijs:read api://{client-id}/wikijs:write`. If bare scopes reach Azure AD, it returns `AADSTS70011` ("The provided value for the input parameter 'scope' is not valid").

**Why it happens:** The MCP spec defines scopes as simple strings. Azure AD requires scopes prefixed with the App ID URI (typically `api://{client-id}/`). This is a fundamental format mismatch between the MCP ecosystem and Azure AD.

**Consequences:** Authorization fails immediately. Users cannot obtain tokens. The error message is misleading -- developers often think the scope name itself is wrong rather than the format.

**Warning signs:**
- Azure AD returns `AADSTS70011` with "invalid scope" message
- The `scp` claim in successfully-issued tokens contains bare names (e.g., `wikijs:read`), but the token REQUEST must use fully-qualified names

**Prevention:**
1. The authorization proxy MUST transform scopes before forwarding to Azure AD:
   - `wikijs:read` becomes `api://{client-id}/wikijs:read`
   - `wikijs:write` becomes `api://{client-id}/wikijs:write`
   - `wikijs:admin` becomes `api://{client-id}/wikijs:admin`
2. Preserve standard OpenID scopes unchanged: `openid`, `profile`, `email`, `offline_access` do NOT get prefixed
3. Add `offline_access` to the scope list if refresh tokens are needed (Claude Desktop expects refresh tokens)
4. The returned token's `scp` claim will contain the bare scope names -- this is correct behavior and matches what the existing JWT validation middleware already expects

**Detection:** Unit test the scope transformation function with edge cases: empty scopes, duplicate scopes, mixed bare and prefixed scopes, OpenID scopes

**Phase:** Authorization endpoint proxy. This is the core value of the proxy -- it MUST be implemented correctly in the first phase.

**Confidence:** HIGH -- verified via [Microsoft Learn: Scopes and permissions](https://learn.microsoft.com/en-us/entra/identity-platform/scopes-oidc) and project constraint in PROJECT.md

---

### Pitfall 3: Claude.ai Ignores Discovery Metadata Endpoints -- Hardcodes Paths on MCP Server

**What goes wrong:** Claude.ai (web) does NOT respect `authorization_endpoint` and `token_endpoint` from the OAuth metadata document. Instead, it constructs endpoint URLs by appending `/authorize`, `/token`, and `/register` to the MCP server's base URL, regardless of what the discovery document advertises. This means even if your metadata points to `https://login.microsoftonline.com/.../authorize`, Claude.ai will hit `https://your-mcp-server.com/authorize`.

**Why it happens:** Claude.ai implements the older MCP authorization spec (2025-03-26) which derived auth endpoints from the MCP server URL. The newer spec (2025-06-18+) introduced RFC 9728 support for external authorization servers. Claude.ai has not been updated. Claude Code CLI does NOT have this bug -- it correctly reads endpoints from metadata.

**Consequences:** If you only configure the discovery document to point to Azure AD and do not implement actual proxy endpoints on the MCP server itself, Claude.ai users get 404 errors. Claude Code CLI users work fine. This client inconsistency is extremely confusing to debug.

**Warning signs:**
- Claude.ai sends `GET /authorize?...` to the MCP server instead of Azure AD
- Claude.ai sends `POST /token` to the MCP server instead of Azure AD
- Claude Code CLI works perfectly while Claude.ai fails
- 404 responses on `/authorize` and `/token` endpoints

**Prevention:**
1. MUST implement actual proxy endpoints on the MCP server at `/authorize`, `/token`, and `/register`
2. The `/authorize` endpoint redirects to Azure AD with transformed parameters
3. The `/token` endpoint proxies the request to Azure AD's token endpoint
4. This is the ONLY architecture that works across all MCP clients -- metadata-only approaches are insufficient
5. The discovery document's `authorization_endpoint` and `token_endpoint` SHOULD point to the MCP server's own proxy endpoints (not Azure AD directly)

**Detection:** Test with both Claude.ai and Claude Code CLI. If only one works, this is the likely cause.

**Phase:** This defines the fundamental architecture. Must be decided in Phase 1 (planning) and implemented in the first coding phase. The proxy approach is non-negotiable for Claude.ai compatibility.

**Confidence:** HIGH -- verified via [anthropics/claude-ai-mcp#82](https://github.com/anthropics/claude-ai-mcp/issues/82) with reproduction steps and client comparison table

---

### Pitfall 4: Azure AD Does Not Advertise `code_challenge_methods_supported` in OIDC Metadata

**What goes wrong:** Azure AD's OIDC discovery document at `/.well-known/openid-configuration` omits the `code_challenge_methods_supported` field, even though Azure AD fully supports PKCE with S256. Per RFC 8414, omitting this field means "the authorization server does not support PKCE." MCP clients that strictly validate this field will refuse to proceed.

**Why it happens:** This is a longstanding Azure AD metadata gap. Microsoft has been gradually rolling out a fix (build 2.1.22096.x includes the field), but rollout is incomplete across regions as of late 2025. Some regional ESTS clusters include `["plain", "S256"]`, others omit the field entirely.

**Consequences:** MCP clients following the spec strictly (the MCP TypeScript SDK did this until PR #992 in October 2025) will abort the auth flow, displaying an error like "does not support S256 code challenge method required by MCP specification."

**Warning signs:**
- Auth flow aborts before reaching the Azure AD login page
- Error message mentions PKCE or code_challenge_methods
- The problem appears intermittently across different Azure AD regions
- Works when tested against `login.microsoftonline.com` from one region but fails from another

**Prevention:**
1. The proxy's discovery document (`/.well-known/openid-configuration` or `/.well-known/oauth-authorization-server`) MUST explicitly include `"code_challenge_methods_supported": ["S256"]`
2. Since the proxy is the authorization server from the MCP client's perspective, the proxy controls this field -- do not relay Azure AD's metadata verbatim
3. This is one of the key reasons to proxy the discovery document rather than redirecting to Azure AD's

**Detection:** Fetch `https://login.microsoftonline.com/{tenant}/v2.0/.well-known/openid-configuration` and verify the field presence. If missing, the proxy MUST compensate.

**Phase:** Discovery endpoint implementation. Must be correct in the first phase that creates `/.well-known/openid-configuration`.

**Confidence:** HIGH -- verified via [MCP TypeScript SDK#832](https://github.com/modelcontextprotocol/typescript-sdk/issues/832) (closed, fix merged) and [Microsoft Q&A: OIDC metadata inconsistency](https://learn.microsoft.com/en-us/answers/questions/5576009/oidc-discovery-metadata-inconsistent-across-region)

---

### Pitfall 5: Breaking Existing JWT Validation When Adding Proxy Routes

**What goes wrong:** The existing server registers the auth middleware as a Fastify plugin that adds an `onRequest` hook to ALL routes in its scope. If proxy endpoints (`/authorize`, `/token`, `/register`, `/.well-known/openid-configuration`) are accidentally registered inside the protected route scope, they require a Bearer token -- but these endpoints must be public (they are used BEFORE the client has a token).

**Why it happens:** Fastify's encapsulation model means hooks registered in a parent scope apply to all child routes. The existing `protectedRoutes` plugin applies JWT validation. If new OAuth proxy routes are registered as siblings or children of `protectedRoutes`, they inherit the auth hook.

**Consequences:** The OAuth proxy endpoints return 401 "missing bearer token" to unauthenticated clients. The entire auth flow is dead -- clients cannot obtain a token because the token-obtaining endpoints require a token.

**Warning signs:**
- `/authorize` returns 401 instead of redirecting to Azure AD
- `/token` returns 401 instead of proxying to Azure AD
- `/.well-known/openid-configuration` returns 401
- The existing `/health` and `/.well-known/oauth-protected-resource` endpoints still work (they are in the public scope)

**Prevention:**
1. Register ALL proxy endpoints in the same scope as `publicRoutes` -- outside the `protectedRoutes` plugin
2. Follow the existing pattern: `publicRoutes` is registered at root scope in `server.ts`, `protectedRoutes` is registered separately with the auth plugin
3. Add a new `oauthProxyRoutes` plugin registered at root scope alongside `publicRoutes`
4. Write integration tests that verify proxy endpoints respond WITHOUT a Bearer token
5. Write regression tests that verify `/mcp` still REQUIRES a Bearer token

**Detection:** The existing test pattern in `tests/route-protection.test.ts` already tests that certain routes require auth. Extend this to verify proxy routes do NOT require auth.

**Phase:** Route registration phase. This is an architecture decision that must be made before any proxy routes are coded.

**Confidence:** HIGH -- verified by reading the existing `server.ts` which clearly shows the Fastify encapsulation pattern with `publicRoutes` vs `protectedRoutes`

---

### Pitfall 6: Shared Client ID Enables Cross-Client Token Theft

**What goes wrong:** When Dynamic Client Registration returns a single hardcoded Azure AD `client_id` to all MCP clients, all clients share the same OAuth identity. If a user has previously consented to that `client_id`, Azure AD may skip the consent prompt for subsequent authorization requests -- even from a different MCP client. An attacker can register a malicious MCP client, receive the same `client_id` from your `/register` endpoint, and then craft an authorization URL that gets an authorization code without user consent (because the user already consented for a different client).

**Why it happens:** Azure AD consent is bound to the `client_id`, not to the specific MCP client. When all clients share one `client_id`, the consent grant is effectively shared. The MCP server's Dynamic Client Registration endpoint has no way to differentiate legitimate clients from malicious ones.

**Consequences:** One-click account takeover. An attacker sends a victim a link, the victim clicks it, and the attacker receives a valid authorization code for the victim's account.

**Warning signs:**
- Your `/register` endpoint returns the same `client_id` regardless of who calls it
- Azure AD does not show a consent prompt after the first authorization
- No per-client consent tracking at the proxy level

**Prevention:**
1. Implement a consent interstitial page on the MCP server that shows BEFORE redirecting to Azure AD
2. Display the requesting client's name, redirect URI, and requested scopes
3. Use a server-side session (not just the OAuth `state` parameter) to bind the consent to the user who initiated it
4. Consider using `prompt=consent` in the Azure AD authorization URL to force consent every time (user friction tradeoff)
5. Validate that the `redirect_uri` in the token request matches the one from the authorization request
6. If using Client ID Metadata Documents (the newer MCP approach), validate the client metadata document and display the `client_name` to the user

**Detection:** Test the flow with two different MCP clients using the same `client_id`. If the second client gets a token without consent, this vulnerability exists.

**Phase:** Authorization endpoint proxy. This must be considered when implementing the `/authorize` proxy, not deferred.

**Confidence:** HIGH -- verified via [Obsidian Security: MCP OAuth Pitfalls](https://www.obsidiansecurity.com/blog/when-mcp-meets-oauth-common-pitfalls-leading-to-one-click-account-takeover) with documented real-world exploits

---

## Moderate Pitfalls

### Pitfall 7: Redirect URI Port Mismatch with Azure AD Localhost Handling

**What goes wrong:** Claude Desktop/Code uses ephemeral ports for its local callback server (observed ports include 54212, 56619, 57411, 59306, 64236). Azure AD's localhost handling ignores ports for matching purposes -- registering `http://localhost/callback` matches `http://localhost:54212/callback`. However, this behavior has a catch: if you register MULTIPLE localhost redirect URIs with different ports, Azure AD picks one ARBITRARILY and uses its platform type (Web vs SPA vs Native). The wrong platform type causes CORS errors or incorrect token format.

**Why it happens:** Azure AD follows RFC 8252 Section 8.3 for loopback redirects -- the port is ignored. But developers often register multiple localhost URIs "just in case," which triggers Azure AD's arbitrary selection behavior.

**Prevention:**
1. Register exactly ONE localhost redirect URI in Azure AD: `http://localhost/callback` (no port)
2. Set the platform type to "Mobile and desktop applications" (Native) -- this is correct for MCP clients which are native apps, not SPAs
3. Do NOT register `http://localhost:3000/callback` AND `http://localhost:8080/callback` -- only the path matters for differentiation
4. Use `127.0.0.1` instead of `localhost` for robustness (Microsoft recommends this to avoid firewall/DNS issues)
5. The proxy should pass through whatever `redirect_uri` the MCP client provides -- do not rewrite it

**Detection:** Test with multiple MCP client sessions that use different ephemeral ports. All should work. If they intermittently fail with CORS errors, check the Azure AD app registration for duplicate localhost URIs.

**Phase:** Azure AD app registration setup (documentation/configuration phase) and token endpoint proxy (must forward `redirect_uri` faithfully).

**Confidence:** HIGH -- verified via [Microsoft Learn: Redirect URI best practices](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url)

---

### Pitfall 8: Proxy Token Endpoint Leaks Azure AD Error Details to Clients

**What goes wrong:** When Azure AD rejects a token exchange (expired code, PKCE mismatch, invalid redirect_uri), it returns a JSON error with `error`, `error_description`, and sometimes `correlation_id` and `trace_id`. Naively proxying this response verbatim to the MCP client leaks Azure AD internal details: tenant ID, correlation IDs, and AADSTS error codes that reveal the backend provider.

**Why it happens:** The token proxy forwards Azure AD's response body and status code directly without sanitization.

**Prevention:**
1. Map Azure AD error codes to standard OAuth 2.0 error codes:
   - `AADSTS70008` (expired code) -> `{ "error": "invalid_grant", "error_description": "authorization code expired" }`
   - `AADSTS9002325` (PKCE required) -> `{ "error": "invalid_request", "error_description": "code verifier required" }`
   - `AADSTS50011` (redirect URI mismatch) -> `{ "error": "invalid_grant", "error_description": "redirect_uri mismatch" }`
   - `AADSTS70011` (invalid scope) -> `{ "error": "invalid_scope", "error_description": "scope not recognized" }`
2. Log the full Azure AD error server-side (including `correlation_id` and `trace_id`) for debugging
3. Return only standardized OAuth 2.0 error responses to the client
4. Preserve the HTTP status code from Azure AD (typically 400) -- do not convert to 500

**Detection:** Send a deliberately expired authorization code to the `/token` proxy and inspect the response. It should contain generic OAuth errors, not AADSTS codes.

**Phase:** Token endpoint proxy implementation.

**Confidence:** MEDIUM -- this is a security best practice; the exact behavior depends on implementation choices

---

### Pitfall 9: Discovery Document Missing Required Fields for MCP Clients

**What goes wrong:** The `/.well-known/openid-configuration` (or `/.well-known/oauth-authorization-server`) response is missing fields that MCP clients require, causing the auth flow to abort or behave incorrectly.

**Why it happens:** Developers copy Azure AD's discovery document or create a minimal one without checking what MCP clients actually validate.

**Required fields for MCP client compatibility:**

| Field | Required By | Value for Proxy |
|-------|------------|-----------------|
| `issuer` | RFC 8414 | `https://your-mcp-server.com` (the proxy, not Azure AD) |
| `authorization_endpoint` | RFC 8414 | `https://your-mcp-server.com/authorize` |
| `token_endpoint` | RFC 8414 | `https://your-mcp-server.com/token` |
| `registration_endpoint` | MCP spec (if DCR) | `https://your-mcp-server.com/register` |
| `response_types_supported` | RFC 8414 | `["code"]` |
| `grant_types_supported` | RFC 8414 | `["authorization_code", "refresh_token"]` |
| `code_challenge_methods_supported` | MCP spec (MUST) | `["S256"]` |
| `token_endpoint_auth_methods_supported` | RFC 8414 | `["none"]` (public client) |
| `scopes_supported` | RFC 9728 | `["wikijs:read", "wikijs:write", "wikijs:admin", "openid", "profile", "email"]` |

**Key gotcha with `issuer`:** If the proxy's discovery document has `issuer` set to `https://your-mcp-server.com` but the JWT tokens are issued by Azure AD with `iss: https://login.microsoftonline.com/{tenant}/v2.0`, there is a mismatch. This is expected and correct -- the proxy is the authorization server from the MCP client's perspective, but Azure AD is the actual token issuer. The resource server (your existing JWT validation) validates against Azure AD's issuer, not the proxy's. This dual-issuer situation is inherent to the proxy architecture.

**Prevention:**
1. Include ALL fields listed above
2. Set `code_challenge_methods_supported: ["S256"]` explicitly (Pitfall 4)
3. All endpoint URLs MUST point to the proxy server, not Azure AD
4. Include `client_id_metadata_document_supported: true` if supporting Client ID Metadata Documents

**Detection:** Fetch your discovery endpoint and validate every field against the table above. Write a test that does this automatically.

**Phase:** Discovery endpoint implementation (first phase).

**Confidence:** HIGH -- field requirements verified via [MCP Authorization Spec](https://modelcontextprotocol.io/specification/draft/basic/authorization) and [Claude Code issue#2527](https://github.com/anthropics/claude-code/issues/2527)

---

### Pitfall 10: Protected Resource Metadata `authorization_servers` Points to Wrong URL

**What goes wrong:** The existing `/.well-known/oauth-protected-resource` endpoint currently points `authorization_servers` to Azure AD directly: `https://login.microsoftonline.com/{tenant}/v2.0`. When the proxy is added, this must change to point to the MCP server itself (the proxy). If this is not updated, MCP clients will try to use Azure AD directly, bypassing the proxy, and the scope mapping / PKCE / redirect URI transformations will not be applied.

**Why it happens:** The current implementation correctly points to Azure AD because there was no proxy. Adding the proxy changes the architecture -- the MCP server is now its own authorization server from the client's perspective.

**Consequences:** MCP clients bypass the proxy entirely, sending bare scopes directly to Azure AD (which rejects them with AADSTS70011), or sending the `resource` parameter (which Azure AD rejects with AADSTS9010010).

**Warning signs:**
- Clients skip the proxy endpoints entirely
- Azure AD returns scope validation errors
- The proxy endpoints never receive any traffic

**Prevention:**
1. Update `authorization_servers` in `/.well-known/oauth-protected-resource` to point to the MCP server's own URL (e.g., `["https://mcp.example.com"]`)
2. This is a breaking change for any existing clients that hardcoded the Azure AD URL -- but since MCP clients should use discovery, this should be transparent
3. Add a configuration toggle to make this switchable during development/testing

**Detection:** Fetch `/.well-known/oauth-protected-resource` and verify `authorization_servers` contains the MCP server URL, not the Azure AD URL.

**Phase:** Discovery/metadata update phase. Must be coordinated with the first proxy endpoint deployment.

**Confidence:** HIGH -- verified from the existing `public-routes.ts` source code which currently has the Azure AD URL

---

### Pitfall 11: State Parameter Not Bound to Session -- CSRF Vulnerability

**What goes wrong:** The OAuth `state` parameter is supposed to prevent CSRF attacks by binding the authorization request to the client session. In a proxy, there are TWO state parameters: the one from the MCP client to the proxy, and the one from the proxy to Azure AD. If the proxy simply passes through the client's `state` to Azure AD, it loses the ability to validate that the callback came from a legitimate flow it initiated.

**Why it happens:** The proxy is stateless by design (per PROJECT.md constraint: "Token storage/caching -- proxy is stateless, passes tokens through"). But stateless proxies that do not validate state parameters are vulnerable to CSRF and authorization code injection.

**Prevention:**
1. The proxy SHOULD generate its own `state` parameter for the Azure AD request
2. Store a mapping of `proxy_state -> client_state + client_redirect_uri` in a short-lived server-side store (even a simple in-memory map with TTL)
3. When Azure AD calls back, validate the `proxy_state`, look up the original `client_state` and `redirect_uri`, and redirect the client with the original `state`
4. If truly stateless is required: encode the client's state and redirect_uri into the proxy's state (encrypted, not just base64) and validate on callback
5. At minimum, the proxy MUST NOT embed the client's redirect_uri in plaintext in the state parameter (this was the exact attack vector in the Obsidian Security research)

**Detection:** Attempt to replay an authorization callback with a forged state parameter. The proxy should reject it.

**Phase:** Authorization endpoint proxy. Must be implemented alongside the `/authorize` proxy.

**Confidence:** HIGH -- verified via [Obsidian Security: MCP OAuth Pitfalls](https://www.obsidiansecurity.com/blog/when-mcp-meets-oauth-common-pitfalls-leading-to-one-click-account-takeover) describing real-world CSRF exploits via state parameter manipulation

---

## Minor Pitfalls

### Pitfall 12: `offline_access` Scope Missing -- No Refresh Tokens

**What goes wrong:** MCP clients (especially Claude Desktop) expect refresh tokens for long-lived sessions. Azure AD only issues refresh tokens when the `offline_access` scope is included in the authorization request. If the scope mapping logic transforms `wikijs:read` to `api://{client-id}/wikijs:read` but forgets to add `offline_access`, the token response will not include a `refresh_token`, and the client must re-authenticate when the access token expires (typically 1 hour).

**Prevention:**
1. Always include `offline_access` in the scope list forwarded to Azure AD
2. Always include `openid` and `profile` for proper ID token and user info
3. The proxy should ensure these are present even if the MCP client does not request them

**Phase:** Authorization endpoint proxy (scope transformation logic).

**Confidence:** MEDIUM -- standard Azure AD behavior, but whether Claude Desktop handles missing refresh tokens gracefully is not fully documented

---

### Pitfall 13: Discovery Endpoint URL Path Mismatch for Tenant-Specific Issuers

**What goes wrong:** MCP clients follow RFC 8414 Section 3.1 for metadata discovery. For an issuer URL WITH a path component (like `https://mcp.example.com/v1`), clients try:
1. `https://mcp.example.com/.well-known/oauth-authorization-server/v1`
2. `https://mcp.example.com/.well-known/openid-configuration/v1`
3. `https://mcp.example.com/v1/.well-known/openid-configuration`

If the proxy only serves metadata at `/.well-known/openid-configuration` (no path suffix), clients with path-based issuer URLs will fail to discover it.

**Prevention:**
1. Keep the issuer URL simple: `https://mcp.example.com` (no path component)
2. Serve metadata at both `/.well-known/oauth-authorization-server` AND `/.well-known/openid-configuration` for maximum compatibility
3. The MCP spec requires clients to support both -- serve both to be safe

**Phase:** Discovery endpoint implementation.

**Confidence:** MEDIUM -- depends on how the issuer URL is configured

---

### Pitfall 14: Token Proxy Timeout When Azure AD Is Slow

**What goes wrong:** The token exchange request from the proxy to Azure AD has a network round-trip that the direct flow does not. If Azure AD is slow (JWKS cache miss, regional routing, or transient issues), the MCP client's HTTP request to `/token` may time out before the proxy receives Azure AD's response.

**Prevention:**
1. Set a reasonable timeout for the outbound Azure AD request (10-15 seconds)
2. Return a proper OAuth error (`{ "error": "server_error" }`) if the upstream times out, not a generic 500
3. Include `Retry-After` header on timeout responses
4. Log the Azure AD response time for monitoring

**Phase:** Token endpoint proxy implementation.

**Confidence:** LOW -- depends on network conditions and client timeout settings

---

### Pitfall 15: PKCE `code_verifier` Not Forwarded Correctly in Token Proxy

**What goes wrong:** The MCP client sends `code_verifier` in the token request body (form-encoded). The proxy must forward this EXACTLY to Azure AD. If the proxy parses the body as JSON instead of `application/x-www-form-urlencoded`, or if it URL-encodes special characters differently, the PKCE verification fails at Azure AD with `AADSTS9002325`.

**Prevention:**
1. Parse the incoming token request body as `application/x-www-form-urlencoded` (OAuth standard)
2. Forward ALL parameters to Azure AD's token endpoint in the same format
3. Do not re-encode or transform the `code_verifier` -- pass it through verbatim
4. Add integration tests that use a known `code_verifier`/`code_challenge` pair

**Phase:** Token endpoint proxy implementation.

**Confidence:** MEDIUM -- standard proxy behavior, but encoding issues are common in practice

---

### Pitfall 16: Dynamic Client Registration Returns Inconsistent Data

**What goes wrong:** The `/register` endpoint returns a `client_id` and registration metadata. If this response does not match what the discovery document advertises or what Azure AD expects, the client will construct malformed requests. Common mistakes:
- Returning `token_endpoint_auth_method: "client_secret_basic"` when the Azure AD app is a public client (no secret)
- Missing `grant_types` in the registration response
- Returning `redirect_uris` that do not match what the client sent

**Prevention:**
1. The registration response MUST include:
   - `client_id`: the pre-configured Azure AD public client application ID
   - `client_name`: echo back what the client sent (or a default)
   - `redirect_uris`: echo back what the client sent (do NOT restrict these -- Azure AD handles localhost validation)
   - `grant_types`: `["authorization_code", "refresh_token"]`
   - `response_types`: `["code"]`
   - `token_endpoint_auth_method`: `"none"` (public client, no secret)
2. Do NOT return `client_secret` -- the Azure AD app is a public client

**Phase:** Client registration endpoint.

**Confidence:** HIGH -- format requirements verified via MCP spec and [Claude Code issue#2527](https://github.com/anthropics/claude-code/issues/2527)

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Severity | Mitigation |
|-------------|---------------|----------|------------|
| Discovery endpoints | Missing `code_challenge_methods_supported` (Pitfall 4) | Critical | Explicitly include `["S256"]` in proxy discovery doc |
| Discovery endpoints | Missing required fields (Pitfall 9) | Moderate | Validate against required field checklist |
| Discovery endpoints | `authorization_servers` still points to Azure AD (Pitfall 10) | Critical | Update to point to self |
| Authorization proxy | `resource` parameter rejected by Azure AD (Pitfall 1) | Critical | Strip `resource`, encode into `scope` |
| Authorization proxy | Bare scopes rejected by Azure AD (Pitfall 2) | Critical | Transform to `api://{client-id}/scope` format |
| Authorization proxy | Missing `offline_access` (Pitfall 12) | Minor | Always include in forwarded scopes |
| Authorization proxy | CSRF via state parameter (Pitfall 11) | Moderate | Generate proxy state, bind to session |
| Authorization proxy | Shared client ID attack (Pitfall 6) | Critical | Consent interstitial page |
| Token proxy | Error detail leakage (Pitfall 8) | Moderate | Map AADSTS errors to standard OAuth errors |
| Token proxy | PKCE code_verifier encoding (Pitfall 15) | Minor | Forward form body verbatim |
| Token proxy | Timeout handling (Pitfall 14) | Minor | Set upstream timeout, return OAuth error |
| Route registration | Proxy routes require auth (Pitfall 5) | Critical | Register in public scope, not protected scope |
| Client registration | Inconsistent registration response (Pitfall 16) | Minor | Match spec format, `token_endpoint_auth_method: "none"` |
| Client integration | Claude.ai ignores metadata endpoints (Pitfall 3) | Critical | Implement actual proxy endpoints on MCP server |
| Azure AD config | Redirect URI port confusion (Pitfall 7) | Moderate | Register ONE localhost URI, use Native platform |

## Integration Pitfalls Summary

The following pitfalls are specific to adding the proxy without breaking existing functionality:

1. **Pitfall 5** (route registration) is the highest risk for breaking existing JWT validation -- one misplaced `register()` call and the entire protected API becomes inaccessible
2. **Pitfall 10** (authorization_servers field) requires changing existing public endpoint behavior -- this is a backwards-incompatible change to the protected resource metadata
3. **Pitfall 9** (discovery document dual-issuer) means the proxy's discovery says one issuer but the JWT tokens say another -- this is architecturally correct but confusing if not documented
4. The existing `scp` claim parsing in `middleware.ts` (line 85) expects bare scope names like `wikijs:read` -- Azure AD correctly strips the `api://` prefix in the `scp` claim, so this continues to work without changes

## Sources

- [MCP Authorization Specification (draft)](https://modelcontextprotocol.io/specification/draft/basic/authorization) -- MCP auth flow requirements
- [Obsidian Security: MCP OAuth Pitfalls](https://www.obsidiansecurity.com/blog/when-mcp-meets-oauth-common-pitfalls-leading-to-one-click-account-takeover) -- Cross-client token theft via shared client_id
- [anthropics/claude-ai-mcp#82](https://github.com/anthropics/claude-ai-mcp/issues/82) -- Claude.ai ignores authorization_endpoint and token_endpoint from metadata
- [anthropics/claude-code#2527](https://github.com/anthropics/claude-code/issues/2527) -- Azure AD integration complexity with DCR
- [MCP TypeScript SDK#832](https://github.com/modelcontextprotocol/typescript-sdk/issues/832) -- Azure AD missing code_challenge_methods_supported
- [MCP TypeScript SDK#862](https://github.com/modelcontextprotocol/typescript-sdk/issues/862) -- Azure AD workarounds needed for MCP servers
- [IBM/mcp-context-forge#2881](https://github.com/IBM/mcp-context-forge/issues/2881) -- AADSTS9010010 resource+scope conflict
- [Microsoft Learn: Redirect URI best practices](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url) -- Localhost port behavior, platform types
- [Microsoft Learn: Scopes and permissions](https://learn.microsoft.com/en-us/entra/identity-platform/scopes-oidc) -- api:// prefix requirements
- [Microsoft Learn: AADSTS error codes](https://learn.microsoft.com/en-us/entra/identity-platform/reference-error-codes) -- Token endpoint error reference
- [Logto: MCP Auth Spec Review](https://blog.logto.io/mcp-auth-spec-review-2025-03-26) -- Proxy architecture complexity analysis
- [Aaron Parecki: Let's fix OAuth in MCP](https://aaronparecki.com/2025/04/03/15/oauth-for-model-context-protocol) -- MCP OAuth design critique
- [CVE-2025-69196: FastMCP OAuth Proxy token reuse](https://advisories.gitlab.com/pkg/pypi/fastmcp/CVE-2025-69196/) -- Token reuse vulnerability in proxy implementations
- [Microsoft Q&A: OIDC metadata inconsistency](https://learn.microsoft.com/en-us/answers/questions/5576009/oidc-discovery-metadata-inconsistent-across-region) -- Regional code_challenge_methods_supported rollout
