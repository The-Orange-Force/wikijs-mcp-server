# Phase 6: Scope Format Alignment - Research

**Researched:** 2026-03-24
**Domain:** OAuth scope format consistency, single-source-of-truth refactor
**Confidence:** HIGH

## Summary

Phase 6 closes a cross-phase integration gap identified in the milestone audit: `src/scopes.ts` defines scopes with dot notation (`wikijs.read`) while `src/auth/middleware.ts` independently defines scopes with colon notation (`wikijs:read`). The discovery endpoint serves dot-notation scopes (from `scopes.ts`), but the auth middleware only accepts colon-notation scopes. A client following the RFC 9728 discovery document would request the wrong scopes from Azure AD and be rejected with 403.

The fix is straightforward: change `src/scopes.ts` to use colon notation (the OAuth 2.0 / Azure AD convention) and remove the duplicate `VALID_SCOPES` constant from `src/auth/middleware.ts`, replacing it with an import from `src/scopes.ts`. This creates a single source of truth. All tests hardcoding dot-notation scope strings must also be updated.

**Primary recommendation:** Change `src/scopes.ts` to colon notation, delete `VALID_SCOPES` from middleware, import `SUPPORTED_SCOPES` from `src/scopes.ts` instead. Update all tests that assert dot-notation strings.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DISC-02 | Metadata includes resource URL, authorization_servers, scopes_supported, bearer_methods_supported | Scope format alignment ensures `scopes_supported` returns the colon-notation scopes that the auth middleware actually enforces, making discovery semantically correct |
</phase_requirements>

## Standard Stack

No new libraries or dependencies needed. This phase is a pure refactor of existing code.

### Core
| Library | Version | Purpose | Already Present |
|---------|---------|---------|-----------------|
| TypeScript | existing | Type-safe scope constants | Yes |
| vitest | existing | Test runner | Yes |
| Fastify | existing | HTTP framework | Yes |

## Architecture Patterns

### Pattern: Single Source of Truth for Scopes

**What:** All scope strings derive from a single constant object (`SCOPES` in `src/scopes.ts`). No other file may define scope string literals.

**Why:** The audit found that two files independently defined scope values with different formats. The middleware (`wikijs:read`) and the scope module (`wikijs.read`) disagreed, creating a silent integration failure.

**Current state (BROKEN):**
```
src/scopes.ts          -->  "wikijs.read"  (dot notation)
src/auth/middleware.ts  -->  "wikijs:read"  (colon notation, separate VALID_SCOPES array)
```

**Target state (FIXED):**
```
src/scopes.ts          -->  "wikijs:read"  (colon notation)
src/auth/middleware.ts  -->  imports SUPPORTED_SCOPES from src/scopes.ts (no local definition)
```

### Files Requiring Changes

| File | Change | Reason |
|------|--------|--------|
| `src/scopes.ts` | Change SCOPES values from dot to colon notation | Single source of truth |
| `src/auth/middleware.ts` | Remove `VALID_SCOPES`, import `SUPPORTED_SCOPES` from `src/scopes.ts` | Eliminate duplication |
| `tests/scopes.test.ts` | Update all string assertions from dot to colon notation | 8 assertions reference dot-notation strings |
| `tests/discovery.test.ts` | Update `scopes_supported` assertion from dot to colon notation | Line 67 asserts dot-notation |

### Files That Need NO Changes

