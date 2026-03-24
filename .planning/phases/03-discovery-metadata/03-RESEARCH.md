# Phase 3: Discovery Metadata - Research

**Researched:** 2026-03-24
**Domain:** RFC 9728 Protected Resource Metadata, MCP authorization discovery, Vitest testing
**Confidence:** HIGH

## Summary

This phase implements a single unauthenticated GET endpoint (`/.well-known/oauth-protected-resource`) returning RFC 9728-compliant Protected Resource Metadata JSON, and defines a scope-to-tool mapping module for consumption by Phase 4/5 enforcement middleware. The RFC 9728 specification is straightforward -- the endpoint returns a JSON object with `application/json` content type containing fields like `resource`, `authorization_servers`, `scopes_supported`, and `bearer_methods_supported`. The MCP specification (draft) REQUIRES servers to implement RFC 9728 and REQUIRES the `authorization_servers` field to contain at least one authorization server.

Phase 2 establishes the config module (`src/config.ts`) with Zod-validated environment variables including `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, and `MCP_RESOURCE_URL`. Phase 3 derives the Azure AD v2.0 issuer URL (`https://login.microsoftonline.com/{AZURE_TENANT_ID}/v2.0`) from the tenant ID and uses `MCP_RESOURCE_URL` as the `resource` field. The scope-to-tool mapping is a pure data structure mapping three scope names (`wikijs.read`, `wikijs.write`, `wikijs.admin`) to the 17 existing tool names.

Testing uses Vitest with Fastify's built-in `.inject()` method for integration tests -- no running server or Azure AD connectivity needed. Phase 2's CONTEXT.md specifies Vitest as the test framework, which Phase 3 will either install (if Phase 2 has not been implemented yet) or consume the existing setup.

**Primary recommendation:** Create a `src/scopes.ts` module defining the scope-to-tool mapping as an exported constant, a route handler in `src/server.ts` (or a Fastify plugin) for `/.well-known/oauth-protected-resource` that builds the metadata response from config values, and integration tests using `fastify.inject()` via Vitest.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Three per-category scopes using short names: `wikijs.read`, `wikijs.write`, `wikijs.admin`
- Read/Write/Admin split across existing tools:
  - `wikijs.read`: get_page, get_page_content, list_pages, list_all_pages, search_pages, search_unpublished_pages, get_page_status
  - `wikijs.write`: create_page, update_page, publish_page
  - `wikijs.admin`: delete_page, force_delete_page, list_users, search_users, list_groups, create_user, update_user
- Phase 3 defines both the metadata response AND the scope-to-tool mapping config (shared module for Phase 4/5 enforcement)
- Short scope names (not Azure AD `api://` prefix format)
- Required metadata fields: `resource` (from MCP_RESOURCE_URL), `authorization_servers` (derived from AZURE_TENANT_ID), `scopes_supported`, `bearer_methods_supported` (["header"])
- Optional included: `resource_signing_alg_values_supported` hardcoded to ["RS256"]
- Optional included: `resource_documentation` from new env var MCP_RESOURCE_DOCS_URL -- omitted from response if env var is not set
- Response includes `Cache-Control: public, max-age=3600` header
- Test runner: Vitest (new dependency)
- Integration tests using Fastify's `.inject()` -- no real server or Azure AD needed
- Explicit test that endpoint is accessible without Authorization header (DISC-03)
- Tests for missing required env vars (AZURE_TENANT_ID, AZURE_CLIENT_ID, MCP_RESOURCE_URL)
- Tests for resource_documentation present/absent based on MCP_RESOURCE_DOCS_URL
- URL format assertions are non-brittle (assert valid URL, not exact format)
- Test scope-to-tool mapping config: every tool assigned exactly one scope, all three scopes have at least one tool

