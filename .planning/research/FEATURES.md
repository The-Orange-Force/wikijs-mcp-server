# Feature Landscape: OAuth Authorization Proxy for MCP Server

**Domain:** OAuth 2.1 authorization proxy enabling MCP clients (Claude Desktop, Claude Code) to authenticate against Azure AD without pre-configured client credentials
**Researched:** 2026-03-25
**Overall Confidence:** HIGH

## Context

The wikijs-mcp-server already has:
- JWT validation against Azure AD JWKS using `jose`
- RFC 9728 Protected Resource Metadata at `/.well-known/oauth-protected-resource` (pointing to Azure AD as authorization server)
- Scope enforcement (wikijs:read, wikijs:write, wikijs:admin)
- 401 responses with `WWW-Authenticate` headers including `resource_metadata` URL
- Per-request correlation IDs and structured logging

The problem: Azure AD does not support RFC 7591 Dynamic Client Registration. MCP clients (Claude Desktop, Claude Code) expect to discover an authorization server, dynamically register, then complete an OAuth 2.1 authorization code + PKCE flow. Without a proxy layer, Claude clients cannot authenticate because they have no pre-registered client_id for Azure AD.

The solution: The MCP server itself acts as an OAuth authorization server to MCP clients, proxying all OAuth operations to Azure AD behind the scenes using a pre-registered Azure AD app registration.

---

## Spec Version Landscape (Critical Context)

Two MCP auth spec versions are relevant:

| Spec Version | Architecture | Claude Support | Status |
|---|---|---|---|
| **2025-03-26** | MCP server acts as both authorization server AND resource server | Claude Code + Claude Desktop currently implement this | Active in production clients |
| **2025-06-18** | MCP server is resource server ONLY; authorization server is separate entity discovered via RFC 9728 | Claude Code supports this; Claude Desktop partial | Newer, cleaner architecture |

**Decision for this project:** Target the **2025-03-26 spec** because that is what Claude Desktop currently implements. The proxy endpoints we build will also be forward-compatible with 2025-06-18 because the proxy IS a separate authorization server -- it just happens to be co-located on the same domain. When clients upgrade to 2025-06-18, our `/.well-known/oauth-protected-resource` already points them to the right place.

---

## Feature Landscape

### Table Stakes (Expected -- Missing = Auth Flow Broken)

These features are required for Claude Desktop/Code to complete the OAuth flow. Missing any one of them results in a non-functional authentication flow.

| Feature | Why Expected | Complexity | Depends On |
|---------|--------------|------------|------------|
| **OAuth Authorization Server Metadata** (`/.well-known/oauth-authorization-server`) | MCP clients MUST discover OAuth endpoints via RFC 8414. Claude Code fetches this first. Returns `authorization_endpoint`, `token_endpoint`, `registration_endpoint`, `scopes_supported`, etc. | LOW | Existing `config.ts` for URLs |
| **Dynamic Client Registration** (`POST /register`) | MCP spec says clients and servers SHOULD support RFC 7591 DCR. Claude Code uses DCR when no `--client-id` is pre-configured. The proxy returns the pre-registered Azure AD client_id to all registering clients. | MED | Azure AD app registration (external prereq) |
| **Authorization Endpoint** (`GET /authorize`) | Receives OAuth authorization requests from the browser, maps bare scopes to Azure AD fully-qualified scopes (`wikijs:read` to `api://{client_id}/wikijs:read`), then redirects to Azure AD's `/oauth2/v2.0/authorize`. | MED | Scope mapping logic, Azure AD tenant config |
| **Token Endpoint** (`POST /token`) | Exchanges authorization codes for access tokens by proxying the request to Azure AD's token endpoint. Handles `authorization_code` and `refresh_token` grant types. | MED | Azure AD token endpoint URL construction |
| **Authorization Callback** (`GET /oauth/callback`) | Receives the redirect back from Azure AD after user authenticates. Maps the authorization code back to the original MCP client's redirect_uri and forwards it. | HIGH | Transaction state storage, PKCE relay |
| **Scope Mapping** (bare to fully-qualified) | MCP clients send `wikijs:read`; Azure AD expects `api://{client_id}/wikijs:read`. The proxy must translate scopes in both directions: outbound (to Azure AD) and inbound (in token `scp` claim already works -- Azure AD returns short form). | MED | Existing `SCOPES` constants in `scopes.ts` |
| **PKCE Relay** | Claude clients generate PKCE `code_challenge`. The proxy must relay this to Azure AD's authorize endpoint (Azure AD public clients require PKCE). NOT dual-PKCE -- single pass-through because tokens come from Azure AD, not the proxy. | MED | Understanding of PKCE flow |
| **Updated Protected Resource Metadata** | The existing `/.well-known/oauth-protected-resource` must be updated to point `authorization_servers` to itself (not directly to Azure AD) so Claude discovers the proxy endpoints. | LOW | Existing `public-routes.ts` |

