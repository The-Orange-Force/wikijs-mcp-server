# Phase 28: Metadata Fallback Implementation - Research

**Researched:** 2026-03-28
**Domain:** TypeScript search pipeline extension -- substring matching on page metadata
**Confidence:** HIGH

## Summary

Phase 28 adds a `searchPagesByMetadata()` private method to `WikiJsApi` (src/api.ts) that supplements the existing GraphQL search when it returns fewer results than the requested limit. The method filters the `pages.list` dataset using case-insensitive substring matching against page titles and paths, deduplicates against GraphQL results by page ID, excludes unpublished pages, and enforces the caller's limit. The implementation is self-contained within a single file and uses only existing project dependencies (no new libraries).

The codebase is well-structured for this change. The `resolveViaPagesList()` method already fetches `pages.list(500, UPDATED)` and returns the full page array internally -- the primary change is extending its return type to expose `allPages` to the caller. The `searchPages()` method has a clear early-return at line 194 and a post-step-3 insertion point where the metadata fallback hooks in. All data types (`WikiJsPage`, `PageSearchResult`) remain unchanged.

**Primary recommendation:** Implement as a single-plan phase modifying only `src/api.ts` -- extend `resolveViaPagesList()` return type, add `searchPagesByMetadata()` private method, and wire both into `searchPages()` at two integration points (zero-result early return and post-resolution shortfall).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- No minimum query length -- run metadata fallback for any query length
- Pure substring matching always -- no word-boundary splitting, even for short queries
- Match against title and path only -- skip description field (too generic, adds noise)
- Full path string matching -- no splitting on `/` segments
- Case-insensitive via `toLowerCase()` + `includes()` -- no regex
- GraphQL results always come first, metadata results appended after
- Within metadata results: title matches ranked before path-only matches
- Within each tier (title / path-only): keep pages.list UPDATED order (recently updated first)
- Same title > path priority applies even when GraphQL returns 0 results
- `resolveViaPagesList()` return type changes to `{ resolved, dropped, allPages }` -- exposes the already-fetched pages array
- `searchPagesByMetadata()` accepts an optional `allPages` parameter -- uses cached data when available, fetches independently when not
- When GraphQL returns 0 results (early return path): skip steps 2-3, metadata fallback fetches pages.list directly
- When all singleByPath succeed but `resolved.length < limit`: metadata fallback fetches pages.list independently (no cached data from resolveViaPagesList)
- `totalHits = Math.max(originalTotalHits, mergedResults.length)` -- never decreases, reflects actual available results
- No extra signal to callers that metadata fallback was used -- `PageSearchResult` type unchanged
- Logging of fallback activity deferred to Phase 29

### Claude's Discretion
- Exact implementation of the title-match vs path-match partitioning
- Whether to pre-lowercase page fields once during iteration or inline
- Internal cap on metadata results before final limit enforcement (e.g., 50 or 100)
- Error handling for pages.list failures within metadata fallback

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| META-01 | When GraphQL search returns fewer results than the requested limit, a metadata fallback supplements results by matching the query against page paths and titles | Wire `searchPagesByMetadata()` into `searchPages()` at two points: zero-result early return (line 194) and post-step-3 shortfall check |
| META-02 | Metadata matching is case-insensitive substring matching (single string, no tokenization) | `toLowerCase()` + `includes()` -- verified as locked decision, no regex |
| META-03 | Fallback results are deduplicated against GraphQL results by page ID | Build a `Set<number>` from resolved GraphQL result IDs; skip metadata matches already in set |
| META-04 | Unpublished pages are excluded from metadata fallback results | Filter `isPublished === true` in `searchPagesByMetadata()` -- same pattern as `listPages()` line 100 |
| META-05 | Total results (GraphQL + metadata) never exceed the requested limit | `metadataResults.slice(0, limit - resolved.length)` before merging |
| META-06 | `totalHits` is adjusted to reflect the actual merged result count when metadata adds results | `Math.max(originalTotalHits, mergedResults.length)` -- locked decision |
| INTG-01 | Metadata fallback shares the `pages.list` data with the existing `resolveViaPagesList` fallback (no duplicate GraphQL call) | Extend `resolveViaPagesList()` return to `{ resolved, dropped, allPages }` and pass `allPages` to `searchPagesByMetadata()` |
| INTG-02 | The existing `searchPages()` early-return path for zero results is replaced to route through the metadata fallback | Replace `return { results: [], totalHits }` at line 194 with metadata fallback call |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.3 | Language | Already in use, strict mode |
| Vitest | 4.x | Test runner | Already in use, 375 passing tests |

