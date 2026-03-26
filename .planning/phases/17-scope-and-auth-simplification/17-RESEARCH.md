# Phase 17: Scope and Auth Simplification - Research

**Researched:** 2026-03-26
**Domain:** OAuth scope enforcement, TypeScript const-type derivation, test refactoring
**Confidence:** HIGH

## Summary

Phase 17 simplifies the scope model from 3 scopes (wikijs:read, wikijs:write, wikijs:admin) to a single wikijs:read scope for all 3 remaining tools. This is a downstream consequence of Phase 16 removing all write/admin tools -- once only read-only tools exist, multi-scope enforcement is dead weight.

The change is architecturally clean because the codebase already uses a single-source-of-truth derivation chain: `SCOPES` -> `SCOPE_TOOL_MAP` -> `TOOL_SCOPE_MAP` -> `SUPPORTED_SCOPES`. Changing `SCOPES` and `SCOPE_TOOL_MAP` in `src/scopes.ts` propagates automatically to all 6 consumer files (middleware, public-routes, oauth-proxy, scope-mapper, and their tests). No code changes are needed in middleware, public-routes, oauth-proxy, or scope-mapper -- only `src/scopes.ts` and test files.

**Primary recommendation:** Change `src/scopes.ts` to define only `SCOPES.READ` and map all 3 tools under it, then rewrite test assertions to match the new single-scope model. The production code changes are minimal (one file); the test changes are the bulk of the work.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Remove WRITE and ADMIN entirely from SCOPES object -- single value: `{ READ: "wikijs:read" }`
- SCOPE_TOOL_MAP collapses to one key mapping wikijs:read to all 3 tools
- SUPPORTED_SCOPES remains derived via `Object.values(SCOPES)` -- single source of truth preserved
- Scope type stays derived: `type Scope = (typeof SCOPES)[keyof typeof SCOPES]` -- resolves to `"wikijs:read"`
- Keep TOOL_SCOPE_MAP -- still derived from SCOPE_TOOL_MAP, consistent pattern
- No per-tool scope enforcement in middleware -- gate-level check is sufficient with 1 scope
- wikijs:read is the ONLY valid scope -- tokens with only wikijs:write or wikijs:admin get 403 insufficient_scope
- Tokens with wikijs:read plus other scopes are accepted (wikijs:read present = valid)
- No backward compatibility for write/admin-only tokens
- Update JSDoc comments only in scope-mapper.ts -- code logic uses SUPPORTED_SCOPES and works correctly with 1 scope
- Remove mentions of wikijs:write and wikijs:admin from comments in scope-mapper.ts
- OAuth discovery metadata (oauth-proxy.ts) already derives scopes_supported from SUPPORTED_SCOPES -- no code change needed
- Protected Resource Metadata (public-routes.ts) also derives from SUPPORTED_SCOPES -- automatic
- Rewrite scopes.test.ts from scratch -- every assertion changes (1 scope, 3 tools instead of 3 scopes, 17 tools)
- Convert auth middleware tests: tokens with only wikijs:write/admin become rejection (403) test cases
- Update smoke/integration test tokens to use `scp: "wikijs:read"` only
- Discovery test: assert `scopes_supported` equals exactly `["wikijs:read"]`
- Remove scope-mapper test cases for wikijs:write and wikijs:admin mapping

### Claude's Discretion
- Exact test case naming and organization in rewritten scopes.test.ts
- Whether to add a negative test for "SCOPES has no WRITE or ADMIN" or just assert the object shape
- Comment wording in scope-mapper.ts

### Deferred Ideas (OUT OF SCOPE)
- Azure AD app registration still has wikijs:write and wikijs:admin scopes defined -- clean up externally (not a code change)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SCOP-01 | Scope model simplified to wikijs:read only (remove wikijs:write and wikijs:admin) | Single change in `src/scopes.ts` SCOPES object + SCOPE_TOOL_MAP; derivation chain propagates to all consumers automatically |
| SCOP-02 | SCOPE_TOOL_MAP maps all 3 tools to wikijs:read | Collapse SCOPE_TOOL_MAP to single key; TOOL_SCOPE_MAP auto-derives; test assertions updated to match |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.3 | Type-level derivation of scope literal | `as const` + mapped types ensure Scope resolves to `"wikijs:read"` |
| Vitest | 4 | Test runner for rewriting scope/auth tests | Already configured in vitest.config.ts |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| jose | current | JWT scope validation in auth middleware | No changes needed -- uses SUPPORTED_SCOPES import |