### Differentiators (Not Expected, But Valuable)

Features that improve robustness, developer experience, or forward-compatibility but are not strictly required for the basic auth flow.

| Feature | Value Proposition | Complexity | Depends On |
|---------|-------------------|------------|------------|
| **User Consent Screen** | MCP spec (2025-03-26 Section "Confused Deputy Problem") says proxy servers using static client IDs MUST obtain user consent before forwarding to third-party auth servers. Prevents authorization code theft attacks where an attacker crafts a malicious URL through the proxy. Without this, an attacker who knows the MCP server URL can craft OAuth links that silently grant them tokens. | HIGH | HTML rendering, cookie/state management, security review |
| **Pre-configured Client Credential Support** (`--client-id` / `--callback-port`) | Claude Code supports `--client-id` and `--callback-port` flags to bypass DCR entirely. If the proxy also works with pre-configured credentials, operators can skip DCR registration and hardcode the Azure AD client_id in Claude Code config. This is the simplest path for corporate deployments. | LOW | Already works -- existing JWT validation accepts any valid Azure AD token. The proxy just needs to not break this path. |
| **`authServerMetadataUrl` Override Support** | Claude Code supports `authServerMetadataUrl` in its config to point OAuth metadata discovery at an arbitrary URL. The proxy should return valid metadata at the standard path, but supporting alternate discovery paths is free robustness. | LOW | Standard metadata endpoint handles this |
| **Refresh Token Proxying** | Proxying `refresh_token` grant type through the token endpoint. Azure AD issues refresh tokens for public clients with `offline_access` scope. Long-lived sessions depend on this. | MED | Token endpoint already handles multiple grant types |
| **Health-Check Integration for Azure AD Connectivity** | Extend `/health` to verify Azure AD authorize/token endpoints are reachable, not just Wiki.js API. Useful for diagnosing proxy issues. | LOW | Existing health check pattern |
| **Structured Proxy Logging** | Log all proxy operations (DCR, authorize redirects, token exchanges) with correlation IDs, timing, and user identity -- same observability as existing MCP tool calls. | MED | Existing `requestContext`, `wrapToolHandler` pattern |
| **Forward Compatibility with 2025-06-18 Spec** | Structure proxy endpoints so they can be extracted to a separate service later. Keep proxy routes in their own Fastify plugin. If a client sends RFC 8707 `resource` parameter, pass it through. | LOW | Clean module boundaries |
| **`MCP-Protocol-Version` Header Handling** | The 2025-03-26 spec says clients SHOULD include `MCP-Protocol-Version` header during metadata discovery. The server could use this to return different metadata for different spec versions (future-proofing). | LOW | Header parsing in metadata endpoint |

### Anti-Features (Explicitly Do NOT Build)

Features that would add complexity, create security vulnerabilities, or conflict with the project's architecture. Each has a specific reason for exclusion.

