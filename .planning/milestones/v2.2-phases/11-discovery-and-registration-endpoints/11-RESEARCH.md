# Phase 11: Discovery and Registration Endpoints - Research

**Researched:** 2026-03-25
**Domain:** OAuth 2.0 Authorization Server Metadata (RFC 8414), Dynamic Client Registration (RFC 7591), MCP Authorization Spec
**Confidence:** HIGH

## Summary

Phase 11 implements three static-response endpoints: two OAuth authorization server metadata endpoints (`/.well-known/oauth-authorization-server` and `/.well-known/openid-configuration`) and one Dynamic Client Registration endpoint (`POST /register`). All return pre-configured JSON -- no outbound Azure AD calls are needed. The endpoints go in a new `src/routes/oauth-proxy.ts` Fastify plugin, following the established pattern from `public-routes.ts`.

The implementation is straightforward because every response is a static JSON object derived from `AppConfig` values that already exist (`azure.clientId`, `azure.tenantId`, `azure.resourceUrl`). The `buildAzureEndpoints()` function from Phase 10 provides the `authorization_endpoint` and `token_endpoint` URLs. Fastify's built-in JSON body parser handles `POST /register` content-type validation (returns 415 automatically for non-JSON).

**Primary recommendation:** Create a single Fastify plugin (`oauthProxyRoutes`) with a shared metadata builder function, register it in `server.ts` and `build-test-app.ts`, and write one test file covering all three endpoints.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Discovery metadata fields: Include all MCP-required fields (`authorization_endpoint`, `token_endpoint`, `registration_endpoint`, `response_types_supported`, `grant_types_supported`, `code_challenge_methods_supported: ["S256"]`), plus `scopes_supported`, `issuer` set to `MCP_RESOURCE_URL`, `token_endpoint_auth_methods_supported: ["none"]`, and `Cache-Control: public, max-age=3600`
- `/.well-known/oauth-authorization-server` and `/.well-known/openid-configuration` return identical content
- Registration response: `client_id`, `token_endpoint_auth_method: "none"`, `grant_types: ["authorization_code", "refresh_token"]`, `response_types: ["code"]` -- no `client_id_issued_at`, idempotent, HTTP 201 Created
- Registration validation: Accept any valid JSON body, reject non-JSON with 400, require `Content-Type: application/json` (415 otherwise), log `client_name` if present
- Route organization: All endpoints in new `src/routes/oauth-proxy.ts` Fastify plugin, protected-resource metadata stays in `public-routes.ts`, register `oauthProxyRoutes` in `server.ts` during this phase
- Update GET / server info to list new OAuth proxy endpoints

### Claude's Discretion
- Exact plugin options interface shape for oauthProxyRoutes
- Whether to use a shared metadata builder function or inline the JSON
- Test file organization (single test file or split by endpoint)
- Error response format for 400/415 on /register

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| META-01 | Server serves OAuth authorization server metadata at both `/.well-known/oauth-authorization-server` and `/.well-known/openid-configuration` with identical content | RFC 8414 metadata fields documented in Standard Stack section; `buildAzureEndpoints()` from Phase 10 provides authorize/token URLs; `SUPPORTED_SCOPES` from `scopes.ts` provides scopes_supported |
| META-02 | Discovery document includes `code_challenge_methods_supported: ["S256"]` and all MCP-required fields | MCP spec REQUIRES `code_challenge_methods_supported` for OIDC discovery; RFC 8414 REQUIRES `issuer`, `authorization_endpoint`, `token_endpoint`, `response_types_supported`; full field list in Architecture Patterns |
| REGN-01 | `POST /register` accepts RFC 7591 DCR request and returns pre-configured Azure AD `client_id` with no `client_secret` (public client) | RFC 7591 response format documented; `token_endpoint_auth_method: "none"` signals public client; 201 Created status code per spec |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Fastify | 4.27.2 | HTTP server, route registration, JSON body parsing | Already the project's HTTP framework; built-in JSON content-type parser handles 415 automatically |
| Zod | 3.25.17 | Optional: validate registration request body structure | Already used for all external input validation in the project |

### From Phase 10 (dependencies)
| Module | Location | Purpose | Provides |
|--------|----------|---------|----------|
| `buildAzureEndpoints()` | `src/oauth-proxy/azure-endpoints.ts` | Azure AD authorize/token URLs | `authorization_endpoint` and `token_endpoint` values for metadata |
| `AzureEndpoints` | `src/oauth-proxy/azure-endpoints.ts` | Type for endpoint URLs | Type safety in metadata construction |
| `SUPPORTED_SCOPES` | `src/scopes.ts` | Flat array of scope strings | `scopes_supported` field value |