### Claude's Discretion
- Exact file/module organization for the scope-to-tool mapping config
- Vitest configuration details
- Whether to use a Fastify plugin for the metadata route or inline it

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DISC-01 | GET /.well-known/oauth-protected-resource returns RFC 9728 Protected Resource Metadata JSON | RFC 9728 Section 2+3 define the exact fields and well-known URI; response is `application/json` with metadata object; MCP spec REQUIRES servers to implement this endpoint |
| DISC-02 | Metadata includes resource URL, authorization_servers, scopes_supported, bearer_methods_supported | RFC 9728 defines `resource` (REQUIRED), `authorization_servers` (OPTIONAL per RFC, REQUIRED per MCP spec with >= 1 entry), `scopes_supported` (RECOMMENDED), `bearer_methods_supported` (OPTIONAL); all populated from config/hardcoded values |
| DISC-03 | Discovery endpoint remains unauthenticated | Endpoint is registered as a standard Fastify GET route with no auth hooks; verified by test that omits Authorization header and still gets 200 |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastify | ^4.27.2 | HTTP framework (already in project) | Provides route registration and `.inject()` for testing; already the project's server framework |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | ^4.1.1 | Test framework | Integration tests; ESM-native, TypeScript out-of-box, fast |

### No New Runtime Dependencies

This phase adds NO new runtime dependencies. The metadata endpoint is pure data transformation (config values to JSON response). Vitest is a devDependency only.

**Installation:**
```bash
npm install -D vitest
```

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vitest 4.x | Vitest 2.x | 2.x supports Node 18; 4.x requires Node >= 20. Dev machine is Node 25, so 4.x is fine. If CI runs Node 18, pin to 2.x |
| Inline route in server.ts | Fastify plugin | Plugin adds abstraction for a single route; inline is simpler and follows existing patterns in server.ts |

## Architecture Patterns

### Recommended Project Structure
```
src/
  server.ts          # Fastify server + routes (add well-known route here)
  scopes.ts          # NEW: scope-to-tool mapping + scope constants
  config.ts          # From Phase 2: Zod-validated env config
  api.ts             # WikiJsApi class (unchanged)
  types.ts           # TypeScript interfaces (unchanged)
tests/
  discovery.test.ts  # NEW: integration tests for the metadata endpoint
  scopes.test.ts     # NEW: unit tests for scope-to-tool mapping
vitest.config.ts     # NEW: Vitest configuration
```

### Pattern 1: RFC 9728 Metadata Response Construction

**What:** Build the Protected Resource Metadata JSON from config values and hardcoded constants.
**When to use:** In the route handler for `/.well-known/oauth-protected-resource`.

```typescript
// Source: RFC 9728 Section 2 (https://datatracker.ietf.org/doc/html/rfc9728#section-2)
// + MCP spec (https://modelcontextprotocol.io/specification/draft/basic/authorization)

import { SUPPORTED_SCOPES } from "./scopes.js";

// The authorization_servers value for Azure AD v2.0:
// https://login.microsoftonline.com/{AZURE_TENANT_ID}/v2.0
// This is the issuer identifier, NOT the authorization endpoint itself.
// MCP clients will fetch /.well-known/openid-configuration from this issuer
// to discover the actual authorization and token endpoints.

interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  scopes_supported: string[];
  bearer_methods_supported: string[];
  resource_signing_alg_values_supported: string[];
  resource_documentation?: string;
}

function buildMetadataResponse(config: AppConfig): ProtectedResourceMetadata {
  const metadata: ProtectedResourceMetadata = {
    resource: config.mcpResourceUrl,
    authorization_servers: [
      `https://login.microsoftonline.com/${config.azureTenantId}/v2.0`
    ],
    scopes_supported: SUPPORTED_SCOPES,
    bearer_methods_supported: ["header"],
    resource_signing_alg_values_supported: ["RS256"],
  };

  if (config.mcpResourceDocsUrl) {
    metadata.resource_documentation = config.mcpResourceDocsUrl;
  }

  return metadata;
}
```

**Critical detail:** The `authorization_servers` array contains the Azure AD v2.0 **issuer identifier** (not the full authorization endpoint URL). MCP clients follow RFC 8414 / OpenID Connect Discovery from this issuer to find actual endpoints. The issuer format is `https://login.microsoftonline.com/{tenant_id}/v2.0`.

