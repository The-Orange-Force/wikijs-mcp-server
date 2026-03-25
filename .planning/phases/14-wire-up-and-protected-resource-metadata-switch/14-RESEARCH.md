# Phase 14: Wire Up and Protected Resource Metadata Switch - Research

**Researched:** 2026-03-25
**Domain:** Fastify plugin registration, OAuth 2.0 Protected Resource Metadata (RFC 9728), MCP authorization discovery chain, end-to-end integration testing
**Confidence:** HIGH

## Summary

Phase 14 is the final integration step for the v2.2 OAuth Authorization Proxy milestone. It wires up the `oauthProxyRoutes` Fastify plugin (created in Phases 11-13) into the production server and test helper, switches `/.well-known/oauth-protected-resource` to reference self (`MCP_RESOURCE_URL`) as the authorization server instead of Azure AD, and validates the full discovery chain end-to-end. The phase touches five existing files and creates one new test file.

The implementation is low-risk because it follows established Fastify plugin registration patterns already used for `publicRoutes` and `protectedRoutes`. The metadata switchover is a single-line change (replacing the Azure AD URL with `MCP_RESOURCE_URL`). The bulk of the work is in the E2E integration test that walks the full discovery chain: protected resource metadata, authorization server metadata, client registration, authorization redirect, and token proxy -- all as sequential HTTP requests against the test Fastify app with mock fetch injection.

**Primary recommendation:** Execute as a single plan with four logical waves: (1) register the plugin in `server.ts` and `build-test-app.ts`, (2) switch the protected resource metadata `authorization_servers` value, (3) update the GET `/` server info endpoint, (4) write the E2E integration test and update existing tests.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- E2E validation via automated integration test in `tests/e2e-flow.test.ts` with sequential `it()` blocks walking the full discovery chain
- Mock fetch injected to capture outbound requests to Azure AD -- assert correct URL, headers, and mapped scopes (no fake token response needed)
- No manual Claude Desktop test procedure -- rely on automated integration test
- `authorization_servers` in `/.well-known/oauth-protected-resource` switches entirely to `[MCP_RESOURCE_URL]` (self only, no Azure AD fallback)
- Endpoint stays in `public-routes.ts` -- just update the `authorization_servers` value
- Keep all existing metadata fields: `resource`, `authorization_servers`, `scopes_supported`, `bearer_methods_supported`, `resource_signing_alg_values_supported`, `resource_documentation`
- Use `MCP_RESOURCE_URL` as-is from appConfig (no trailing slash normalization)
- Update GET `/` to list all new OAuth proxy endpoints with access level annotations
- Add `authorization_server_metadata` field to GET `/` response
- Keep version at `2.0.0` -- don't bump
- Update `discovery.test.ts` assertions in place: change expected `authorization_servers` from Azure AD URL to `MCP_RESOURCE_URL` (self)
- `buildTestApp()` always registers the OAuth proxy plugin -- mirrors production parity, no opt-in flag
- Inject a capture-only mock fetch in `buildTestApp()` that records all calls and returns generic 400
- Add proxy endpoint access tests to `route-protection.test.ts` confirming proxy endpoints are accessible without Bearer token (INTG-01)

### Claude's Discretion
- Exact mock fetch implementation details in buildTestApp
- How to pass the mock fetch to the oauth proxy plugin (constructor option, plugin option, etc.)
- Whether to extract mock fetch as a shared test helper or inline in buildTestApp

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| META-03 | Protected Resource Metadata (`/.well-known/oauth-protected-resource`) references self (`MCP_RESOURCE_URL`) as authorization server | Single-line change in `public-routes.ts:78-80`: replace Azure AD URL with `appConfig.azure.resourceUrl`; RFC 9728 requires `authorization_servers` field; MCP spec requires at least one AS URL |
| INTG-01 | All proxy endpoints are public (unauthenticated) -- existing JWT validation on `POST /mcp` is unchanged | OAuth proxy plugin registered at root scope (like `publicRoutes`), not inside `protectedRoutes` scope; add assertions in `route-protection.test.ts` for GET `/authorize`, POST `/token`, POST `/register`, GET `/.well-known/oauth-authorization-server`, GET `/.well-known/openid-configuration` |
| INTG-02 | Claude Desktop completes full OAuth flow and successfully invokes MCP tools | E2E integration test in `tests/e2e-flow.test.ts` walks the full chain: PRM discovery, AS metadata discovery, DCR registration, authorize redirect capture, token proxy with mock fetch capture; validates correct URLs, headers, scope mapping, and resource stripping at each step |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Fastify | 4.27.2 | Plugin registration, route testing via `inject()` | Project's HTTP framework; all routes follow plugin pattern |
| Vitest | 4.1.1 | Integration and E2E test runner | Project's established test framework |