### Existing Patterns (reuse)
| Pattern | Location | Purpose |
|---------|----------|---------|
| `PublicRoutesOptions` interface | `src/routes/public-routes.ts` | Template for plugin options typing |
| `AppConfig` type | `src/config.ts` | All needed config values already present |
| `buildTestApp()` | `tests/helpers/build-test-app.ts` | Must be extended to register new plugin |

### No New Dependencies
This phase requires zero new npm packages. Everything is built from existing Fastify features, Phase 10 utilities, and existing config values.

## Architecture Patterns

### Recommended Project Structure
```
src/
  routes/
    oauth-proxy.ts       # NEW: oauthProxyRoutes plugin (discovery + registration)
    public-routes.ts     # MODIFY: update GET / endpoints list
    mcp-routes.ts        # UNCHANGED
  oauth-proxy/
    azure-endpoints.ts   # EXISTING (Phase 10): buildAzureEndpoints()
    scope-mapper.ts      # EXISTING (Phase 10): mapScopes(), stripResourceParam()
  server.ts              # MODIFY: register oauthProxyRoutes plugin
tests/
  helpers/
    build-test-app.ts    # MODIFY: register oauthProxyRoutes plugin
  oauth-proxy-discovery.test.ts  # NEW: test all three endpoints
```

### Pattern 1: OAuth Proxy Plugin with Typed Options

**What:** A Fastify plugin following the same structure as `publicRoutes` -- typed options interface, `appConfig` dependency injection, async plugin function.

**When to use:** For all Phase 11-14 OAuth proxy routes.

**Example:**
```typescript
// src/routes/oauth-proxy.ts
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { buildAzureEndpoints } from "../oauth-proxy/azure-endpoints.js";
import { SUPPORTED_SCOPES } from "../scopes.js";

export interface OAuthProxyOptions {
  appConfig: AppConfig;
}

export async function oauthProxyRoutes(
  fastify: FastifyInstance,
  opts: OAuthProxyOptions,
): Promise<void> {
  const { appConfig } = opts;
  const azureEndpoints = buildAzureEndpoints(appConfig.azure.tenantId);

  // Build metadata once at plugin registration time
  const metadata = {
    issuer: appConfig.azure.resourceUrl,
    authorization_endpoint: `${appConfig.azure.resourceUrl}/authorize`,
    token_endpoint: `${appConfig.azure.resourceUrl}/token`,
    registration_endpoint: `${appConfig.azure.resourceUrl}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: SUPPORTED_SCOPES,
  };

  // GET /.well-known/oauth-authorization-server
  fastify.get("/.well-known/oauth-authorization-server", async (_req, reply) => {
    return reply
      .header("Cache-Control", "public, max-age=3600")
      .send(metadata);
  });

  // GET /.well-known/openid-configuration (identical content)
  fastify.get("/.well-known/openid-configuration", async (_req, reply) => {
    return reply
      .header("Cache-Control", "public, max-age=3600")
      .send(metadata);
  });

  // POST /register (RFC 7591 DCR)
  fastify.post("/register", async (request, reply) => {
    // Fastify auto-rejects non-JSON with 415
    // Log client_name if present for observability
    const body = request.body as Record<string, unknown> | null;
    if (body && typeof body === "object" && "client_name" in body) {
      request.log.info({ client_name: body.client_name }, "DCR registration request");
    }

    return reply.status(201).send({
      client_id: appConfig.azure.clientId,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    });
  });
}
```

### Pattern 2: Metadata Endpoint URLs Point to Self (Not Azure AD)

**What:** The `authorization_endpoint` and `token_endpoint` in metadata point to THIS server's own `/authorize` and `/token` paths, NOT directly to Azure AD. This is because this server IS the authorization server proxy.

**Why:** Claude.ai ignores metadata endpoint URLs and constructs paths from the MCP server base URL (documented bug in claude-ai-mcp#82). Even MCP clients that do read metadata need to hit the proxy for scope mapping and resource parameter stripping. The `buildAzureEndpoints()` from Phase 10 is used internally by Phase 12/13 to construct the upstream redirect/proxy URLs, not exposed in metadata.

**Critical distinction:**
- Metadata `authorization_endpoint`: `${MCP_RESOURCE_URL}/authorize` (self)
- Metadata `token_endpoint`: `${MCP_RESOURCE_URL}/token` (self)
- Internal proxy target (Phase 12/13): `buildAzureEndpoints(tenantId)` -> Azure AD URLs

### Pattern 3: Registration in server.ts and build-test-app.ts

**What:** Register `oauthProxyRoutes` at root scope (like `publicRoutes`) since all endpoints are unauthenticated.

**Example for server.ts:**
```typescript
import { oauthProxyRoutes } from "./routes/oauth-proxy.js";