### Supporting
No new libraries required. This phase uses only built-in JavaScript/TypeScript features:
- `String.prototype.toLowerCase()` -- case normalization
- `String.prototype.includes()` -- substring matching
- `Set<number>` -- O(1) deduplication by page ID
- `Array.prototype.filter()` / `.slice()` -- filtering and limit enforcement

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `toLowerCase()` + `includes()` | `RegExp` with `i` flag | Regex adds ReDoS risk from user-controlled input; substring is simpler and locked decision |
| `Set<number>` for dedup | `Map<number, WikiJsPage>` | Set is sufficient since we only need existence check, not value lookup |
| In-memory iteration | Separate `searchMetadata` GraphQL field | Wiki.js v2 has no such field; `pages.list` is the only available metadata API |

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Modified File
```
src/
  api.ts             # ONLY file modified -- 3 changes:
                     #   1. resolveViaPagesList() return type extended
                     #   2. searchPagesByMetadata() private method added
                     #   3. searchPages() wired with 2 integration points
```

### Pattern 1: Pipeline Extension (Step 4 Addition)

**What:** The existing `searchPages()` is a 3-step pipeline (GraphQL search -> singleByPath resolution -> pages.list fallback). Phase 28 adds a conditional Step 4 that supplements results when `resolved.length < limit`.

**When to use:** After Step 3 completes and before returning the result.

**Current flow (lines 171-243):**
```
searchPages(query, limit)
  Step 1: GraphQL pages.search        -> rawResults[], totalHits
  Early return if rawResults.length === 0    [INTEGRATION POINT 1]
  Step 2: Promise.allSettled singleByPath    -> resolved[], unresolved[]
  Step 3: resolveViaPagesList(unresolved)    -> resolved += fallback.resolved
  Return { results: resolved, totalHits }   [INTEGRATION POINT 2]
```

**New flow:**
```
searchPages(query, limit)
  Step 1: GraphQL pages.search        -> rawResults[], totalHits
  If rawResults.length === 0:
    Step 4a: searchPagesByMetadata(query, limit, [])  -> metadataResults
    totalHits = Math.max(totalHits, metadataResults.length)
    Return { results: metadataResults.slice(0, limit), totalHits }
  Step 2: Promise.allSettled singleByPath    -> resolved[], unresolved[]
  Step 3: resolveViaPagesList(unresolved)    -> { resolved: fbResolved, dropped, allPages }
    resolved += fbResolved
  If resolved.length < limit:
    Step 4b: searchPagesByMetadata(query, limit, resolved, allPages?)
    resolved = [...graphqlResults, ...metadataResults].slice(0, limit)
    totalHits = Math.max(totalHits, resolved.length)
  Return { results: resolved, totalHits }
```

### Pattern 2: Data Sharing via Extended Return Type

**What:** `resolveViaPagesList()` already fetches 500 pages internally. Extending its return to include `allPages` avoids a second GraphQL call when metadata fallback fires.

**Current signature:**
```typescript
private async resolveViaPagesList(
  unresolved: UnresolvedItem[]
): Promise<{ resolved: WikiJsPage[]; dropped: UnresolvedItem[] }>
```

**New signature:**
```typescript
private async resolveViaPagesList(
  unresolved: UnresolvedItem[]
): Promise<{ resolved: WikiJsPage[]; dropped: UnresolvedItem[]; allPages: WikiJsPage[] }>
```

**Impact:** The `allPages` field is the raw `response.pages.list` array (line 147). Adding it to the return object is a one-line change. The caller at line 221 destructures it: `const { resolved: fbResolved, dropped, allPages } = await this.resolveViaPagesList(unresolved);`

### Pattern 3: Private Method with Optional Dependency Injection

**What:** `searchPagesByMetadata()` accepts an optional `allPages` parameter. When provided (from `resolveViaPagesList`), it uses the cached data. When not provided (zero-result path), it fetches `pages.list` directly.

```typescript
private async searchPagesByMetadata(
  query: string,
  limit: number,
  existingIds: Set<number>,
  allPages?: WikiJsPage[]
): Promise<WikiJsPage[]>
```

**Logic:**
1. If `allPages` not provided, fetch via `this.client.request(pagesListQuery)`
2. Lowercase query once: `const lowerQuery = query.toLowerCase()`
3. Iterate pages, partitioning into `titleMatches[]` and `pathOnlyMatches[]`
4. For each page: skip if `!page.isPublished`, skip if `existingIds.has(page.id)`
5. Check `page.title.toLowerCase().includes(lowerQuery)` -- if yes, push to `titleMatches`
6. Else check `page.path.toLowerCase().includes(lowerQuery)` -- if yes, push to `pathOnlyMatches`
7. Return `[...titleMatches, ...pathOnlyMatches]` (order preserved from `pages.list UPDATED`)