### From Previous Phases (dependencies)
| Module | Location | Purpose | Phase |
|--------|----------|---------|-------|
| `oauthProxyRoutes` | `src/routes/oauth-proxy.ts` | Fastify plugin with discovery, registration, authorize, token endpoints | Phases 11-13 |
| `OAuthProxyOptions` | `src/routes/oauth-proxy.ts` | Plugin options interface (includes `appConfig`, `fetch` injection) | Phases 11-13 |
| `buildAzureEndpoints()` | `src/oauth-proxy/azure-endpoints.ts` | Azure AD URL construction | Phase 10 |
| `mapScopes()` | `src/oauth-proxy/scope-mapper.ts` | Bare-to-Azure scope transformation | Phase 10 |
| `SUPPORTED_SCOPES` | `src/scopes.ts` | Scope strings for metadata | Existing |

### No New Dependencies
Zero new npm packages required. All integration is wiring existing code together.

## Architecture Patterns

### Files Modified

```
src/
  server.ts              # ADD: import + register oauthProxyRoutes
  routes/
    public-routes.ts     # MODIFY: authorization_servers value, GET / endpoint listing
tests/
  helpers/
    build-test-app.ts    # ADD: import + register oauthProxyRoutes with mock fetch
  discovery.test.ts      # MODIFY: authorization_servers assertion
  route-protection.test.ts  # ADD: proxy endpoint public access assertions
  e2e-flow.test.ts       # NEW: full discovery chain integration test
```

### Pattern 1: Plugin Registration in server.ts

**What:** Register `oauthProxyRoutes` at root scope alongside `publicRoutes` (both are unauthenticated).

**When to use:** Production server wiring.

**Example:**
```typescript
// src/server.ts - additions
import { oauthProxyRoutes } from "./routes/oauth-proxy.js";

// In buildApp(), after publicRoutes registration:
server.register(oauthProxyRoutes, {
  appConfig,
  // fetch: globalThis.fetch (default, or allow override for tests)
});
```

The `oauthProxyRoutes` plugin is NOT wrapped with `fastify-plugin`, so its decorators and hooks stay encapsulated -- same pattern as `publicRoutes` and `protectedRoutes`.

### Pattern 2: Mock Fetch in buildTestApp

**What:** Inject a capture-only mock fetch that records all outbound calls and returns a generic 400 response. Prevents accidental real Azure AD calls during tests.

**Recommended approach -- inline in buildTestApp:**
```typescript
// tests/helpers/build-test-app.ts

/** Captured fetch call for test assertions. */
export interface CapturedFetchCall {
  url: string;
  init?: RequestInit;
}

/** Global captures for test inspection. */
export const capturedFetchCalls: CapturedFetchCall[] = [];

/** Mock fetch that captures calls and returns generic 400. */
async function mockFetch(url: string | URL | Request, init?: RequestInit): Promise<Response> {
  capturedFetchCalls.push({
    url: typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url,
    init,
  });
  return new Response(
    JSON.stringify({ error: "mock_error", error_description: "Mock fetch -- no real Azure AD calls in tests" }),
    { status: 400, headers: { "content-type": "application/json" } },
  );
}

// In buildTestApp():
server.register(oauthProxyRoutes, {
  appConfig,
  fetch: mockFetch,
});
```

**Why inline:** The mock fetch is simple (10 lines), tightly coupled to the test helper, and the captured calls array needs to be accessible from test files. Extracting to a separate helper adds indirection without benefit.

**Why export `capturedFetchCalls`:** The E2E test needs to assert what URLs and parameters were sent to Azure AD. Tests clear the array in `beforeEach()` and inspect after each step.