### Alternatives Considered
None -- this phase uses the existing stack exclusively.

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Single Source of Truth Derivation Chain

This is the core architectural pattern that makes Phase 17 a minimal-change operation.

```
src/scopes.ts (SCOPES object)
  |
  +-> SCOPE_TOOL_MAP (forward: scope -> tools[])
  |     |
  |     +-> TOOL_SCOPE_MAP (reverse: tool -> scope, derived)
  |
  +-> SUPPORTED_SCOPES (flat string[], derived via Object.values)
        |
        +-> src/auth/middleware.ts line 86: hasValidScope check
        +-> src/routes/public-routes.ts line 90: PRM scopes_supported
        +-> src/routes/oauth-proxy.ts line 54: AS metadata scopes_supported
        +-> src/oauth-proxy/scope-mapper.ts line 22: SUPPORTED_SCOPES.includes()
```

**Key insight:** Changing `SCOPES` and `SCOPE_TOOL_MAP` in one file propagates to all 6 consumer files without any code changes in those consumers.

### Pattern: scopes.ts After Phase 17

**What:** The final state of `src/scopes.ts` after simplification.
**When to use:** This is the single production code change.
**Example:**
```typescript
// Source: Derived from current src/scopes.ts structure + CONTEXT.md decisions

export const SCOPES = {
  READ: "wikijs:read",
} as const;

export type Scope = (typeof SCOPES)[keyof typeof SCOPES];

export const SCOPE_TOOL_MAP: Record<Scope, readonly string[]> = {
  [SCOPES.READ]: [
    "get_page",
    "list_pages",
    "search_pages",
  ],
} as const;

export const SUPPORTED_SCOPES: string[] = Object.values(SCOPES);

export const TOOL_SCOPE_MAP: Record<string, Scope> = Object.entries(
  SCOPE_TOOL_MAP,
).reduce<Record<string, Scope>>((map, [scope, tools]) => {
  for (const tool of tools) {
    map[tool] = scope as Scope;
  }
  return map;
}, {});
```

**Important note on tool names:** The exact 3 tool names depend on Phase 15/16 outcomes. Phase 15 consolidates get_page + get_page_content into a single get_page tool. Phase 16 removes all write/admin tools. The planner should verify which 3 tools survive before writing the SCOPE_TOOL_MAP. Based on REQUIREMENTS.md and phase descriptions, the expected 3 tools are: `get_page`, `list_pages`, `search_pages`.

### Pattern: Test Token Updates

**What:** Default test tokens currently use `scp: 'wikijs:read wikijs:write'` (helpers.ts line 64).
**When to use:** The `createTestToken()` default must change to `scp: 'wikijs:read'` only.
**Example:**
```typescript
// Source: Current src/auth/__tests__/helpers.ts, modified for Phase 17

export async function createTestToken(
  claims: Record<string, unknown> = {},
): Promise<string> {
  const { privateKey } = await getKeyPair();
  return new SignJWT({
    oid: '00000000-0000-0000-0000-000000000001',
    preferred_username: 'testuser@contoso.com',
    name: 'Test User',
    email: 'testuser@contoso.com',
    scp: 'wikijs:read',  // Changed: was 'wikijs:read wikijs:write'
    ...claims,
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: 'test-key-1' })
    .setIssuer(TEST_CONFIG.issuer)
    .setAudience(TEST_CONFIG.audience)
    .setExpirationTime('1h')
    .setIssuedAt()
    .setNotBefore('0s')
    .sign(privateKey);
}
```