### Anti-Patterns to Avoid
- **Regex for user input:** Never use `new RegExp(query)` -- user-controlled patterns can cause ReDoS. The locked decision mandates `includes()`.
- **Mutating resolved array in-place:** Create new arrays for metadata results and merge via spread. Keeps the pipeline readable.
- **Fetching pages.list when allPages is available:** This wastes a GraphQL call. The data sharing pattern exists specifically to prevent this.
- **Filtering published pages after deduplication:** Always filter `isPublished === true` BEFORE checking against `existingIds` to ensure unpublished pages never leak through.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Case-insensitive matching | Custom locale-aware collation | `toLowerCase()` + `includes()` | Simple, locked decision, sufficient for ASCII acronyms and paths |
| Deduplication | Custom merge algorithm | `Set<number>` from page IDs | O(1) lookup, page IDs are unique integers |
| Limit enforcement | Complex pagination logic | `.slice(0, remainingSlots)` | Single array operation, no pagination needed |

**Key insight:** This is intentionally simple string matching. The value is in the pipeline integration, not in matching sophistication. GraphQL handles fuzzy/content search; metadata fallback handles exact substring matches that GraphQL's stemmer misses.

## Common Pitfalls

### Pitfall 1: Double `pages.list` Fetch
**What goes wrong:** Metadata fallback fetches `pages.list` even though `resolveViaPagesList()` already fetched it.
**Why it happens:** The two code paths are non-obvious -- `allPages` is only available when step 3 executed.
**How to avoid:** Pass `allPages` from `resolveViaPagesList()` return to `searchPagesByMetadata()`. For the zero-result path (step 4a), `allPages` is undefined and `searchPagesByMetadata()` fetches independently.
**Warning signs:** Two `pages.list` GraphQL calls in the same `searchPages()` invocation.

### Pitfall 2: ID Type Mismatch in Deduplication
**What goes wrong:** Deduplication fails because GraphQL resolved pages have numeric IDs but comparison uses `===` against string IDs.
**Why it happens:** The `WikiJsPage.id` type is `number`, but GraphQL search results have string `id` fields (`RawSearchResult.id: string`). The resolved pages go through `resolvePageByPath()` or `resolveViaPagesList()` which return proper `WikiJsPage` objects with numeric IDs.
**How to avoid:** Build `Set<number>` from `resolved.map(r => r.id)` -- these are always numeric `WikiJsPage.id` values. The `allPages` from `pages.list` also returns numeric IDs. No type coercion needed.
**Warning signs:** Duplicate pages in results despite deduplication logic.

### Pitfall 3: Unpublished Pages Leaking Through
**What goes wrong:** Metadata fallback returns unpublished pages because `pages.list` returns all pages (including drafts).
**Why it happens:** `pages.list(500, UPDATED)` in `resolveViaPagesList()` does NOT filter by `isPublished`. The raw `allPages` array contains published and unpublished pages.
**How to avoid:** Always check `page.isPublished === true` in `searchPagesByMetadata()` before matching. This is the same pattern used in `listPages()` (api.ts line 100).
**Warning signs:** Draft/unpublished pages appearing in search results.

### Pitfall 4: Exceeding the Limit After Merge
**What goes wrong:** Final results array has more items than `limit`.
**Why it happens:** GraphQL returned some results, metadata returned more, and they were concatenated without slicing.
**How to avoid:** Calculate `remainingSlots = limit - resolved.length` and slice metadata results to that count BEFORE merging.
**Warning signs:** `result.results.length > limit` in any test case.

### Pitfall 5: Existing Test Expectations for Zero-Result Path
**What goes wrong:** The existing test "returns empty results for empty search" (api.test.ts line 347) expects exactly 1 GraphQL call (the search query) and empty results. After Phase 28, this path now triggers metadata fallback.
**Why it happens:** The zero-result early return at line 194 is being replaced with a metadata fallback call.
**How to avoid:** This test MUST be updated in Phase 28 to mock `pages.list` as the second call and expect metadata-based results (or empty if no metadata matches). This is a critical regression risk.
**Warning signs:** Existing test `mockRequest` call count assertions failing.

### Pitfall 6: Order Sensitivity in Title vs Path Partitioning
**What goes wrong:** A page matching both title and path gets counted in both arrays, appearing twice.
**Why it happens:** The if/else-if structure is correct, but a logic error could use two separate `if` statements instead.
**How to avoid:** Use `if (titleMatch) { ... } else if (pathMatch) { ... }` -- a page that matches title is never checked for path match. This is by design (title is the stronger signal).
**Warning signs:** Duplicate pages in metadata results.