### Pattern 3: Protected Resource Metadata Switchover

**What:** Change `authorization_servers` from Azure AD URL to self (`MCP_RESOURCE_URL`).

**Example:**
```typescript
// src/routes/public-routes.ts - BEFORE:
authorization_servers: [
  `https://login.microsoftonline.com/${appConfig.azure.tenantId}/v2.0`,
],

// AFTER:
authorization_servers: [appConfig.azure.resourceUrl],
```

This is the key switchover that makes the MCP client follow the proxy's discovery chain instead of going directly to Azure AD. The MCP spec (RFC 9728) requires the `authorization_servers` field to contain at least one authorization server URL. Since this server IS the authorization server proxy, it references itself.

### Pattern 4: E2E Test Structure -- Sequential Discovery Chain

**What:** A single `describe` block with sequential `it()` blocks, each performing one step of the discovery chain. Each step uses the response from the previous step to construct the next request.

**Example structure:**
```typescript
// tests/e2e-flow.test.ts
describe("E2E OAuth discovery chain", () => {
  let app: FastifyInstance;
  // Shared state across sequential steps
  let authorizationServerUrl: string;
  let authorizationEndpoint: string;
  let tokenEndpoint: string;
  let registrationEndpoint: string;
  let clientId: string;

  beforeAll(async () => {
    app = await buildTestApp();
    await app.ready();
    capturedFetchCalls.length = 0;
  });

  afterAll(async () => { await app.close(); });

  it("Step 1: discovers protected resource metadata", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-protected-resource",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.authorization_servers).toBeInstanceOf(Array);
    expect(body.authorization_servers.length).toBeGreaterThanOrEqual(1);
    authorizationServerUrl = body.authorization_servers[0];
    // Key assertion: authorization server is self
    expect(authorizationServerUrl).toBe("https://mcp.example.com");
  });

  it("Step 2: follows to authorization server metadata", async () => {
    // Construct .well-known URL from authorization server URL
    const metadataUrl = new URL(
      "/.well-known/oauth-authorization-server",
      authorizationServerUrl,
    );
    // Since authorizationServerUrl points to self, request the local path
    const res = await app.inject({
      method: "GET",
      url: metadataUrl.pathname,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    authorizationEndpoint = body.authorization_endpoint;
    tokenEndpoint = body.token_endpoint;
    registrationEndpoint = body.registration_endpoint;
    expect(body.code_challenge_methods_supported).toContain("S256");
  });

  it("Step 3: registers client via DCR", async () => {
    // Extract path from registrationEndpoint
    const regPath = new URL(registrationEndpoint).pathname;
    const res = await app.inject({
      method: "POST",
      url: regPath,
      headers: { "content-type": "application/json" },
      payload: { client_name: "E2E Test Client" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    clientId = body.client_id;
    expect(clientId).toBeDefined();
    expect(body.token_endpoint_auth_method).toBe("none");
  });

  it("Step 4: builds authorize redirect", async () => {
    const authPath = new URL(authorizationEndpoint).pathname;
    const res = await app.inject({
      method: "GET",
      url: authPath,
      query: {
        client_id: clientId,
        redirect_uri: "http://localhost:3000/callback",
        response_type: "code",
        scope: "wikijs:read",
        state: "test-state-123",
        code_challenge: "abc123",
        code_challenge_method: "S256",
      },
    });
    expect(res.statusCode).toBe(302);
    const location = new URL(res.headers.location as string);
    // Verify redirect goes to Azure AD
    expect(location.hostname).toBe("login.microsoftonline.com");
    // Verify scope mapping happened
    expect(location.searchParams.get("scope")).toContain("api://");
    // Verify client params passed through
    expect(location.searchParams.get("state")).toBe("test-state-123");
    expect(location.searchParams.get("code_challenge")).toBe("abc123");
    // Verify resource param stripped
    expect(location.searchParams.has("resource")).toBe(false);
  });

  it("Step 5: proxies token request", async () => {
    capturedFetchCalls.length = 0;
    const tokenPath = new URL(tokenEndpoint).pathname;
    const res = await app.inject({
      method: "POST",
      url: tokenPath,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: `grant_type=authorization_code&code=test-auth-code&redirect_uri=${encodeURIComponent("http://localhost:3000/callback")}&client_id=${clientId}&code_verifier=test-verifier`,
    });
    // Mock fetch returns 400, so token endpoint returns error -- that's fine
    // The important thing: verify the outbound request to Azure AD
    expect(capturedFetchCalls.length).toBe(1);
    const fetchCall = capturedFetchCalls[0];
    expect(fetchCall.url).toContain("login.microsoftonline.com");
    expect(fetchCall.url).toContain("/oauth2/v2.0/token");
  });
});
```

### Anti-Patterns to Avoid

- **Do NOT register `oauthProxyRoutes` inside `protectedRoutes` scope:** It must be at root scope (like `publicRoutes`) since OAuth proxy endpoints are unauthenticated. Registering inside `protectedRoutes` would apply JWT auth to proxy endpoints.
- **Do NOT keep Azure AD URL in `authorization_servers`:** The whole point of this phase is switching to self-reference. A dual/fallback `[MCP_RESOURCE_URL, azureAdUrl]` array was explicitly rejected in CONTEXT.md.
- **Do NOT make real HTTP calls to Azure AD in tests:** The mock fetch prevents this. Tests that need specific Azure AD responses override the mock.
- **Do NOT test the full token exchange with real tokens:** The E2E test validates the discovery chain and correct parameter forwarding, not actual token issuance. Mock fetch returning 400 is sufficient.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fetch mocking | Complex interceptor library | Simple inline mock function | Only need to capture URL + params; 10-line function suffices |
| Discovery chain URL construction | Hardcoded test URLs | Parse from previous step's response | Tests should validate the chain, not assume it |
| Plugin registration order | Custom initialization logic | Fastify's standard `server.register()` | Plugin encapsulation handles scope isolation automatically |

**Key insight:** Phase 14 is a wiring phase, not a logic phase. The complexity is in getting the right things connected, not in building new logic. Every component already exists.

## Common Pitfalls

### Pitfall 1: Forgetting to Update discovery.test.ts Assertions
**What goes wrong:** Existing `discovery.test.ts` asserts `authorization_servers[0]` contains the tenant ID (Azure AD URL). After switching to self-reference, this assertion fails.
**Why it happens:** The metadata switchover in `public-routes.ts` is obvious, but the test file referencing the old value is easy to forget.
**How to avoid:** Update `discovery.test.ts` in the same task as the metadata switchover. The assertion should change from checking for tenant ID to checking for `MCP_RESOURCE_URL`.
**Warning signs:** `discovery.test.ts` test failures after metadata change.

### Pitfall 2: Plugin Registration Order in buildTestApp
**What goes wrong:** `oauthProxyRoutes` registered after `protectedRoutes`, causing route conflicts or unexpected behavior.
**Why it happens:** Copying from `server.ts` where order may differ.
**How to avoid:** Register `oauthProxyRoutes` in the same position in both `server.ts` and `buildTestApp()` -- after `publicRoutes`, before `protectedRoutes`. The `publicRoutes` and `oauthProxyRoutes` plugins both register unauthenticated routes; `protectedRoutes` registers authenticated routes.
**Warning signs:** 404 for proxy endpoints, or proxy endpoints unexpectedly requiring auth.

### Pitfall 3: Mock Fetch Not Passed to Plugin
**What goes wrong:** `buildTestApp()` registers `oauthProxyRoutes` but doesn't pass the mock fetch function, causing real HTTP calls to Azure AD during tests.
**Why it happens:** The `OAuthProxyOptions` interface from Phase 13 accepts an optional `fetch` parameter. Omitting it falls back to `globalThis.fetch`.
**How to avoid:** Always pass the mock fetch in `buildTestApp()`. The mock prevents accidental real calls and enables E2E test assertions.
**Warning signs:** Test timeouts, DNS resolution errors for `login.microsoftonline.com`.

### Pitfall 4: E2E Test Steps Not Independent Enough
**What goes wrong:** If Step 3 fails, Steps 4-5 fail with confusing errors because `clientId` is undefined.
**Why it happens:** Sequential test steps share state. Earlier step failures cascade.
**How to avoid:** Use `let` declarations with initialization in each step. If a variable is required from a previous step, the later test will fail with a clear "expected X to be defined" rather than a cryptic error.
**Warning signs:** Multiple test failures from a single root cause; hard to debug.

### Pitfall 5: smoke.test.ts Not Updated
**What goes wrong:** `smoke.test.ts` creates its own Fastify server instance (not via `buildTestApp()`) and doesn't register `oauthProxyRoutes`. This means smoke tests don't cover the full production setup.
**Why it happens:** `smoke.test.ts` predates the shared `buildTestApp()` helper and manually constructs the server.
**How to avoid:** Either update `smoke.test.ts` to also register `oauthProxyRoutes`, or accept this divergence since the dedicated E2E test covers the full chain. The smoke test's purpose is MCP protocol validation, not OAuth proxy validation.
**Warning signs:** Smoke tests pass but production server has different route set.

### Pitfall 6: Authorization Server Metadata URL Construction in E2E Test
**What goes wrong:** The E2E test hardcodes `/.well-known/oauth-authorization-server` instead of deriving it from the `authorization_servers[0]` URL returned by protected resource metadata.
**Why it happens:** The MCP spec discovery chain expects the client to append `/.well-known/oauth-authorization-server` to the authorization server URL found in PRM. Since the AS URL is self (`https://mcp.example.com`), the path is just `/.well-known/oauth-authorization-server` relative to the test app.
**How to avoid:** In the E2E test, explicitly extract the AS URL from PRM response and construct the metadata URL from it, even though the result is the same path. This validates the chain logic, not just the endpoint.

## Code Examples

### server.ts Registration (verified against existing pattern)
```typescript
// Source: existing server.ts plugin registration pattern
import { oauthProxyRoutes } from "./routes/oauth-proxy.js";

// In buildApp():
// Public routes -- no auth required
server.register(publicRoutes, {
  wikiJsApi,
  appConfig,
});

// OAuth proxy routes -- no auth required (discovery, registration, authorize, token)
server.register(oauthProxyRoutes, {
  appConfig,
});

// Protected MCP routes -- auth enforced via scoped preHandler
server.register(protectedRoutes, { ... });
```

### build-test-app.ts Registration (verified against existing pattern)
```typescript
// Source: existing build-test-app.ts plugin registration pattern
import { oauthProxyRoutes } from "../../src/routes/oauth-proxy.js";

// Capture array + mock fetch (exported for test assertions)
export interface CapturedFetchCall {
  url: string;
  init?: RequestInit;
}
export const capturedFetchCalls: CapturedFetchCall[] = [];

async function mockFetch(url: string | URL | Request, init?: RequestInit): Promise<Response> {
  capturedFetchCalls.push({
    url: typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url,
    init,
  });
  return new Response(
    JSON.stringify({ error: "mock_error", error_description: "Mock fetch" }),
    { status: 400, headers: { "content-type": "application/json" } },
  );
}

// In buildTestApp():
server.register(oauthProxyRoutes, {
  appConfig,
  fetch: mockFetch,
});
```

### Updated protected-resource metadata (single-line change)
```typescript
// Source: existing public-routes.ts line 78-80
// BEFORE:
authorization_servers: [
  `https://login.microsoftonline.com/${appConfig.azure.tenantId}/v2.0`,
],

// AFTER:
authorization_servers: [appConfig.azure.resourceUrl],
```

### Updated GET / server info endpoint
```typescript
// Source: existing public-routes.ts GET / handler
fastify.get("/", async () => ({
  name: "wikijs-mcp",
  version: "2.0.0",
  auth_required: true,
  protected_resource_metadata: `${appConfig.azure.resourceUrl}/.well-known/oauth-protected-resource`,
  authorization_server_metadata: `${appConfig.azure.resourceUrl}/.well-known/oauth-authorization-server`,
  endpoints: {
    "GET /": "Server info (unauthenticated)",
    "GET /health": "Health check (unauthenticated)",
    "POST /mcp": "MCP JSON-RPC endpoint (requires Bearer token)",
    "GET /mcp": "MCP SSE endpoint -- returns 405 in stateless mode (requires Bearer token)",
    "GET /.well-known/oauth-protected-resource": "RFC 9728 discovery (unauthenticated)",
    "GET /.well-known/oauth-authorization-server": "OAuth 2.0 Authorization Server Metadata (unauthenticated)",
    "GET /.well-known/openid-configuration": "OpenID Connect Discovery (unauthenticated)",
    "POST /register": "Dynamic Client Registration (unauthenticated)",
    "GET /authorize": "OAuth authorization redirect (unauthenticated)",
    "POST /token": "OAuth token proxy (unauthenticated)",
  },
}));
```

### Updated discovery.test.ts assertion
```typescript
// BEFORE:
it("contains authorization_servers with a valid URL including tenant ID", async () => {
  const body = res.json();
  expect(body.authorization_servers).toBeInstanceOf(Array);
  expect(body.authorization_servers.length).toBeGreaterThanOrEqual(1);
  const server = body.authorization_servers[0];
  expect(() => new URL(server)).not.toThrow();
  expect(server).toContain(FAKE_TENANT_ID);
});

// AFTER:
it("contains authorization_servers referencing self (MCP_RESOURCE_URL)", async () => {
  const body = res.json();
  expect(body.authorization_servers).toBeInstanceOf(Array);
  expect(body.authorization_servers.length).toBeGreaterThanOrEqual(1);
  const server = body.authorization_servers[0];
  expect(() => new URL(server)).not.toThrow();
  expect(server).toBe(FAKE_RESOURCE_URL);
});
```

### route-protection.test.ts additions (INTG-01)
```typescript
// Add to existing "Route protection" describe block:
it("GET /.well-known/oauth-authorization-server without token returns 200", async () => {
  const res = await app.inject({
    method: "GET",
    url: "/.well-known/oauth-authorization-server",
  });
  expect(res.statusCode).toBe(200);
});

it("GET /.well-known/openid-configuration without token returns 200", async () => {
  const res = await app.inject({
    method: "GET",
    url: "/.well-known/openid-configuration",
  });
  expect(res.statusCode).toBe(200);
});

it("POST /register without token returns 201", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/register",
    headers: { "content-type": "application/json" },
    payload: { client_name: "test" },
  });
  expect(res.statusCode).toBe(201);
});

