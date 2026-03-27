# Phase 25: Core Redaction Function - Research

**Researched:** 2026-03-27
**Domain:** Pure string redaction function (regex-based HTML comment marker processing)
**Confidence:** HIGH

## Summary

Phase 25 implements a pure `redactContent()` function that replaces content between `<!-- gdpr-start -->` and `<!-- gdpr-end -->` HTML comment markers with a fixed placeholder string. The function lives in the existing `src/gdpr.ts` module alongside `isBlocked()`, returns a structured `RedactionResult` with content, count, and warnings, and has zero external dependencies beyond TypeScript itself.

The technical approach is a two-pass regex replacement: (1) match all properly closed marker pairs using a non-greedy pattern, then (2) handle any remaining unclosed start markers by redacting to end of content. A third scan detects orphaned end markers for warning generation. All regex patterns use the `gi` flags for case-insensitive matching and `\s*` for whitespace tolerance around the tag names.

**Primary recommendation:** Implement as a two-pass regex function with comprehensive unit tests in the existing `src/__tests__/gdpr.test.ts` file, following the defensive coding patterns established by `isBlocked()`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Return value shape: `RedactionResult { content, redactionCount, warnings }` with `RedactionWarning { message, pageId, path }`
- Function signature: `redactContent(content: string, pageId: number, path: string)`
- Null/undefined/empty content handled gracefully -- returns `{ content: "", redactionCount: 0, warnings: [] }`
- Function is pure -- returns warnings in result, does not log directly
- Caller logs warnings as a single batched log entry per page (not one per warning)
- Only log when warnings exist -- successful redaction is silent
- Module placement: add to existing `src/gdpr.ts` alongside `isBlocked()`
- Types exported from `gdpr.ts` alongside the function
- First-start to first-end pairing: left-to-right scan, nested start markers are just redacted content
- Orphaned gdpr-end (no preceding start): ignore content but emit a warning
- Markers are replaced along with redacted content -- clean output with no marker noise
- Unclosed gdpr-start: redact from marker to end of content (REDACT-04 fail-closed)
- Phase 27 will rename gdpr.ts to redact.ts after isBlocked() removal

### Claude's Discretion
- Regex pattern design for marker matching with case/whitespace tolerance
- Test structure and organization
- Exact warning message wording

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| REDACT-01 | get_page redacts content between markers before returning | Core `redactContent()` function performs the replacement; integration is Phase 26 but the function itself satisfies the redaction logic |
| REDACT-02 | Multiple marker pairs per page are each independently redacted | Two-pass regex with non-greedy `[\s\S]*?` matches each pair independently; verified with multi-pair test cases |
| REDACT-03 | Each redacted block replaced with exact placeholder text | Constant `REDACTION_PLACEHOLDER` used in all replacements: `[lock emoji PII redacted -- consult the wiki directly for contact details]` |
| REDACT-04 | Unclosed gdpr-start redacts from marker to end of content (fail-safe) | Second pass uses greedy `[\s\S]*` to consume everything after remaining start markers |
| REDACT-05 | Malformed markers generate a warning log with page ID and path | Function returns `RedactionWarning[]` with `{ message, pageId, path }` for unclosed starts and orphaned ends |
| REDACT-06 | Markers matched case-insensitively with whitespace tolerance | Regex uses `gi` flags and `\s*` around tag names; verified against 7 whitespace/case variants |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.3 | Language (strict, ESM) | Project standard per CLAUDE.md |
| Vitest | ^4.1.1 | Test runner | Project standard per package.json |

### Supporting
No additional libraries needed. This is a pure function using only built-in JavaScript `String.prototype.replace()` and `RegExp`. Zero new dependencies.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Regex-based approach | DOM parser (cheerio) | Overkill for HTML comments; adds dependency; comments aren't DOM nodes anyway |
| Regex-based approach | Manual character-by-character scanner | More code, more bugs, no benefit for simple paired-marker pattern |
| Two-pass regex | Single iterative scan with state machine | More complex, harder to test, no performance benefit for typical wiki page sizes |

## Architecture Patterns

### Module Placement
```
src/
  gdpr.ts              # isBlocked() + redactContent() + RedactionResult + RedactionWarning
  __tests__/
    gdpr.test.ts       # Existing isBlocked tests + new redactContent tests
```