## Code Examples

### searchPagesByMetadata() Implementation Pattern

```typescript
// Source: Derived from CONTEXT.md locked decisions + existing codebase patterns
private async searchPagesByMetadata(
  query: string,
  limit: number,
  existingIds: Set<number>,
  allPages?: WikiJsPage[]
): Promise<WikiJsPage[]> {
  // Fetch pages if not provided (zero-result path)
  if (!allPages) {
    const pagesQuery = `
      {
        pages {
          list (limit: 500, orderBy: UPDATED) {
            id path title description isPublished createdAt updatedAt
          }
        }
      }
    `;
    const response: any = await this.client.request(pagesQuery);
    allPages = response.pages.list;
  }

  const lowerQuery = query.toLowerCase();
  const titleMatches: WikiJsPage[] = [];
  const pathOnlyMatches: WikiJsPage[] = [];

  for (const page of allPages) {
    // Exclude unpublished pages
    if (page.isPublished !== true) continue;
    // Deduplicate against existing results
    if (existingIds.has(page.id)) continue;

    const lowerTitle = page.title.toLowerCase();
    const lowerPath = page.path.toLowerCase();

    if (lowerTitle.includes(lowerQuery)) {
      titleMatches.push(page);
    } else if (lowerPath.includes(lowerQuery)) {
      pathOnlyMatches.push(page);
    }
  }

  // Title matches first, then path-only matches
  // Within each tier, UPDATED order preserved from pages.list
  return [...titleMatches, ...pathOnlyMatches];
}
```

### Integration Point 1: Zero-Result Early Return Replacement

```typescript
// Source: api.ts line 194 modification
// BEFORE:
if (rawResults.length === 0) {
  return { results: [], totalHits };
}

// AFTER:
if (rawResults.length === 0) {
  const existingIds = new Set<number>();
  const metadataResults = await this.searchPagesByMetadata(
    query, limit, existingIds
  );
  const finalResults = metadataResults.slice(0, limit);
  return {
    results: finalResults,
    totalHits: Math.max(totalHits, finalResults.length),
  };
}
```

### Integration Point 2: Post-Step-3 Shortfall Check

```typescript
// Source: After line 240 in api.ts, before final return
// After step 3 (resolveViaPagesList), check if we need metadata supplementation
if (resolved.length < limit) {
  const existingIds = new Set(resolved.map(r => r.id));
  // allPages may be available from resolveViaPagesList (when step 3 ran)
  // or undefined (when all singleByPath succeeded)
  const metadataResults = await this.searchPagesByMetadata(
    query, limit, existingIds, allPages
  );
  const remainingSlots = limit - resolved.length;
  resolved.push(...metadataResults.slice(0, remainingSlots));
  totalHits = Math.max(totalHits, resolved.length);
}
```

### resolveViaPagesList() Return Extension

```typescript
// Source: api.ts line 128-168 modification
private async resolveViaPagesList(
  unresolved: UnresolvedItem[]
): Promise<{ resolved: WikiJsPage[]; dropped: UnresolvedItem[]; allPages: WikiJsPage[] }> {
  // ... existing query and resolution logic unchanged ...

  return { resolved, dropped, allPages };  // allPages added
}
```

### searchPages() Variable Scoping for allPages

