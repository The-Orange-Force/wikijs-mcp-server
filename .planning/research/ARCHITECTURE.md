# Architecture Patterns

**Domain:** OAuth 2.1 resource server layer for an existing MCP server (Fastify + Node.js)
**Researched:** 2026-03-24

## Recommended Architecture

The OAuth 2.1 resource server layer is a **middleware insertion** into the existing Fastify request lifecycle, not a separate service. It sits between incoming HTTP requests and the existing MCP JSON-RPC handler, validating Bearer tokens before any tool execution occurs.

### High-Level Component Diagram

```
                                    Fastify Server (unified)
                                    ========================

  MCP Client ──── HTTP ────>  [ Route Registration ]
  (Claude Desktop)                    |
                                      |
                          +-----------+-----------+
                          |                       |
                    Public Routes           Protected Routes
                    (no auth)               (auth required)
                          |                       |
                    /.well-known/         onRequest hook:
                    oauth-protected-      [ Bearer Token
                     resource              Extraction ]
                          |                       |
                    /health               [ JWT Validation ]
                                          (jose: jwtVerify +
                                           createRemoteJWKSet)
                                                  |
                                          [ Audience Check ]
                                          (aud == AZURE_CLIENT_ID)
                                                  |
                                          [ MCP JSON-RPC Handler ]
                                          (tools/list, tools/call,
                                           initialize, etc.)
                                                  |
                                          [ WikiJS GraphQL API ]
                                          (server-side WIKIJS_TOKEN)
```

### Component Boundaries

| Component | Responsibility | Communicates With | Location |
|-----------|---------------|-------------------|----------|
| **Fastify Server** | HTTP listener, route registration, lifecycle hooks | All components | `src/server.ts` (unified, replaces both current servers) |
| **OAuth Config** | Loads and validates Azure AD tenant/client/resource env vars | Server startup | `src/auth/config.ts` |
| **JWKS Provider** | Creates and caches remote JWKS key set from Azure AD | JWT Validator | `src/auth/jwks.ts` |
| **JWT Validator** | Extracts Bearer token, verifies signature + claims | JWKS Provider, Fastify hook system | `src/auth/validate.ts` |
| **Auth Hook** | Fastify `onRequest` hook that runs JWT Validator on protected routes | JWT Validator, Fastify route system | `src/auth/hook.ts` |
| **Protected Resource Metadata** | Serves RFC 9728 JSON document at well-known URI | MCP Clients (discovery) | `src/auth/metadata.ts` |
| **MCP Transport Handler** | JSON-RPC 2.0 request/response over HTTP POST, SSE events | WikiJS API, Tool implementations | `src/mcp/transport.ts` (ported from `lib/fixed_mcp_http_server.js`) |
| **WikiJS API** | GraphQL client to WikiJS instance | WikiJS server | `src/api.ts` (existing) |
| **Tool Registry** | Tool definitions, parameter validation, execution | WikiJS API | `src/tools.ts` + `src/schemas.ts` (existing) |

### Request Flow: Authenticated MCP Call

```
1. Client sends:  POST /mcp
                  Authorization: Bearer eyJhbG...
                  Content-Type: application/json
                  {"jsonrpc":"2.0","method":"tools/call","params":{"name":"search_pages",...},"id":1}

2. Fastify onRequest hook fires (before body parsing):
   a. Extract "Bearer <token>" from Authorization header
   b. If missing/malformed -> 401 with WWW-Authenticate header
   c. Call jose.jwtVerify(token, JWKS, {
        issuer: expectedIssuer,    // Azure AD tenant issuer URL
        audience: AZURE_CLIENT_ID, // app registration client ID
        algorithms: ['RS256']
      })
   d. If invalid/expired -> 401 with WWW-Authenticate header
   e. Attach decoded payload to request (request.user or request.jwtPayload)

3. Fastify route handler receives verified request:
   a. Parse JSON-RPC body
   b. Route to appropriate tool
   c. Execute tool against WikiJS API (using server-side WIKIJS_TOKEN)
   d. Return JSON-RPC response

4. Client receives:  200 OK
                     {"jsonrpc":"2.0","id":1,"result":{...}}
```