| Anti-Feature | Why Avoid | What To Do Instead |
|---|---|---|
| **Token Issuance / Token Swap** | The 2025-03-26 spec's "Third-Party Authorization" section suggests the proxy should issue its own tokens bound to Azure AD sessions. This requires maintaining a token mapping store, implementing JWT signing, managing token lifecycles, and dramatically increases attack surface. The FastMCP `OAuthProxy` does this but it adds massive complexity. Our server already validates Azure AD tokens directly -- issuing proxy tokens is unnecessary overhead. | Pass through Azure AD tokens directly. The MCP server already validates them via JWKS. Claude receives an Azure AD access token and sends it to POST /mcp, where existing middleware validates it. |
| **Dual-PKCE (Proxy-to-Azure + Client-to-Proxy)** | FastMCP implements two separate PKCE flows (client-to-proxy and proxy-to-upstream). This is needed when the proxy issues its own tokens. Since we pass through Azure AD tokens, we only need to relay the client's PKCE challenge to Azure AD. Adding a second PKCE layer adds complexity for zero security benefit. | Relay the client's `code_challenge` and `code_challenge_method` directly to Azure AD. On callback, forward the authorization code to the client. The client exchanges it at `/token`, which proxies to Azure AD with the client's `code_verifier`. |
| **Client Secret Generation** | Azure AD app registration is configured as a public client (no client_secret). Generating proxy-specific client secrets would create a mismatched security model and confuse the OAuth flow. | Return `token_endpoint_auth_method: "none"` in DCR response. Public client, no secrets. |
| **Per-Client Azure AD App Registration** | Creating a new Azure AD app registration per dynamically registered MCP client would be architecturally correct but operationally impossible -- Azure AD doesn't support programmatic app creation without admin consent, Graph API permissions, and significant provisioning latency. | All DCR clients share the same Azure AD app registration. The proxy returns the same `client_id` to every registering client. |
| **CORS Configuration** | MCP clients are native desktop applications, not browsers. They do not make cross-origin requests. Adding CORS headers creates unnecessary attack surface. | No CORS headers on any proxy endpoint. |
| **Token Caching / Session State Persistence** | Storing tokens server-side creates a stateful service that needs durable storage, encryption at rest, and cleanup. The current architecture is stateless (validate-and-forward). | Proxy is stateless for token storage. Transaction state (during the authorization flow) can be ephemeral in-memory with short TTLs. |
| **OpenID Connect Discovery** (`/.well-known/openid-configuration`) | Some implementations use OIDC discovery. The MCP spec references RFC 8414 (OAuth Authorization Server Metadata), not OpenID Connect. Claude Code uses `/.well-known/oauth-authorization-server`. Adding OIDC discovery creates confusion about which endpoint is authoritative. | Only implement `/.well-known/oauth-authorization-server` per RFC 8414. |
| **Multiple Authorization Server Support** | The 2025-06-18 spec allows multiple authorization servers in Protected Resource Metadata. Our deployment has exactly one: Azure AD (via the proxy). Supporting multiple adds routing complexity for no benefit. | Single authorization server in PRM response. |
| **Browser-Based Admin UI for Client Registration** | Some OAuth servers provide web UIs for managing registered clients. This is unnecessary -- DCR is automated, and any troubleshooting happens via logs. | Use structured logging for registration events. |
| **Rate Limiting on OAuth Endpoints** | Could prevent abuse but adds complexity. The proxy is behind Caddy, which can handle rate limiting at the reverse proxy layer if needed. | Defer to Caddy configuration if rate limiting becomes necessary. |

---

## Feature Dependencies

```
Updated Protected Resource Metadata
  |
  v
OAuth Authorization Server Metadata (/.well-known/oauth-authorization-server)
  |
  +---> Dynamic Client Registration (POST /register)
  |
  +---> Authorization Endpoint (GET /authorize)
  |       |
  |       +---> Scope Mapping (bare -> api://{client_id}/*)
  |       |
  |       +---> PKCE Relay (pass code_challenge to Azure AD)
  |       |
  |       +---> Authorization Callback (GET /oauth/callback)
  |               |
  |               +---> Transaction State (ephemeral, in-memory)
  |
  +---> Token Endpoint (POST /token)
          |
          +---> authorization_code grant (proxy to Azure AD)
          |
          +---> refresh_token grant (proxy to Azure AD)
```

