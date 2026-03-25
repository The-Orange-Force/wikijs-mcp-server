# Architecture Patterns: OAuth Authorization Proxy

**Domain:** OAuth 2.1 Authorization Proxy for MCP Server with Azure AD
**Researched:** 2026-03-25
**Overall confidence:** HIGH (verified against MCP SDK source code, MCP spec, Azure AD endpoints, and Claude client issue reports)

## Recommended Architecture

### Decision: Custom Fastify Proxy Routes (Not MCP SDK Auth Router)

The MCP TypeScript SDK (`@modelcontextprotocol/sdk ^1.27.1`) includes `mcpAuthRouter` and `ProxyOAuthServerProvider` -- a pre-built Express-based auth router with proxy support. **Do NOT use them** for this project because:

1. **Express dependency:** The SDK auth router is built on Express (`express.Router()`, `express-rate-limit`, `cors`). This project uses Fastify. Using `@fastify/express` to bridge would add complexity, break Fastify's encapsulation model, and create an awkward hybrid.

2. **The proxy logic is simple:** `ProxyOAuthServerProvider` is ~150 lines. It does three things: redirect `/authorize` to Azure AD, POST `/token` to Azure AD's token endpoint, and POST `/register` to an upstream registration URL. Writing equivalent Fastify handlers is straightforward.

3. **Better control over scope mapping:** Azure AD requires fully-qualified scopes (`api://{client_id}/wikijs:read`), but MCP clients send bare scopes (`wikijs:read`). The SDK's proxy provider passes scopes through unchanged. We need a transformation layer.

4. **Better control over client registration:** Azure AD does not support Dynamic Client Registration (RFC 7591). Our `/register` endpoint returns a pre-configured Azure AD `client_id`. The SDK's `registerClient` proxies to an upstream URL, which does not exist in our case.

5. **Consistency:** All existing routes use Fastify plugins. Adding Express middleware would break the architectural pattern.

### Architecture: Single Fastify Plugin for OAuth Proxy

```
                        MCP Client (Claude Desktop / Claude Code)
                                      |
                    1. GET /.well-known/oauth-protected-resource
                                      |
                                      v
                          +-------------------+
                          |   Public Routes   |  (existing plugin, MODIFIED)
                          |  oauth-protected- |
                          |  resource now      |
                          |  points to SELF   |
                          +-------------------+
                                      |
                    2. GET /.well-known/openid-configuration
                    3. POST /register
                    4. GET /authorize
                    5. POST /token
                                      |
                                      v
                          +-------------------+
                          | OAuth Proxy Routes|  (NEW plugin, public/unauthenticated)
                          |  src/routes/      |
                          |  oauth-proxy.ts   |
                          +-------------------+
                                 |         |
                          redirect    HTTP POST
                          (302)       (fetch)
                                 |         |
                                 v         v
                          +-------------------+
                          |   Azure AD v2.0   |
                          | login.microsoft   |
                          | online.com/{tid}  |
                          +-------------------+
                                      |
                          tokens issued by Azure AD
                                      |
                                      v
                          +-------------------+
                          | Protected Routes  |  (existing plugin, UNCHANGED)
                          |  POST /mcp        |
                          |  JWT validation   |
                          +-------------------+
```

### CRITICAL: Endpoint Path Selection

**Use root-level paths: `/authorize`, `/token`, `/register` -- NOT `/oauth/authorize`, `/oauth/token`, `/oauth/register`.**

