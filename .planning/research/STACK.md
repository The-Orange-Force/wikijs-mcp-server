# Stack Research

**Domain:** Metadata search fallback for MCP server search pipeline
**Researched:** 2026-03-27
**Confidence:** HIGH

## Context: What This Covers

This research is scoped to the v2.7 milestone. The existing application stack (TypeScript 5.3, Fastify 4, graphql-request, jose, Zod, Vitest, Pino, Docker Alpine) is validated and not re-researched. The existing search pipeline in `src/api.ts` already uses `pages.search` (GraphQL full-text) with `singleByPath` + `pages.list` fallback for ID resolution.

**The questions:**
1. What is needed for client-side substring matching on page metadata (path, title, description)?
2. Should we use a text search library (Fuse.js, FlexSearch, MiniSearch) or plain string matching?
3. How to handle case-insensitive matching correctly, including Unicode?
4. How to deduplicate results from GraphQL search + metadata fallback?
5. Any changes needed for structured logging of fallback activity?

**Answer: Zero new dependencies.** All capabilities are covered by Node.js built-in string operations and the existing stack.

---

## Recommended Stack Additions

### New Dependencies

None.

The v2.7 milestone features (metadata substring matching, deduplication, unpublished filtering, limit enforcement, fallback logging) require **zero new npm dependencies**. Everything is implemented with:

- `String.prototype.toLowerCase()` + `String.prototype.includes()` -- case-insensitive substring matching
- `Map<number, WikiJsPage>` -- deduplication by page ID
- `Array.prototype.filter()` -- unpublished page filtering (already exists)
- `Array.prototype.slice()` -- limit enforcement
- Pino via Fastify (already installed) -- structured fallback logging via existing `requestContext` pattern

### Capabilities from Existing Stack

| Capability | Provided By | How | Notes |
|------------|-------------|-----|-------|
| Fetch all page metadata | `WikiJsApi.listPages()` in `src/api.ts` | Existing `pages.list` GraphQL query returns id, path, title, description, isPublished | Already fetches limit 500 in `resolveViaPagesList` |
| Case-insensitive substring match | `String.toLowerCase().includes()` | `page.title.toLowerCase().includes(query.toLowerCase())` | Computed once per search, not per page |
| Path segment matching | `String.toLowerCase().includes()` | Same method works on paths (e.g., "coa" matches "clients/coa/overview") | Path uses forward slashes, no special handling needed |
| Description matching | `String.toLowerCase().includes()` | Same method on `page.description` field | Description may be empty string, `includes()` handles this correctly |
| Deduplication | `Map<number, WikiJsPage>` | Key by `page.id`, merge GraphQL results with metadata results | Map preserves insertion order; GraphQL results take priority |
| Unpublished page filtering | `Array.prototype.filter()` | `pages.filter(p => p.isPublished === true)` | Already implemented in `listPages()` |
| Limit enforcement | `Array.prototype.slice()` | `results.slice(0, limit)` after merge + dedup | Applied as final step |
| Fallback activity logging | Pino via `requestContext.getStore()` | `ctx?.log.info({ fallbackCount, query }, "Metadata search fallback triggered")` | Existing pattern from search ID resolution logging |

---

## Technical Design Decisions

### 1. Plain String Matching Over Fuzzy Search Libraries

**Decision: Use `toLowerCase().includes()` for all metadata matching.**

**Why NOT Fuse.js, FlexSearch, or MiniSearch:**

| Library | Why Not for This Use Case |
|---------|---------------------------|
| Fuse.js (v7.1) | Fuzzy matching adds false positives; acronyms like "COA" should exact-match path segments, not fuzzy-match "COAT" or "COCA". ~17 KB minified adds unnecessary weight. Index rebuild per search is wasteful for < 500 pages. |
| FlexSearch (v0.7) | Full-text indexing engine designed for persistent indexes; we query once per search call and discard results. Overkill for substring matching on < 500 pages. |
| MiniSearch (v7.1) | Same problem as FlexSearch: designed for persistent searchable indexes, not one-shot substring filtering. |