### Pattern 1: Two-Pass Regex Replacement
**What:** First pass replaces properly closed marker pairs (non-greedy). Second pass catches unclosed start markers (greedy to end). Third scan detects orphaned end markers for warnings.
**When to use:** When markers form nested/overlapping patterns with fail-closed semantics.
**Example:**
```typescript
// Verified via Node.js REPL -- all patterns produce correct results

// Regex patterns (case-insensitive, whitespace-tolerant)
const PAIR_RE   = /<!--\s*gdpr-start\s*-->[\s\S]*?<!--\s*gdpr-end\s*-->/gi;
const UNCLOSED_RE = /<!--\s*gdpr-start\s*-->[\s\S]*/gi;
const ORPHAN_END_RE = /<!--\s*gdpr-end\s*-->/gi;

// Pass 1: Replace matched pairs
let result = content.replace(PAIR_RE, () => {
  redactionCount++;
  return REDACTION_PLACEHOLDER;
});

// Pass 2: Replace unclosed start markers (fail-closed)
result = result.replace(UNCLOSED_RE, () => {
  redactionCount++;
  warnings.push({ message: "...", pageId, path });
  return REDACTION_PLACEHOLDER;
});

// Pass 3: Detect orphaned end markers (warning only, no content change)
let match;
while ((match = ORPHAN_END_RE.exec(result)) !== null) {
  warnings.push({ message: "...", pageId, path });
}
```

### Pattern 2: Structured Return Value (Pure Function)
**What:** Function returns a typed result object instead of mutating state or logging directly.
**When to use:** When the caller controls side effects (logging, error handling).
**Example:**
```typescript
export interface RedactionWarning {
  message: string;
  pageId: number;
  path: string;
}

export interface RedactionResult {
  content: string;
  redactionCount: number;
  warnings: RedactionWarning[];
}

export function redactContent(
  content: string,
  pageId: number,
  path: string,
): RedactionResult {
  if (!content) {
    return { content: "", redactionCount: 0, warnings: [] };
  }
  // ... regex replacement logic ...
}
```

### Pattern 3: Defensive Null Safety (Existing Project Pattern)
**What:** Guard against null/undefined/empty input at the top of the function, matching `isBlocked()` style.
**When to use:** Always for public API surface in this codebase.
**Example:**
```typescript
// isBlocked pattern (existing):
export function isBlocked(path: string): boolean {
  if (!path) return false;
  // ...
}

// redactContent should follow same pattern:
export function redactContent(content: string, pageId: number, path: string): RedactionResult {
  if (!content) {
    return { content: "", redactionCount: 0, warnings: [] };
  }
  // ...
}
```

### Anti-Patterns to Avoid
- **Greedy first pass:** Using `[\s\S]*` instead of `[\s\S]*?` for pair matching would consume everything between the first start and the LAST end marker, destroying content between independent pairs
- **Logging inside the function:** The function must be pure -- warnings are returned, not logged. Caller handles logging (Phase 26)
- **Separate module file:** Do NOT create a new file. `redactContent()` goes in existing `src/gdpr.ts` per user decision
- **Forgetting `.js` extension in imports:** All imports in this project MUST include `.js` extensions (NodeNext module resolution)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTML comment matching | Character-by-character parser | Regex with `\s*` and `gi` flags | HTML comments have a simple, well-defined syntax; regex is correct and maintainable |
| Case-insensitive matching | Manual `.toLowerCase()` on content | Regex `i` flag | Built-in, zero overhead, no mutation of content |
| Multiline content matching | Line-by-line scanning | `[\s\S]*?` in regex | `[\s\S]` matches everything including newlines; `*?` makes it non-greedy |

**Key insight:** The entire redaction logic is 3 regex operations. There is no parsing ambiguity because HTML comments have rigid syntax (`<!--` ... `-->`). A regex approach is correct, complete, and far simpler than any parser-based alternative.

## Common Pitfalls

### Pitfall 1: Greedy vs Non-Greedy Quantifier
**What goes wrong:** Using `.*` or `[\s\S]*` (greedy) for pair matching consumes content between independent marker pairs.
**Why it happens:** Default regex quantifiers are greedy.
**How to avoid:** Always use `[\s\S]*?` (non-greedy) for the pair-matching regex. The unclosed-start regex intentionally uses greedy `[\s\S]*` because it should consume to end.
**Warning signs:** Test with two separate redacted blocks and check that public content between them is preserved.

### Pitfall 2: Regex `lastIndex` State with Global Flag
**What goes wrong:** Reusing a regex object with the `g` flag retains `lastIndex` between calls, causing missed matches on subsequent invocations.
**Why it happens:** JavaScript regex objects with `g` flag are stateful.
**How to avoid:** Either create regex objects inside the function (recommended -- they are lightweight) or reset `lastIndex = 0` before each use. Since `String.prototype.replace()` resets automatically, this mainly affects the `while (exec)` loop for orphan detection.
**Warning signs:** Intermittent test failures; function works on first call but not second.