// In buildApp():
server.register(oauthProxyRoutes, { appConfig });
```

**Example for build-test-app.ts:**
```typescript
import { oauthProxyRoutes } from "../../src/routes/oauth-proxy.js";

// In buildTestApp():
server.register(oauthProxyRoutes, { appConfig });
```

### Anti-Patterns to Avoid
- **Do NOT expose Azure AD URLs in metadata:** The proxy IS the authorization server from the client's perspective. Exposing Azure AD URLs would bypass scope mapping.
- **Do NOT validate specific RFC 7591 fields in the request body:** The locked decision says accept any valid JSON. Over-validating breaks clients that send minimal or non-standard fields.
- **Do NOT use `fastify-plugin` wrapper:** The oauth-proxy plugin should be encapsulated (like `publicRoutes`), not leak decorators to parent scope.
- **Do NOT build metadata lazily per-request:** Compute it once at plugin registration time. The values are static from config.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON body parsing | Custom content-type check | Fastify built-in JSON parser | Fastify already returns 415 for non-`application/json` POST requests; handles charset variants |
| HTTP caching | Custom Date/ETag headers | `Cache-Control: public, max-age=3600` header | Matches existing pattern from protected-resource metadata endpoint |
| Azure AD endpoint URL construction | Manual string template | `buildAzureEndpoints()` from Phase 10 | Already tested, typed, consistent URL format |
| Scope list | Hardcoded array | `SUPPORTED_SCOPES` from `scopes.ts` | Single source of truth, auto-updates if scopes change |

**Key insight:** This phase has zero complex logic. Every response is a static JSON object built from config values. The main risk is incorrect metadata field names or values, not algorithmic complexity.

## Common Pitfalls

### Pitfall 1: Metadata Endpoints Pointing to Azure AD Instead of Self
**What goes wrong:** `authorization_endpoint` and `token_endpoint` in metadata point to `login.microsoftonline.com` URLs instead of the proxy's own `/authorize` and `/token`.
**Why it happens:** Natural instinct to point to the "real" auth server. But this server IS the authorization server from the MCP client's perspective.
**How to avoid:** Metadata endpoints use `${appConfig.azure.resourceUrl}/authorize` and `${appConfig.azure.resourceUrl}/token`. Azure AD URLs are only used internally by Phase 12/13 proxy logic.
**Warning signs:** MCP clients bypass scope mapping; Azure AD rejects bare `wikijs:read` scopes.

### Pitfall 2: Fastify 415 Behavior Misunderstanding
**What goes wrong:** Implementing custom content-type checking when Fastify already handles it.
**Why it happens:** Not knowing Fastify's default JSON parser behavior.
**How to avoid:** Fastify 4 parses `application/json` by default. For POST routes, if the `Content-Type` is not `application/json`, Fastify returns `415 Unsupported Media Type` with error code `FST_ERR_CTP_INVALID_MEDIA_TYPE`. This satisfies the locked decision "require Content-Type: application/json -- return 415 otherwise."
**Warning signs:** Duplicate content-type logic, tests for 415 that don't actually exercise Fastify's built-in behavior.

### Pitfall 3: Missing Plugin Registration in Test Helper
**What goes wrong:** Tests pass for individual route handlers but integration tests fail because `buildTestApp()` doesn't register `oauthProxyRoutes`.
**Why it happens:** Forgetting to update `build-test-app.ts` alongside `server.ts`.
**How to avoid:** Register `oauthProxyRoutes` in both `server.ts:buildApp()` AND `tests/helpers/build-test-app.ts:buildTestApp()` in the same task.
**Warning signs:** 404 responses in tests for `/.well-known/oauth-authorization-server`.

### Pitfall 4: Forgetting to Update GET / Endpoint Listing
**What goes wrong:** Server info endpoint at GET `/` doesn't list the new endpoints, making manual discovery harder.
**Why it happens:** Small detail buried in requirements.
**How to avoid:** Add entries for all three new endpoints to the `endpoints` object in `public-routes.ts`.

### Pitfall 5: Invalid JSON Body Handling for /register
**What goes wrong:** Sending a request with `Content-Type: application/json` but invalid JSON body.
**Why it happens:** Fastify returns `400 Bad Request` with `FST_ERR_CTP_INVALID_CONTENT_LENGTH` or parse error.
**How to avoid:** This is actually handled correctly by Fastify out of the box -- invalid JSON with correct Content-Type returns 400. The locked decision says "reject non-JSON with 400" which aligns with Fastify's default behavior.

### Pitfall 6: registration_endpoint Path in Metadata
**What goes wrong:** Using just `/register` instead of the full URL `${MCP_RESOURCE_URL}/register`.
**Why it happens:** Confusion between route path and metadata value.
**How to avoid:** All endpoint URLs in RFC 8414 metadata MUST be absolute URLs. Use `${appConfig.azure.resourceUrl}/register`.

## Code Examples

### Complete Metadata Object (verified against RFC 8414 + MCP spec)
```typescript
// All field names from RFC 8414 Section 2
// MCP spec REQUIRES code_challenge_methods_supported for OIDC discovery
const metadata = {
  // REQUIRED by RFC 8414
  issuer: appConfig.azure.resourceUrl,                              // string URL
  authorization_endpoint: `${appConfig.azure.resourceUrl}/authorize`,// string URL
  token_endpoint: `${appConfig.azure.resourceUrl}/token`,           // string URL
  response_types_supported: ["code"],                                // array

  // OPTIONAL by RFC 8414, needed by MCP
  registration_endpoint: `${appConfig.azure.resourceUrl}/register`, // string URL
  grant_types_supported: ["authorization_code", "refresh_token"],   // array
  code_challenge_methods_supported: ["S256"],                        // array (MCP REQUIRES this)
  token_endpoint_auth_methods_supported: ["none"],                   // array (signals public client)
  scopes_supported: SUPPORTED_SCOPES,                                // array ["wikijs:read", "wikijs:write", "wikijs:admin"]
};
```

### Complete Registration Response (verified against RFC 7591 Section 3.2)
```typescript
// HTTP 201 Created, Content-Type: application/json
const registrationResponse = {
  client_id: appConfig.azure.clientId,          // REQUIRED by RFC 7591
  token_endpoint_auth_method: "none",           // signals public client
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
  // No client_secret (public client)
  // No client_id_issued_at (locked decision: static, not dynamically issued)
};
```

### Test Pattern for Discovery Endpoint
```typescript
// Source: adapted from existing tests/discovery.test.ts pattern
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp } from "./helpers/build-test-app.js";