### Request Flow: Unauthenticated Discovery

```
1. Client sends:  POST /mcp  (no Authorization header)

2. Fastify onRequest hook fires:
   a. No Bearer token found
   b. Return 401 Unauthorized
      WWW-Authenticate: Bearer resource_metadata="https://<MCP_RESOURCE_URL>/.well-known/oauth-protected-resource"

3. Client sends:  GET /.well-known/oauth-protected-resource

4. Fastify route handler (public, no auth):
   Return 200 OK with:
   {
     "resource": "https://<MCP_RESOURCE_URL>",
     "authorization_servers": [
       "https://login.microsoftonline.com/<AZURE_TENANT_ID>/v2.0"
     ],
     "scopes_supported": [],
     "bearer_methods_supported": ["header"]
   }

5. Client discovers Azure AD authorization server.
   Client fetches: GET https://login.microsoftonline.com/<AZURE_TENANT_ID>/v2.0/.well-known/openid-configuration
   (Azure AD's own endpoint, not ours)

6. Client performs OAuth 2.1 authorization_code + PKCE flow with Azure AD.
   Client obtains access token.

7. Client retries:  POST /mcp  WITH Authorization: Bearer <token>
   (Flow continues as "Authenticated MCP Call" above)
```

### Request Flow: SSE Event Stream

```
1. Client sends:  GET /mcp/events
                  Authorization: Bearer eyJhbG...

2. Fastify onRequest hook fires:
   a. Validate Bearer token (same as POST /mcp)
   b. If invalid -> 401

3. Fastify route handler:
   a. Set response headers: Content-Type: text/event-stream, etc.
   b. Hold connection open
   c. Push SSE events as tool executions occur

Note: SSE connections are long-lived. Token expiry during an active SSE
connection is a design decision -- options:
  (a) Let it ride until disconnect (simpler, acceptable for internal use)
  (b) Periodic re-validation (complex, unnecessary for this use case)
  Recommendation: Option (a). Validate once at connection open.
```

## Patterns to Follow

### Pattern 1: Fastify `onRequest` Hook for Auth (Not `preHandler`)

**What:** Use `onRequest` lifecycle hook for JWT validation, not `preHandler` or `preValidation`.

**Why:** `onRequest` fires before body parsing. Since the Bearer token is in the HTTP header, there is no reason to parse the request body before rejecting unauthorized requests. This saves CPU and memory on invalid requests.

**Implementation:**

```typescript
// src/auth/hook.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import { validateToken } from './validate.js';

export async function authHook(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.code(401).header(
      'WWW-Authenticate',
      `Bearer resource_metadata="${getResourceMetadataUrl()}"`
    ).send({ error: 'Authorization required' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = await validateToken(token);
    // Attach to request for downstream use (logging, audit)
    request.jwtPayload = payload;
  } catch (err) {
    reply.code(401).header(
      'WWW-Authenticate',
      `Bearer resource_metadata="${getResourceMetadataUrl()}", error="invalid_token"`
    ).send({ error: 'Invalid or expired token' });
    return;
  }
}
```

**Route registration (selective application):**

```typescript
// Only protected routes get the auth hook
server.post('/mcp', { onRequest: authHook }, mcpHandler);
server.get('/mcp/events', { onRequest: authHook }, sseHandler);

// Public routes -- no hook
server.get('/health', healthHandler);
server.get('/.well-known/oauth-protected-resource', metadataHandler);
```

### Pattern 2: Singleton JWKS with Lazy Initialization

**What:** Create the remote JWKS key set once at module level, reuse across all requests.

**Why:** `jose.createRemoteJWKSet` handles caching, cooldown, and key rotation internally. Creating it per-request would defeat caching and potentially trigger rate limits against Azure AD's JWKS endpoint.

**Implementation:**