### Anti-Patterns to Avoid
- **Leaving commented-out WRITE/ADMIN code:** Decision is clean break -- remove entirely, no "for reference" comments
- **Changing consumer files (middleware, routes):** These derive from SUPPORTED_SCOPES -- changing them is unnecessary and violates DRY
- **Adding backward compatibility for old scope tokens:** Explicitly rejected in CONTEXT.md decisions

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Scope propagation to metadata endpoints | Manual updates to public-routes.ts and oauth-proxy.ts | SUPPORTED_SCOPES derivation chain | Already auto-propagates; manual edits would create inconsistency risk |
| Scope validation logic | Custom scope-checking middleware | Existing `hasValidScope = scopes.some(s => SUPPORTED_SCOPES.includes(s))` | Works correctly with 1 or N scopes; no code change needed |

**Key insight:** The derivation chain pattern means this phase is primarily a data change (one source file) plus a test update. No logic changes needed in middleware or routes.

## Common Pitfalls

### Pitfall 1: Forgetting the Tool Count Dependency on Phase 15/16
**What goes wrong:** Hardcoding 3 specific tool names in SCOPE_TOOL_MAP before Phase 15/16 are complete.
**Why it happens:** Phase 17 depends on Phase 16, which depends on Phase 15. The final tool list is determined by those phases.
**How to avoid:** Verify the actual registered tool names after Phase 15/16 are done. The expected tools are `get_page`, `list_pages`, `search_pages` based on REQUIREMENTS.md.
**Warning signs:** Tests failing because a tool name doesn't match what mcp-tools.ts registers.

### Pitfall 2: Missing Test Assertion Updates for 403 Required Scopes
**What goes wrong:** Tests assert `required_scopes` contains `['wikijs:read', 'wikijs:write', 'wikijs:admin']` -- this will fail when SUPPORTED_SCOPES changes to `['wikijs:read']`.
**Why it happens:** Multiple test files check the `required_scopes` array in 403 responses.
**How to avoid:** Search all test files for string literals `wikijs:write` and `wikijs:admin` and update every occurrence.
**Warning signs:** Middleware.test.ts line 214 asserts `required_scopes` equals the old 3-scope array; discovery.test.ts line 65-68 asserts 3 scopes.

### Pitfall 3: Scope-Mapper Test Has wikijs:write and wikijs:admin Assertions
**What goes wrong:** scope-mapper.test.ts line 13-20 tests `mapScopes(["wikijs:read", "wikijs:write", "wikijs:admin"], ...)` -- after Phase 17, wikijs:write and wikijs:admin are no longer in SUPPORTED_SCOPES, so `mapScopes` would pass them through unchanged instead of prefixing them.
**Why it happens:** The scope-mapper's logic checks `SUPPORTED_SCOPES.includes(scope)` -- only wikijs:read will match post-change.
**How to avoid:** Update scope-mapper tests to only test wikijs:read prefixing. wikijs:write and wikijs:admin become "unknown scopes" that pass through -- this is correct behavior but tests need to match.
**Warning signs:** scope-mapper.test.ts "prefixes all three MCP scopes" test will fail because only wikijs:read gets prefixed.

### Pitfall 4: Auth Middleware Test for wikijs:admin Acceptance
**What goes wrong:** middleware.test.ts line 183-191 expects `scp: 'wikijs:admin'` to return 200. After Phase 17, this should return 403.
**Why it happens:** With only wikijs:read in SUPPORTED_SCOPES, a token with only wikijs:admin has no valid scope.
**How to avoid:** Convert this test case from a 200-acceptance test to a 403-rejection test.
**Warning signs:** The test name says "returns 200 for a single valid scope (wikijs:admin)".

### Pitfall 5: WWW-Authenticate Header Scope String Changes
**What goes wrong:** middleware.test.ts line 267-278 asserts WWW-Authenticate contains `scope="wikijs:read wikijs:write wikijs:admin"`. After Phase 17, this becomes `scope="wikijs:read"`.
**Why it happens:** `buildWwwAuthenticate403` receives `[...SUPPORTED_SCOPES]` and joins with space.
**How to avoid:** Update the assertion to check for `scope="wikijs:read"`.
**Warning signs:** Test fails with "expected to contain 'scope=\"wikijs:read wikijs:write wikijs:admin\"'" error.