**Critical dependency chain for a single auth flow:**
1. Client hits POST /mcp, gets 401 with `resource_metadata` URL (existing)
2. Client fetches `/.well-known/oauth-protected-resource` (existing, needs update)
3. Client fetches `/.well-known/oauth-authorization-server` (new)
4. Client POSTs to `/register` for DCR (new)
5. Client opens browser to `/authorize` (new)
6. Proxy redirects browser to Azure AD `/oauth2/v2.0/authorize` with mapped scopes (new)
7. User authenticates at Azure AD (external)
8. Azure AD redirects to `/oauth/callback` (new)
9. Proxy redirects browser to client's `redirect_uri` with authorization code (new)
10. Client POSTs to `/token` with code + code_verifier (new)
11. Proxy forwards to Azure AD token endpoint, returns token to client (new)
12. Client sends Bearer token to POST /mcp (existing)

---

## Detailed Feature Analysis

### 1. OAuth Authorization Server Metadata

**What it returns:**
```json
{
  "issuer": "https://mcp.example.com",
  "authorization_endpoint": "https://mcp.example.com/authorize",
  "token_endpoint": "https://mcp.example.com/token",
  "registration_endpoint": "https://mcp.example.com/register",
  "scopes_supported": ["wikijs:read", "wikijs:write", "wikijs:admin"],
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "token_endpoint_auth_methods_supported": ["none"],
  "code_challenge_methods_supported": ["S256"]
}
```

**Key design decisions:**
- `issuer` is the MCP server's own URL (MCP_RESOURCE_URL), not Azure AD
- Scopes are bare names (not `api://` prefixed) -- scope mapping happens internally
- `token_endpoint_auth_methods_supported: ["none"]` because Azure AD app is a public client
- S256 is the only PKCE method (Azure AD requires it, SHA256 is the standard)

**Confidence:** HIGH -- directly from MCP spec RFC 8414 requirements

### 2. Dynamic Client Registration

**What it accepts and returns:**
```json
// Request from Claude Code
POST /register
{
  "client_name": "Claude Code",
  "redirect_uris": ["http://localhost:54212/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none"
}

// Response from proxy
{
  "client_id": "<azure-ad-client-id>",
  "client_name": "Claude Code",
  "redirect_uris": ["http://localhost:54212/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none"
}
```

**Key design decisions:**
- Returns the same Azure AD `client_id` to every registering client
- Does NOT return a `client_secret` (public client)
- Stores the redirect_uri for validation during the authorize step (ephemeral, in-memory)
- Validates redirect_uris: must be `http://localhost:*` or `http://127.0.0.1:*`

**Azure AD localhost behavior (HIGH confidence, from Microsoft docs):**
Azure AD ignores the port component for localhost redirect URIs. Register `http://localhost/callback` in the Azure AD app registration, and Azure AD will accept `http://localhost:54212/callback`, `http://localhost:8080/callback`, etc. This is critical because Claude Code uses ephemeral ports.

**Confidence:** HIGH -- RFC 7591 is well-specified, Azure AD localhost behavior verified from Microsoft docs

### 3. Scope Mapping

**Mapping rules:**
| Client sends | Proxy sends to Azure AD | Direction |
|---|---|---|
| `wikijs:read` | `api://{AZURE_CLIENT_ID}/wikijs:read` | Outbound (authorize/token) |
| `wikijs:write` | `api://{AZURE_CLIENT_ID}/wikijs:write` | Outbound (authorize/token) |
| `wikijs:admin` | `api://{AZURE_CLIENT_ID}/wikijs:admin` | Outbound (authorize/token) |
| `offline_access` | `offline_access` | Pass-through (OIDC standard scope) |
| `openid` | `openid` | Pass-through (OIDC standard scope) |

**OIDC scopes (openid, profile, email, offline_access) are NEVER prefixed** -- they are standard scopes handled by Azure AD directly. Only custom API scopes get the `api://` prefix.

**Token response scopes:** Azure AD returns scopes in the `scp` claim as short form (`wikijs:read wikijs:write`) even though they were requested in fully-qualified form. The existing JWT validation middleware already parses `scp` correctly, so no mapping is needed on the inbound side.

**Confidence:** HIGH -- verified from Azure AD docs and existing middleware code

### 4. Authorization Flow (Authorize + Callback)