it("GET /authorize without token returns 302 or 400 (not 401)", async () => {
  const res = await app.inject({
    method: "GET",
    url: "/authorize",
    query: {
      client_id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      redirect_uri: "http://localhost:3000/callback",
      response_type: "code",
    },
  });
  // Should redirect to Azure AD (302) or return param error (400)
  // MUST NOT return 401 (that would mean auth was required)
  expect(res.statusCode).not.toBe(401);
});

it("POST /token without token returns non-401 status", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/token",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: "grant_type=authorization_code&code=test&client_id=6ba7b810-9dad-11d1-80b4-00c04fd430c8&redirect_uri=http://localhost:3000/callback",
  });
  // Mock fetch returns 400, which is fine -- just verify it's not 401
  expect(res.statusCode).not.toBe(401);
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Protected Resource Metadata points to Azure AD directly | PRM points to self (OAuth proxy) | Phase 14 (this phase) | MCP clients discover proxy as their authorization server; scope mapping and resource stripping happen transparently |
| Claude Desktop constructs paths from base URL | MCP spec (2025-11-25) says read metadata | 2025-11-25 | Both paths work: metadata readers discover self, path constructors hit root-level `/authorize` and `/token` |
| DCR was REQUIRED | DCR is now optional fallback after Client ID Metadata Documents | 2025-11-25 | Still needed for backwards compatibility; this server supports DCR |