```typescript
// Source: api.ts searchPages() method -- allPages must be scoped for both paths
async searchPages(query: string, limit: number = 10): Promise<PageSearchResult> {
  // ... Step 1 unchanged ...

  // ... Step 2 unchanged ...

  // Step 3: Fallback to pages.list for unresolved results
  let allPages: WikiJsPage[] | undefined;
  if (unresolved.length > 0) {
    const fallback = await this.resolveViaPagesList(unresolved);
    resolved.push(...fallback.resolved);
    allPages = fallback.allPages;  // Capture for potential step 4
    // ... existing logging unchanged ...
  }

  // Step 4: Metadata fallback if still under limit
  if (resolved.length < limit) {
    const existingIds = new Set(resolved.map(r => r.id));
    const metadataResults = await this.searchPagesByMetadata(
      query, limit, existingIds, allPages
    );
    const remainingSlots = limit - resolved.length;
    resolved.push(...metadataResults.slice(0, remainingSlots));
    totalHits = Math.max(totalHits, resolved.length);
  }

  return { results: resolved, totalHits };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| GraphQL search only | GraphQL + singleByPath + pages.list fallback | v2.3 (Phase 15) | Resolved search index ID mismatch |
| Zero results for acronym queries | Metadata substring fallback (Phase 28) | v2.7 (now) | Acronyms and path segments return results |

**Why GraphQL search misses these queries:** Wiki.js v2 uses a search engine (Elasticsearch, PostgreSQL tsvector, or similar depending on deployment) that tokenizes and stems content. Short tokens like "COA" may be below the minimum token length threshold. Path segments like "mendix" may not be indexed because the search engine focuses on content, not metadata fields. The metadata fallback bypasses the search engine entirely by filtering the raw pages list.

## Open Questions

1. **Internal cap on metadata results**
   - What we know: User marked this as Claude's discretion
   - What's unclear: Whether to cap at 50, 100, or no cap before final limit enforcement
   - Recommendation: No explicit cap -- the `pages.list(500)` already limits the dataset, and the final `.slice(0, remainingSlots)` enforces the caller's limit. An internal cap adds complexity with no benefit when the source is already bounded at 500.

2. **Error handling for pages.list failure in metadata fallback**
   - What we know: User marked this as Claude's discretion
   - What's unclear: Whether to swallow errors and return empty, or let them propagate
   - Recommendation: Wrap the `pages.list` fetch in a try-catch within `searchPagesByMetadata()`. On failure, return an empty array (graceful degradation). The search pipeline should never fail because of a supplementary fallback. Log a warning if `requestContext` is available, but logging is deferred to Phase 29, so a simple try-catch returning `[]` is sufficient.

3. **Pre-lowercase optimization**
   - What we know: User marked this as Claude's discretion
   - What's unclear: Whether to lowercase page fields once during iteration or inline in each check
   - Recommendation: Pre-lowercase once into local variables (`const lowerTitle = page.title.toLowerCase(); const lowerPath = page.path.toLowerCase();`) since both may be checked per page. Minor optimization but cleaner code.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.x |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/api.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| META-01 | Metadata fallback supplements results when GraphQL returns < limit | unit | `npx vitest run tests/api.test.ts -t "metadata fallback"` | Wave 0 (new tests in api.test.ts) |
| META-02 | Case-insensitive substring matching | unit | `npx vitest run tests/api.test.ts -t "case-insensitive"` | Wave 0 |
| META-03 | Deduplication by page ID | unit | `npx vitest run tests/api.test.ts -t "dedup"` | Wave 0 |
| META-04 | Unpublished pages excluded | unit | `npx vitest run tests/api.test.ts -t "unpublished"` | Wave 0 |
| META-05 | Results never exceed limit | unit | `npx vitest run tests/api.test.ts -t "limit"` | Wave 0 |
| META-06 | totalHits adjusted | unit | `npx vitest run tests/api.test.ts -t "totalHits"` | Wave 0 |
| INTG-01 | Shares pages.list data (no duplicate fetch) | unit | `npx vitest run tests/api.test.ts -t "shares pages.list"` | Wave 0 |
| INTG-02 | Zero-result path routes to metadata fallback | unit | `npx vitest run tests/api.test.ts -t "zero results"` | Existing test needs update |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/api.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] New test cases in `tests/api.test.ts` -- covers META-01 through META-06, INTG-01, INTG-02
- [ ] Update existing test "returns empty results for empty search" (line 347) -- currently expects 1 GraphQL call and empty results; must be updated to account for metadata fallback behavior (INTG-02)

Note: No new test files or framework changes needed. All new tests go in the existing `tests/api.test.ts` file using the established `vi.mock("graphql-request")` + `mockRequest` pattern.

## Sources

### Primary (HIGH confidence)
- `src/api.ts` -- Direct inspection of `searchPages()`, `resolveViaPagesList()`, `resolvePageByPath()` implementations
- `src/types.ts` -- `WikiJsPage` interface (id: number, path: string, title: string, isPublished: boolean) and `PageSearchResult` type
- `tests/api.test.ts` -- Existing test patterns: `vi.mock("graphql-request")`, `mockRequest`, helper factories
- `28-CONTEXT.md` -- Locked implementation decisions from user discussion

### Secondary (MEDIUM confidence)
- `CLAUDE.md` -- Project conventions (ESM, .js extensions, strict TypeScript)
- `.planning/REQUIREMENTS.md` -- Requirement definitions META-01 through INTG-02
- `vitest.config.ts` -- Test configuration with env var defaults

### Tertiary (LOW confidence)
- None -- all findings verified against source code

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all existing patterns
- Architecture: HIGH -- direct source code inspection of the exact methods being modified
- Pitfalls: HIGH -- identified from actual code paths (type system, existing test expectations, filter ordering)

**Research date:** 2026-03-28
**Valid until:** Indefinite -- this is codebase-internal implementation research, not subject to external library changes
