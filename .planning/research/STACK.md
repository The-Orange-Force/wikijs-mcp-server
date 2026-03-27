# Stack Research: GDPR Path Filtering

**Domain:** Path-based access control utility for MCP tool layer
**Researched:** 2026-03-27
**Confidence:** HIGH

## Context: What This Covers

This research is scoped to the v2.5 GDPR Path Filter milestone. The existing
application stack (TypeScript 5.3, Fastify 4, jose, Zod, Vitest, Docker) is validated
and not re-researched.

**The single question:** What is the right approach to implement `isBlocked()` —
a predicate that returns `true` for paths matching the pattern `Clients/<CompanyName>`
(exactly 2 segments, first segment is "Clients")?

**Existing validated stack (unchanged):**
- TypeScript 5.3 strict ESM, Node.js 20
- Fastify 4 (HTTP server)
- Zod (input validation — already used for all tool inputs)
- Vitest (test runner — already used for all unit tests)
- graphql-request, jose, @modelcontextprotocol/sdk

**What we are adding:** A single utility function and its unit tests. No new
infrastructure, no new framework integration.

---

## Recommended Stack Additions

### New Dependencies

None.

The GDPR path filter requires **zero new npm dependencies**. The entire feature
is implemented as a pure TypeScript utility function using only:

- `String.prototype.split()` — built-in, no import needed
- Comparison operators — built-in

### No New Dependencies Needed For

| Capability | Why No New Dep | What To Use |
|------------|---------------|-------------|
| Path segment parsing | Wiki.js paths use `/` as separator. `path.split("/")` produces the segment array in one call. No glob syntax, no wildcards, no recursion. | `String.prototype.split("/")` |
| Path pattern matching | The rule is deterministic and fully specified: `segments.length === 2` AND `segments[0].toLowerCase() === "clients"`. No pattern language needed. | Direct comparison |
| Testing the utility | Vitest is already present and used for `scope-mapper` unit tests, which are structurally identical (pure functions, table-driven test cases). | Vitest (existing) |
| Filtering arrays of pages | `Array.prototype.filter()` in tool handlers | Built-in `.filter()` |

---

## Why Custom Utility, Not a Library

### Libraries Evaluated

**accesscontrol / role-acl / casbin (node-casbin)** — These implement RBAC/ABAC
for multi-role, multi-resource permission systems. They require defining roles, users,
and resource permissions, then querying "can role X perform action Y on resource Z?".
The GDPR rule has no roles and no users — it is a single structural test on a URL path
segment. The libraries solve a fundamentally different problem and would add 100–400 KB
of dependencies for a 3-line predicate.

**micromatch / picomatch / minimatch** — These match file paths against glob patterns
(e.g., `Clients/**`). They add zero-dependency glob engines (~15–60 KB) that compile
patterns to regexes. The rule `Clients/<CompanyName>` is not a glob — it is an exact
structural test: exactly 2 segments, first segment equals "Clients". Using glob
matching would be an abstraction mismatch: it would permit `Clients/` (empty second
segment) and `Clients/Foo/Bar` unless the glob pattern is carefully tuned. A direct
structural test is more readable, more precise, and impossible to misconfigure.

**Conclusion:** No library fits. The rule is a predicate over string structure, not
a policy system or a file-glob match. A custom pure function is the correct and
simplest implementation.

### The Precedent: `scope-mapper.ts`

The codebase already uses this pattern for `src/oauth-proxy/scope-mapper.ts`:

- Pure TypeScript functions (`mapScopes`, `unmapScopes`, `stripResourceParam`)
- No dependencies beyond built-ins
- Co-located unit tests in `__tests__/scope-mapper.test.ts`
- Table-driven test cases covering edge cases (empty input, boundary conditions)
- Exported and imported with `.js` extension (ESM NodeNext convention)

The `isBlocked()` utility should follow the exact same structure:
a new file `src/path-filter.ts` with a co-located `src/__tests__/path-filter.test.ts`.

---

## Implementation Pattern

### Function Signature

```typescript
// src/path-filter.ts

/**
 * Returns true if a Wiki.js page path is GDPR-blocked.
 *
 * Blocks direct client directory pages at Clients/<CompanyName> —
 * paths with exactly 2 segments where the first segment is "Clients"
 * (case-insensitive). Does NOT block deeper pages (Clients/Foo/Bar)
 * or the Clients root itself (Clients).
 */
export function isBlocked(path: string): boolean {
  const segments = path.split("/").filter(Boolean);
  return segments.length === 2 && segments[0].toLowerCase() === "clients";
}
```

The `.filter(Boolean)` removes empty strings from leading/trailing slashes,
normalising `/Clients/Acme/` to the same result as `Clients/Acme`.

### Usage in Tool Handlers

**get_page** — path is resolved from the API response, not the tool input. Filter
applies after `wikiJsApi.getPageById()` returns:

```typescript
const page = await wikiJsApi.getPageById(id);
if (isBlocked(page.path)) {
  return { isError: true, content: [{ type: "text", text: "Page not found." }] };
}
```

**list_pages** — filter applied to the returned array:

```typescript
const pages = await wikiJsApi.listPages(limit, orderBy, includeUnpublished);
const visible = pages.filter(p => !isBlocked(p.path));
```

**search_pages** — filter applied to the results array:

```typescript
const result = await wikiJsApi.searchPages(query, limit);
const visible = result.results.filter(p => !isBlocked(p.path));
```

---

## Testing Approach