### Pattern 2: Scope-to-Tool Mapping Module

**What:** A single-source-of-truth module defining which tools belong to which scope.
**When to use:** Imported by the metadata endpoint (for `scopes_supported`) and by Phase 4/5 auth middleware (for enforcement).

```typescript
// src/scopes.ts

/** The three OAuth scopes this server supports */
export const SCOPES = {
  READ: "wikijs.read",
  WRITE: "wikijs.write",
  ADMIN: "wikijs.admin",
} as const;

export type Scope = (typeof SCOPES)[keyof typeof SCOPES];

/** Map from scope name to the tool names it authorizes */
export const SCOPE_TOOL_MAP: Record<Scope, readonly string[]> = {
  [SCOPES.READ]: [
    "get_page",
    "get_page_content",
    "list_pages",
    "list_all_pages",
    "search_pages",
    "search_unpublished_pages",
    "get_page_status",
  ],
  [SCOPES.WRITE]: [
    "create_page",
    "update_page",
    "publish_page",
  ],
  [SCOPES.ADMIN]: [
    "delete_page",
    "force_delete_page",
    "list_users",
    "search_users",
    "list_groups",
    "create_user",
    "update_user",
  ],
} as const;

/** Flat array of all supported scope strings (for metadata response) */
export const SUPPORTED_SCOPES: string[] = Object.values(SCOPES);

/** Reverse lookup: tool name -> required scope */
export const TOOL_SCOPE_MAP: Record<string, Scope> = Object.entries(
  SCOPE_TOOL_MAP
).reduce(
  (acc, [scope, tools]) => {
    for (const tool of tools) {
      acc[tool] = scope as Scope;
    }
    return acc;
  },
  {} as Record<string, Scope>
);
```

**Key design:** The forward map (`SCOPE_TOOL_MAP`) is the source of truth. The reverse map (`TOOL_SCOPE_MAP`) is derived. Phase 4/5 middleware will use `TOOL_SCOPE_MAP[toolName]` to check if a token's scopes include the required scope for a given tool.

### Pattern 3: Fastify Route Registration

**What:** Register the well-known endpoint as a standard Fastify GET route.
**When to use:** During server setup in `src/server.ts`.

```typescript
// In src/server.ts (inline, following existing route pattern)

server.get("/.well-known/oauth-protected-resource", async (request, reply) => {
  const metadata = buildMetadataResponse(config);

  reply
    .header("Cache-Control", "public, max-age=3600")
    .header("Content-Type", "application/json")
    .send(metadata);
});
```

**Note:** Fastify auto-serializes objects to JSON and sets `Content-Type: application/json` by default, but explicit header setting ensures compliance with RFC 9728's `application/json` requirement and adds the Cache-Control header per user decision.

### Pattern 4: Vitest Configuration for ESM TypeScript Project

**What:** Minimal Vitest config for this project's ESM + TypeScript setup.
**When to use:** Project-wide test configuration.

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
  },
});
```

**Note:** The project uses `"type": "module"` and `"module": "NodeNext"` in tsconfig. Vitest 4.x handles ESM natively. No special transform plugins needed.

### Pattern 5: Fastify inject() Testing

**What:** Test HTTP endpoints without starting a real server.
**When to use:** Integration tests for the metadata endpoint.

```typescript
// tests/discovery.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify, { FastifyInstance } from "fastify";

let app: FastifyInstance;