```typescript
// src/auth/jwks.ts
import { createRemoteJWKSet } from 'jose';
import { authConfig } from './config.js';

// Singleton -- jose handles caching and key rotation internally.
// Azure AD rotates keys roughly every 24 hours; jose's built-in
// cooldown prevents excessive fetches.
let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

export function getJWKS() {
  if (!_jwks) {
    const jwksUrl = new URL(
      `https://login.microsoftonline.com/${authConfig.tenantId}/discovery/v2.0/keys`
    );
    _jwks = createRemoteJWKSet(jwksUrl);
  }
  return _jwks;
}
```

### Pattern 3: Strict JWT Validation with Explicit Claims

**What:** Validate issuer, audience, and algorithm explicitly. Do not rely on defaults.

**Why:** The MCP spec (June 2025 update) MUST-level requires audience validation. Azure AD tokens have known issuer formats that vary by v1/v2 -- being explicit prevents accepting tokens from wrong tenants or wrong app registrations.

**Implementation:**

```typescript
// src/auth/validate.ts
import { jwtVerify, JWTPayload } from 'jose';
import { getJWKS } from './jwks.js';
import { authConfig } from './config.js';

export async function validateToken(token: string): Promise<JWTPayload> {
  const jwks = getJWKS();

  // Azure AD v2 tokens use this issuer format.
  // If the app registration has accessTokenAcceptedVersion: 2 in its manifest,
  // tokens will have iss = https://login.microsoftonline.com/{tenant}/v2.0
  // If accessTokenAcceptedVersion: null or 1, iss = https://sts.windows.net/{tenant}/
  const { payload } = await jwtVerify(token, jwks, {
    issuer: authConfig.expectedIssuer,
    audience: authConfig.clientId,
    algorithms: ['RS256'],
  });

  return payload;
}
```

### Pattern 4: Configuration Module with Validation at Startup

**What:** Load all auth-related environment variables in a single config module, validate them at import time, and fail fast if misconfigured.

**Why:** Better to crash at startup with a clear error than to silently accept requests with missing config and fail at runtime.

**Implementation:**

```typescript
// src/auth/config.ts
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Eagerly load -- crashes at startup if missing
export const authConfig = {
  tenantId: requireEnv('AZURE_TENANT_ID'),
  clientId: requireEnv('AZURE_CLIENT_ID'),
  resourceUrl: requireEnv('MCP_RESOURCE_URL'),

  // Derived values
  get expectedIssuer(): string {
    // v2 token format. Adjust if your app registration
    // uses accessTokenAcceptedVersion: 1 (then use sts.windows.net)
    return `https://login.microsoftonline.com/${this.tenantId}/v2.0`;
  },

  get jwksUrl(): string {
    return `https://login.microsoftonline.com/${this.tenantId}/discovery/v2.0/keys`;
  },

  get metadataUrl(): string {
    return `${this.resourceUrl}/.well-known/oauth-protected-resource`;
  },
} as const;
```

### Pattern 5: Static Protected Resource Metadata Response

**What:** Serve the RFC 9728 metadata as a plain JSON object from a Fastify route handler. No dynamic computation needed.

**Why:** The metadata values are all derived from environment configuration and do not change at runtime. Building the response object once and returning it is the simplest approach. No database, no external calls.

**Implementation:**

```typescript
// src/auth/metadata.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import { authConfig } from './config.js';

