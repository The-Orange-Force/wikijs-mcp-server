# Phase 12: Authorization Redirect Endpoint - Research

**Researched:** 2026-03-25
**Domain:** OAuth 2.1 authorization endpoint proxy (Fastify + Azure AD)
**Confidence:** HIGH

## Summary

Phase 12 implements a `GET /authorize` endpoint that acts as a transparent proxy, redirecting MCP clients to Azure AD's authorization endpoint with properly mapped scopes, stripped `resource` parameter, and PKCE passthrough. The endpoint performs local validation (client_id matching, required param checks), constructs the Azure AD URL using Phase 10's existing utilities, and returns a 302 redirect.

This is a relatively contained phase: one route handler with Zod query parameter validation, scope manipulation using existing `mapScopes()` and `stripResourceParam()`, URL construction using `buildAzureEndpoints()`, and structured error responses following RFC 6749 section 4.1.2.1. The error handling has two modes: JSON errors when redirect_uri/client_id are invalid (cannot redirect), and redirect-based errors once redirect_uri is validated.

**Primary recommendation:** Build a single `GET /authorize` route handler inside `src/routes/oauth-proxy.ts` (the plugin created in Phase 11) using Zod for query parameter validation, `URLSearchParams` for Azure AD URL construction, and the existing Phase 10 utilities (`mapScopes`, `stripResourceParam`, `buildAzureEndpoints`).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Error responses follow two modes: JSON (400) when redirect_uri/client_id invalid, redirect (302) when redirect_uri is valid (RFC 6749 section 4.1.2.1)
- Validation order: client_id -> redirect_uri -> response_type -> other params
- client_id validated against AZURE_CLIENT_ID env var; mismatch returns 400 JSON + warn log
- No scope parameter: forward with just openid + offline_access
- Unknown scopes: pass through to Azure AD (proxy stays stateless)
- Deduplication: ensure openid and offline_access appear exactly once
- Ordering: preserve client's scope ordering, append openid + offline_access at end
- Whitelist policy for parameters: client_id, redirect_uri, response_type, scope, state, code_challenge, code_challenge_method, nonce, prompt, login_hint
- Resource parameter: strip before forwarding (AADSTS9010010)
- Dropped/stripped params: log at debug level
- Mismatched client_id: warn level log (includes received client_id)
- Successful redirects: info level log

### Claude's Discretion
- Exact Zod schema shape for query parameter validation
- URL construction implementation details (URLSearchParams vs template)
- Test structure and assertion patterns
- How to integrate with the oauth-proxy.ts plugin from Phase 10/11

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTHZ-01 | GET /authorize redirects (302) to Azure AD authorization endpoint with mapped scopes, stripped resource parameter, and appended offline_access + openid | Phase 10 utilities (`mapScopes`, `stripResourceParam`, `buildAzureEndpoints`) provide all building blocks; Fastify `reply.redirect(url)` returns 302 by default |
| AUTHZ-02 | Authorization redirect preserves client's redirect_uri, state, code_challenge, and code_challenge_method parameters unchanged | Whitelist passthrough via URLSearchParams -- copy listed params verbatim from incoming query to outbound Azure AD URL |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Fastify | 4.29.1 | HTTP server + route handler | Already in use; `reply.redirect(url)` for 302 |
| Zod | 3.25.76 | Query parameter validation | Already in use for all external input validation |

### Supporting (Already in Project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `src/oauth-proxy/scope-mapper.ts` | Phase 10 | `mapScopes()` and `stripResourceParam()` | Scope mapping and resource param stripping |
| `src/oauth-proxy/azure-endpoints.ts` | Phase 10 | `buildAzureEndpoints()` | Azure AD authorize URL construction |
| `src/scopes.ts` | Existing | `SUPPORTED_SCOPES` array | Already consumed by scope-mapper |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| URLSearchParams | Template string interpolation | URLSearchParams handles encoding automatically; template strings risk encoding bugs |
| Zod for query validation | Manual checks | Zod is project convention and catches edge cases; manual checks are error-prone |