Vitest unit tests co-located with the utility, following the `scope-mapper.test.ts`
pattern. All test cases are pure in/out — no mocks needed.

### Test Case Categories

| Category | Input | Expected |
|----------|-------|----------|
| Exact match | `"Clients/Acme Corp"` | `true` |
| Case-insensitive | `"clients/Acme Corp"` | `true` |
| Leading slash normalisation | `"/Clients/Acme"` | `true` |
| Trailing slash normalisation | `"Clients/Acme/"` | `true` |
| Root segment only | `"Clients"` | `false` |
| Deeper path (3 segments) | `"Clients/Acme/Projects"` | `false` |
| Unrelated top-level | `"Engineering/Architecture"` | `false` |
| Empty string | `""` | `false` |
| Single slash | `"/"` | `false` |

The test file should be `src/__tests__/path-filter.test.ts` to keep it alongside
the function source, matching the `scope-mapper` convention.

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `accesscontrol` / `casbin` / `role-acl` | RBAC/ABAC systems for multi-role permission models — wrong abstraction for a single structural path predicate | Custom `isBlocked()` pure function |
| `micromatch` / `picomatch` / `minimatch` | Glob engines that compile patterns to regex — over-engineered for a deterministic 2-segment rule; introduces potential misconfiguration | `path.split("/")` + direct comparison |
| Zod `.refine()` on tool inputs | Tool inputs don't include the page path — path is returned by the Wiki.js API after ID lookup. Zod validates inputs; blocking is output post-processing. | Filter in tool handler after API call |
| Fastify `preHandler` hook | Blocking at HTTP layer would require parsing MCP JSON-RPC request body to extract page ID, then pre-fetching the page path — worse performance and coupling than filtering tool output | Filter inside tool handler closures |
| Middleware / decorator pattern | No reuse across HTTP routes (this is all within MCP tool handlers). A shared utility function is cleaner. | Import `isBlocked` in `mcp-tools.ts` |
| Configuration-driven block list | PROJECT.md specifies the rule exactly: `Clients/<CompanyName>`. Making it configurable at startup adds complexity without a stated need. | Hardcoded structural check in `isBlocked()` |
| Environment variable for toggle | No stated requirement to disable GDPR filtering at runtime. A toggle would make blocking accidental rather than guaranteed. | Always-on predicate |

---

## Integration Points

| File | Change |
|------|--------|
| `src/path-filter.ts` | New file — exports `isBlocked(path: string): boolean` |
| `src/__tests__/path-filter.test.ts` | New file — Vitest unit tests for `isBlocked()` |
| `src/mcp-tools.ts` | Import `isBlocked` from `./path-filter.js`; apply in all 3 tool handlers |

No changes needed to:
- `src/config.ts` — no new env vars
- `src/types.ts` — `WikiJsPage.path` is already `string`
- `src/api.ts` — filtering is tool-layer responsibility, not API layer
- Docker / docker-compose — no new dependencies or volumes

---

## Version Compatibility

| Dependency | Version | Notes |
|------------|---------|-------|
| TypeScript | 5.3 (existing) | `split`, `filter`, comparison — no new TS features needed |
| Node.js | 20 (existing) | No new built-ins required |
| Vitest | 4.x (existing) | Same `describe/it/expect` pattern as existing unit tests |

No new packages → no version compatibility concerns.

---

## Installation

```bash
# No new dependencies to install.
# The feature is implemented entirely in TypeScript using built-ins.
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Custom `isBlocked()` pure function | `micromatch` glob pattern | Only if the block rules become dynamic patterns configured at runtime by non-developers (not the case here) |
| Custom `isBlocked()` pure function | `casbin` policy engine | Only if the system needs per-user permissions across multiple resource types (out of scope per PROJECT.md) |
| Filter in `mcp-tools.ts` after API call | Fastify `preHandler` hook | Only if blocking needed at HTTP transport level before MCP deserialization (not needed — this is tool-level business logic) |
| Hardcoded rule | Env var toggle | Only if GDPR compliance is optional — it is not. Hardcoding makes the constraint explicit and auditable. |

---

## Sources

- Codebase analysis of `src/oauth-proxy/scope-mapper.ts` and `src/oauth-proxy/__tests__/scope-mapper.test.ts` — establishes the pure-function utility pattern to follow. HIGH confidence (direct code inspection).
- [accesscontrol npm](https://www.npmjs.com/package/accesscontrol) — RBAC/ABAC library, last reviewed 2026-03-27. Confirmed: requires role definitions and resource permissions — wrong abstraction. HIGH confidence.
- [casbin/node-casbin GitHub](https://github.com/casbin/node-casbin) — Policy engine for ACL/RBAC/ABAC. Confirmed: designed for multi-user policy enforcement, not single-predicate filtering. HIGH confidence.
- [micromatch npm](https://www.npmjs.com/package/micromatch) — Glob matching library. Confirmed: solves wildcard file-system path matching, not structural segment counting. HIGH confidence.
- [picomatch npm](https://www.npmjs.com/package/picomatch) — Underlying glob engine for micromatch. Same conclusion. HIGH confidence.
- `src/types.ts` inspection — `WikiJsPage.path` is `string`; field is present on all three tool API return types. HIGH confidence (direct code inspection).
- `src/mcp-tools.ts` inspection — confirmed that page path is returned from API call, not from tool input; filtering must happen post-API-call inside tool handlers. HIGH confidence (direct code inspection).

---
*Stack research for: GDPR Path Filter — wikijs-mcp-server v2.5*
*Researched: 2026-03-27*