beforeAll(async () => {
  // Set env vars before importing config
  process.env.AZURE_TENANT_ID = "00000000-0000-0000-0000-000000000001";
  process.env.AZURE_CLIENT_ID = "00000000-0000-0000-0000-000000000002";
  process.env.MCP_RESOURCE_URL = "https://mcp.example.com";

  // Build the Fastify app with routes
  app = buildApp(); // factory function that creates and configures the app
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("GET /.well-known/oauth-protected-resource", () => {
  it("returns 200 with valid RFC 9728 metadata", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-protected-resource",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.resource).toBe("https://mcp.example.com");
    expect(body.authorization_servers).toBeInstanceOf(Array);
    expect(body.authorization_servers.length).toBeGreaterThanOrEqual(1);
    expect(body.scopes_supported).toEqual(
      expect.arrayContaining(["wikijs.read", "wikijs.write", "wikijs.admin"])
    );
    expect(body.bearer_methods_supported).toEqual(["header"]);
  });

  it("is accessible without Authorization header (DISC-03)", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-protected-resource",
      // No Authorization header
    });

    expect(response.statusCode).toBe(200);
  });

  it("includes Cache-Control header", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-protected-resource",
    });

    expect(response.headers["cache-control"]).toBe("public, max-age=3600");
  });
});
```

### Anti-Patterns to Avoid
- **Hardcoding tenant ID in the metadata response:** Always derive from `AZURE_TENANT_ID` env var via the config module. Hardcoded values break when deploying to different tenants.
- **Using the authorization endpoint URL as the issuer identifier:** The `authorization_servers` field takes the issuer identifier (`https://login.microsoftonline.com/{tenant}/v2.0`), NOT the full authorization endpoint (`https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize`). MCP clients discover the actual endpoints via OpenID Connect Discovery from the issuer.
- **Making the metadata endpoint depend on WikiJS connectivity:** This endpoint returns static config-derived data. It must not call WikiJS APIs or fail if WikiJS is down.
- **Coupling test setup to real Azure AD:** Tests use fake tenant/client IDs via environment variables. No network calls.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP injection for tests | Custom HTTP client hitting localhost | Fastify `.inject()` | Inject bypasses TCP, is faster, doesn't need port allocation, and is Fastify's official test pattern |
| Test framework | Custom assertion helpers | Vitest `expect` + matchers | Vitest provides rich matchers, watch mode, TypeScript support out of box |
| JSON serialization with Content-Type | Manual `JSON.stringify` + header setting | Fastify's auto-serialization (return object from handler) | Fastify handles Content-Type and serialization; just set Cache-Control explicitly |

**Key insight:** The metadata endpoint is essentially a pure function from config to JSON. No external dependencies, no state, no async operations beyond reading config. Keep it simple.

## Common Pitfalls

### Pitfall 1: Wrong Authorization Server Identifier Format
**What goes wrong:** MCP clients fail to discover authorization endpoints because the `authorization_servers` value is not a valid issuer identifier.
**Why it happens:** Confusion between issuer ID, authorization endpoint, and OpenID Configuration URL. Azure AD has three different URL patterns:
- Issuer: `https://login.microsoftonline.com/{tenant_id}/v2.0` (this goes in `authorization_servers`)
- Authorization endpoint: `https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/authorize` (NOT this)
- OpenID Config: `https://login.microsoftonline.com/{tenant_id}/v2.0/.well-known/openid-configuration` (NOT this)
**How to avoid:** Use the issuer identifier format. MCP clients follow the RFC 8414 / OIDC discovery flow from the issuer to find endpoints.
**Warning signs:** MCP client authorization flow fails at the discovery step; client cannot find token/authorize endpoints.

### Pitfall 2: MCP_RESOURCE_DOCS_URL Conditional Inclusion
**What goes wrong:** The `resource_documentation` field appears in the response as `null` or empty string when the env var is not set.
**Why it happens:** Checking `if (config.mcpResourceDocsUrl)` but the config module returns an empty string instead of undefined for unset optional vars.
**How to avoid:** In the config Zod schema, use `.optional()` so the field is `undefined` when not set. Only add the field to the response object when the value is defined and non-empty. Do not include the key at all when absent (RFC 9728 optional fields should be omitted, not null).
**Warning signs:** Response JSON contains `"resource_documentation": null` or `"resource_documentation": ""`.