**Installation:**
```bash
# No new packages needed -- all dependencies already in project
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  routes/
    oauth-proxy.ts       # Phase 11 creates plugin; Phase 12 adds GET /authorize
  oauth-proxy/
    scope-mapper.ts      # Phase 10 (existing) -- mapScopes(), stripResourceParam()
    azure-endpoints.ts   # Phase 10 (existing) -- buildAzureEndpoints()
    __tests__/
      scope-mapper.test.ts
      azure-endpoints.test.ts
tests/
  authorize.test.ts      # Phase 12 integration tests for GET /authorize
```

### Pattern 1: OAuth Authorization Proxy Route Handler

**What:** A GET route that validates incoming OAuth params, transforms scopes, and 302-redirects to Azure AD.

**When to use:** When proxying OAuth authorization requests to an upstream IdP.

**Example:**
```typescript
// Pseudocode for the authorize handler pattern
fastify.get("/authorize", async (request, reply) => {
  const query = request.query as Record<string, string>;

  // 1. Validate client_id (JSON 400 on mismatch)
  // 2. Validate redirect_uri presence (JSON 400 if missing)
  // 3. Validate response_type (redirect error if not "code")
  // 4. Map scopes via mapScopes()
  // 5. Append openid + offline_access (deduplicated)
  // 6. Strip resource param
  // 7. Build Azure AD URL via buildAzureEndpoints()
  // 8. Construct URLSearchParams with whitelisted params
  // 9. reply.redirect(azureUrl)
});
```

### Pattern 2: Two-Phase Error Response (RFC 6749 section 4.1.2.1)

**What:** Authorization errors use different response mechanisms depending on whether redirect_uri is trusted.

**When to use:** Any OAuth authorization endpoint implementation.

**Rules:**
- client_id missing/invalid: HTTP 400 JSON `{"error": "invalid_client", ...}` -- never redirect
- redirect_uri missing/invalid: HTTP 400 JSON `{"error": "invalid_request", ...}` -- never redirect
- Other errors (after redirect_uri validated): 302 redirect to `redirect_uri?error=...&error_description=...`

**Example:**
```typescript
// Pre-redirect validation errors (JSON)
if (clientId !== appConfig.azure.clientId) {
  request.log.warn({ receivedClientId: clientId }, "client_id mismatch");
  return reply.code(400).send({
    error: "invalid_client",
    error_description: "unknown client_id",
  });
}

// Post-redirect-uri validation errors (redirect)
if (responseType !== "code") {
  const errorUrl = new URL(redirectUri);
  errorUrl.searchParams.set("error", "unsupported_response_type");
  errorUrl.searchParams.set("error_description", "response_type must be 'code'");
  if (state) errorUrl.searchParams.set("state", state);
  return reply.redirect(errorUrl.toString());
}
```

### Pattern 3: Scope Deduplication and Appending

**What:** Ensure openid and offline_access appear exactly once in the forwarded scope string, appended after the client's original scopes.

**Example:**
```typescript
function buildFinalScopes(clientScopes: string[], clientId: string): string {
  // Map bare MCP scopes to Azure AD format
  const mapped = mapScopes(clientScopes, clientId);

  // Remove any existing openid/offline_access from client scopes
  const filtered = mapped.filter(
    (s) => s !== "openid" && s !== "offline_access"
  );

  // Append OIDC scopes at end
  return [...filtered, "openid", "offline_access"].join(" ");
}
```

### Pattern 4: Parameter Whitelist with URLSearchParams

**What:** Only forward known OAuth parameters to Azure AD, using URLSearchParams for safe URL construction.

**Example:**
```typescript
const ALLOWED_PARAMS = new Set([
  "client_id", "redirect_uri", "response_type", "scope",
  "state", "code_challenge", "code_challenge_method",
  "nonce", "prompt", "login_hint",
]);

const outbound = new URLSearchParams();
for (const [key, value] of Object.entries(query)) {
  if (ALLOWED_PARAMS.has(key)) {
    outbound.set(key, value);
  } else {
    request.log.debug({ param: key }, "dropping unknown parameter");
  }
}
// Override scope with mapped version
outbound.set("scope", finalScopeString);
// Remove resource (already handled by whitelist, but explicit for clarity)
outbound.delete("resource");

const azureUrl = `${buildAzureEndpoints(tenantId).authorize}?${outbound.toString()}`;
return reply.redirect(azureUrl);
```