describe("GET /.well-known/oauth-authorization-server", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 200 with all required metadata fields", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-authorization-server",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.issuer).toBeDefined();
    expect(body.authorization_endpoint).toBeDefined();
    expect(body.token_endpoint).toBeDefined();
    expect(body.registration_endpoint).toBeDefined();
    expect(body.response_types_supported).toEqual(["code"]);
    expect(body.grant_types_supported).toContain("authorization_code");
    expect(body.code_challenge_methods_supported).toEqual(["S256"]);
  });

  it("includes Cache-Control header", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-authorization-server",
    });
    expect(res.headers["cache-control"]).toBe("public, max-age=3600");
  });

  it("is accessible without authorization", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-authorization-server",
    });
    expect(res.statusCode).toBe(200);
  });
});
```

### Test Pattern for Registration Endpoint
```typescript
describe("POST /register", () => {
  it("returns 201 with client_id and no client_secret", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/register",
      headers: { "content-type": "application/json" },
      payload: { client_name: "Test MCP Client" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.client_id).toBeDefined();
    expect(body).not.toHaveProperty("client_secret");
    expect(body.token_endpoint_auth_method).toBe("none");
  });

  it("returns 415 for non-JSON content type", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/register",
      headers: { "content-type": "text/plain" },
      payload: "not json",
    });
    expect(res.statusCode).toBe(415);
  });

  it("is idempotent -- same response every time", async () => {
    const res1 = await app.inject({
      method: "POST",
      url: "/register",
      headers: { "content-type": "application/json" },
      payload: { client_name: "Client A" },
    });
    const res2 = await app.inject({
      method: "POST",
      url: "/register",
      headers: { "content-type": "application/json" },
      payload: { client_name: "Client B" },
    });
    expect(res1.json().client_id).toBe(res2.json().client_id);
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| MCP clients construct `/authorize`, `/token` from base URL | MCP spec (2025-06-18) says read metadata; but Claude.ai still constructs from base URL | 2025-06-18 | Root-level paths required for Claude.ai compatibility; metadata still needed for spec-compliant clients |
| Dynamic Client Registration was REQUIRED in old MCP auth spec | DCR is now optional fallback after Client ID Metadata Documents | 2025-06-18 | Still needed for backwards compatibility; `client_id_metadata_document_supported` deferred per REQUIREMENTS.md |
| OpenID Connect Discovery not mentioned | MCP spec REQUIRES servers support at least one of RFC 8414 or OIDC Discovery; clients MUST support both | Current | Serve both `/.well-known/oauth-authorization-server` and `/.well-known/openid-configuration` |

**Note:** Claude.ai's behavior of ignoring metadata endpoint URLs (claude-ai-mcp#82) is a known issue that validates this project's architecture decision to use root-level proxy paths and point metadata to self.

## Open Questions

1. **Fastify 415 for missing Content-Type header**
   - What we know: Fastify returns 415 for wrong Content-Type. If no Content-Type header is present on a POST, Fastify may treat it differently.
   - What's unclear: Whether Fastify returns 415 or 400 when Content-Type header is completely absent.
   - Recommendation: Write a test for missing Content-Type. If Fastify's default is acceptable (400 or 415), use it as-is. If not, add a preHandler check. LOW priority -- unlikely edge case for real MCP clients.

2. **Empty body on POST /register**
   - What we know: Locked decision says "accept any valid JSON body." An empty body `{}` is valid JSON.
   - What's unclear: Whether Fastify's JSON parser accepts a request with Content-Type application/json but zero-length body.
   - Recommendation: Write a test for empty body. If Fastify returns 400 (parse error), that's acceptable per the locked decision "reject non-JSON with 400."

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.1 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/oauth-proxy-discovery.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| META-01 | Both .well-known endpoints return identical metadata JSON | integration | `npx vitest run tests/oauth-proxy-discovery.test.ts -t "oauth-authorization-server"` | No -- Wave 0 |
| META-01 | Both endpoints accessible without auth | integration | `npx vitest run tests/oauth-proxy-discovery.test.ts -t "without authorization"` | No -- Wave 0 |
| META-02 | Metadata includes code_challenge_methods_supported and all MCP-required fields | integration | `npx vitest run tests/oauth-proxy-discovery.test.ts -t "required metadata fields"` | No -- Wave 0 |
| REGN-01 | POST /register returns 201 with client_id, no client_secret | integration | `npx vitest run tests/oauth-proxy-discovery.test.ts -t "register"` | No -- Wave 0 |
| REGN-01 | POST /register rejects non-JSON with 415 | integration | `npx vitest run tests/oauth-proxy-discovery.test.ts -t "415"` | No -- Wave 0 |
| REGN-01 | POST /register is idempotent | integration | `npx vitest run tests/oauth-proxy-discovery.test.ts -t "idempotent"` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/oauth-proxy-discovery.test.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/oauth-proxy-discovery.test.ts` -- covers META-01, META-02, REGN-01
- [ ] `tests/helpers/build-test-app.ts` -- must register `oauthProxyRoutes` plugin
- No framework install needed -- Vitest 4.1.1 already configured

## Sources

### Primary (HIGH confidence)
- [RFC 8414 - OAuth 2.0 Authorization Server Metadata](https://www.rfc-editor.org/rfc/rfc8414.html) - Section 2 metadata fields, Section 3 HTTP response requirements
- [RFC 7591 - OAuth 2.0 Dynamic Client Registration Protocol](https://www.rfc-editor.org/rfc/rfc7591) - Section 3.2 response format, 201 Created, required `client_id` field
- [MCP Authorization Specification](https://modelcontextprotocol.io/specification/draft/basic/authorization) - Required metadata fields, PKCE requirement, discovery mechanisms
- Existing codebase: `src/routes/public-routes.ts`, `src/server.ts`, `src/config.ts`, `src/scopes.ts`, `src/oauth-proxy/azure-endpoints.ts`

### Secondary (MEDIUM confidence)
- [Claude.ai MCP OAuth Issue #82](https://github.com/anthropics/claude-ai-mcp/issues/82) - Confirms Claude.ai ignores metadata endpoint URLs, constructs from base URL -- validates root-level path architecture
- [Fastify Content-Type handling](https://github.com/fastify/fastify/issues/202) - Fastify returns 415 for unregistered content types on POST routes

### Tertiary (LOW confidence)
- None -- all findings verified against primary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Zero new dependencies, all config values exist, Phase 10 utilities ready
- Architecture: HIGH - Direct extension of established Fastify plugin pattern, all integration points identified in existing codebase
- Pitfalls: HIGH - All pitfalls verified against RFC specs and existing codebase patterns

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable RFCs, static endpoints)
