# Phase 10: Scope Mapper and Azure Endpoint Utils - Research

**Researched:** 2026-03-25
**Domain:** OAuth scope transformation, Azure AD v2.0 endpoint construction, RFC 8707 resource parameter handling
**Confidence:** HIGH

## Summary

Phase 10 delivers pure-function utilities that later phases (11-14) import. The scope mapper transforms bare MCP scopes (`wikijs:read`) into Azure AD fully-qualified format (`api://{client_id}/wikijs:read`), passes OIDC scopes (`openid`, `offline_access`) unchanged, and lets unknown scopes through untouched. The resource parameter stripper removes the RFC 8707 `resource` parameter from parameter sets before forwarding to Azure AD, which is critical because Azure AD v2.0 rejects requests containing it with `AADSTS9010010`. The endpoint constructor builds Azure AD v2.0 authorize and token URLs from a tenant ID.

All three concerns are pure functions with no I/O, no Fastify dependency, and no side effects. They require only the existing tech stack (TypeScript strict mode, Vitest). No new npm packages are needed.

**Primary recommendation:** Implement two modules under `src/oauth-proxy/` -- `scope-mapper.ts` for scope mapping and resource stripping, `azure-endpoints.ts` for endpoint URL construction -- with co-located `__tests__/` unit tests following the existing `src/auth/__tests__/` pattern.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Unrecognized scopes (not `wikijs:*`, not OIDC) pass through unchanged to Azure AD -- Azure AD will reject what it doesn't recognize, proxy stays dumb and transparent
- Create new `src/oauth-proxy/` directory for all proxy utilities
- `src/oauth-proxy/scope-mapper.ts` -- scope transformation and resource parameter stripping
- `src/oauth-proxy/azure-endpoints.ts` -- Azure AD URL construction from tenant ID
- Keeps proxy code separate from existing auth enforcement in `src/scopes.ts`
- Phases 11-14 add route files to the same `src/oauth-proxy/` directory
- Only `openid` and `offline_access` are explicitly recognized as passthrough (no `api://` prefix)

### Claude's Discretion
- Function signatures and return types
- Internal implementation of scope detection (regex, set lookup, etc.)
- Test organization within the oauth-proxy directory
- Whether to export a single `mapScopes()` or composable helpers

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SCOPE-01 | Proxy maps bare MCP scopes (`wikijs:read`) to Azure AD format (`api://{client_id}/wikijs:read`) in all outbound requests, preserving OIDC scopes (`openid`, `offline_access`) unprefixed | Scope mapper function using Set-based OIDC detection; imports `SCOPES` constants from `src/scopes.ts` for known MCP scope identification; applies `api://{clientId}/` prefix; see Architecture Patterns section |
| SCOPE-02 | Proxy strips RFC 8707 `resource` parameter before forwarding to Azure AD | `stripResourceParam()` function that removes `resource` key from a key-value parameter object; critical because Azure AD v2.0 rejects `resource` with AADSTS9010010; see Common Pitfalls section |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.3 (strict, ESM) | Type-safe pure functions | Already in project; strict mode catches scope-string mistakes at compile time |
| Vitest | 4 | Unit tests for pure functions | Already in project; pure functions are ideal unit test targets |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none) | - | - | No new dependencies needed -- these are string transformation utilities |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Set-based OIDC detection | Regex pattern matching | Set lookup is O(1), explicit, and readable; regex adds complexity for two known strings |
| Importing `SCOPES` from `src/scopes.ts` | Hardcoding `wikijs:*` pattern | Importing is safer -- single source of truth, breaks at compile time if scopes change |

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  oauth-proxy/
    scope-mapper.ts        # mapScopes(), stripResourceParam()
    azure-endpoints.ts     # buildAzureEndpoints()
    __tests__/
      scope-mapper.test.ts
      azure-endpoints.test.ts
```

### Pattern 1: Scope Mapping Function
**What:** Transforms an array of scope strings from MCP/bare format to Azure AD fully-qualified format.
**When to use:** Before every outbound request to Azure AD (authorize and token endpoints).
**Example:**
```typescript
// Source: Azure AD docs + project CONTEXT.md decisions
import { SCOPES, SUPPORTED_SCOPES } from "../scopes.js";

