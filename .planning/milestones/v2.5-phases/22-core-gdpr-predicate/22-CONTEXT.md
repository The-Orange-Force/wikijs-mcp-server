# Phase 22: Core GDPR Predicate - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

A hardened `isBlocked()` path-blocking predicate that is the single source of truth for GDPR path filtering. Blocks paths with exactly 2 segments where the first is "Clients" (case-insensitive). This phase delivers the utility and its unit tests only — tool handler integration is Phase 23.

</domain>

<decisions>
## Implementation Decisions

### Module placement
- Single file: `src/gdpr.ts` — new top-level module alongside api.ts, types.ts
- Only `isBlocked()` is exported; `normalizePath()` is an internal helper
- No directory structure — one file is sufficient

### Function signature
- `export function isBlocked(path: string): boolean`
- Plain boolean return — Phase 23 derives audit context from request context, not from isBlocked()
- "clients" literal hardcoded inside the function, not a module-level constant

### Path normalization
- Minimal normalization: leading/trailing slashes, double slashes, case folding
- Full lowercase of entire path (not just first segment) — company name casing is irrelevant for a boolean predicate
- Split on `/` then `.filter(Boolean)` to handle empty segments from slashes
- No URL decoding (%2F etc.) — WikiJsPage.path is already clean
- No path traversal resolution — `..` and `.` treated as literal segments (WikiJS stores clean paths)
- Standard `toLowerCase()` — no locale-aware case folding needed

### Null/invalid input handling
- null, undefined, empty string all return false (can't block what has no path)
- Defensive — avoids runtime crashes on unexpected WikiJS data

### Test strategy
- Test file: `src/__tests__/gdpr.test.ts`
- Follow `scope-mapper.test.ts` pattern: describe blocks, pure function, no mocking
- Explicit describe blocks by scenario category (not coverage thresholds):
  - Blocked paths (exactly 2 segments, first is "clients")
  - Allowed paths (1 segment, 3+ segments, different first segment)
  - Normalization variants (leading/trailing slashes, double slashes, mixed case)
  - Null/undefined/non-string inputs
  - Unicode & special characters (Ünited, spaces, apostrophes)
  - Path traversal attempts (../  ./ treated as literal segments)

### Claude's Discretion
- Exact normalization implementation (regex vs string methods)
- Test assertion messages and describe block naming
- Internal code comments

</decisions>

<specifics>
## Specific Ideas

- `"Clients/AcmeCorp".toLowerCase().split('/').filter(Boolean)` — the core pattern
- Segment count check: exactly 2 segments where first is "clients"
- Empty filter pattern: `.filter(Boolean)` handles all slash normalization in one step after lowercasing

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `WikiJsPage` interface (src/types.ts): has `path: string` field — the input isBlocked() will receive in Phase 23
- `scope-mapper.test.ts`: test pattern to follow — describe/it blocks, edge cases, no mocking

### Established Patterns
- Pure utility functions as standalone modules (e.g. scope-mapper.ts)
- Unit tests in `__tests__/` subdirectories co-located with source
- ESM imports with `.js` extensions required (TypeScript NodeNext)

### Integration Points
- Phase 23 will import `isBlocked` from `./gdpr.js` in `mcp-tools.ts`
- `tool-wrapper.ts` provides request context (correlationId, userId) for Phase 23 audit logging

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 22-core-gdpr-predicate*
*Context gathered: 2026-03-27*