Per GitHub issue [#82](https://github.com/anthropics/claude-ai-mcp/issues/82), Claude.ai (web) ignores `authorization_endpoint` and `token_endpoint` from metadata and instead constructs `/authorize`, `/token`, `/register` by appending to the server's base URL. This is the 2025-03-26 MCP spec behavior. Claude Code CLI follows the newer draft spec and respects metadata. Our server is at the domain root, so root-level paths satisfy both clients.

| MCP Spec Version | Client Behavior | Root paths work? | `/oauth/*` paths work? |
|-----------------|-----------------|-------------------|----------------------|
| 2025-03-26 | Constructs from base URL: `/authorize`, `/token`, `/register` | YES | NO -- client looks for `/authorize`, gets 404 |
| Draft (2025-06+) | Uses metadata endpoints | YES | YES (if metadata advertises them) |
| Claude.ai (web) | Follows 2025-03-26 behavior | YES | NO |
| Claude Code CLI | Follows draft spec | YES | YES |

Root-level paths are the only option that works with ALL clients.

## Component Boundaries

| Component | Responsibility | Communicates With | New/Modified |
|-----------|---------------|-------------------|--------------|
| `src/routes/oauth-proxy.ts` | OAuth proxy endpoints (metadata, register, authorize, token) | Azure AD via `fetch()` | **NEW** |
| `src/oauth/scope-mapper.ts` | Bare scope <-> fully-qualified scope translation | Called by oauth-proxy | **NEW** |
| `src/oauth/azure-endpoints.ts` | Azure AD endpoint URL construction from tenant ID | Called by oauth-proxy | **NEW** |
| `src/routes/public-routes.ts` | `.well-known/oauth-protected-resource` now points to self | N/A | **MODIFIED** |
| `src/config.ts` | No new env vars needed | N/A | **UNCHANGED** |
| `src/routes/mcp-routes.ts` | POST /mcp with JWT validation | N/A | **UNCHANGED** |
| `src/auth/middleware.ts` | JWT validation against Azure JWKS | N/A | **UNCHANGED** |
| `src/server.ts` | Register new oauthProxyRoutes plugin | N/A | **MODIFIED** (small addition) |
| `tests/helpers/build-test-app.ts` | Register oauthProxyRoutes in test app | N/A | **MODIFIED** (small addition) |

## Data Flow for Each OAuth Endpoint

### 1. Protected Resource Metadata (MODIFIED existing route)

**Path:** `GET /.well-known/oauth-protected-resource`
**Auth:** None (public)
**Change:** `authorization_servers` value changes from Azure AD URL to self (MCP server URL).

```
BEFORE:
  authorization_servers: ["https://login.microsoftonline.com/{tenantId}/v2.0"]

AFTER:
  authorization_servers: ["https://{MCP_RESOURCE_URL}"]
```

**Why:** MCP clients use this to discover where to authenticate. When pointing to self, the client will fetch `/.well-known/openid-configuration` from OUR server (not Azure AD), which lets us proxy the flow.

**Impact on existing flow:** Claude Code CLI and VS Code currently follow `authorization_servers` directly to Azure AD. After this change, they will hit our proxy instead. This is the correct behavior per the MCP spec's proxy pattern. The existing JWT validation (`src/auth/middleware.ts`) continues to validate Azure AD tokens unchanged because Azure AD still issues the tokens.

**Risk:** If MCP clients have cached the old metadata pointing to Azure AD, they may continue hitting Azure AD directly. The `Cache-Control: public, max-age=3600` header means caches expire within 1 hour. Consider reducing to `max-age=300` during rollout.

### 2. Authorization Server Metadata (NEW)

**Paths:** `GET /.well-known/openid-configuration` AND `GET /.well-known/oauth-authorization-server`
**Auth:** None (public)
**Cache:** `Cache-Control: public, max-age=3600`

MCP clients discover OAuth endpoints here. Both paths return the same JSON document. Serve both because the MCP draft spec requires clients to try them in priority order:
1. `/.well-known/oauth-authorization-server` (RFC 8414)
2. `/.well-known/openid-configuration` (OIDC Discovery 1.0)

```json
{
  "issuer": "https://{MCP_RESOURCE_URL}",
  "authorization_endpoint": "https://{MCP_RESOURCE_URL}/authorize",
  "token_endpoint": "https://{MCP_RESOURCE_URL}/token",
  "registration_endpoint": "https://{MCP_RESOURCE_URL}/register",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["none"],
  "scopes_supported": ["wikijs:read", "wikijs:write", "wikijs:admin"]
}
```

**Issuer value:** `MCP_RESOURCE_URL` (our server), NOT Azure AD. We are presenting ourselves as the authorization server to MCP clients. The actual tokens come from Azure AD, but the client interacts with us.

### 3. Dynamic Client Registration (NEW)

**Path:** `POST /register`
**Auth:** None (public, rate-limited)
**Rate limit:** 20 requests/hour per IP (recommended)

Azure AD does NOT support Dynamic Client Registration. Our endpoint returns a pre-configured Azure AD `client_id` to any client that registers.

```
Request:
POST /register
Content-Type: application/json
{
  "client_name": "Claude Code",
  "redirect_uris": ["http://localhost:54212/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none"
}

Response:
201 Created
{
  "client_id": "{AZURE_CLIENT_ID}",
  "client_name": "Claude Code",
  "redirect_uris": ["http://localhost:54212/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none"
}
```

**Key design decisions:**
- Returns the SAME `client_id` (Azure AD app registration) for ALL registrations
- Does NOT store registrations -- stateless facade
- Validates request body with Zod
- Does NOT return `client_secret` -- Azure AD app is a public client (PKCE-only)

**Azure AD prerequisite:** The Azure AD app registration MUST be configured as a public client with "Allow public client flows" enabled and mobile/desktop platform type configured with `http://localhost` redirect URI (matches any port).

### 4. Authorization Endpoint (NEW)

**Path:** `GET /authorize`
**Auth:** None (public)
**Action:** HTTP 302 redirect to Azure AD

The client sends an authorization request. Our proxy transforms it and redirects to Azure AD.

```
Incoming from MCP client:
GET /authorize?
  response_type=code&
  client_id={AZURE_CLIENT_ID}&
  redirect_uri=http://localhost:54212/callback&
  code_challenge={challenge}&
  code_challenge_method=S256&
  state={state}&
  scope=wikijs:read+wikijs:write

Outgoing redirect to Azure AD:
302 Location: https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/authorize?
  response_type=code&
  client_id={AZURE_CLIENT_ID}&
  redirect_uri=http://localhost:54212/callback&
  code_challenge={challenge}&
  code_challenge_method=S256&
  state={state}&
  scope=api://{AZURE_CLIENT_ID}/wikijs:read+api://{AZURE_CLIENT_ID}/wikijs:write+openid+offline_access
```

**Scope mapping (critical):**
- MCP clients send bare scopes: `wikijs:read`, `wikijs:write`, `wikijs:admin`
- Azure AD expects fully-qualified: `api://{client_id}/wikijs:read`
- Always append `openid` and `offline_access` (required for refresh tokens)
- OIDC standard scopes (`openid`, `profile`, `email`, `offline_access`) pass through unchanged
- Filter out unknown scopes before mapping
- Pass `resource` parameter through if present (RFC 8707)

**Why redirect (not proxy)?** The authorization endpoint requires user interaction (login page, MFA, consent screen). The user's browser MUST navigate to Azure AD directly. A server-side proxy would break the user flow.

### 5. Token Endpoint (NEW)

**Path:** `POST /token`
**Auth:** None (public)
**Action:** Server-side HTTP POST to Azure AD, returns response

The token endpoint is a true server-side proxy. The MCP client sends a token request to us, we forward it to Azure AD, and return the response.

```
Incoming from MCP client:
POST /token
Content-Type: application/x-www-form-urlencoded
grant_type=authorization_code&
client_id={AZURE_CLIENT_ID}&
code={auth_code}&
code_verifier={verifier}&
redirect_uri=http://localhost:54212/callback

Outgoing to Azure AD:
POST https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token
Content-Type: application/x-www-form-urlencoded
grant_type=authorization_code&
client_id={AZURE_CLIENT_ID}&
code={auth_code}&
code_verifier={verifier}&
redirect_uri=http://localhost:54212/callback&
scope=api://{AZURE_CLIENT_ID}/wikijs:read+api://{AZURE_CLIENT_ID}/wikijs:write+openid+offline_access

Response from Azure AD (passed through verbatim):
200 OK
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "0.ARo...",
  "scope": "api://{client_id}/wikijs:read api://{client_id}/wikijs:write"
}
```

**Two grant types to proxy:**

| Grant Type | When Used | Key Parameters |
|------------|-----------|----------------|
| `authorization_code` | Initial token exchange | `code`, `code_verifier`, `redirect_uri`, `scope` (mapped) |
| `refresh_token` | Token renewal | `refresh_token`, `scope` (mapped if present) |

**HTTP client:** Node.js built-in `fetch()` (Node 20+). No additional HTTP library needed.

**Error handling:** Azure AD error responses MUST be forwarded to the client with the same status code and body. Do not swallow or transform Azure AD errors -- the client needs them for error recovery.

## File Layout

### New Files

```
src/
  routes/
    oauth-proxy.ts        # Fastify plugin: all OAuth proxy endpoints
  oauth/
    scope-mapper.ts       # mapToAzureScopes() / mapFromAzureScopes()
    azure-endpoints.ts    # azureAuthorizeUrl() / azureTokenUrl() from tenantId
tests/
  oauth-proxy.test.ts     # Integration tests for all proxy endpoints
  oauth/
    scope-mapper.test.ts  # Unit tests for scope mapping
```

### Modified Files

```
src/
  routes/public-routes.ts    # authorization_servers points to self
  server.ts                  # Register oauthProxyRoutes plugin
tests/
  helpers/build-test-app.ts  # Register oauthProxyRoutes in test app
```

## Patterns to Follow

### Pattern 1: Fastify Encapsulated Plugin (same as existing routes)

**What:** OAuth proxy routes as a standard Fastify plugin, registered in `server.ts` alongside `publicRoutes` and `protectedRoutes`.
**When:** Always -- this is how the codebase works.

```typescript
// src/routes/oauth-proxy.ts
import type { FastifyInstance } from "fastify";
import formbody from "@fastify/formbody";
import type { AppConfig } from "../config.js";

export interface OAuthProxyOptions {
  appConfig: AppConfig;
  fetchFn?: typeof fetch; // Dependency injection for testability
}

export async function oauthProxyRoutes(
  fastify: FastifyInstance,
  opts: OAuthProxyOptions,
): Promise<void> {
  const { appConfig, fetchFn = fetch } = opts;

  // Scoped to this plugin only -- does not affect /mcp
  await fastify.register(formbody);

  // GET /.well-known/openid-configuration
  fastify.get("/.well-known/openid-configuration", ...);

  // GET /.well-known/oauth-authorization-server (same response)
  fastify.get("/.well-known/oauth-authorization-server", ...);

  // POST /register
  fastify.post("/register", ...);

  // GET /authorize
  fastify.get("/authorize", ...);

  // POST /token
  fastify.post("/token", ...);
}
```

```typescript
// src/server.ts (addition)
import { oauthProxyRoutes } from "./routes/oauth-proxy.js";

// In buildApp():
server.register(oauthProxyRoutes, { appConfig });
```

### Pattern 2: Scope Mapping as Pure Function

**What:** Stateless scope transformation, easily testable.
**When:** Authorization and token endpoints need to translate scopes.

```typescript
// src/oauth/scope-mapper.ts
import { SUPPORTED_SCOPES } from "../scopes.js";

const OIDC_SCOPES = new Set(["openid", "profile", "email", "offline_access"]);

export function mapToAzureScopes(
  bareScopes: string[],
  clientId: string,
): string[] {
  const mapped = bareScopes
    .filter(s => s.length > 0)
    .map(s => OIDC_SCOPES.has(s) ? s : `api://${clientId}/${s}`)
    .filter(s => {
      // Only allow known app scopes + OIDC scopes
      const bare = s.startsWith(`api://${clientId}/`)
        ? s.slice(`api://${clientId}/`.length)
        : s;
      return OIDC_SCOPES.has(bare) || SUPPORTED_SCOPES.includes(bare);
    });

  // Always include openid and offline_access for Azure AD
  return [...new Set([...mapped, "openid", "offline_access"])];
}