### Pitfall 3: Dot Does Not Match Newlines
**What goes wrong:** Using `.` instead of `[\s\S]` fails to match content spanning multiple lines.
**Why it happens:** In JavaScript regex, `.` does not match `\n` by default (unless using the `s`/dotAll flag).
**How to avoid:** Use `[\s\S]` for "match any character including newlines". Alternatively, the `s` flag (`/pattern/gis`) would make `.` match newlines, but `[\s\S]` is the traditional and universally supported approach.
**Warning signs:** Redaction works for single-line content but fails when the redacted block spans multiple lines.

### Pitfall 4: Placeholder String Contains Unicode
**What goes wrong:** The placeholder `[lock-emoji PII redacted ...]` contains a Unicode emoji (U+1F512) and an em dash (U+2014). Copy-paste errors or encoding issues could produce wrong characters.
**Why it happens:** Emoji and special characters can be mangled by editors, terminals, or copy-paste.
**How to avoid:** Define the placeholder as a single exported constant. Tests should assert against the constant, not a copy-pasted string. Use the exact text from REDACT-03: `[🔒 PII redacted — consult the wiki directly for contact details]`
**Warning signs:** Tests pass locally but fail in CI, or placeholder looks wrong in terminal output.

### Pitfall 5: Import Extension
**What goes wrong:** Importing from `./gdpr` instead of `./gdpr.js` causes runtime module resolution failure.
**Why it happens:** Project uses NodeNext module resolution which requires explicit `.js` extensions.
**How to avoid:** Always use `.js` extension in imports: `import { redactContent } from "../gdpr.js"`
**Warning signs:** TypeScript compiles fine but runtime throws ERR_MODULE_NOT_FOUND.

## Code Examples

### Complete Function Skeleton
```typescript
// Source: Verified via Node.js REPL testing (2026-03-27)

export const REDACTION_PLACEHOLDER =
  "[🔒 PII redacted — consult the wiki directly for contact details]";

export interface RedactionWarning {
  message: string;
  pageId: number;
  path: string;
}

export interface RedactionResult {
  content: string;
  redactionCount: number;
  warnings: RedactionWarning[];
}

export function redactContent(
  content: string,
  pageId: number,
  path: string,
): RedactionResult {
  if (!content) {
    return { content: "", redactionCount: 0, warnings: [] };
  }

  const warnings: RedactionWarning[] = [];
  let redactionCount = 0;

  // Pass 1: Replace properly closed marker pairs (non-greedy)
  const pairRe = /<!--\s*gdpr-start\s*-->[\s\S]*?<!--\s*gdpr-end\s*-->/gi;
  let result = content.replace(pairRe, () => {
    redactionCount++;
    return REDACTION_PLACEHOLDER;
  });

  // Pass 2: Handle unclosed start markers -- fail-closed (greedy to end)
  const unclosedRe = /<!--\s*gdpr-start\s*-->[\s\S]*/gi;
  result = result.replace(unclosedRe, () => {
    redactionCount++;
    warnings.push({
      message: "Unclosed gdpr-start marker — redacted to end of content",
      pageId,
      path,
    });
    return REDACTION_PLACEHOLDER;
  });

  // Pass 3: Detect orphaned end markers (warning only)
  const orphanEndRe = /<!--\s*gdpr-end\s*-->/gi;
  let match;
  while ((match = orphanEndRe.exec(result)) !== null) {
    warnings.push({
      message: "Orphaned gdpr-end marker without preceding gdpr-start",
      pageId,
      path,
    });
  }

  return { content: result, redactionCount, warnings };
}
```

### Test Pattern (Following Existing gdpr.test.ts Style)
```typescript
// Source: Modeled after existing src/__tests__/gdpr.test.ts conventions

import { describe, it, expect } from "vitest";
import { redactContent, REDACTION_PLACEHOLDER } from "../gdpr.js";

describe("redactContent", () => {
  // Group: basic redaction
  describe("single marker pair", () => {
    it("replaces content between markers with placeholder", () => {
      const input = "Hello <!-- gdpr-start -->SECRET<!-- gdpr-end --> World";
      const result = redactContent(input, 1, "test/page");
      expect(result.content).toBe(`Hello ${REDACTION_PLACEHOLDER} World`);
      expect(result.redactionCount).toBe(1);
      expect(result.warnings).toHaveLength(0);
    });
  });

  // Group: null safety (matching isBlocked test pattern)
  describe("null, undefined, and empty input", () => {
    it("returns empty result for empty string", () => {
      const result = redactContent("", 1, "test");
      expect(result).toEqual({ content: "", redactionCount: 0, warnings: [] });
    });

    it("returns empty result for null", () => {
      const result = redactContent(null as any, 1, "test");
      expect(result).toEqual({ content: "", redactionCount: 0, warnings: [] });
    });

    it("returns empty result for undefined", () => {
      const result = redactContent(undefined as any, 1, "test");
      expect(result).toEqual({ content: "", redactionCount: 0, warnings: [] });
    });
  });
});
```

