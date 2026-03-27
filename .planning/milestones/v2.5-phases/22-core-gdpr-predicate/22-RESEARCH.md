# Phase 22: Core GDPR Predicate - Research

**Researched:** 2026-03-27
**Domain:** Pure TypeScript utility function + unit testing
**Confidence:** HIGH

## Summary

Phase 22 delivers a single pure function `isBlocked(path: string): boolean` in a new file `src/gdpr.ts`. The function blocks paths with exactly 2 segments where the first segment is "clients" (case-insensitive). This is a zero-dependency, pure TypeScript implementation with no external libraries, no runtime state, and no side effects.

The implementation is straightforward: normalize the path (lowercase, split on `/`, filter empty segments), then check `segments.length === 2 && segments[0] === "clients"`. All decisions are locked in CONTEXT.md. The primary risk area is test completeness -- ensuring all edge cases from the CONTEXT.md test strategy are covered.

**Primary recommendation:** Implement the function and tests in a single wave. The function is ~10 lines; the tests are the bulk of the work. Follow the `scope-mapper.test.ts` pattern exactly.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Single file: `src/gdpr.ts` -- new top-level module alongside api.ts, types.ts
- Only `isBlocked()` is exported; `normalizePath()` is an internal helper
- No directory structure -- one file is sufficient
- `export function isBlocked(path: string): boolean`
- Plain boolean return -- Phase 23 derives audit context from request context, not from isBlocked()
- "clients" literal hardcoded inside the function, not a module-level constant
- Minimal normalization: leading/trailing slashes, double slashes, case folding
- Full lowercase of entire path (not just first segment)
- Split on `/` then `.filter(Boolean)` to handle empty segments from slashes
- No URL decoding (%2F etc.) -- WikiJsPage.path is already clean
- No path traversal resolution -- `..` and `.` treated as literal segments
- Standard `toLowerCase()` -- no locale-aware case folding needed
- null, undefined, empty string all return false (can't block what has no path)
- Test file: `src/__tests__/gdpr.test.ts`
- Follow `scope-mapper.test.ts` pattern: describe blocks, pure function, no mocking

### Claude's Discretion
- Exact normalization implementation (regex vs string methods)
- Test assertion messages and describe block naming
- Internal code comments

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FILT-01 | `isBlocked()` utility blocks paths with exactly 2 segments where first is "Clients" (case-insensitive) | Core function logic: lowercase + split + filter(Boolean) + segment count check. Verified against WikiJsPage.path format (no leading slash in Wiki.js GraphQL responses). |
| FILT-02 | `isBlocked()` normalizes paths (leading/trailing slashes, double slashes, case folding) before checking | Normalization via `toLowerCase()` + `split('/')` + `filter(Boolean)` handles all listed variants in a single pipeline. No external dependencies needed. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.3 (strict, ESM) | Implementation language | Already configured in project |
| Vitest | 4.1.1 | Test runner | Already configured, `vitest run` works |

### Supporting
No additional libraries needed. This is pure TypeScript with zero new dependencies. The `toLowerCase()`, `split()`, and `filter()` methods are built-in JavaScript string/array primitives.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual string ops | `path` module (Node.js) | `path` module uses OS-specific separators on Windows and is designed for filesystem paths, not Wiki.js URL-style paths. Manual split on `/` is correct here. |
| Hardcoded "clients" | Config/env var | CONTEXT.md explicitly locks hardcoded literal. Code change with tests is safer than runtime config for GDPR compliance (per REQUIREMENTS.md). |

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  gdpr.ts              # NEW -- isBlocked() + internal normalizePath()
  __tests__/
    gdpr.test.ts        # NEW -- unit tests (directory must be created)
```

### Pattern 1: Pure Utility Module
**What:** A standalone module exporting a single pure function with no imports from the rest of the codebase.
**When to use:** When the function has no dependencies, no side effects, and a clear single responsibility.
**Example:**
```typescript
// Source: project pattern from src/oauth-proxy/scope-mapper.ts
// scope-mapper.ts exports pure functions (mapScopes, unmapScopes, stripResourceParam)
// with no side effects and no external state. gdpr.ts follows the same pattern.

/**
 * Returns true when path identifies a GDPR-protected client page.
 *
 * A path is blocked when it has exactly 2 segments and the first
 * segment is "clients" (case-insensitive).
 */
export function isBlocked(path: string): boolean {
  if (!path) return false;
  const segments = path.toLowerCase().split("/").filter(Boolean);
  return segments.length === 2 && segments[0] === "clients";
}
```

### Pattern 2: Test Structure (scope-mapper.test.ts pattern)
**What:** Describe blocks grouped by scenario category, each containing focused `it()` assertions.
**When to use:** For all unit tests in this project.
**Example:**
```typescript
// Source: src/oauth-proxy/__tests__/scope-mapper.test.ts
import { describe, it, expect } from "vitest";
import { isBlocked } from "../gdpr.js";  // .js extension required (NodeNext)

describe("isBlocked", () => {
  describe("blocked paths (exactly 2 segments, first is 'clients')", () => {
    it("blocks Clients/AcmeCorp", () => {
      expect(isBlocked("Clients/AcmeCorp")).toBe(true);
    });
    // ... more cases
  });

  describe("allowed paths", () => {
    // 1-segment, 3+ segments, different first segment
  });

  describe("normalization variants", () => {
    // leading/trailing slashes, double slashes, mixed case
  });

  // ... etc
});
```

### Anti-Patterns to Avoid
- **Importing from api.ts or types.ts:** `isBlocked()` takes a plain string, not a WikiJsPage. The function must remain decoupled from the domain model.
- **Exporting normalizePath():** CONTEXT.md locks this as internal. Only `isBlocked()` is exported.
- **Module-level constants for "clients":** CONTEXT.md explicitly says hardcode inside the function.
- **Using Node.js `path` module:** `path.sep` is `\` on Windows, `/` on Unix. Wiki.js paths always use `/`. Manual split is correct.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| N/A | N/A | N/A | This phase IS the hand-rolled solution -- a ~10-line function. There are no libraries for "block Wiki.js paths matching a specific pattern." The function is simple enough that no abstraction or library is warranted. |

**Key insight:** The entire point of Phase 22 is to hand-roll a small, auditable, testable predicate. The simplicity IS the feature -- GDPR compliance code should be easy to audit.

## Common Pitfalls

### Pitfall 1: Wiki.js path format assumptions
**What goes wrong:** Assuming paths always arrive with or without leading slashes.
**Why it happens:** Wiki.js GraphQL API returns paths WITHOUT leading slashes (e.g., `Clients/AcmeCorp`, not `/Clients/AcmeCorp`). However, other code paths or future callers might pass `/Clients/AcmeCorp`.
**How to avoid:** The `split("/").filter(Boolean)` pattern handles both: leading slash produces an empty first element that `filter(Boolean)` removes.
**Warning signs:** Tests pass but integration fails with `["", "clients", "acmecorp"]` having 3 segments.

### Pitfall 2: TypeScript strict mode and null/undefined
**What goes wrong:** `path.toLowerCase()` throws TypeError if path is null or undefined.
**Why it happens:** TypeScript signature says `string` but runtime callers (especially from WikiJsPage.path which is typed as `string` but could be null from GraphQL) might pass nullish values.
**How to avoid:** Guard with `if (!path) return false;` before any string operations. The CONTEXT.md explicitly requires this.
**Warning signs:** `TypeError: Cannot read properties of null (reading 'toLowerCase')` in production.

### Pitfall 3: Forgetting .js extension in ESM imports
**What goes wrong:** TypeScript compilation succeeds but runtime fails with `ERR_MODULE_NOT_FOUND`.
**Why it happens:** Project uses `"module": "NodeNext"` -- all imports must include `.js` extensions even though source files are `.ts`.
**How to avoid:** Import as `import { isBlocked } from "../gdpr.js"` in test file (NOT `../gdpr.ts` or `../gdpr`).
**Warning signs:** `vitest run` might work (Vitest resolves `.ts` files), but `tsc && node dist/...` will fail. Check both.

### Pitfall 4: Case sensitivity of "clients" check
**What goes wrong:** `isBlocked("clients/AcmeCorp")` works but `isBlocked("CLIENTS/AcmeCorp")` fails.
**Why it happens:** Comparing against "clients" without lowercasing the input first.
**How to avoid:** CONTEXT.md specifies `toLowerCase()` on the entire path BEFORE splitting. Since the comparison literal is lowercase "clients", this handles all case variants.
**Warning signs:** Tests with mixed-case first segments failing.

### Pitfall 5: Missing `__tests__` directory
**What goes wrong:** Writing `src/__tests__/gdpr.test.ts` fails because `src/__tests__/` doesn't exist.
**Why it happens:** Existing tests are in subdirectory `__tests__` folders (e.g., `src/oauth-proxy/__tests__/`, `src/auth/__tests__/`) but `src/__tests__/` has never been created.
**How to avoid:** Create the directory before writing the test file.
**Warning signs:** File creation errors during implementation.

## Code Examples

### Complete isBlocked() implementation
```typescript
// File: src/gdpr.ts
// Source: Derived from CONTEXT.md locked decisions

/**
 * GDPR path-blocking predicate.
 *
 * Returns true when a Wiki.js page path matches a GDPR-protected
 * client page: exactly 2 segments where the first is "clients"
 * (case-insensitive).
 *
 * Examples:
 *   isBlocked("Clients/AcmeCorp")     → true
 *   isBlocked("clients/acme")         → true
 *   isBlocked("Clients")              → false  (1 segment)
 *   isBlocked("Clients/Acme/SubPage") → false  (3 segments)
 *   isBlocked("Projects/AcmeCorp")    → false  (wrong first segment)
 */
export function isBlocked(path: string): boolean {
  if (!path) return false;
  const segments = path.toLowerCase().split("/").filter(Boolean);
  return segments.length === 2 && segments[0] === "clients";
}
```

### Test file structure
```typescript
// File: src/__tests__/gdpr.test.ts
// Source: Pattern from src/oauth-proxy/__tests__/scope-mapper.test.ts

import { describe, it, expect } from "vitest";
import { isBlocked } from "../gdpr.js";

describe("isBlocked", () => {
  describe("blocked paths (exactly 2 segments, first is 'clients')", () => {
    it("blocks Clients/AcmeCorp", () => {
      expect(isBlocked("Clients/AcmeCorp")).toBe(true);
    });

    it("blocks lowercase clients/acme", () => {
      expect(isBlocked("clients/acme")).toBe(true);
    });

    it("blocks CLIENTS/ACME (all uppercase)", () => {
      expect(isBlocked("CLIENTS/ACME")).toBe(true);
    });

    it("blocks mixed case cLiEnTs/SomeCorp", () => {
      expect(isBlocked("cLiEnTs/SomeCorp")).toBe(true);
    });
  });

  describe("allowed paths (not blocked)", () => {
    it("allows single-segment 'Clients'", () => {
      expect(isBlocked("Clients")).toBe(false);
    });

    it("allows 3-segment 'Clients/Acme/SubPage'", () => {
      expect(isBlocked("Clients/Acme/SubPage")).toBe(false);
    });

    it("allows different first segment 'Projects/AcmeCorp'", () => {
      expect(isBlocked("Projects/AcmeCorp")).toBe(false);
    });

    it("allows root-level page 'home'", () => {
      expect(isBlocked("home")).toBe(false);
    });
  });

  describe("normalization variants", () => {
    it("handles leading slash '/Clients/AcmeCorp'", () => {
      expect(isBlocked("/Clients/AcmeCorp")).toBe(true);
    });

    it("handles trailing slash 'Clients/AcmeCorp/'", () => {
      expect(isBlocked("Clients/AcmeCorp/")).toBe(true);
    });

    it("handles double slashes 'Clients//AcmeCorp'", () => {
      expect(isBlocked("Clients//AcmeCorp")).toBe(true);
    });

    it("handles leading + trailing slashes '/Clients/AcmeCorp/'", () => {
      expect(isBlocked("/Clients/AcmeCorp/")).toBe(true);
    });
  });

  describe("null, undefined, and empty input", () => {
    it("returns false for empty string", () => {
      expect(isBlocked("")).toBe(false);
    });

    it("returns false for null (cast as any)", () => {
      expect(isBlocked(null as any)).toBe(false);
    });

    it("returns false for undefined (cast as any)", () => {
      expect(isBlocked(undefined as any)).toBe(false);
    });
  });

  describe("unicode and special characters", () => {
    it("blocks clients with unicode company name", () => {
      expect(isBlocked("Clients/United")).toBe(true);
    });

    it("blocks clients with spaces in company name", () => {
      expect(isBlocked("Clients/Acme Corp")).toBe(true);
    });

    it("blocks clients with apostrophes", () => {
      expect(isBlocked("Clients/O'Brien")).toBe(true);
    });
  });

  describe("path traversal (treated as literal segments)", () => {
    it("does not block '../Clients/AcmeCorp' (3 segments)", () => {
      expect(isBlocked("../Clients/AcmeCorp")).toBe(false);
    });

    it("does not block './Clients/AcmeCorp' (3 segments with dot)", () => {
      // Note: "./" becomes "." after filter(Boolean), so 3 segments
      expect(isBlocked("./Clients/AcmeCorp")).toBe(false);
    });
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| N/A | N/A | N/A | This is a new feature with no prior implementation |

**Relevant project context:**
- Project uses Vitest 4.1.1 (latest major version as of 2025)
- TypeScript strict mode is enabled -- no implicit any, null safety enforced
- ESM-only project (`"type": "module"` in package.json)

## Open Questions

1. **`./` normalization edge case**
   - What we know: `"./Clients/AcmeCorp".split("/").filter(Boolean)` yields `[".", "Clients", "AcmeCorp"]` (3 segments) -- so it correctly returns false.
   - What's unclear: Whether Wiki.js ever produces paths with `./` prefix. Almost certainly not, but worth noting.
   - Recommendation: Include as a test case (already in CONTEXT.md test strategy), document the behavior. No code change needed.

2. **Vitest globals config**
   - What we know: `vitest.config.ts` has `globals: true`, which means `describe`, `it`, `expect` are available globally without import.
   - What's unclear: Whether the existing test pattern (scope-mapper.test.ts) imports from vitest anyway.
   - Recommendation: The existing `scope-mapper.test.ts` explicitly imports `{ describe, it, expect } from "vitest"` despite globals being enabled. Follow this pattern for consistency -- explicit imports are better.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.1 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run src/__tests__/gdpr.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FILT-01 | isBlocked() returns true for exactly 2 segments where first is "clients" | unit | `npx vitest run src/__tests__/gdpr.test.ts` | No -- Wave 0 |
| FILT-02 | isBlocked() normalizes paths before checking | unit | `npx vitest run src/__tests__/gdpr.test.ts` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/__tests__/gdpr.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/__tests__/` directory -- must be created (does not exist yet)
- [ ] `src/__tests__/gdpr.test.ts` -- covers FILT-01, FILT-02
- [ ] `src/gdpr.ts` -- the implementation file itself

*(No framework install needed -- Vitest 4.1.1 is already in devDependencies and configured)*

## Sources

### Primary (HIGH confidence)
- Project source code: `src/oauth-proxy/scope-mapper.ts` and `src/oauth-proxy/__tests__/scope-mapper.test.ts` -- verified test pattern and pure utility module pattern
- Project source code: `src/types.ts` -- verified `WikiJsPage.path` is typed as `string`
- Project source code: `src/api.ts` -- verified Wiki.js GraphQL returns paths without leading slashes
- Project source code: `vitest.config.ts` -- verified test configuration (globals: true, node environment)
- Project source code: `tsconfig.json` -- verified NodeNext module resolution, strict mode
- Project source code: `package.json` -- verified Vitest 4.1.1, ESM ("type": "module")

### Secondary (MEDIUM confidence)
- [Wiki.js GraphQL API docs](https://docs.requarks.io/dev/api) -- Wiki.js path format (no leading slash)
- [Wiki.js GitHub Discussion #6672](https://github.com/requarks/wiki/discussions/6672) -- singleByPath path format confirmation

### Tertiary (LOW confidence)
None -- all findings verified from source code.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero new dependencies, all tools already in project
- Architecture: HIGH -- follows established project patterns (scope-mapper.ts), all decisions locked in CONTEXT.md
- Pitfalls: HIGH -- all pitfalls derived from examining actual codebase (ESM extensions, strict mode, directory structure)

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (stable -- no external dependencies to change)