export function mapFromAzureScopes(
  azureScopes: string,
  clientId: string,
): string[] {
  const prefix = `api://${clientId}/`;
  return azureScopes
    .split(" ")
    .filter(s => s.startsWith(prefix))
    .map(s => s.slice(prefix.length));
}
```

### Pattern 3: Zod Validation for Incoming OAuth Requests

**What:** Validate all incoming OAuth parameters with Zod schemas, matching existing project pattern.
**When:** Every proxy endpoint validates its input.

```typescript
const AuthorizeQuerySchema = z.object({
  response_type: z.literal("code"),
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  code_challenge: z.string().min(1),
  code_challenge_method: z.literal("S256"),
  state: z.string().optional(),
  scope: z.string().optional(),
  resource: z.string().url().optional(),
});

const TokenBodySchema = z.object({
  grant_type: z.enum(["authorization_code", "refresh_token"]),
  client_id: z.string().min(1),
  code: z.string().optional(),
  code_verifier: z.string().optional(),
  redirect_uri: z.string().optional(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
});

const ClientRegistrationSchema = z.object({
  client_name: z.string().optional(),
  redirect_uris: z.array(z.string().url()),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  token_endpoint_auth_method: z.string().optional(),
});
```

### Pattern 4: Dependency Injection for Testability

**What:** Accept an optional `fetchFn` in plugin options so tests can inject a mock.
**When:** Token endpoint calls Azure AD -- tests should not make real HTTP calls.

```typescript
// In tests:
const mockFetch = async (url: string | URL | Request, init?: RequestInit) => {
  return new Response(JSON.stringify({
    access_token: "mock-token",
    token_type: "Bearer",
    expires_in: 3600,
  }), { status: 200, headers: { "Content-Type": "application/json" } });
};

server.register(oauthProxyRoutes, {
  appConfig,
  fetchFn: mockFetch,
});
```

### Pattern 5: Token Proxy with fetch()

**What:** Use Node.js native `fetch()` for server-to-server HTTP calls to Azure AD.
**When:** Token endpoint proxying.

```typescript
const response = await fetchFn(azureTokenUrl(tenantId), {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: params.toString(),
});

const data = await response.json();
return reply.code(response.status).send(data);
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Using MCP SDK's Express-based Auth Router

**What:** Importing `mcpAuthRouter` from `@modelcontextprotocol/sdk/server/auth/router.js` and using `@fastify/express` to mount it.
**Why bad:** Introduces Express as a runtime dependency, breaks Fastify encapsulation (hooks, decorators, error handling), creates a franken-framework. The auth router also pulls in `express-rate-limit`, `cors`, `zod/v4`, and `pkce-challenge`.
**Instead:** Write equivalent Fastify route handlers directly.

### Anti-Pattern 2: Storing Client Registrations

**What:** Persisting dynamic client registrations in a database or in-memory store.
**Why bad:** All registrations return the same Azure AD `client_id`. Storing them adds state management complexity with zero value.
**Instead:** Stateless registration endpoint that always returns the pre-configured `client_id`.

### Anti-Pattern 3: Token Issuance (MCP Server as Full Authorization Server)

**What:** Having the MCP server issue its own tokens bound to Azure AD sessions (the "third-party authorization flow" from the MCP spec where the server maintains token-to-token mapping).
**Why bad:** Requires session storage, token signing keys, token lifecycle management, and doubles the attack surface. PROJECT.md explicitly states "server is a resource server only, Azure AD issues tokens."
**Instead:** Pure proxy pattern. Azure AD issues tokens directly. Our server validates them using the existing JWKS flow. The tokens are Azure AD JWTs end-to-end.

### Anti-Pattern 4: Using MSAL for Token Proxying

**What:** Using `@azure/msal-node` to acquire tokens on behalf of MCP clients.
**Why bad:** MSAL abstracts the HTTP layer, making it impossible to pass through exact client parameters (redirect_uri, state, PKCE). MSAL wants to manage the auth flow itself -- the proxy needs to control individual parameters.
**Instead:** Direct `fetch()` calls to Azure AD endpoints with explicit parameter construction.

### Anti-Pattern 5: Using /oauth/* Subpaths

**What:** Mounting proxy endpoints at `/oauth/authorize`, `/oauth/token`, `/oauth/register`.
**Why bad:** Claude.ai (web) constructs fallback URLs as `/authorize`, `/token`, `/register` from the base URL (issue #82). Using `/oauth/*` paths breaks Claude.ai compatibility. Claude Code CLI would work fine (reads metadata), but supporting both requires root paths.
**Instead:** Mount at `/authorize`, `/token`, `/register` directly.

### Anti-Pattern 6: Validating PKCE on the Proxy

**What:** Verifying `code_challenge` and `code_verifier` on the proxy server before forwarding to Azure AD.
**Why bad:** Double validation adds complexity and can mask Azure AD's actual error messages. The proxy is not the authorization server.
**Instead:** Pass PKCE parameters through unchanged. Azure AD validates them.

### Anti-Pattern 7: Transparent Reverse Proxying

**What:** Using `@fastify/http-proxy` or `@fastify/reply-from` to transparently forward requests to Azure AD.
**Why bad:** The proxy must transform request bodies (scope mapping, client_id substitution). Transparent proxying passes requests unchanged. Trying to modify requests in hooks fights the library's design.
**Instead:** Receive request, construct new request with transformed parameters, send via `fetch()`, return response.

## Integration with Existing Architecture

### Plugin Registration Order (server.ts)

```typescript
// 1. Global onRequest hook (x-request-id) -- existing, unchanged
server.addHook("onRequest", ...);

// 2. Public routes (/, /health, /.well-known/oauth-protected-resource) -- existing, modified
server.register(publicRoutes, { wikiJsApi, appConfig });

// 3. OAuth proxy routes (new, public/unauthenticated)
server.register(oauthProxyRoutes, { appConfig });

// 4. Protected MCP routes (POST /mcp) -- existing, unchanged
server.register(protectedRoutes, { wikiJsApi, auth: { ... } });
```

### Config: No New Environment Variables

All required values already exist:

| Existing Var | Used By Proxy For |
|-------------|-------------------|
| `AZURE_TENANT_ID` | Constructing Azure AD endpoint URLs (`login.microsoftonline.com/{tenantId}/oauth2/v2.0/...`) |
| `AZURE_CLIENT_ID` | Scope qualification prefix (`api://{client_id}/...`), registration response value |
| `MCP_RESOURCE_URL` | Metadata `issuer`, endpoint URL construction (`{MCP_RESOURCE_URL}/authorize`) |

### New Dependency: @fastify/formbody

The `/token` endpoint receives `application/x-www-form-urlencoded` bodies (per OAuth spec). Fastify does not parse form bodies by default. Install `@fastify/formbody` and register it INSIDE the `oauthProxyRoutes` plugin (scoped, not global) to avoid affecting `/mcp` which expects JSON.

## Suggested Build Order (Phase Dependencies)

```
Phase 1: Scope Mapper + Azure Endpoints (foundation)
  Files: src/oauth/scope-mapper.ts, src/oauth/azure-endpoints.ts
  Tests: tests/oauth/scope-mapper.test.ts
  Dependencies: None
  Rationale: Pure functions, zero external deps, needed by Phases 3+4

Phase 2: Metadata + Registration Endpoints
  Files: src/routes/oauth-proxy.ts (partial: metadata + register routes)
  Tests: tests/oauth-proxy.test.ts (partial)
  Dependencies: Phase 1 (scopes_supported list from SUPPORTED_SCOPES)
  Rationale: Static responses, no Azure AD calls, fast to build and test

Phase 3: Authorization Endpoint
  Files: src/routes/oauth-proxy.ts (add /authorize route)
  Tests: tests/oauth-proxy.test.ts (add redirect verification)
  Dependencies: Phase 1 (scope mapping)
  Rationale: 302 redirect construction, no HTTP proxy needed yet

Phase 4: Token Endpoint
  Files: src/routes/oauth-proxy.ts (add /token route)
  Tests: tests/oauth-proxy.test.ts (mock fetchFn)
  Dependencies: Phase 1 (scope mapping), @fastify/formbody
  Rationale: Most complex -- server-to-server HTTP proxy with request transformation

Phase 5: Protected Resource Metadata Update + Integration
  Files: src/routes/public-routes.ts (modify authorization_servers),
         src/server.ts (register plugin), tests/helpers/build-test-app.ts
  Tests: End-to-end discovery chain test
  Dependencies: Phases 2-4 (all endpoints must exist before switching discovery)
  Rationale: MUST be last -- changing authorization_servers to self before proxy exists breaks auth
```

**Phase ordering rationale:**
- Phase 1 has zero dependencies and is needed by Phases 3 and 4
- Phases 2, 3, and 4 are ordered by ascending complexity (static -> redirect -> HTTP proxy)
- Phase 5 MUST be last: changing `authorization_servers` to point to self before the proxy endpoints exist would break all auth flows for existing clients

## Scalability Considerations

| Concern | Current (< 10 users) | At 100 users | Notes |
|---------|---------------------|--------------|-------|
| Auth flow frequency | Rare (once per session) | Still rare | Auth flows are infrequent |
| Token endpoint latency | ~200ms (Azure AD round-trip) | Same | Single fetch(), no caching needed |
| Discovery endpoint load | Cached by clients | Same | Cache-Control header |
| Memory usage | Negligible (stateless) | Same | No state accumulates |
| Concurrent auth flows | Sequential | May overlap | All independent, no shared state |

## Sources

- [MCP Specification - Authorization (2025-03-26)](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization) - HIGH confidence
- [MCP Specification - Authorization (Draft)](https://modelcontextprotocol.io/specification/draft/basic/authorization) - HIGH confidence
- [Claude.ai ignores authorization_endpoint - Issue #82](https://github.com/anthropics/claude-ai-mcp/issues/82) - HIGH confidence (verified, open bug report)
- [Claude OAuth requires DCR - Issue #2527](https://github.com/anthropics/claude-code/issues/2527) - HIGH confidence (closed: not planned)
- [Azure AD OpenID Configuration](https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration) - HIGH confidence
- [Azure AD OAuth 2.0 v2.0 Authorization Code Flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow) - HIGH confidence
- [MCP SDK ProxyOAuthServerProvider source](node_modules/@modelcontextprotocol/sdk/dist/esm/server/auth/providers/proxyProvider.js) - HIGH confidence (local)
- [MCP SDK mcpAuthRouter source](node_modules/@modelcontextprotocol/sdk/dist/esm/server/auth/router.js) - HIGH confidence (local)
- [FastMCP Azure OAuth Proxy](https://gofastmcp.com/integrations/azure) - MEDIUM confidence
- [Microsoft ISE - MCP Server with OAuth 2.1 and Azure AD](https://devblogs.microsoft.com/ise/aca-secure-mcp-server-oauth21-azure-ad/) - MEDIUM confidence
- [@fastify/formbody](https://github.com/fastify/fastify-formbody) - HIGH confidence
- [@fastify/express compatibility plugin](https://github.com/fastify/fastify-express) - HIGH confidence

---
*Architecture research for: OAuth Authorization Proxy -- wikijs-mcp-server v2.2*
*Researched: 2026-03-25*