**Why plain substring matching is correct:**

The feature goal is explicit: "acronyms, path segments, and short tokens always surface results." This is a **substring containment** problem, not a fuzzy relevance problem.

- Query "COA" should match path `clients/coa/overview` and title "COA Client Portal" -- `includes()` does this
- Query "getting" should match title "Getting Started Guide" -- `includes()` does this
- Query "mendix" should match description "Mendix development best practices" -- `includes()` does this

Fuzzy matching would introduce false positives (e.g., "COA" matching "COAT" or "COCOA") that degrade result quality. The GraphQL `pages.search` already handles relevance-ranked full-text search. The metadata fallback supplements it with exact substring hits that the search index missed.

**Performance is not a concern:**

Filtering 500 pages with 3 `includes()` calls each = 1500 string comparisons. On modern V8, `String.includes()` on short strings is sub-microsecond. Total: < 1 ms for the entire metadata scan, negligible versus the GraphQL round-trip (50-200 ms).

### 2. Case Folding: `toLowerCase()` vs `toLocaleLowerCase()`

**Decision: Use `toLowerCase()`, not `toLocaleLowerCase()`.**

- `toLowerCase()` uses Unicode Default Case Mapping (invariant, locale-independent)
- `toLocaleLowerCase()` uses locale-specific rules (e.g., Turkish dotless-I problem where `I` lowercases to `\u0131` instead of `i`)
- Wiki.js page paths and titles are overwhelmingly ASCII or Western European characters
- The server's locale is not controlled (Docker Alpine sets `C` locale by default)
- `toLowerCase()` avoids surprising locale-dependent behavior in containerized deployments

For this use case (path segments, acronyms, titles), `toLowerCase()` is the correct and predictable choice.

### 3. Query Normalization

**Decision: Lowercase the query string once, before iterating pages.**

```typescript
const queryLower = query.toLowerCase();
// Then for each page:
const matches = page.title.toLowerCase().includes(queryLower)
  || page.path.toLowerCase().includes(queryLower)
  || page.description.toLowerCase().includes(queryLower);
```

Do NOT lowercase each page field for every query. In the current architecture (no persistent cache), fields are lowercased per-search, but the query is normalized once. This is the simplest correct approach.

### 4. Deduplication Strategy

**Decision: Use `Map<number, WikiJsPage>` keyed by page ID.**

The search pipeline produces results from two sources:
1. GraphQL `pages.search` results (already resolved to real page IDs)
2. Metadata fallback results (from `pages.list` substring matching)

Deduplication ensures a page appearing in both sets is returned only once.

```typescript
const seen = new Map<number, WikiJsPage>();

// GraphQL results first (higher relevance)
for (const page of graphqlResults) {
  seen.set(page.id, page);
}

// Metadata fallback results second (only if not already present)
for (const page of metadataResults) {
  if (!seen.has(page.id)) {
    seen.set(page.id, page);
  }
}

return Array.from(seen.values()).slice(0, limit);
```

**Why `Map` over `Set`:**
- `Set` stores values but we need key-based deduplication (by `page.id`)
- `Map` preserves insertion order (GraphQL results come first)
- `Map.has()` is O(1) lookup

### 5. Where Metadata Fallback Executes

**Decision: Inside `WikiJsApi.searchPages()` in `src/api.ts`, not in `mcp-tools.ts`.**

**Rationale:**
- The metadata fallback is a **search strategy**, not a presentation concern
- The existing `searchPages()` already implements multi-step search (GraphQL + singleByPath + pages.list fallback for ID resolution)
- Adding metadata matching is a natural extension of the same pipeline
- `mcp-tools.ts` should remain a thin handler layer that calls `api.searchPages()` and formats the result
- This matches the existing architecture: `api.ts` owns all Wiki.js data retrieval logic

### 6. Triggering the Metadata Fallback