**Authorize endpoint flow:**
1. Receive `GET /authorize?response_type=code&client_id=X&redirect_uri=Y&scope=Z&state=S&code_challenge=C&code_challenge_method=S256`
2. Validate `client_id` matches Azure AD client_id
3. Validate `redirect_uri` is a registered localhost URI
4. Map bare scopes to fully-qualified Azure AD scopes
5. Generate a transaction ID, store `{state, redirect_uri, code_challenge, code_challenge_method}` in memory
6. Redirect browser to `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize` with mapped scopes, proxy's own callback URL, and a new `state` parameter that encodes the transaction ID
7. Azure AD shows login page, user authenticates

**Callback endpoint flow:**
1. Receive `GET /oauth/callback?code=X&state=Y` from Azure AD redirect
2. Look up transaction by state parameter
3. Redirect browser to original client `redirect_uri` with the Azure AD authorization code and the original client state

**Why this works:** The authorization code from Azure AD is bound to the `redirect_uri` used in the authorize request. When the client exchanges the code at `/token`, the proxy forwards to Azure AD's token endpoint with the proxy's callback URL as `redirect_uri` (because that is what Azure AD expects). This is the key architectural insight -- the proxy's callback URL is the registered redirect_uri with Azure AD, not the client's localhost URL.

**Transaction state:** Must be stored in memory between the authorize redirect and the callback. TTL of 10 minutes (authorization codes expire in 10 minutes at Azure AD). A `Map<string, Transaction>` with periodic cleanup is sufficient. No persistence needed -- if the server restarts during an auth flow, the user simply re-authenticates (rare and acceptable).

**Confidence:** HIGH for the general pattern; MEDIUM for exact Azure AD `redirect_uri` matching behavior during code exchange

### 5. Token Endpoint

**Authorization code exchange:**
```
POST /token
grant_type=authorization_code
&code=<azure-ad-auth-code>
&redirect_uri=<proxy-callback-url>
&client_id=<azure-ad-client-id>
&code_verifier=<pkce-verifier>
```

The proxy forwards this to `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token` and returns the response directly. The key detail: `redirect_uri` must match what was sent to the authorize endpoint -- which is the proxy's callback URL, not the client's localhost URL.

**Refresh token exchange:**
```
POST /token
grant_type=refresh_token
&refresh_token=<refresh-token>
&client_id=<azure-ad-client-id>
&scope=<requested-scopes>
```

Forward to Azure AD, return response. Scope mapping applies (bare to fully-qualified).

**Confidence:** HIGH

---

## MVP Recommendation

**Priority order for implementation:**

1. **OAuth Authorization Server Metadata** (`/.well-known/oauth-authorization-server`) -- enables discovery, LOW complexity, unblocks everything else
2. **Updated Protected Resource Metadata** -- point `authorization_servers` to self, LOW complexity, required for clients to find the proxy
3. **Dynamic Client Registration** (`POST /register`) -- returns static Azure AD client_id, MED complexity, unblocks the auth flow
4. **Authorization + Callback Endpoints** -- the core proxy flow, HIGH complexity, this is the main work
5. **Token Endpoint** (`POST /token`) -- proxies code exchange and refresh, MED complexity, completes the flow
6. **Scope Mapping** -- implemented within authorize and token endpoints, not a separate feature

**Defer to post-MVP:**
- **User Consent Screen**: Important for security but not required for the basic flow to work. The attack it prevents (authorization code theft via crafted URLs) requires an attacker to know the MCP server URL AND the Azure AD app to have pre-authorized the client. In a corporate Azure AD tenant, apps are not pre-authorized by default. Add this as a hardening phase after the basic flow is verified end-to-end with Claude Desktop.
- **Structured Proxy Logging**: Valuable but can be added after the basic flow works.
- **Health-Check Integration for Azure AD**: Nice-to-have, not blocking.

---

## Client Compatibility Matrix