### Pitfall 3: Fastify App Factory for Testability
**What goes wrong:** Tests cannot create isolated Fastify instances because the server is created as a module-level side effect in `server.ts`.
**Why it happens:** Current `server.ts` creates and starts the server at import time. Tests need to create fresh instances with controlled config.
**How to avoid:** Extract a `buildApp(config)` factory function that creates and configures the Fastify instance without starting it. The `start()` function at the bottom of `server.ts` calls `buildApp()` then `listen()`. Tests call `buildApp()` directly with test config.
**Warning signs:** Tests pollute each other's state; port conflicts when running tests in parallel; cannot override env vars per test.

### Pitfall 4: Vitest ESM Import Resolution
**What goes wrong:** Vitest fails to resolve `.js` extension imports used throughout the project (e.g., `import { foo } from "./bar.js"`).
**Why it happens:** The project uses `"module": "NodeNext"` which requires `.js` extensions in import paths. Vitest uses Vite's resolver which may handle this differently.
**How to avoid:** Vitest 4.x resolves `.js` → `.ts` automatically when the source is TypeScript. No special configuration needed. If issues arise, add `resolve.extensions` to `vitest.config.ts`.
**Warning signs:** `Cannot find module './config.js'` errors when running tests.

### Pitfall 5: Scope Mapping Completeness
**What goes wrong:** A new tool is added in the future but not assigned to any scope, causing it to be unprotected or throw at runtime.
**Why it happens:** The scope mapping and tool registration are in separate modules with no compile-time enforcement.
**How to avoid:** Write a test that cross-references all registered tool names against the scope mapping, asserting every tool has exactly one scope and every scope has at least one tool. This test catches drift.
**Warning signs:** Tool calls succeed without proper scope checking after adding new tools.

## Code Examples

### Complete Metadata Endpoint Response (Expected)

```json
{
  "resource": "https://mcp.example.com",
  "authorization_servers": [
    "https://login.microsoftonline.com/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/v2.0"
  ],
  "scopes_supported": ["wikijs.read", "wikijs.write", "wikijs.admin"],
  "bearer_methods_supported": ["header"],
  "resource_signing_alg_values_supported": ["RS256"]
}
```

When `MCP_RESOURCE_DOCS_URL` is set:

```json
{
  "resource": "https://mcp.example.com",
  "authorization_servers": [
    "https://login.microsoftonline.com/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/v2.0"
  ],
  "scopes_supported": ["wikijs.read", "wikijs.write", "wikijs.admin"],
  "bearer_methods_supported": ["header"],
  "resource_signing_alg_values_supported": ["RS256"],
  "resource_documentation": "https://docs.example.com/mcp-server"
}
```

Source: RFC 9728 Section 3.2 example format (https://datatracker.ietf.org/doc/html/rfc9728#section-3.2)

### App Factory Pattern for Testability

```typescript
// src/server.ts -- refactored for testability

import Fastify, { FastifyInstance } from "fastify";
import { loadConfig, AppConfig } from "./config.js";
import { SUPPORTED_SCOPES } from "./scopes.js";

export function buildApp(config: AppConfig): FastifyInstance {
  const server = Fastify({ logger: true });

  // Health check
  server.get("/health", async () => ({ status: "ok" }));

  // RFC 9728 Protected Resource Metadata
  server.get("/.well-known/oauth-protected-resource", async (request, reply) => {
    const metadata: Record<string, unknown> = {
      resource: config.mcpResourceUrl,
      authorization_servers: [
        `https://login.microsoftonline.com/${config.azureTenantId}/v2.0`,
      ],
      scopes_supported: SUPPORTED_SCOPES,
      bearer_methods_supported: ["header"],
      resource_signing_alg_values_supported: ["RS256"],
    };

    if (config.mcpResourceDocsUrl) {
      metadata.resource_documentation = config.mcpResourceDocsUrl;
    }

    return reply
      .header("Cache-Control", "public, max-age=3600")
      .send(metadata);
  });

  // ... other routes (MCP, etc.)

  return server;
}