/** OIDC scopes that pass through without api:// prefix */
const OIDC_PASSTHROUGH = new Set(["openid", "offline_access"]);

/**
 * Map bare MCP scopes to Azure AD format.
 * - Known MCP scopes (wikijs:read, etc.) -> api://{clientId}/wikijs:read
 * - OIDC scopes (openid, offline_access) -> unchanged
 * - Unknown scopes -> unchanged (Azure AD rejects what it doesn't know)
 */
export function mapScopes(scopes: string[], clientId: string): string[] {
  return scopes.map((scope) => {
    if (OIDC_PASSTHROUGH.has(scope)) {
      return scope;
    }
    // Bare MCP scope: prefix with api://{clientId}/
    // Also catches unknown scopes and prefixes them -- but per decision,
    // unknown scopes pass through unchanged
    if (SUPPORTED_SCOPES.includes(scope)) {
      return `api://${clientId}/${scope}`;
    }
    // Unknown scope: pass through unchanged
    return scope;
  });
}
```

### Pattern 2: Resource Parameter Stripping
**What:** Removes the `resource` key from a record of URL parameters.
**When to use:** Before forwarding any parameter set to Azure AD (both authorize and token requests).
**Example:**
```typescript
// Source: RFC 8707 + Azure AD AADSTS9010010 error behavior
/**
 * Strip the RFC 8707 `resource` parameter from a parameter set.
 * Azure AD v2.0 rejects requests containing `resource` with AADSTS9010010.
 */
export function stripResourceParam(
  params: Record<string, string>
): Record<string, string> {
  const { resource, ...rest } = params;
  return rest;
}
```

### Pattern 3: Azure AD Endpoint URL Construction
**What:** Builds Azure AD v2.0 authorize and token endpoint URLs from a tenant ID.
**When to use:** At proxy initialization or per-request when constructing redirect URLs.
**Example:**
```typescript
// Source: Microsoft identity platform docs (verified 2026-01-09)
// https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow

export interface AzureEndpoints {
  authorize: string;
  token: string;
}

/**
 * Construct Azure AD v2.0 OAuth endpoint URLs from a tenant ID.
 */