**MCP Spec Discovery Chain (2025-11-25):**
1. Client requests MCP endpoint without token, gets 401 with `WWW-Authenticate: Bearer resource_metadata="..."`
2. Client fetches `/.well-known/oauth-protected-resource` (from header or well-known fallback)
3. Client extracts `authorization_servers[0]` from PRM response
4. Client fetches `/.well-known/oauth-authorization-server` from authorization server URL
5. Client reads `registration_endpoint`, `authorization_endpoint`, `token_endpoint`, `code_challenge_methods_supported` from AS metadata
6. Client registers via DCR (or uses pre-registered/CIMD)
7. Client initiates PKCE authorization code flow via `authorization_endpoint`
8. Client exchanges code for tokens via `token_endpoint`
9. Client uses access token in `Authorization: Bearer` header for MCP requests

## Open Questions

1. **smoke.test.ts parity**
   - What we know: `smoke.test.ts` constructs its own Fastify server directly (not via `buildTestApp()`) and only registers `publicRoutes` and `protectedRoutes`.
   - What's unclear: Whether we should update `smoke.test.ts` to also register `oauthProxyRoutes` for full parity.
   - Recommendation: Do NOT update `smoke.test.ts` in this phase. It tests the MCP protocol flow, not OAuth proxy. The E2E test and route-protection tests cover proxy endpoints. Updating smoke test would be scope creep and risk breakage of an existing comprehensive test.