**Decision: Trigger when GraphQL search returns fewer results than the requested limit.**

```typescript
const threshold = limit; // User-requested limit (default: 10)
if (graphqlResults.length < threshold) {
  // Run metadata fallback to supplement results
}
```

**Why not "when GraphQL returns zero":**
- A query like "COA" may return 1 result from full-text search but miss 3 pages where "COA" appears only in the path
- Triggering only on zero results would miss this supplementation opportunity
- The deduplication step prevents duplicates, so triggering eagerly is safe

**Why not "always":**
- If GraphQL returns the full requested limit, the user already has enough results
- Avoiding an unnecessary `pages.list` call saves a GraphQL round-trip
- The metadata fallback is a supplement, not a replacement

### 7. Reusing `resolveViaPagesList` vs New Method

**Decision: Extract a new method (e.g., `metadataSearch`) that reuses the existing `pages.list` query pattern, not the `resolveViaPagesList` method directly.**

**Why:**
- `resolveViaPagesList` is designed for ID resolution (matching by path), not substring searching
- The metadata search needs to iterate all pages and apply substring matching, which is a different loop shape
- However, the GraphQL query is identical (`pages.list` with limit 500, same fields)
- Extract a shared private method for the `pages.list` call, called by both `resolveViaPagesList` and the new metadata search

This avoids code duplication of the GraphQL query while keeping the matching logic separate and testable.

---

## Configuration Changes

### No New Environment Variables

No new env vars needed. The metadata fallback uses the existing `pages.list` GraphQL query, which already uses the configured `WIKIJS_BASE_URL` and `WIKIJS_TOKEN`.

---

## Files Modified (no new dependencies)

| File | Change | Reason |
|------|--------|--------|
| `src/api.ts` | Add `metadataSearch()` private method; modify `searchPages()` to call it when GraphQL results are insufficient; extract shared `fetchPagesList()` for reuse | Core metadata fallback logic |
| `src/mcp-tools.ts` | Update `search_pages` tool description to mention metadata fallback capability | User-facing tool description accuracy |
| `tests/api.test.ts` | Add test cases for metadata fallback: substring matching, case insensitivity, deduplication, limit enforcement, unpublished filtering, fallback not triggered when limit satisfied | Verify new behavior |

**No changes needed to:**
- `src/types.ts` -- `WikiJsPage` and `PageSearchResult` interfaces are unchanged
- `src/config.ts` -- no new env vars
- `src/mcp-tools.ts` handler logic -- only the description string changes; the handler still calls `api.searchPages()` and formats the result identically
- `src/gdpr.ts` -- GDPR redaction is a separate concern applied in get_page, not search
- Docker / docker-compose -- no new dependencies or volumes

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Fuse.js | Fuzzy matching produces false positives for acronym/path search; "COA" should not match "COAT" or "COCOA"; adds 17 KB dependency for < 500 items | `String.toLowerCase().includes()` |
| FlexSearch | Full-text indexing engine designed for persistent indexes; rebuild per search call is wasteful and the API is complex for simple substring matching | `String.toLowerCase().includes()` |
| MiniSearch | Same as FlexSearch: overkill for one-shot substring filtering on small datasets | `String.toLowerCase().includes()` |
| `toLocaleLowerCase()` | Locale-dependent case folding causes surprising behavior in Docker Alpine (C locale); Turkish dotless-I problem can break ASCII acronym matching | `toLowerCase()` (Unicode Default Case Mapping) |
| `String.prototype.match()` / `RegExp` | Unnecessary complexity for simple substring containment; introduces ReDoS risk if query is user-provided and used as regex pattern | `String.prototype.includes()` (no regex compilation) |
| `String.prototype.search()` | Returns index not boolean; uses regex internally; same ReDoS concern as `match()` | `includes()` returns boolean directly |
| `Array.prototype.find()` for dedup | O(n) per lookup; with 500 pages and potential 50-item result set, repeated scans add up | `Map.has()` for O(1) dedup lookup |
| `lodash.uniqBy()` | Adding lodash for one utility is unnecessary; `Map` achieves the same thing in 5 lines | `Map<number, WikiJsPage>` |
| Persistent search index / cache | Adds statefulness and cache invalidation complexity; pages.list is fast enough (< 200 ms) for per-request use at current wiki size | Stateless per-request fetch + filter |

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `toLowerCase().includes()` | Fuse.js fuzzy matching | Fuzzy matching adds false positives; exact substring is what the feature spec requires |
| `toLowerCase().includes()` | `RegExp` with `i` flag | User query used as regex pattern = ReDoS vector; `includes()` is simpler and safer |
| `Map<number, WikiJsPage>` dedup | `Set<number>` + separate results array | Map combines storage and dedup in one structure; cleaner code |
| Trigger on `results.length < limit` | Trigger only on `results.length === 0` | Misses supplementation opportunity; "COA" returns 1 from full-text but 3 more from path matching |
| Trigger on `results.length < limit` | Always trigger | Unnecessary `pages.list` call when GraphQL already returned sufficient results |
| Fallback in `api.ts` | Fallback in `mcp-tools.ts` | Search strategy belongs in the API layer; tool handlers should stay thin |
| Shared `fetchPagesList()` extraction | Duplicate the pages.list query | `resolveViaPagesList` already has the same query; DRY principle |
| Substring on 3 fields (path, title, desc) | Only match title | Acronyms often appear only in paths (e.g., `clients/coa/overview`); description may contain keywords not in title |