export function buildAzureEndpoints(tenantId: string): AzureEndpoints {
  const base = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0`;
  return {
    authorize: `${base}/authorize`,
    token: `${base}/token`,
  };
}
```

### Pattern 4: Consistency with Existing Config Pattern
**What:** The existing `src/config.ts` already constructs `jwksUri` and `issuer` from tenant ID using the same Azure AD URL base pattern. The new `azure-endpoints.ts` follows the same derivation approach.
**When to use:** Reference this for consistency -- `config.ts` builds `https://login.microsoftonline.com/{tenantId}/discovery/v2.0/keys` and `https://login.microsoftonline.com/{tenantId}/v2.0`. The new module builds `/oauth2/v2.0/authorize` and `/oauth2/v2.0/token` from the same base.

### Anti-Patterns to Avoid
- **Coupling to Fastify or request objects:** These functions must remain pure. They take primitive inputs (string arrays, records, tenant ID) and return primitive outputs. Phases 12-13 handle the HTTP integration.
- **Mutating input parameters:** `stripResourceParam` must return a new object, not delete from the original. Callers may need the original params for logging.
- **Scope validation/rejection:** Per the locked decision, unknown scopes pass through. Do NOT throw errors or filter out unrecognized scopes.
- **Importing `config` singleton in utils:** Pass `clientId` and `tenantId` as function parameters. This keeps functions pure and testable without environment variable setup.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| URL encoding | Manual `encodeURIComponent` for Azure URLs | `URL` / `URLSearchParams` API | Edge cases with special characters; built-in handles RFC 3986 correctly |
| OIDC scope detection | Regex like `/^(openid|offline_access)$/` | `Set.has()` with explicit constant | Two values don't need regex; Set is clearer and faster |
| Scope string splitting | Custom split/join for space-delimited scopes | Standard `string.split(" ")` / `array.join(" ")` | Simple enough that no library is needed, but callers (Phases 12-13) handle the split -- the mapper works on arrays |

**Key insight:** These utilities are intentionally minimal. The complexity lives in the HTTP layer (Phases 12-13), not in the transformation logic.

## Common Pitfalls

### Pitfall 1: Azure AD Rejects `resource` Parameter (AADSTS9010010)
**What goes wrong:** MCP clients include `resource` per RFC 8707 (the MCP spec requires it). Azure AD v2.0 rejects requests containing `resource` alongside `scope` parameters.
**Why it happens:** Azure AD v2.0 uses scopes for resource identification (e.g., `api://client-id/scope`), not the separate `resource` parameter from the v1.0 API. A stricter enforcement change rolled out in early March 2026 now rejects with `AADSTS9010010`.
**How to avoid:** Always strip `resource` before forwarding to Azure AD. This is SCOPE-02's explicit purpose.
**Warning signs:** Azure AD returns `{"error": "invalid_request", "error_description": "AADSTS9010010: ..."}`.

### Pitfall 2: Prefixing OIDC Scopes with `api://`
**What goes wrong:** `openid` and `offline_access` get incorrectly prefixed as `api://{client_id}/openid`, which Azure AD does not recognize.
**Why it happens:** Naive implementation that prefixes all non-empty scopes without checking for OIDC passthrough.
**How to avoid:** Explicit `OIDC_PASSTHROUGH` set checked before any prefixing logic.
**Warning signs:** Azure AD returns scope-related errors; refresh tokens are not issued (missing `offline_access`); ID tokens are not returned (missing `openid`).

### Pitfall 3: Double-Prefixing Already-Qualified Scopes
**What goes wrong:** A scope that arrives as `api://client-id/wikijs:read` gets prefixed again to `api://client-id/api://client-id/wikijs:read`.
**Why it happens:** Not checking whether a scope already has the `api://` prefix.
**How to avoid:** Check if scope already starts with `api://` and skip prefixing. This is a defensive guard for robustness, though in the normal MCP flow bare scopes are expected.
**Warning signs:** Azure AD returns `invalid_scope` errors with doubled URI paths.

### Pitfall 4: Forgetting `.js` Extensions on Imports
**What goes wrong:** TypeScript compiles fine but runtime fails with `ERR_MODULE_NOT_FOUND`.
**Why it happens:** Project uses NodeNext module resolution, which requires `.js` extensions on all relative imports.
**How to avoid:** Every import from `../scopes.js`, `./scope-mapper.js`, etc. must include `.js`.
**Warning signs:** `npm test` passes (vitest may resolve differently) but `npm run build && npm start` fails.

### Pitfall 5: Importing the `config` Singleton in Utility Modules
**What goes wrong:** Test setup becomes complex because `config.ts` runs `loadConfig()` at module load time, requiring all env vars to be set.
**Why it happens:** Direct import of `config` object couples the pure utility to environment state.
**How to avoid:** Pass `clientId` and `tenantId` as function parameters. The calling code (Phases 12-14 route handlers) extracts these from config and passes them in.
**Warning signs:** Tests fail with "Configuration Error" messages from config.ts even though you're only testing scope mapping.

## Code Examples

Verified patterns from official sources:

### Scope Mapping: Full Round-Trip Example
```typescript
// Input from MCP client: bare scopes + OIDC
const inputScopes = ["wikijs:read", "wikijs:write", "openid", "offline_access"];
const clientId = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

const mapped = mapScopes(inputScopes, clientId);
// Result:
// [
//   "api://6ba7b810-9dad-11d1-80b4-00c04fd430c8/wikijs:read",
//   "api://6ba7b810-9dad-11d1-80b4-00c04fd430c8/wikijs:write",
//   "openid",
//   "offline_access"
// ]
```

### Resource Parameter Stripping Example
```typescript
// Input: MCP client sends resource parameter per RFC 8707
const params = {
  client_id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  response_type: "code",
  redirect_uri: "http://localhost:3000/callback",
  scope: "wikijs:read openid",
  resource: "https://mcp.example.com",
  state: "abc123",
  code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  code_challenge_method: "S256",
};

const stripped = stripResourceParam(params);
// Result: same object without "resource" key
// { client_id, response_type, redirect_uri, scope, state, code_challenge, code_challenge_method }
```

### Azure Endpoint Construction Example
```typescript
// Source: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
const tenantId = "550e8400-e29b-41d4-a716-446655440000";
const endpoints = buildAzureEndpoints(tenantId);
// Result:
// {
//   authorize: "https://login.microsoftonline.com/550e8400-e29b-41d4-a716-446655440000/oauth2/v2.0/authorize",
//   token: "https://login.microsoftonline.com/550e8400-e29b-41d4-a716-446655440000/oauth2/v2.0/token"
// }
```

### Test Pattern Example (Following Project Convention)
```typescript
// Follows existing pattern from tests/scopes.test.ts and tests/config.test.ts
import { describe, it, expect } from "vitest";
import { mapScopes, stripResourceParam } from "../scope-mapper.js";

describe("mapScopes", () => {
  const CLIENT_ID = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

  it("prefixes bare MCP scopes with api://{clientId}/", () => {
    const result = mapScopes(["wikijs:read"], CLIENT_ID);
    expect(result).toEqual([`api://${CLIENT_ID}/wikijs:read`]);
  });

  it("passes OIDC scopes through unchanged", () => {
    const result = mapScopes(["openid", "offline_access"], CLIENT_ID);
    expect(result).toEqual(["openid", "offline_access"]);
  });

  it("handles mixed bare and OIDC scopes", () => {
    const result = mapScopes(["wikijs:read", "openid", "wikijs:admin", "offline_access"], CLIENT_ID);
    expect(result).toEqual([
      `api://${CLIENT_ID}/wikijs:read`,
      "openid",
      `api://${CLIENT_ID}/wikijs:admin`,
      "offline_access",
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(mapScopes([], CLIENT_ID)).toEqual([]);
  });

  it("passes unknown scopes through unchanged", () => {
    const result = mapScopes(["custom:scope"], CLIENT_ID);
    expect(result).toEqual(["custom:scope"]);
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Azure AD v1.0 `resource` parameter | Azure AD v2.0 scope-based resource identification (`api://`) | v2.0 endpoint (GA since 2019, strict enforcement March 2026) | Must strip `resource` param and use `api://` prefix in scopes |
| MCP spec without RFC 8707 | MCP spec (2025-11-25) requires `resource` parameter in both auth and token requests | November 2025 | Proxy must strip what MCP requires but Azure AD rejects |

**Deprecated/outdated:**
- Azure AD v1.0 endpoints (`/oauth2/authorize`, `/oauth2/token` without `/v2.0/`) -- do not use; project already on v2.0
- `resource` parameter in Azure AD v2.0 requests -- actively rejected since March 2026 enforcement change

## Open Questions

1. **Should `mapScopes` handle already-prefixed scopes?**
   - What we know: In the normal MCP flow, clients send bare scopes. The MCP spec's scope selection strategy uses bare scope names from protected resource metadata.
   - What's unclear: Whether any MCP client might send pre-qualified scopes like `api://client-id/wikijs:read`.
   - Recommendation: Add a defensive `scope.startsWith("api://")` check that skips prefixing. Minimal cost, prevents the double-prefix pitfall.

2. **Should `stripResourceParam` be generic or specific?**
   - What we know: Only `resource` needs stripping per requirements. Phase 12 (authorize) and Phase 13 (token) both need it.
   - What's unclear: Whether other parameters might need stripping in the future.
   - Recommendation: Keep it specific to `resource`. A generic "strip keys" function is over-engineering for one known key. If more keys need stripping later, refactor then.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4 |
| Config file | `vitest.config.ts` (exists, pre-sets env vars) |
| Quick run command | `npx vitest run src/oauth-proxy/__tests__/ --reporter=verbose` |
| Full suite command | `npm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCOPE-01 | Bare MCP scopes mapped to `api://{clientId}/` format | unit | `npx vitest run src/oauth-proxy/__tests__/scope-mapper.test.ts -x` | No -- Wave 0 |
| SCOPE-01 | OIDC scopes (`openid`, `offline_access`) pass through unchanged | unit | `npx vitest run src/oauth-proxy/__tests__/scope-mapper.test.ts -x` | No -- Wave 0 |
| SCOPE-01 | Unknown scopes pass through unchanged | unit | `npx vitest run src/oauth-proxy/__tests__/scope-mapper.test.ts -x` | No -- Wave 0 |
| SCOPE-01 | Empty scope array returns empty array | unit | `npx vitest run src/oauth-proxy/__tests__/scope-mapper.test.ts -x` | No -- Wave 0 |
| SCOPE-01 | Mixed bare + OIDC scopes handled correctly | unit | `npx vitest run src/oauth-proxy/__tests__/scope-mapper.test.ts -x` | No -- Wave 0 |
| SCOPE-02 | `resource` parameter stripped from params | unit | `npx vitest run src/oauth-proxy/__tests__/scope-mapper.test.ts -x` | No -- Wave 0 |
| SCOPE-02 | Params without `resource` returned unchanged | unit | `npx vitest run src/oauth-proxy/__tests__/scope-mapper.test.ts -x` | No -- Wave 0 |
| N/A | Azure AD authorize URL constructed correctly | unit | `npx vitest run src/oauth-proxy/__tests__/azure-endpoints.test.ts -x` | No -- Wave 0 |
| N/A | Azure AD token URL constructed correctly | unit | `npx vitest run src/oauth-proxy/__tests__/azure-endpoints.test.ts -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/oauth-proxy/__tests__/ --reporter=verbose`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/oauth-proxy/__tests__/scope-mapper.test.ts` -- covers SCOPE-01, SCOPE-02
- [ ] `src/oauth-proxy/__tests__/azure-endpoints.test.ts` -- covers endpoint URL construction
- [ ] `src/oauth-proxy/` directory -- needs to be created

*(No framework install needed -- Vitest already configured)*

## Sources

### Primary (HIGH confidence)
- [Microsoft identity platform OAuth 2.0 auth code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow) -- Verified authorize endpoint URL format: `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize`; token endpoint: `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token`; scope format with `api://` prefix; OIDC scopes (`openid`, `offline_access`) used bare
- [MCP Authorization Specification (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) -- RFC 8707 resource parameter MUST be included by MCP clients; scope selection strategy; protected resource metadata requirements
- [RFC 8707: Resource Indicators for OAuth 2.0](https://www.rfc-editor.org/rfc/rfc8707.html) -- Defines `resource` parameter as absolute URI identifying target resource
- Existing codebase: `src/scopes.ts` -- `SCOPES` constants and `SUPPORTED_SCOPES` array; `src/config.ts` -- existing Azure AD URL derivation pattern from tenant ID

### Secondary (MEDIUM confidence)
- [Azure AD AADSTS9010010 error](https://github.com/microsoft/powerbi-modeling-mcp/issues/68) -- Confirms Azure AD v2.0 rejects `resource` parameter with AADSTS9010010 when combined with scopes; enforcement tightened March 2026
- [Microsoft Learn: Scopes and permissions](https://learn.microsoft.com/en-us/entra/identity-platform/scopes-oidc) -- Confirms custom scope format `api://{client_id}/{scope_name}`
- [Microsoft Learn: Expose web API](https://learn.microsoft.com/en-us/azure/active-directory/develop/quickstart-configure-app-expose-web-apis) -- Application ID URI defaults to `api://<application-client-id>`, used as scope prefix

### Tertiary (LOW confidence)
None -- all findings verified against primary or secondary sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, uses existing project patterns
- Architecture: HIGH -- locked decisions from CONTEXT.md are specific; code patterns verified against existing codebase (`src/config.ts`, `src/scopes.ts`)
- Pitfalls: HIGH -- AADSTS9010010 confirmed by multiple independent sources (Microsoft GitHub issues, IBM docs, MCP server implementations); OIDC passthrough requirement verified against Azure AD docs

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable domain -- Azure AD v2.0 endpoints are GA and unchanging)