### Pitfall 6: Smoke Test Tool Count Assertion
**What goes wrong:** smoke.test.ts line 197 asserts `tools.length === 17` and lines 210-228 list all 17 tool names.
**Why it happens:** Phase 16 should have already reduced this, but if Phase 17 runs on top of the Phase 16 state, need to verify this is already 3.
**How to avoid:** This is a Phase 16 concern, not Phase 17. But verify smoke tests pass after the scope changes.
**Warning signs:** If Phase 16 didn't update smoke tests, they'll already be broken.

## Code Examples

### Exact Files Requiring Changes

```
PRODUCTION CODE (1 file):
  src/scopes.ts                              -- Remove WRITE/ADMIN from SCOPES, collapse SCOPE_TOOL_MAP

COMMENT-ONLY CHANGES (1 file):
  src/oauth-proxy/scope-mapper.ts            -- Update JSDoc (line 15: remove wikijs:write, wikijs:admin mention)

TEST FILES (5 files):
  tests/scopes.test.ts                       -- Full rewrite (every assertion changes)
  src/auth/__tests__/helpers.ts              -- Default token scp: 'wikijs:read' (line 64)
  src/auth/__tests__/middleware.test.ts       -- Update scope validation tests (lines 183-215, 267-278)
  tests/discovery.test.ts                    -- scopes_supported assertion (lines 59-68)
  src/oauth-proxy/__tests__/scope-mapper.test.ts -- Remove multi-scope test, update single-scope test
```

### Files That Auto-Propagate (NO changes needed)

```
  src/auth/middleware.ts          -- Uses SUPPORTED_SCOPES import, logic unchanged
  src/routes/public-routes.ts    -- Uses SUPPORTED_SCOPES for PRM, auto-propagates
  src/routes/oauth-proxy.ts      -- Uses SUPPORTED_SCOPES for AS metadata, auto-propagates
  src/oauth-proxy/scope-mapper.ts -- Uses SUPPORTED_SCOPES.includes(), auto-propagates (code, not comments)
  src/auth/errors.ts             -- buildWwwAuthenticate403 receives scopes as param, auto-propagates
```

### Rewritten scopes.test.ts (recommended structure)

```typescript
// Source: Recommended test structure based on CONTEXT.md decisions

import { describe, it, expect } from "vitest";
import {
  SCOPES,
  SCOPE_TOOL_MAP,
  TOOL_SCOPE_MAP,
  SUPPORTED_SCOPES,
  type Scope,
} from "../src/scopes.js";

describe("Scope-to-tool mapping", () => {
  it("SUPPORTED_SCOPES contains exactly one scope: wikijs:read", () => {
    expect(SUPPORTED_SCOPES).toEqual(["wikijs:read"]);
    expect(SUPPORTED_SCOPES).toHaveLength(1);
  });

  it("SCOPES object contains only READ", () => {
    expect(SCOPES).toEqual({ READ: "wikijs:read" });
    expect(Object.keys(SCOPES)).toHaveLength(1);
  });

  it("SCOPE_TOOL_MAP maps wikijs:read to exactly 3 tools", () => {
    const readTools = SCOPE_TOOL_MAP[SCOPES.READ];
    expect(readTools).toHaveLength(3);
    expect(readTools).toContain("get_page");
    expect(readTools).toContain("list_pages");
    expect(readTools).toContain("search_pages");
  });

  it("every scope has at least one tool", () => {
    for (const scope of SUPPORTED_SCOPES) {
      expect(SCOPE_TOOL_MAP[scope as Scope].length).toBeGreaterThanOrEqual(1);
    }
  });

  it("maps exactly 3 tools total", () => {
    const allTools = Object.values(SCOPE_TOOL_MAP).flat();
    expect(allTools).toHaveLength(3);
  });

  it("has no duplicate tool names across scopes", () => {
    const allTools = Object.values(SCOPE_TOOL_MAP).flat();
    const unique = new Set(allTools);
    expect(unique.size).toBe(allTools.length);
  });

  it("TOOL_SCOPE_MAP reverse lookup covers every tool in SCOPE_TOOL_MAP", () => {
    const allTools = Object.values(SCOPE_TOOL_MAP).flat();
    for (const tool of allTools) {
      expect(TOOL_SCOPE_MAP[tool]).toBeDefined();
      expect(TOOL_SCOPE_MAP[tool]).toBe("wikijs:read");
    }
    expect(Object.keys(TOOL_SCOPE_MAP)).toHaveLength(allTools.length);
  });

  it("all tools map to wikijs:read", () => {
    for (const [_tool, scope] of Object.entries(TOOL_SCOPE_MAP)) {
      expect(scope).toBe("wikijs:read");
    }
  });
});
```