### Anti-Patterns to Avoid
- **Building URLs with string concatenation:** Use `URLSearchParams` or `URL` class -- string concatenation risks double-encoding or injection
- **Redirecting to untrusted redirect_uri before validating client_id:** Always validate client_id first -- redirect_uri from an unknown client cannot be trusted
- **Forwarding all query parameters blindly:** Whitelist approach prevents leaking internal parameters to Azure AD
- **Mutating the incoming query object:** Build a new URLSearchParams instance; never modify `request.query`

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Scope mapping (bare to Azure AD) | Custom scope prefixer | `mapScopes()` from Phase 10 | Already tested with 7 edge cases; handles OIDC passthrough, double-prefix prevention |
| Resource param stripping | Manual delete | `stripResourceParam()` from Phase 10 | Immutable, tested, single responsibility |
| Azure AD URL base | Hardcoded URL string | `buildAzureEndpoints()` from Phase 10 | Centralized tenant-based URL derivation, type-safe |
| URL encoding | `encodeURIComponent()` manually | `URLSearchParams` | Handles encoding/decoding correctly for query strings |
| Query param validation | Manual null checks | Zod schema with `.safeParse()` | Project convention; provides typed result with error details |

**Key insight:** Phase 10 already built and tested the three core utilities needed. This phase is about wiring them into a Fastify route handler with proper validation and error handling.

## Common Pitfalls

### Pitfall 1: Double-Encoding Query Parameters
**What goes wrong:** Using `encodeURIComponent()` on values already encoded by the client, or encoding the entire URL string after building it with URLSearchParams.
**Why it happens:** URLSearchParams automatically encodes values; applying additional encoding produces `%2520` instead of `%20`.
**How to avoid:** Use URLSearchParams exclusively for query string construction. Pass raw (decoded) values. Fastify's `request.query` already provides decoded values.
**Warning signs:** `%25` appearing in redirect URLs; Azure AD returning "invalid redirect_uri" errors.

### Pitfall 2: Scope String vs Array Confusion
**What goes wrong:** Treating the incoming scope as an array when it's a space-delimited string, or forgetting to split/join.
**Why it happens:** OAuth 2.0 scopes in query strings are space-separated; `mapScopes()` expects an array.
**How to avoid:** Always `.split(" ")` the incoming scope string before passing to `mapScopes()`, then `.join(" ")` the result for the outbound URL.
**Warning signs:** Azure AD returning "invalid_scope" errors; scope appearing as "wikijs:read,wikijs:write" (comma-separated).

### Pitfall 3: Missing State in Error Redirects
**What goes wrong:** Redirecting to redirect_uri with error params but forgetting to include the `state` parameter.
**Why it happens:** RFC 6749 section 4.1.2.1 requires state to be echoed back even in error responses.
**How to avoid:** Always append `state` to redirect-based error responses if the client provided it.
**Warning signs:** MCP clients failing to match error responses to their original requests.

### Pitfall 4: Fastify reply.redirect Encoding
**What goes wrong:** Passing an improperly encoded URL to `reply.redirect()`.
**Why it happens:** Fastify docs note the URL must be properly encoded; `URLSearchParams.toString()` handles this, but manual construction might not.
**How to avoid:** Construct the URL as `${base}?${urlSearchParams.toString()}` -- URLSearchParams handles value encoding.
**Warning signs:** Fastify returning 500 TypeError on redirect.

### Pitfall 5: Forgetting to Return After reply.redirect/send
**What goes wrong:** Handler continues executing after sending a redirect or JSON error, potentially sending a second response.
**Why it happens:** In async Fastify handlers, you must `return reply` after `reply.redirect()` or `reply.send()` to stop execution.
**How to avoid:** Always use `return reply.redirect(...)` or `return reply.code(400).send(...)`.
**Warning signs:** Fastify "Reply already sent" errors in logs.

### Pitfall 6: Empty Scope Handling
**What goes wrong:** Calling `.split(" ")` on an empty string produces `[""]` instead of `[]`.
**Why it happens:** JavaScript `"".split(" ")` returns `[""]`, not `[]`.
**How to avoid:** Check for empty/missing scope before splitting: `scope ? scope.split(" ").filter(Boolean) : []`.
**Warning signs:** Azure AD receiving a scope of `api://{clientId}/` (empty scope name gets prefixed).

## Code Examples

Verified patterns from the existing codebase and official sources:

### Fastify Redirect (from Fastify v4 docs)
```typescript
// Source: https://fastify.dev/docs/latest/Reference/Reply/
// reply.redirect(dest, [code]) -- defaults to 302
return reply.redirect("https://login.microsoftonline.com/tenant/oauth2/v2.0/authorize?...");
```

### Using Existing Phase 10 Utilities
```typescript
// Source: src/oauth-proxy/scope-mapper.ts (Phase 10)
import { mapScopes, stripResourceParam } from "../oauth-proxy/scope-mapper.js";
import { buildAzureEndpoints } from "../oauth-proxy/azure-endpoints.js";

// Map bare scopes to Azure AD format
const mappedScopes = mapScopes(["wikijs:read"], clientId);
// Result: ["api://{clientId}/wikijs:read"]

// Strip resource parameter
const cleaned = stripResourceParam({ resource: "https://...", client_id: "..." });
// Result: { client_id: "..." }

// Get Azure AD authorize URL
const endpoints = buildAzureEndpoints(tenantId);
// Result: { authorize: "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/authorize", token: "..." }
```

### Zod Query Validation Schema
```typescript
// Project convention: Zod for all external input validation
import { z } from "zod";

// Minimal schema -- validates presence/type only
// Business logic (client_id matching, response_type=code) handled in handler
const authorizeQuerySchema = z.object({
  client_id: z.string().optional(),
  redirect_uri: z.string().optional(),
  response_type: z.string().optional(),
  scope: z.string().optional(),
  state: z.string().optional(),
  code_challenge: z.string().optional(),
  code_challenge_method: z.string().optional(),
  nonce: z.string().optional(),
  prompt: z.string().optional(),
  login_hint: z.string().optional(),
  resource: z.string().optional(),
}).passthrough(); // Allow extra params (they get dropped by whitelist)
```

### Azure AD Authorize URL (from Microsoft docs)
```
// Source: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize?
  client_id=...
  &response_type=code
  &redirect_uri=...
  &scope=api%3A%2F%2F{clientId}%2Fwikijs%3Aread%20openid%20offline_access
  &state=...
  &code_challenge=...
  &code_challenge_method=S256
```

### Test Pattern (matching existing project conventions)
```typescript
// Source: existing tests/smoke.test.ts pattern
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp } from "./helpers/build-test-app.js";
import { TEST_CONFIG } from "../src/auth/__tests__/helpers.js";

describe("GET /authorize", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("redirects to Azure AD with 302", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/authorize",
      query: {
        client_id: TEST_CONFIG.clientId,
        redirect_uri: "http://localhost:9999/callback",
        response_type: "code",
        scope: "wikijs:read",
        state: "abc123",
        code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
        code_challenge_method: "S256",
      },
    });
    expect(res.statusCode).toBe(302);
    const location = new URL(res.headers.location as string);
    expect(location.origin + location.pathname).toBe(
      `https://login.microsoftonline.com/${TEST_CONFIG.tenantId}/oauth2/v2.0/authorize`
    );
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| RFC 6749 OAuth 2.0 | OAuth 2.1 (draft) | 2024+ | PKCE required for public clients; implicit grant removed |
| `resource` parameter (RFC 8707) | Azure AD v2.0 rejects it | Azure AD v2.0 | Must strip before forwarding (AADSTS9010010) |
| `response_mode=fragment` | `response_mode=query` (default) | OAuth best practice | query is default for code flow; fragment for implicit |

**Deprecated/outdated:**
- Azure AD v1.0 `resource` parameter: replaced by scoped permissions in v2.0; causes AADSTS9010010 if sent
- Implicit grant (`response_type=token`): removed in OAuth 2.1; not supported by this proxy

## Open Questions

1. **Phase 11 plugin structure not yet implemented**
   - What we know: Phase 11 CONTEXT.md specifies `src/routes/oauth-proxy.ts` as a Fastify plugin with `oauthProxyRoutes`
   - What's unclear: Phase 11 has not been executed yet -- the plugin file does not exist
   - Recommendation: Phase 12 plan should either (a) depend on Phase 11 being complete first, or (b) include creating the minimal oauth-proxy plugin as part of Phase 12. Given the roadmap says Phase 12 depends on Phase 10 (not 11), the plan should create the plugin structure itself if Phase 11 is not yet done, OR assume Phase 11 runs first. The planner should handle this dependency.