| Client | Transport | OAuth Discovery | DCR | Pre-configured Creds | Spec Version |
|--------|-----------|----------------|-----|---------------------|--------------|
| Claude Code CLI | HTTP | `/.well-known/oauth-authorization-server` | Yes (default) | Yes (`--client-id`, `--callback-port`) | 2025-03-26 + 2025-06-18 |
| Claude Desktop (web) | HTTP | `/.well-known/oauth-authorization-server` | Inconsistent (may skip DCR) | Limited | 2025-03-26 mostly |
| Claude.ai (web connectors) | HTTP | Uses `https://claude.ai/api/mcp/auth_callback` | Backend-driven | N/A | Varies |
| VS Code + Copilot | HTTP | RFC 9728 PRM directly | No (uses PRM) | Pre-configured | 2025-06-18 |
| Cursor IDE | HTTP | Similar to Claude Code | Yes | Yes | 2025-03-26 |

**Primary target:** Claude Code CLI with DCR (most common path for this project's users)
**Secondary target:** Claude Code CLI with `--client-id` + `--callback-port` (simpler, no DCR needed)

**Confidence:** MEDIUM -- client behavior varies between versions and is actively evolving

---

## Azure AD Prerequisites (External Configuration)

These are NOT features to build but external configuration required before the proxy can work:

| Prerequisite | Details | Who Configures |
|---|---|---|
| **Azure AD App Registration** | Single-tenant, public client, with `api://{client_id}` identifier URI | Azure AD admin |
| **API Scopes Defined** | `api://{client_id}/wikijs:read`, `wikijs:write`, `wikijs:admin` under "Expose an API" | Azure AD admin |
| **Localhost Redirect URI** | `http://localhost/callback` registered under "Mobile and desktop applications" platform | Azure AD admin |
| **Access Token v2** | `requestedAccessTokenVersion: 2` in app manifest | Azure AD admin |
| **Public Client Flow Enabled** | "Allow public client flows" = Yes in app registration | Azure AD admin |

**New env var needed:** None additional. The existing `AZURE_TENANT_ID` and `AZURE_CLIENT_ID` are sufficient to construct all Azure AD URLs. The proxy callback URL is derived from `MCP_RESOURCE_URL`.

**Confidence:** HIGH -- standard Azure AD configuration, verified from Microsoft docs

---

## Sources

### Authoritative (HIGH confidence)
- [MCP Spec 2025-03-26 Authorization](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization) -- defines all MUST/SHOULD/MAY requirements for proxy pattern
- [MCP Spec 2025-06-18 Authorization](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization) -- newer spec separating resource server from auth server
- [RFC 7591 - Dynamic Client Registration](https://datatracker.ietf.org/doc/html/rfc7591) -- DCR protocol
- [Azure AD Redirect URI Rules](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url) -- localhost port-agnostic matching, HTTPS requirements
- [Claude Code MCP Docs](https://code.claude.com/docs/en/mcp) -- `--callback-port`, `--client-id`, `authServerMetadataUrl`

### Verified (MEDIUM confidence)
- [Logto MCP Auth Spec Review](https://blog.logto.io/mcp-auth-spec-review-2025-03-26) -- analysis of dual-role architecture and proxy patterns
- [FastMCP OAuth Proxy Architecture](https://deepwiki.com/punkpeye/fastmcp/8.3-oauth-proxy) -- reference implementation of DCR + token swap proxy
- [FastMCP Azure Integration](https://gofastmcp.com/integrations/azure) -- scope mapping, AzureProvider pattern
- [Aaron Parecki - OAuth for MCP](https://aaronparecki.com/2025/04/03/15/oauth-for-model-context-protocol) -- architectural critique and RFC 9728 proposal
- [GitHub Issue #205 - MCP as Resource Server](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/205) -- community discussion that led to 2025-06-18 changes
- [Microsoft ISE - MCP Server with Azure AD](https://devblogs.microsoft.com/ise/aca-secure-mcp-server-oauth21-azure-ad/) -- enterprise deployment patterns

### Community (LOW confidence, needs validation)
- [Claude Code Issue #2527 - Azure AD DCR](https://github.com/anthropics/claude-code/issues/2527) -- ephemeral port behavior, redirect_uri issues
- [MCP Auth Consent Discussion #265](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/265) -- consent screen attack scenarios
- [Obsidian Security - MCP OAuth Pitfalls](https://www.obsidiansecurity.com/blog/when-mcp-meets-oauth-common-pitfalls-leading-to-one-click-account-takeover) -- confused deputy attacks in MCP