export async function protectedResourceMetadataHandler(
  _request: FastifyRequest,
  _reply: FastifyReply
) {
  return {
    resource: authConfig.resourceUrl,
    authorization_servers: [
      `https://login.microsoftonline.com/${authConfig.tenantId}/v2.0`
    ],
    bearer_methods_supported: ['header'],
    scopes_supported: [],
    resource_documentation: undefined,
  };
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Using `@fastify/jwt` or `fastify-jwt-jwks` Plugins

**What:** Installing a Fastify plugin that wraps JWT verification.

**Why bad:** These plugins add their own decoration patterns (`request.jwtVerify()`, `fastify.jwt.verify()`), secret/key management, and cookie support that we do not need. The `jose` library alone provides exactly what is required: `createRemoteJWKSet` + `jwtVerify`. Adding a plugin layer on top creates indirection, makes debugging harder, and increases the dependency surface. The plugins also tend to assume the server issued the tokens (full JWT lifecycle), whereas we are purely a resource server consuming externally-issued tokens.

**Instead:** Use `jose` directly in a custom `onRequest` hook. Total code: approximately 60 lines across config + jwks + validate + hook modules.

### Anti-Pattern 2: Token Validation Inside the JSON-RPC Handler

**What:** Checking the Authorization header inside the `POST /mcp` route handler body, after the JSON-RPC payload has already been parsed.

**Why bad:** Wastes resources parsing request bodies for unauthorized requests. Also mixes concerns: authentication should be resolved before the application layer sees the request. The Fastify lifecycle is designed precisely for this separation.

**Instead:** Use `onRequest` hook. The JSON-RPC handler only runs if auth has already passed.

### Anti-Pattern 3: Per-Request JWKS Fetching

**What:** Calling `createRemoteJWKSet(url)` inside each request handler or creating a new instance for each verification.

**Why bad:** `createRemoteJWKSet` is designed to be instantiated once and reused. It manages an internal cache with cooldown periods. Creating it per-request would fetch keys from Azure AD on every single request, introducing latency and risking rate-limiting.

**Instead:** Create a singleton instance (see Pattern 2 above).

### Anti-Pattern 4: Accepting Both v1 and v2 Token Formats

**What:** Accepting issuer claims from both `https://sts.windows.net/{tenant}/` and `https://login.microsoftonline.com/{tenant}/v2.0` to be "flexible."

**Why bad:** This doubles the attack surface. The app registration in Azure AD should be configured to issue one token version. Accepting both means the server cannot distinguish between a legitimately-issued token and one that was issued under different configuration. The `jose` `jwtVerify` `issuer` option performs exact string match intentionally.

**Instead:** Configure the Azure AD app registration to use `accessTokenAcceptedVersion: 2` and validate only the v2 issuer. Document the required Azure AD configuration.

### Anti-Pattern 5: Token Passthrough to WikiJS

**What:** Forwarding the client's Bearer token to the WikiJS GraphQL API instead of using the server-side `WIKIJS_TOKEN`.

**Why bad:** The MCP spec explicitly forbids token passthrough (see MCP Authorization spec, Security Best Practices). The client's token is issued by Azure AD for the MCP server audience. WikiJS uses its own API key authentication scheme. These are completely separate trust domains.

**Instead:** The WikiJS API client uses `WIKIJS_TOKEN` from the environment (already the case). The client's Azure AD token is validated and discarded after the auth hook -- it is never forwarded.

## Build Order (Dependencies Between Components)

Components must be built in this order due to hard dependencies:

```
Phase 1: Foundation (no auth dependencies)
  ├── 1a. Port MCP transport into Fastify TypeScript
  │        (lib/fixed_mcp_http_server.js -> src/mcp/transport.ts)
  │        Dependency: none. Must be done first because auth hooks
  │        attach to Fastify routes. No Fastify routes = no hooks.
  │
  └── 1b. Define auth config types and env var loading
           (src/auth/config.ts)
           Dependency: none. Pure config, no network calls.

Phase 2: Auth Core (depends on Phase 1)
  ├── 2a. JWKS Provider singleton
  │        (src/auth/jwks.ts)
  │        Dependency: config.ts (needs tenant ID for JWKS URL)
  │
  ├── 2b. JWT Validator function
  │        (src/auth/validate.ts)
  │        Dependency: jwks.ts + config.ts
  │
  └── 2c. Protected Resource Metadata handler
           (src/auth/metadata.ts)
           Dependency: config.ts (needs resource URL, tenant ID)

Phase 3: Integration (depends on Phase 2)
  ├── 3a. Auth hook (Fastify onRequest)
  │        (src/auth/hook.ts)
  │        Dependency: validate.ts + config.ts
  │
  ├── 3b. Wire auth hook to POST /mcp and GET /mcp/events routes
  │        Dependency: transport.ts (Phase 1a) + hook.ts (Phase 3a)
  │
  ├── 3c. Wire metadata handler to GET /.well-known/oauth-protected-resource
  │        Dependency: metadata.ts (Phase 2c)
  │
  └── 3d. Wire 401 WWW-Authenticate headers
           Dependency: config.ts (needs metadata URL)

Phase 4: Cleanup & Hardening
  ├── 4a. Remove raw Node.js HTTP server (lib/fixed_mcp_http_server.js)
  ├── 4b. Remove unused express dependency from package.json
  ├── 4c. Update example.env with AZURE_TENANT_ID, AZURE_CLIENT_ID, MCP_RESOURCE_URL
  └── 4d. Integration testing (manual or scripted)
```

## Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                    EXTERNAL SYSTEMS                          │
│                                                              │
│  ┌─────────────┐            ┌─────────────────────────┐      │
│  │ Azure AD    │            │ WikiJS Instance          │      │
│  │ (Entra ID)  │            │ (GraphQL API)            │      │
│  │             │            │                           │      │
│  │ Issues JWT  │            │ Accepts WIKIJS_TOKEN      │      │
│  │ tokens      │            │ (server-side secret)      │      │
│  │             │            │                           │      │
│  │ JWKS keys:  │            │                           │      │
│  │ /discovery/ │            │                           │      │
│  │ v2.0/keys   │            │                           │      │
│  └──────┬──────┘            └────────────┬──────────────┘      │
│         │                                │                     │
│         │ (public keys                   │ (GraphQL            │
│         │  fetched by jose)              │  queries/mutations) │
└─────────┼────────────────────────────────┼─────────────────────┘
          │                                │
          ▼                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MCP SERVER (Fastify)                          │
│                                                                 │
│  ┌──────────────────┐     ┌──────────────────┐                  │
│  │ JWKS Provider    │◄────│ Auth Config       │                  │
│  │ (createRemoteJWK │     │ (AZURE_TENANT_ID, │                  │
│  │  Set, singleton) │     │  AZURE_CLIENT_ID, │                  │
│  └────────┬─────────┘     │  MCP_RESOURCE_URL)│                  │
│           │               └───────┬──────────┘                  │
│           │                       │                              │
│           ▼                       ▼                              │
│  ┌──────────────────┐     ┌──────────────────┐                  │
│  │ JWT Validator    │     │ PRM Metadata     │                  │
│  │ (jwtVerify with  │     │ Handler          │                  │
│  │  issuer+audience)│     │ (/.well-known/   │                  │
│  └────────┬─────────┘     │  oauth-protected │                  │
│           │               │  -resource)      │                  │
│           │               └──────────────────┘                  │
│           ▼                                                     │
│  ┌──────────────────┐                                           │
│  │ Auth Hook        │  <── Fastify onRequest lifecycle          │
│  │ (Bearer extract, │                                           │
│  │  validate, 401)  │                                           │
│  └────────┬─────────┘                                           │
│           │ (only if valid)                                     │
│           ▼                                                     │
│  ┌──────────────────┐                                           │
│  │ MCP Transport    │  <── POST /mcp (JSON-RPC)                 │
│  │ Handler          │  <── GET  /mcp/events (SSE)               │
│  │ (JSON-RPC 2.0    │                                           │
│  │  dispatch)       │                                           │
│  └────────┬─────────┘                                           │
│           │                                                     │
│           ▼                                                     │
│  ┌──────────────────┐     ┌──────────────────┐                  │
│  │ Tool Registry    │────►│ WikiJS API Client │──► WikiJS       │
│  │ (Zod validation) │     │ (WIKIJS_TOKEN)   │    GraphQL       │
│  └──────────────────┘     └──────────────────┘                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Data flow direction is strictly one-way for credentials:**
- Azure AD tokens flow IN from clients, are validated, and are discarded.
- WIKIJS_TOKEN flows OUT to WikiJS. It never touches the client.
- JWKS public keys flow IN from Azure AD to the server for signature verification.
- No token is ever forwarded between trust domains.

## Scalability Considerations

| Concern | Current (5-20 users) | At 100 users | At 1000 users |
|---------|---------------------|--------------|---------------|
| JWT validation latency | ~1ms (JWKS cached) | ~1ms (same) | ~1ms (same) |
| JWKS fetching | Once at first request, then cached | Same (singleton) | Same (singleton) |
| SSE connections | In-memory Set, fine | In-memory Set, still fine | May need connection limits |
| Token expiry checking | Per-request via jose | Per-request | Per-request |
| WikiJS API load | Proportional to tool calls | May need connection pooling | Connection pooling + rate limiting |

At the scale described in PROJECT.md (company internal, colleagues), scalability is a non-concern. The architecture remains sound up to thousands of concurrent users because JWT validation is a purely local CPU operation (RSA signature check) with no network call after initial JWKS fetch.

## File Structure After Implementation

```
src/
├── auth/
│   ├── config.ts          # Environment variables, derived URLs
│   ├── jwks.ts            # Singleton createRemoteJWKSet
│   ├── validate.ts        # jwtVerify wrapper
│   ├── hook.ts            # Fastify onRequest hook
│   └── metadata.ts        # RFC 9728 PRM endpoint handler
├── mcp/
│   └── transport.ts       # Ported MCP JSON-RPC handler (from lib/fixed_mcp_http_server.js)
├── api.ts                 # Existing WikiJS GraphQL client
├── schemas.ts             # Existing Zod schemas
├── tools.ts               # Existing tool definitions
├── types.ts               # Existing + new auth types
└── server.ts              # Unified Fastify entry point
```

## Key Technology Decisions

| Decision | Choice | Rationale | Confidence |
|----------|--------|-----------|------------|
| JWT library | `jose` (no additional packages) | Zero native deps, built-in `createRemoteJWKSet` with caching, `jwtVerify` with claims validation. No wrapper plugin needed. | HIGH -- official docs, widely adopted |
| Auth hook placement | Fastify `onRequest` | Fires before body parsing, rejects unauthorized requests early, idiomatic Fastify | HIGH -- Fastify docs |
| JWKS caching | `jose` internal (singleton pattern) | `createRemoteJWKSet` manages fetch cooldown and key rotation. Azure AD rotates keys ~24h. | HIGH -- jose docs |
| Token version | Azure AD v2 only | v2 issuer format (`login.microsoftonline.com/{tenant}/v2.0`), requires app manifest `accessTokenAcceptedVersion: 2` | HIGH -- Microsoft docs |
| Metadata endpoint | Static JSON from env vars | All metadata values are deployment-time constants, no runtime computation | HIGH -- RFC 9728 |
| No Fastify JWT plugins | Direct `jose` usage | Fewer dependencies, no decoration magic, transparent code, ~60 lines total | MEDIUM -- architectural preference |

## Sources

- [MCP Authorization Specification (Draft)](https://modelcontextprotocol.io/specification/draft/basic/authorization)
- [RFC 9728 - OAuth 2.0 Protected Resource Metadata](https://datatracker.ietf.org/doc/html/rfc9728)
- [jose - npm](https://www.npmjs.com/package/jose)
- [jose GitHub - createRemoteJWKSet](https://github.com/panva/jose/blob/main/docs/jwks/remote/functions/createRemoteJWKSet.md)
- [jose GitHub - jwtVerify](https://github.com/panva/jose/blob/main/docs/jwt/verify/functions/jwtVerify.md)
- [Fastify Hooks Reference](https://fastify.dev/docs/latest/Reference/Hooks/)
- [Fastify Routes Reference](https://fastify.dev/docs/latest/Reference/Routes/)
- [How to Validate Microsoft Entra ID OAuth Tokens in Node.js](https://www.voitanos.io/blog/validating-entra-id-generated-oauth-tokens/)
- [Microsoft Entra ID Access Tokens](https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens)
- [MCP Spec Updates June 2025 - Auth0](https://auth0.com/blog/mcp-specs-update-all-about-auth/)
- [WorkOS: Introducing RFC 9728](https://workos.com/blog/introducing-rfc-9728-say-hello-to-standardized-oauth-2-0-resource-metadata)
- [Azure AD v1 vs v2 Token Issuer](https://learn.microsoft.com/en-us/answers/questions/2156642/token-issuer-for-api-is-sts-windows-net-instead-of)
- [nearform/fastify-jwt-jwks](https://github.com/nearform/fastify-jwt-jwks)