---

## Version Compatibility

| Dependency | Current Version | v2.7 Compatible | Notes |
|------------|-----------------|-----------------|-------|
| Node.js | >= 20 | Yes | `String.toLowerCase()`, `includes()`, `Map`, `Array.from()` all available since ES2015 (Node 4+) |
| TypeScript | ^5.3.3 | Yes | All used APIs have complete type definitions in `lib.es2015.d.ts` |
| Zod | ^3.25.17 | Yes | No schema changes needed |
| Vitest | ^4.1.1 | Yes | Pure function tests with existing mock patterns |
| graphql-request | ^6.1.0 | Yes | Same `pages.list` query; no new GraphQL features needed |
| Fastify/Pino | ^4.27.2 | Yes | Existing `ctx?.log.info()` pattern for fallback logging |

No new packages means no version compatibility concerns.

---

## Installation

```bash
# No new dependencies to install.
# All v2.7 features use existing dependencies + Node.js built-ins.
```

---

## Sources

- Codebase analysis of `src/api.ts` (`searchPages()`, `resolveViaPagesList()`, `listPages()`) -- existing search pipeline and pages.list query. HIGH confidence (direct code inspection).
- Codebase analysis of `src/mcp-tools.ts` -- tool handler layer, search_pages description. HIGH confidence (direct code inspection).
- Codebase analysis of `src/types.ts` -- `WikiJsPage` and `PageSearchResult` interfaces confirm available fields. HIGH confidence (direct code inspection).
- Codebase analysis of `tests/api.test.ts` -- existing test patterns and mock helpers for search. HIGH confidence (direct code inspection).
- [MDN: String.prototype.includes()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/includes) -- substring search API reference. HIGH confidence.
- [MDN: String.prototype.toLowerCase()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/toLowerCase) -- Unicode Default Case Mapping behavior (locale-independent). HIGH confidence.
- [MDN: Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map) -- insertion-order preservation guarantee. HIGH confidence.
- [Fuse.js documentation](https://www.fusejs.io/) -- evaluated and rejected; fuzzy matching inappropriate for exact substring containment. MEDIUM confidence.
- `.planning/PROJECT.md` -- v2.7 milestone scope: metadata fallback, case-insensitive matching, deduplication, limit enforcement. HIGH confidence (direct document).

---
*Stack research for: v2.7 Metadata Search Fallback -- wikijs-mcp-server*
*Researched: 2026-03-27*