### Regex Pattern Verification Matrix
```
Pattern: /<!--\s*gdpr-start\s*-->/gi

Verified matches (all produce true):
  "<!-- gdpr-start -->"          standard
  "<!--gdpr-start-->"           no whitespace
  "<!-- GDPR-START -->"          uppercase
  "<!--  gdpr-start  -->"       extra spaces
  "<!-- Gdpr-Start -->"          mixed case
  "<!--\tgdpr-start\t-->"       tabs
  "<!--\ngdpr-start\n-->"       newlines in whitespace
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `isBlocked()` path filtering | `redactContent()` marker-based | v2.6 (this milestone) | Pages are accessible but PII is redacted instead of entire page being blocked |
| No redaction | GDPR marker processing | v2.6 (this milestone) | Enables fine-grained PII protection within page content |

**Deprecated/outdated:**
- `isBlocked()` path-based filtering: Will be removed in Phase 27 after marker-based redaction is verified end-to-end. During the transition (Phases 25-26), both mechanisms coexist.

## Open Questions

1. **Should orphaned end markers be stripped from output or left in place?**
   - What we know: CONTEXT.md says "ignore content but emit a warning" for orphaned ends. The current algorithm leaves the orphaned `<!-- gdpr-end -->` marker in the output content.
   - What's unclear: Whether "ignore content" means leave the marker text in output or strip it.
   - Recommendation: Leave in place (current behavior). Stripping would modify content beyond what redaction requires. The warning alerts operators. If stripping is desired, it is a trivial follow-up.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.1 |
| Config file | `vitest.config.ts` (exists, globals enabled, node environment) |
| Quick run command | `npx vitest run src/__tests__/gdpr.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REDACT-01 | Content between markers is replaced with placeholder | unit | `npx vitest run src/__tests__/gdpr.test.ts -t "single marker pair"` | Exists (needs new tests) |
| REDACT-02 | Multiple marker pairs independently redacted | unit | `npx vitest run src/__tests__/gdpr.test.ts -t "multiple marker pairs"` | Exists (needs new tests) |
| REDACT-03 | Exact placeholder text used | unit | `npx vitest run src/__tests__/gdpr.test.ts -t "placeholder"` | Exists (needs new tests) |
| REDACT-04 | Unclosed start marker redacts to end (fail-closed) | unit | `npx vitest run src/__tests__/gdpr.test.ts -t "unclosed"` | Exists (needs new tests) |
| REDACT-05 | Malformed markers produce warning with pageId and path | unit | `npx vitest run src/__tests__/gdpr.test.ts -t "warnings"` | Exists (needs new tests) |
| REDACT-06 | Case-insensitive and whitespace-tolerant matching | unit | `npx vitest run src/__tests__/gdpr.test.ts -t "case"` | Exists (needs new tests) |

### Sampling Rate
- **Per task commit:** `npx vitest run src/__tests__/gdpr.test.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
None -- existing test infrastructure covers all phase requirements:
- `src/__tests__/gdpr.test.ts` already exists with `isBlocked()` tests; new `redactContent()` tests are added to the same file
- `vitest.config.ts` is configured with required environment variables
- No additional fixtures or helpers needed (pure function with string inputs/outputs)

## Sources

### Primary (HIGH confidence)
- **Project codebase** -- `src/gdpr.ts`, `src/__tests__/gdpr.test.ts`, `src/mcp-tools.ts`, `src/types.ts` (direct file reads)
- **Node.js REPL verification** -- All regex patterns and the two-pass algorithm tested interactively with 15+ edge cases
- **CONTEXT.md** -- User decisions on function signature, return type, module placement, and edge-case semantics

### Secondary (MEDIUM confidence)
- **MDN Web Docs** -- JavaScript `RegExp` behavior with `g` flag, `String.prototype.replace()` with function argument, `[\s\S]` vs `.` for multiline matching (well-established JavaScript knowledge)

### Tertiary (LOW confidence)
None -- this phase uses only core JavaScript/TypeScript features with no external libraries or evolving APIs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, uses only project-standard TypeScript + Vitest
- Architecture: HIGH -- two-pass regex approach verified with 15+ test cases in Node.js REPL; all edge cases from CONTEXT.md confirmed working
- Pitfalls: HIGH -- regex pitfalls (greedy vs non-greedy, dotAll, lastIndex state) are well-documented JavaScript fundamentals; Unicode placeholder verified

**Research date:** 2026-03-27
**Valid until:** Indefinite -- pure JavaScript regex fundamentals do not change