// Entry point (not executed during tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();
  const server = buildApp(config);
  await server.listen({ port: config.port, host: "0.0.0.0" });
}
```

### Scope Mapping Unit Test

```typescript
// tests/scopes.test.ts
import { describe, it, expect } from "vitest";
import { SCOPE_TOOL_MAP, TOOL_SCOPE_MAP, SCOPES, SUPPORTED_SCOPES } from "../src/scopes.js";

describe("Scope-to-tool mapping", () => {
  it("every tool is assigned exactly one scope", () => {
    const allTools = Object.values(SCOPE_TOOL_MAP).flat();
    const uniqueTools = new Set(allTools);
    // No duplicates
    expect(allTools.length).toBe(uniqueTools.size);
  });

  it("all three scopes have at least one tool", () => {
    for (const scope of SUPPORTED_SCOPES) {
      expect(SCOPE_TOOL_MAP[scope as keyof typeof SCOPE_TOOL_MAP].length).toBeGreaterThan(0);
    }
  });

  it("TOOL_SCOPE_MAP covers all tools in SCOPE_TOOL_MAP", () => {
    const allTools = Object.values(SCOPE_TOOL_MAP).flat();
    for (const tool of allTools) {
      expect(TOOL_SCOPE_MAP[tool]).toBeDefined();
    }
  });

  it("has exactly 17 tools mapped", () => {
    const allTools = Object.values(SCOPE_TOOL_MAP).flat();
    expect(allTools.length).toBe(17);
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No standard resource metadata | RFC 9728 Protected Resource Metadata | RFC published 2025 | Standardized way for clients to discover auth requirements |
| Custom discovery mechanisms | MCP spec requires RFC 9728 | MCP draft spec 2025 | MCP clients MUST use this for authorization server discovery |
| Azure AD v1.0 endpoints | Azure AD v2.0 endpoints (Microsoft identity platform) | 2019+ | Issuer format is `https://login.microsoftonline.com/{tenant}/v2.0` |

**Deprecated/outdated:**
- Azure AD v1.0 endpoints (`https://login.microsoftonline.com/{tenant}`): Replaced by v2.0 (`/v2.0` suffix)
- Custom `.well-known` paths for MCP: The MCP spec now standardizes on RFC 9728's `/.well-known/oauth-protected-resource`

## Open Questions

1. **Phase 2 app factory pattern**
   - What we know: Phase 2 CONTEXT.md specifies extracting config into `src/config.ts` and adding Vitest. Phase 3 needs a testable app factory (`buildApp(config)`) to test the metadata endpoint in isolation.
   - What's unclear: Whether Phase 2 will already refactor `server.ts` into a factory pattern, or if Phase 3 needs to do this.
   - Recommendation: Phase 3 planner should check if `buildApp()` exists from Phase 2. If not, include a task to extract the factory function as a prerequisite for testing. This is a small refactor (wrap existing server setup in a function).

2. **MCP_RESOURCE_DOCS_URL in Phase 2 config**
   - What we know: Phase 2 CONTEXT.md lists `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `MCP_RESOURCE_URL` but does NOT mention `MCP_RESOURCE_DOCS_URL`. Phase 3 CONTEXT.md adds this optional env var.
   - What's unclear: Whether Phase 2's Zod config schema will include `MCP_RESOURCE_DOCS_URL` or if Phase 3 must extend it.
   - Recommendation: Phase 3 should extend the config schema to add `MCP_RESOURCE_DOCS_URL` as optional. This is a small addition to the Zod schema in `src/config.ts`.

3. **Vitest installation timing**
   - What we know: Both Phase 2 and Phase 3 CONTEXT.md mention Vitest. Phase 2 says "Add Vitest as test framework" and Phase 3 says "Test runner: Vitest (new dependency)".
   - What's unclear: Whether Vitest will already be installed by Phase 2.
   - Recommendation: Phase 3 planner should include a conditional: if Vitest is not already installed, install it. If it is, just add tests. Use `vitest` in package.json scripts if not already present.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.x (devDependency, to be installed in Phase 2 or 3) |
| Config file | `vitest.config.ts` (to be created in Phase 2 or 3) |
| Quick run command | `npx vitest run tests/discovery.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DISC-01 | GET /.well-known/oauth-protected-resource returns RFC 9728 JSON | integration | `npx vitest run tests/discovery.test.ts -t "returns 200 with valid RFC 9728 metadata"` | No -- Wave 0 |
| DISC-02 | Metadata includes resource, authorization_servers, scopes_supported, bearer_methods_supported | integration | `npx vitest run tests/discovery.test.ts -t "includes all required metadata fields"` | No -- Wave 0 |
| DISC-03 | Endpoint accessible without authentication | integration | `npx vitest run tests/discovery.test.ts -t "accessible without Authorization header"` | No -- Wave 0 |
| N/A | Scope-to-tool mapping completeness (every tool mapped, no duplicates) | unit | `npx vitest run tests/scopes.test.ts` | No -- Wave 0 |
| N/A | resource_documentation conditional inclusion | integration | `npx vitest run tests/discovery.test.ts -t "resource_documentation"` | No -- Wave 0 |
| N/A | authorization_servers contains valid Azure AD v2.0 issuer URL | integration | `npx vitest run tests/discovery.test.ts -t "authorization_servers"` | No -- Wave 0 |
| N/A | Cache-Control header present | integration | `npx vitest run tests/discovery.test.ts -t "Cache-Control"` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run` (full suite, should be fast -- pure data + inject tests)
- **Per wave merge:** `npx vitest run` (same -- no slow tests expected)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `vitest.config.ts` -- Vitest configuration (may exist from Phase 2)
- [ ] `tests/discovery.test.ts` -- integration tests for metadata endpoint
- [ ] `tests/scopes.test.ts` -- unit tests for scope-to-tool mapping
- [ ] Vitest install: `npm install -D vitest` -- if not done in Phase 2
- [ ] App factory function `buildApp(config)` in `src/server.ts` -- if not done in Phase 2
- [ ] `package.json` test script: `"test": "vitest run"` -- if not done in Phase 2

## Sources

### Primary (HIGH confidence)
- RFC 9728 Protected Resource Metadata: https://datatracker.ietf.org/doc/html/rfc9728 -- Section 2 (metadata fields), Section 3 (well-known URI, example response)
- MCP Authorization Specification (draft): https://modelcontextprotocol.io/specification/draft/basic/authorization -- REQUIRES RFC 9728 implementation, REQUIRES `authorization_servers` field with >= 1 entry
- Azure AD v2.0 OpenID Configuration: https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration -- Confirmed issuer format `https://login.microsoftonline.com/{tenantid}/v2.0`
- Fastify Testing Guide: https://fastify.dev/docs/latest/Guides/Testing/ -- inject() API, app factory pattern

### Secondary (MEDIUM confidence)
- Vitest Getting Started: https://vitest.dev/guide/ -- v4.1.1 current, requires Node >= 20, ESM-native
- Vitest Fastify example: https://github.com/vitest-dev/vitest/blob/main/examples/fastify/test/app.test.ts -- inject pattern with Vitest

### Tertiary (LOW confidence)
- None -- all findings verified with primary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new runtime dependencies; Fastify already in project, Vitest is well-documented
- Architecture: HIGH - RFC 9728 is clear and simple; metadata endpoint is pure config-to-JSON
- Pitfalls: HIGH - Identified from actual code analysis (server.ts structure) and RFC specification reading
- Scope mapping: HIGH - Tool names verified from grep of tools.ts; scope assignments from user CONTEXT.md

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (RFC 9728 is stable; MCP spec draft may evolve but Protected Resource Metadata requirement is settled)