2. **buildTestApp() registration of oauth-proxy plugin**
   - What we know: `buildTestApp()` currently registers `publicRoutes` and `protectedRoutes` only
   - What's unclear: Whether Phase 11 will have already added the oauth-proxy plugin registration to `buildTestApp()`
   - Recommendation: The plan must ensure `buildTestApp()` includes the oauth-proxy plugin. If Phase 11 is not yet complete, this becomes a Phase 12 task.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/authorize.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTHZ-01 | GET /authorize returns 302 redirect to Azure AD authorize URL with mapped scopes, stripped resource, appended openid+offline_access | integration | `npx vitest run tests/authorize.test.ts -t "redirects to Azure AD"` | No -- Wave 0 |
| AUTHZ-01 | Scope mapping: bare MCP scopes prefixed with api://{clientId}/ | integration | `npx vitest run tests/authorize.test.ts -t "maps scopes"` | No -- Wave 0 |
| AUTHZ-01 | openid and offline_access appended, deduplicated | integration | `npx vitest run tests/authorize.test.ts -t "appends openid"` | No -- Wave 0 |
| AUTHZ-01 | resource parameter stripped from forwarded URL | integration | `npx vitest run tests/authorize.test.ts -t "strips resource"` | No -- Wave 0 |
| AUTHZ-02 | redirect_uri, state, code_challenge, code_challenge_method passed through unchanged | integration | `npx vitest run tests/authorize.test.ts -t "passes through"` | No -- Wave 0 |
| AUTHZ-02 | Unknown params dropped (whitelist policy) | integration | `npx vitest run tests/authorize.test.ts -t "drops unknown"` | No -- Wave 0 |
| (validation) | Missing client_id returns 400 JSON | integration | `npx vitest run tests/authorize.test.ts -t "missing client_id"` | No -- Wave 0 |
| (validation) | Wrong client_id returns 400 JSON | integration | `npx vitest run tests/authorize.test.ts -t "wrong client_id"` | No -- Wave 0 |
| (validation) | Missing redirect_uri returns 400 JSON | integration | `npx vitest run tests/authorize.test.ts -t "missing redirect_uri"` | No -- Wave 0 |
| (validation) | Invalid response_type redirects with error | integration | `npx vitest run tests/authorize.test.ts -t "invalid response_type"` | No -- Wave 0 |
| (validation) | No scope parameter forwards with just openid+offline_access | integration | `npx vitest run tests/authorize.test.ts -t "no scope"` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/authorize.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/authorize.test.ts` -- covers AUTHZ-01, AUTHZ-02, and all validation edge cases
- [ ] `src/routes/oauth-proxy.ts` -- Fastify plugin file (may be created by Phase 11)
- [ ] `tests/helpers/build-test-app.ts` -- must register oauth-proxy plugin (may be updated by Phase 11)

## Sources

### Primary (HIGH confidence)
- [Microsoft identity platform OAuth 2.0 auth code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow) -- Azure AD authorize endpoint parameters, PKCE support, error codes
- [RFC 6749 section 4.1.2.1](https://datatracker.ietf.org/doc/html/rfc6749#section-4.1.2.1) -- Authorization error response specification (when to redirect vs JSON)
- [Fastify Reply docs](https://fastify.dev/docs/latest/Reference/Reply/) -- `reply.redirect(dest, [code])` API, default 302
- Phase 10 source code (`src/oauth-proxy/scope-mapper.ts`, `src/oauth-proxy/azure-endpoints.ts`) -- verified on-disk implementations

### Secondary (MEDIUM confidence)
- [Fastify redirect GitHub PR #1595](https://github.com/fastify/fastify/pull/1595/files) -- Default 302 behavior confirmed
- [IBM MCP Context Forge issue #2881](https://github.com/IBM/mcp-context-forge/issues/2881) -- Confirms AADSTS9010010 resource+scope conflict in MCP context

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in project, versions verified on-disk
- Architecture: HIGH -- route handler pattern matches existing codebase exactly; Phase 10 utilities verified
- Pitfalls: HIGH -- double-encoding and scope string issues confirmed via RFC + Azure AD docs; Fastify patterns verified via existing project code

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable -- no rapidly changing dependencies)