2. **OAuthProxyOptions interface shape**
   - What we know: Phase 13 designs the interface with `appConfig` and optional `fetch` injection.
   - What's unclear: The exact property name and type for fetch injection (depends on Phase 13 implementation).
   - Recommendation: Reference the interface as designed in Phases 11-13. If `fetch` is `typeof globalThis.fetch`, the mock in `buildTestApp()` must match that signature.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.1 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/e2e-flow.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| META-03 | PRM `authorization_servers` references self | integration | `npx vitest run tests/discovery.test.ts -t "authorization_servers"` | Yes -- update assertion |
| INTG-01 | Proxy endpoints are public (no 401) | integration | `npx vitest run tests/route-protection.test.ts -t "oauth-authorization-server"` | Yes -- add assertions |
| INTG-01 | `/authorize`, `/token`, `/register` are public | integration | `npx vitest run tests/route-protection.test.ts -t "register"` | Yes -- add assertions |
| INTG-02 | Full discovery chain works end-to-end | integration | `npx vitest run tests/e2e-flow.test.ts` | No -- Wave 0 |
| INTG-02 | Discovery chain: PRM -> AS metadata -> DCR -> authorize -> token | integration | `npx vitest run tests/e2e-flow.test.ts -t "discovery chain"` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/e2e-flow.test.ts tests/discovery.test.ts tests/route-protection.test.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/e2e-flow.test.ts` -- covers INTG-02 (full discovery chain)
- [ ] `tests/helpers/build-test-app.ts` -- must register `oauthProxyRoutes` with mock fetch (update existing file)
- [ ] `tests/discovery.test.ts` -- update `authorization_servers` assertion for META-03
- [ ] `tests/route-protection.test.ts` -- add proxy endpoint public access assertions for INTG-01
- No framework install needed -- Vitest 4.1.1 already configured

## Sources

### Primary (HIGH confidence)
- [MCP Authorization Specification (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) -- Full discovery chain flow, PRM requirements, AS metadata discovery sequence
- [RFC 9728 - OAuth 2.0 Protected Resource Metadata](https://datatracker.ietf.org/doc/html/rfc9728) -- `authorization_servers` field requirement, discovery mechanism
- Existing codebase: `src/server.ts`, `src/routes/public-routes.ts`, `tests/helpers/build-test-app.ts`, `tests/discovery.test.ts`, `tests/route-protection.test.ts` -- direct source code inspection
- Phase 11 Research (`.planning/phases/11-discovery-and-registration-endpoints/11-RESEARCH.md`) -- OAuth proxy plugin architecture, metadata field specifications

### Secondary (MEDIUM confidence)
- Phase 11-13 CONTEXT.md files -- Design decisions for the OAuth proxy plugin (not yet implemented at time of research)
- [RFC 8414 - OAuth 2.0 Authorization Server Metadata](https://datatracker.ietf.org/doc/html/rfc8414) -- Metadata field names and requirements

### Tertiary (LOW confidence)
- None -- all findings verified against primary sources and existing codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Zero new dependencies, all existing code
- Architecture: HIGH - Direct extension of established plugin registration patterns; every integration point inspected in source
- Pitfalls: HIGH - All pitfalls derived from actual codebase analysis (e.g., `smoke.test.ts` divergence, `discovery.test.ts` assertion)
- E2E test approach: MEDIUM - Depends on Phase 11-13 implementation completing first (plugin interface shape)

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable patterns, no moving targets)