### Updated middleware.test.ts scope validation section (key changes)

```typescript
// Source: Recommended changes to existing middleware.test.ts

// EXISTING test stays as-is (line 171-179):
// "returns 200 for a single valid scope (wikijs:read)" -- still passes

// CHANGE this test (was line 183-191, "returns 200 for wikijs:admin"):
it('returns 403 for a token with only wikijs:admin scope', async () => {
  const token = await createTokenWithClaims({ oid: 'x', scp: 'wikijs:admin' });
  const res = await app.inject({
    method: 'GET',
    url: '/test',
    headers: { authorization: `Bearer ${token}` },
  });
  expect(res.statusCode).toBe(403);
  const body = res.json();
  expect(body.error).toBe('insufficient_scope');
});

// ADD new test:
it('returns 403 for a token with only wikijs:write scope', async () => {
  const token = await createTokenWithClaims({ oid: 'x', scp: 'wikijs:write' });
  const res = await app.inject({
    method: 'GET',
    url: '/test',
    headers: { authorization: `Bearer ${token}` },
  });
  expect(res.statusCode).toBe(403);
});

// CHANGE required_scopes assertion (was line 204-215):
it('includes required_scopes array in 403 response body', async () => {
  const token = await createTokenWithClaims({ oid: 'x' });
  const res = await app.inject({
    method: 'GET',
    url: '/test',
    headers: { authorization: `Bearer ${token}` },
  });
  expect(res.statusCode).toBe(403);
  const body = res.json();
  expect(body.required_scopes).toEqual(['wikijs:read']);
});

// CHANGE WWW-Authenticate scope assertion (was line 267-278):
it('403 response has WWW-Authenticate containing scope parameter with wikijs:read', async () => {
  const token = await createTokenWithClaims({ oid: 'x' });
  const res = await app.inject({
    method: 'GET',
    url: '/test',
    headers: { authorization: `Bearer ${token}` },
  });
  expect(res.statusCode).toBe(403);
  const wwwAuth = res.headers['www-authenticate'] as string;
  expect(wwwAuth).toContain('scope="wikijs:read"');
});
```

### Updated discovery.test.ts assertion (key change)