| File | Why No Change Needed |
|------|---------------------|
| `src/routes/public-routes.ts` | Already imports `SUPPORTED_SCOPES` from `src/scopes.ts` -- value changes automatically |
| `src/auth/__tests__/middleware.test.ts` | Already uses colon-notation strings (tests were written against the middleware's VALID_SCOPES) |
| `src/auth/__tests__/helpers.ts` | Already uses colon notation in test token `scp` claims |
| `src/auth/__tests__/errors.test.ts` | Already uses colon notation in buildWwwAuthenticate403 test |
| `tests/route-protection.test.ts` | Does not assert scope string values |
| `tests/observability.test.ts` | Does not assert scope string values |
| `tests/helpers/build-test-app.ts` | Does not reference scope strings |

### Anti-Patterns to Avoid
- **Defining scope strings in multiple files:** The root cause of this bug. After the fix, no file other than `src/scopes.ts` should contain scope string literals like `wikijs:read`.
- **Leaving VALID_SCOPES in middleware.ts:** Even if values are aligned, duplication will drift again. Delete it entirely and import from the canonical source.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Scope validation | New scope checking logic | Existing `SUPPORTED_SCOPES` array from `src/scopes.ts` | Already computed as `Object.values(SCOPES)` |

## Common Pitfalls

### Pitfall 1: Changing Only scopes.ts Without Updating Middleware Imports
**What goes wrong:** If `src/scopes.ts` is changed to colon notation but `src/auth/middleware.ts` still uses its own `VALID_SCOPES` array, there are now two arrays with the same values but no shared source of truth. They could drift again.
**How to avoid:** Delete `VALID_SCOPES` from middleware.ts entirely. Import `SUPPORTED_SCOPES` from `src/scopes.ts`.

### Pitfall 2: Missing Test Updates
**What goes wrong:** Tests that hardcode `"wikijs.read"` strings will fail after changing scopes.ts. This is actually desired (tests catch the change), but the planner must account for updating them.
**How to avoid:** Grep for `wikijs\.read`, `wikijs\.write`, `wikijs\.admin` (escaped dot) across the entire project to find all occurrences that need updating.

### Pitfall 3: Type Narrowing Breaks When Removing VALID_SCOPES
**What goes wrong:** The middleware uses `(VALID_SCOPES as readonly string[]).includes(s)` for scope checking. When switching to `SUPPORTED_SCOPES` (typed as `string[]`), the type narrowing works the same way. However, `SUPPORTED_SCOPES` is currently typed as `string[]` not `readonly string[]`. This is fine -- `includes()` is available on both.
**How to avoid:** No special handling needed. The type compatibility is verified.

### Pitfall 4: Forgetting the 403 Response Body
**What goes wrong:** The middleware sends `required_scopes: [...VALID_SCOPES]` in the 403 response body. This must change to use the imported array.
**How to avoid:** Replace `[...VALID_SCOPES]` with `[...SUPPORTED_SCOPES]` (or equivalent import) in the 403 response.

## Code Examples

### Change 1: src/scopes.ts -- Switch to Colon Notation
```typescript
// BEFORE:
export const SCOPES = {
  READ: "wikijs.read",
  WRITE: "wikijs.write",
  ADMIN: "wikijs.admin",
} as const;

// AFTER:
export const SCOPES = {
  READ: "wikijs:read",
  WRITE: "wikijs:write",
  ADMIN: "wikijs:admin",
} as const;
```

### Change 2: src/auth/middleware.ts -- Import Instead of Define
```typescript
// BEFORE (line 34):
export const VALID_SCOPES = ['wikijs:read', 'wikijs:write', 'wikijs:admin'] as const;
// ... used as: (VALID_SCOPES as readonly string[]).includes(s)

// AFTER:
import { SUPPORTED_SCOPES } from '../scopes.js';
// ... used as: SUPPORTED_SCOPES.includes(s)
// Remove the VALID_SCOPES export entirely
```

### Change 3: Scope Check in Middleware
```typescript
// BEFORE:
const hasValidScope = scopes.some(s => (VALID_SCOPES as readonly string[]).includes(s));
// ...
required_scopes: [...VALID_SCOPES],
// ...
buildWwwAuthenticate403(resourceMetadataUrl, [...VALID_SCOPES])

// AFTER:
const hasValidScope = scopes.some(s => SUPPORTED_SCOPES.includes(s));
// ...
required_scopes: [...SUPPORTED_SCOPES],
// ...
buildWwwAuthenticate403(resourceMetadataUrl, [...SUPPORTED_SCOPES])
```

### Change 4: tests/scopes.test.ts -- Update Assertions
```typescript
// BEFORE:
expect(SCOPES.READ).toBe("wikijs.read");
expect(TOOL_SCOPE_MAP["get_page"]).toBe("wikijs.read");
expect.arrayContaining(["wikijs.read", "wikijs.write", "wikijs.admin"])

// AFTER:
expect(SCOPES.READ).toBe("wikijs:read");
expect(TOOL_SCOPE_MAP["get_page"]).toBe("wikijs:read");
expect.arrayContaining(["wikijs:read", "wikijs:write", "wikijs:admin"])
```

### Change 5: tests/discovery.test.ts -- Update Assertion
```typescript
// BEFORE (line 67):
expect.arrayContaining(["wikijs.read", "wikijs.write", "wikijs.admin"])

// AFTER:
expect.arrayContaining(["wikijs:read", "wikijs:write", "wikijs:admin"])
```

## Exhaustive Inventory of Dot-Notation Occurrences

Complete list of lines containing `wikijs.read`, `wikijs.write`, or `wikijs.admin` (excluding `wikijs.baseUrl`/`wikijs.token` config references):

| File | Line(s) | What to Change |
|------|---------|----------------|
| `src/scopes.ts` | 6, 7, 8 | SCOPES constant values |
| `tests/scopes.test.ts` | 13, 43, 55, 63, 76, 77, 78, 82, 83, 84 | String assertions |
| `tests/discovery.test.ts` | 67 | scopes_supported assertion |

All other scope references in the codebase already use colon notation (the auth middleware and its tests).

## Impact on Existing Middleware Test Suite

The auth middleware tests (`src/auth/__tests__/middleware.test.ts`) already use colon-notation scope strings in test tokens AND in assertions. They currently pass because the middleware's `VALID_SCOPES` uses colons. After this change:

1. The middleware will import from `src/scopes.ts` instead of defining its own array
2. The values will still be colon notation (now from scopes.ts)
3. All 17 middleware tests will continue to pass WITHOUT any test changes

This is a critical correctness property: the middleware tests are already testing the right behavior. The only tests that need updating are the ones that test `scopes.ts` directly (which currently assert the wrong dot-notation values) and the discovery integration test (which currently asserts the wrong dot-notation response).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (via vitest.config.ts) |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/scopes.test.ts tests/discovery.test.ts src/auth/__tests__/middleware.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DISC-02 | Discovery returns colon-notation scopes matching middleware | integration | `npx vitest run tests/discovery.test.ts -x` | Exists (needs assertion update) |
| DISC-02 | scopes.ts values are colon notation | unit | `npx vitest run tests/scopes.test.ts -x` | Exists (needs assertion update) |
| DISC-02 | Middleware uses scopes from scopes.ts (single source) | integration | `npx vitest run src/auth/__tests__/middleware.test.ts -x` | Exists (no changes needed) |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/scopes.test.ts tests/discovery.test.ts src/auth/__tests__/middleware.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green (all 106 tests) before `/gsd:verify-work`

### Wave 0 Gaps
None -- existing test infrastructure covers all phase requirements. Tests already exist for scope values (`tests/scopes.test.ts`), discovery response (`tests/discovery.test.ts`), and middleware scope validation (`src/auth/__tests__/middleware.test.ts`). Only assertion values need updating, not new test files.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Dot notation (`wikijs.read`) | Colon notation (`wikijs:read`) | Phase 6 fixes this | OAuth 2.0 convention uses colons; Azure AD App Registration scopes use colons |

**Why colon notation is correct:**
- Azure AD App Registration defines scopes with colon separators (e.g., `api://client-id/wikijs:read`)
- OAuth 2.0 has no formal syntax requirement for scope tokens (RFC 6749 Section 3.3 defines scopes as space-delimited opaque strings), but the colon convention is dominant in Azure AD ecosystems
- All test tokens in this project already use colon notation, confirming the original intent

## Open Questions

None. This is a well-bounded refactor with clear inputs, outputs, and test coverage.

## Sources

### Primary (HIGH confidence)
- Direct code analysis of `src/scopes.ts`, `src/auth/middleware.ts`, `src/routes/public-routes.ts`
- Direct code analysis of all test files referencing scope strings
- `.planning/v2-MILESTONE-AUDIT.md` -- identifies the exact gap and fix recommendation
- Full test suite run: 106/106 tests pass on current codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies, pure refactor
- Architecture: HIGH - exact files and line numbers identified from direct code analysis
- Pitfalls: HIGH - exhaustive grep confirms complete inventory of changes needed

**Research date:** 2026-03-24
**Valid until:** Indefinitely (scope format is a one-time alignment fix)