```typescript
// Source: Recommended change to existing discovery.test.ts line 59-68

it("contains scopes_supported with only wikijs:read", async () => {
  const res = await app.inject({
    method: "GET",
    url: "/.well-known/oauth-protected-resource",
  });
  const body = res.json();
  expect(body.scopes_supported).toEqual(["wikijs:read"]);
  expect(body.scopes_supported).toHaveLength(1);
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 3 scopes (read/write/admin) for 17 tools | 1 scope (read) for 3 tools | Phase 17 (v2.3) | Simpler auth model, no per-tool scope enforcement needed |
| SCOPE_TOOL_MAP with 3 keys | SCOPE_TOOL_MAP with 1 key | Phase 17 | TOOL_SCOPE_MAP becomes trivial but pattern preserved |
| Default test token: `scp: 'wikijs:read wikijs:write'` | Default test token: `scp: 'wikijs:read'` | Phase 17 | All tests using createTestToken() auto-inherit correct scope |

## Open Questions

1. **Exact tool names after Phase 15/16**
   - What we know: REQUIREMENTS.md specifies `get_page` (merged from get_page + get_page_content), `list_pages` (with includeUnpublished flag), `search_pages` (with ID resolution)
   - What's unclear: Whether Phase 15/16 rename any tools or keep exact names
   - Recommendation: Verify against mcp-tools.ts after Phase 15/16 complete. The 3 names above are highly likely based on requirements.

2. **Smoke test and observability test status after Phase 15/16**
   - What we know: smoke.test.ts currently asserts 17 tools and tests list_users; observability.test.ts tests list_users
   - What's unclear: Whether Phase 15/16 already updated these tests
   - Recommendation: Phase 17 should not touch tests that Phase 15/16 should have already updated. If they're still broken, that's a Phase 15/16 issue. But check and fix if needed.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4 |
| Config file | vitest.config.ts |
| Quick run command | `npx vitest run tests/scopes.test.ts src/auth/__tests__/middleware.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCOP-01 | SCOPES contains only READ, no WRITE/ADMIN | unit | `npx vitest run tests/scopes.test.ts -x` | Rewrite needed |
| SCOP-01 | SUPPORTED_SCOPES equals ["wikijs:read"] | unit | `npx vitest run tests/scopes.test.ts -x` | Rewrite needed |
| SCOP-01 | Discovery scopes_supported equals ["wikijs:read"] | integration | `npx vitest run tests/discovery.test.ts -x` | Update needed |
| SCOP-01 | Token with only wikijs:write gets 403 | unit | `npx vitest run src/auth/__tests__/middleware.test.ts -x` | New test case |
| SCOP-01 | Token with only wikijs:admin gets 403 | unit | `npx vitest run src/auth/__tests__/middleware.test.ts -x` | Convert existing |
| SCOP-02 | SCOPE_TOOL_MAP maps all 3 tools to wikijs:read | unit | `npx vitest run tests/scopes.test.ts -x` | Rewrite needed |
| SCOP-02 | Token with wikijs:read can invoke all 3 tools | integration | `npx vitest run tests/scopes.test.ts -x` | Rewrite needed |
| SCOP-02 | TOOL_SCOPE_MAP returns wikijs:read for all tools | unit | `npx vitest run tests/scopes.test.ts -x` | Rewrite needed |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/scopes.test.ts src/auth/__tests__/middleware.test.ts tests/discovery.test.ts src/oauth-proxy/__tests__/scope-mapper.test.ts -x`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green (currently 209 tests) before `/gsd:verify-work`

### Wave 0 Gaps
None -- existing test infrastructure covers all phase requirements. No new test files or framework config needed. All changes are modifications to existing test files.

## Sources

### Primary (HIGH confidence)
- `src/scopes.ts` -- current scope definitions, derivation chain (direct code reading)
- `src/auth/middleware.ts` line 86 -- scope validation logic using SUPPORTED_SCOPES (direct code reading)
- `src/routes/public-routes.ts` line 90 -- PRM metadata using SUPPORTED_SCOPES (direct code reading)
- `src/routes/oauth-proxy.ts` line 54 -- AS metadata using SUPPORTED_SCOPES (direct code reading)
- `src/oauth-proxy/scope-mapper.ts` line 22 -- scope matching using SUPPORTED_SCOPES (direct code reading)
- `src/auth/errors.ts` lines 81-86 -- buildWwwAuthenticate403 receives scopes as parameter (direct code reading)
- `src/auth/__tests__/helpers.ts` line 64 -- default test token scp claim (direct code reading)
- All test files -- current assertions verified by reading (direct code reading)
- `npm test` output -- 209 tests passing as of research date (direct execution)

### Secondary (MEDIUM confidence)
- CONTEXT.md decisions -- user-locked implementation approach
- REQUIREMENTS.md -- SCOP-01/SCOP-02 definitions

### Tertiary (LOW confidence)
- Final 3 tool names -- assumed from REQUIREMENTS.md but depends on Phase 15/16 execution

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new libraries, existing codebase fully understood
- Architecture: HIGH - derivation chain verified by reading all 6 consumer files
- Pitfalls: HIGH - all test files read and specific failing assertion lines identified
- Tool names: MEDIUM - depends on Phase 15/16 output, but REQUIREMENTS.md is clear

**Research date:** 2026-03-26
**Valid until:** Indefinite (stable codebase pattern, no external dependencies)
