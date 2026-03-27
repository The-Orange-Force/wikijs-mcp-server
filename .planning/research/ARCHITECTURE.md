# Architecture: Metadata Search Fallback Integration

**Domain:** MCP server search pipeline enhancement (wikijs-mcp-server v2.7)
**Researched:** 2026-03-27
**Confidence:** HIGH (based on direct code analysis of existing src/ files and established architectural patterns from v2.3-v2.6)

---

## Existing searchPages() Pipeline (Baseline from v2.6)

```
MCP Client: search_pages("COA")
    |
    v
mcp-tools.ts -- search_pages handler (inside wrapToolHandler)
    |
    | wikiJsApi.searchPages(query, limit)
    v
WikiJsApi.searchPages(query, limit)    [src/api.ts line 171]
    |
    |  Step 1: GraphQL pages.search(query)
    |     -> returns RawSearchResult[] { id (string), path, title, description, locale }
    |     -> slice to limit
    |
    |  Step 2: Resolve IDs via singleByPath (parallel Promise.allSettled)
    |     -> fulfilled -> resolved[]
    |     -> rejected  -> unresolved[]
    |
    |  Step 3: Fallback for unresolved via pages.list (limit 500)
    |     -> match by path -> resolved[]
    |     -> no match     -> dropped[] (logged as warnings)
    |
    |  Returns: { results: WikiJsPage[], totalHits: number }
    v
mcp-tools.ts -- search_pages handler
    |
    | JSON.stringify(result.results, null, 2)
    v
MCP response (JSON text in content array)
```

### The Problem

The GraphQL `pages.search` query relies on Wiki.js's internal search index (likely lunr/elasticsearch depending on engine configured). This index is optimized for natural language search and has known limitations:

1. **Acronyms/short tokens** (e.g., "COA", "ZDG", "DSM") often return zero results because the search engine stems or ignores short tokens
2. **Path segments** (e.g., searching "mendix" when pages live at `mendix/best-practices`) may not be indexed
3. **Recently published pages** have indexing delay
4. **Partial title matches** may not surface (searching "best" for "Best Practices Guide")

When GraphQL search returns 0 results (or fewer than expected), there is no fallback -- the user gets nothing. The metadata fallback supplements this by searching page titles, paths, and descriptions directly.

---

## What Changes in v2.7

| v2.6 Behavior | v2.7 Behavior |
|----------------|---------------|
| GraphQL search returns 0 results -> empty response | GraphQL search returns insufficient results -> metadata fallback triggers |
| Only indexed content is searchable | Titles, paths, descriptions always searchable via substring matching |
| `searchPages()` is a 3-step pipeline | `searchPages()` becomes a 4-step pipeline |
| No metadata search capability | New `searchPagesByMetadata()` private method |

### Key Insight: Fallback Triggers on Insufficient Results, Not Zero Results

The fallback should trigger when GraphQL search returns fewer results than the requested limit, not only when it returns zero. If a user requests `limit: 10` and GraphQL returns 3 results, the metadata fallback should try to find 7 more. This maximizes result coverage without adding latency when the primary search already saturates the limit.

**Threshold logic:** `if (resolved.length < limit) -> trigger metadata fallback`

This is strictly an enhancement to the existing `searchPages()` method in `api.ts`. No changes to `mcp-tools.ts`, `server.ts`, `mcp-routes.ts`, or any other module.

---

## New Private Method: searchPagesByMetadata()

**Location:** `src/api.ts`, as a private method on the `WikiJsApi` class.

### Why Inside WikiJsApi (Not a Separate Module)

| Location | Verdict | Rationale |
|----------|---------|-----------|
| Private method on `WikiJsApi` | **Chosen** | Uses the same GraphQL client (`this.client`). Same data layer. Same `pages.list` query already used by `resolveViaPagesList`. Encapsulated -- callers see the same `searchPages()` signature. |
| Standalone `src/metadata-search.ts` module | Rejected | Would need its own GraphQL client instance or accept one as a parameter. Creates a second module that talks to Wiki.js, splitting the "single data access point" pattern. |
| In `mcp-tools.ts` (tool handler) | Rejected | Tool handlers should not contain data access logic. Established pattern: handlers delegate to `WikiJsApi`. |
| As a Fastify plugin | Rejected | Same reasoning as v2.6: MCP SDK writes to `reply.raw`, bypassing Fastify's pipeline. Also, metadata search is a data concern, not an HTTP concern. |

### Function Signature

```typescript
/**
 * Search pages by case-insensitive substring matching on metadata fields
 * (path, title, description). Used as a fallback when GraphQL search
 * returns insufficient results.
 *
 * @param query - Search query string
 * @param limit - Maximum number of results to return
 * @param excludeIds - Set of page IDs already found by primary search (for dedup)
 * @returns WikiJsPage[] matching the query by metadata
 */
private async searchPagesByMetadata(
  query: string,
  limit: number,
  excludeIds: Set<number>,
): Promise<WikiJsPage[]>
```

### Implementation Strategy

```
1. Fetch pages via pages.list (limit: 500, orderBy: UPDATED)
   -- Reuses the same GraphQL query pattern as resolveViaPagesList()
   -- limit 500 is the practical Wiki.js ceiling for a single list call

2. Normalize query to lowercase for case-insensitive matching

3. For each page:
   a. Skip if page.id is in excludeIds (already in primary results)
   b. Skip if page.isPublished !== true (unpublished filter)
   c. Check if query matches any of:
      - page.path (lowercased)
      - page.title (lowercased)
      - page.description (lowercased)
   d. Match = substring includes (query.toLowerCase() in field.toLowerCase())

4. Take first `limit` matches

5. Return matched WikiJsPage[]
```

### Why Substring Matching (Not Regex, Not Fuzzy)

- **Substring (`includes()`)**: Simple, predictable, handles acronyms perfectly ("COA" matches "COA/project-x"), handles path segments ("mendix" matches "mendix/best-practices"). Zero false positives.
- **Regex**: Overkill for this use case. User queries are plain strings, not patterns. Regex special characters in queries would need escaping. No benefit over includes.
- **Fuzzy matching (Levenshtein, etc.)**: Requires a library dependency. The problem statement is about exact tokens that the search index misses, not about typo tolerance. Adds complexity without solving the stated problem.

### Reuse of pages.list Query

Both `resolveViaPagesList()` and `searchPagesByMetadata()` issue `pages.list(limit: 500, orderBy: UPDATED)`. However, they should NOT share the call because:

1. `resolveViaPagesList()` is called only when singleByPath fails -- it runs conditionally
2. `searchPagesByMetadata()` is called only when primary results are insufficient -- also conditional
3. They run at different points in the pipeline
4. Caching pages.list across calls would add state to a currently stateless method

Each call is independent. The duplication is acceptable -- it is at most one extra GraphQL call per search request, and only when the fallback triggers.

---

## Updated searchPages() Pipeline (v2.7)

```
WikiJsApi.searchPages(query, limit)
    |
    |  Step 1: GraphQL pages.search(query)           [UNCHANGED]
    |     -> rawResults[] (sliced to limit)
    |     -> totalHits
    |
    |  (early return if rawResults.length === 0 AND... wait, see below)
    |
    |  Step 2: Resolve IDs via singleByPath           [UNCHANGED]
    |     -> resolved[], unresolved[]
    |
    |  Step 3: Fallback for unresolved via pages.list  [UNCHANGED]
    |     -> resolved[], dropped[] (logged)
    |
    |  Step 4: Metadata search fallback                [NEW]
    |     -> if resolved.length < limit:
    |        remaining = limit - resolved.length
    |        excludeIds = Set(resolved.map(r => r.id))
    |        metadataResults = searchPagesByMetadata(query, remaining, excludeIds)
    |        resolved.push(...metadataResults)
    |        log metadata fallback activity
    |
    |  Returns: { results: WikiJsPage[], totalHits: number }
    v
```

### Critical Change: Early Return Behavior

The current code has an early return at line 194:

```typescript
if (rawResults.length === 0) {
  return { results: [], totalHits };
}
```

**This early return must be removed or modified.** When GraphQL search returns 0 results (e.g., for acronym "COA"), the metadata fallback must still run. The updated logic:

```typescript
if (rawResults.length === 0) {
  // GraphQL returned nothing -- skip steps 2-3, go straight to metadata fallback
  const metadataResults = await this.searchPagesByMetadata(query, limit, new Set());
  // Log fallback
  if (metadataResults.length > 0) {
    const ctx = requestContext.getStore();
    ctx?.log.info(
      { query, graphqlHits: 0, metadataHits: metadataResults.length },
      "Metadata search fallback produced results after GraphQL returned zero"
    );
  }
  return { results: metadataResults, totalHits };
}
```

When GraphQL returns some results but fewer than limit, steps 2-3 run as before, then step 4 supplements:

```typescript
// After step 3 (existing resolved[] is final from GraphQL pipeline):
if (resolved.length < limit) {
  const remaining = limit - resolved.length;
  const excludeIds = new Set(resolved.map(r => r.id));
  const metadataResults = await this.searchPagesByMetadata(query, remaining, excludeIds);
  resolved.push(...metadataResults);

  if (metadataResults.length > 0) {
    const ctx = requestContext.getStore();
    ctx?.log.info(
      { query, graphqlHits: resolved.length - metadataResults.length, metadataHits: metadataResults.length },
      "Metadata search fallback supplemented GraphQL results"
    );
  }
}
```

---

## Component Boundaries

| Component | Responsibility | v2.7 Status |
|-----------|---------------|-------------|
| `src/api.ts` -- `WikiJsApi.searchPages()` | Orchestrates 4-step search pipeline | **MODIFIED** -- adds step 4, modifies early return |
| `src/api.ts` -- `WikiJsApi.searchPagesByMetadata()` | Case-insensitive metadata substring search | **NEW** -- private method |
| `src/mcp-tools.ts` -- search_pages handler | Delegates to `WikiJsApi.searchPages()` | **MODIFIED** -- tool description update only |
| `src/types.ts` -- `WikiJsPage`, `PageSearchResult` | Data types | **UNCHANGED** |
| `src/request-context.ts` | AsyncLocalStorage for logging context | **UNCHANGED** (consumed by new logging) |
| `src/tool-wrapper.ts` | Timing and logging wrapper | **UNCHANGED** |
| `src/server.ts` | App factory | **UNCHANGED** |
| `src/routes/mcp-routes.ts` | Protected route registration | **UNCHANGED** |
| `src/config.ts` | Environment configuration | **UNCHANGED** |
| `src/gdpr.ts` | Content redaction | **UNCHANGED** |

### Key Observation: Minimal Surface Area

Unlike v2.6 (which touched 6+ files), v2.7 modifies exactly 2 files:

1. `src/api.ts` -- core logic (new method + pipeline modification)
2. `src/mcp-tools.ts` -- tool description text update (one string change)

Everything else is untouched. This is because the metadata fallback is purely a data-layer enhancement encapsulated within `WikiJsApi`.

---

## Data Flow Detail

### Case 1: GraphQL Returns Sufficient Results (No Fallback)

```
searchPages("deployment guide", limit=5)
    |
    Step 1: GraphQL search -> 5 raw results
    Step 2: singleByPath resolves all 5
    Step 3: (skipped -- no unresolved)
    Step 4: resolved.length (5) >= limit (5) -> SKIP metadata fallback
    |
    Return: { results: [5 pages], totalHits: 5 }
```

No extra GraphQL call. Zero overhead when primary search works.

### Case 2: GraphQL Returns Zero (Full Metadata Fallback)

```
searchPages("COA", limit=10)
    |
    Step 1: GraphQL search -> 0 raw results, totalHits=0
    (Early path: skip steps 2-3)
    Step 4: searchPagesByMetadata("COA", 10, Set())
        -> pages.list(500) fetches all pages
        -> filter: "coa" in path/title/description (case-insensitive)
        -> returns up to 10 matching pages
    |
    Log: "Metadata search fallback produced results after GraphQL returned zero"
    Return: { results: [N pages], totalHits: 0 }
```

Note: `totalHits` reflects the GraphQL search count (0), not the metadata results. This is intentional -- totalHits comes from the search index and indicates indexed coverage, while metadata results are supplementary.

### Case 3: GraphQL Returns Partial (Supplementary Fallback)

```
searchPages("best practices", limit=10)
    |
    Step 1: GraphQL search -> 3 raw results
    Step 2: singleByPath resolves 2, unresolved 1
    Step 3: pages.list resolves the 1 unresolved
    -- resolved = 3 pages --
    Step 4: resolved.length (3) < limit (10)
        -> remaining = 7
        -> excludeIds = Set(ids of 3 resolved pages)
        -> searchPagesByMetadata("best practices", 7, excludeIds)
        -> filter: "best practices" in path/title/description
        -> up to 7 additional pages
    |
    Return: { results: [3 + N pages], totalHits: 3 }
```

### Case 4: GraphQL Sufficient, Some Unresolved (Existing Behavior)

```
searchPages("wiki guide", limit=5)
    |
    Step 1: GraphQL search -> 5 raw results
    Step 2: singleByPath resolves 3, unresolved 2
    Step 3: pages.list resolves 1, drops 1
    -- resolved = 4 pages --
    Step 4: resolved.length (4) < limit (5)
        -> remaining = 1
        -> searchPagesByMetadata("wiki guide", 1, excludeIds)
        -> finds 0 or 1 additional pages
    |
    Return: { results: [4-5 pages], totalHits: 5 }
```

---

## Logging Architecture

### Existing Logging Pattern

The codebase uses AsyncLocalStorage-based structured logging via `requestContext.getStore()`. All `searchPages()` logging already follows this pattern (lines 225-239 in api.ts).

### New Log Points

| Log Level | When | Payload | Message |
|-----------|------|---------|---------|
| `info` | Metadata fallback produces results | `{ query, graphqlHits, metadataHits }` | "Metadata search fallback produced results..." |
| `info` | Metadata fallback supplements | `{ query, graphqlHits, metadataHits }` | "Metadata search fallback supplemented..." |
| `debug` | Metadata fallback runs but finds nothing | `{ query, graphqlHits: N, metadataHits: 0 }` | "Metadata search fallback found no additional results" |

The `debug` level for zero-result fallback avoids log noise when the query simply has no matches anywhere. The `info` level for successful fallback provides operational visibility into how often the fallback contributes.

### No New Logging Dependencies

All logging goes through the existing `requestContext.getStore()?.log` pattern. No new imports needed in `api.ts` -- it already imports `requestContext`.

---

## Deduplication Strategy

Pages found by metadata search must not duplicate pages already found by GraphQL search. The deduplication key is `page.id` (numeric database ID).

```typescript
const excludeIds = new Set(resolved.map(r => r.id));
```

This is passed to `searchPagesByMetadata()` which skips pages whose `id` is in the set. Using `id` rather than `path` because:

1. `id` is the primary key -- guaranteed unique
2. `path` could theoretically have locale variants (same path, different locale)
3. `id` comparison is O(1) with a Set, same as path, but semantically cleaner

---

## Unpublished Page Filtering

The metadata fallback must filter out unpublished pages, matching the existing behavior:

- `listPages()` filters `isPublished === true` by default (line 99-101 in api.ts)
- `searchPages()` relies on Wiki.js search index which only indexes published pages
- `searchPagesByMetadata()` must explicitly check `page.isPublished === true`

This is critical: `pages.list` returns ALL pages (published + unpublished). Without the filter, draft pages would appear in metadata search results but not in GraphQL search results, creating an inconsistency.

---

## Limit Enforcement

The metadata fallback must respect the caller's `limit` parameter. The strategy is:

1. Calculate `remaining = limit - resolved.length` (how many more results needed)
2. Pass `remaining` as the limit to `searchPagesByMetadata()`
3. `searchPagesByMetadata()` returns at most `remaining` results
4. After merging: `resolved.length <= limit` (guaranteed)

This ensures the total result count never exceeds the requested limit, regardless of how many metadata matches exist.

---

## Tool Description Update

The `search_pages` tool description in `mcp-tools.ts` should be updated to reflect the fallback capability. This is a single string change:

```typescript
// BEFORE (v2.6):
description:
  "Search Wiki.js pages by keyword query. Returns matching pages with metadata and content excerpts. Only searches published pages (unpublished pages are not indexed). Note: recently published pages may take a moment to appear in search results due to indexing delay. Use get_page with a result's ID to retrieve the full page content.",

// AFTER (v2.7):
description:
  "Search Wiki.js pages by keyword query. Returns matching pages with metadata. Searches published pages via the search index, with automatic fallback to metadata matching (titles, paths, descriptions) for acronyms, short tokens, and path-based queries. Use get_page with a result's ID to retrieve the full page content.",
```

Key changes:
- Removed "content excerpts" (search results return metadata only, not excerpts)
- Added fallback capability description
- Removed "recently published" indexing delay note (metadata fallback mitigates this)
- Removed "unpublished not indexed" (implementation detail, not useful to the LLM caller)

---

## Modified Files and Their Changes

### `src/api.ts` -- MODIFIED

```
Adds:     private searchPagesByMetadata(query, limit, excludeIds): Promise<WikiJsPage[]>
Modifies: searchPages() -- adds step 4 metadata fallback, modifies early-return path
Uses:     requestContext (already imported) for structured logging
```

**Estimated line changes:** +50-60 lines (new method ~30 lines, pipeline modifications ~20 lines)

### `src/mcp-tools.ts` -- MODIFIED

```
Modifies: search_pages tool description string (1 string change)
```

**Estimated line changes:** +2/-2 lines

### Test Files

```
Adds:     tests/api.test.ts -- new test cases in existing "searchPages" describe block
          OR new describe block "searchPagesByMetadata integration"
```

**Estimated test additions:** 8-12 new test cases

### Files Summary

| File | Status | Change |
|------|--------|--------|
| `src/api.ts` | MODIFIED | New `searchPagesByMetadata()` private method, pipeline step 4, early-return modification |
| `src/mcp-tools.ts` | MODIFIED | Tool description update (1 string) |
| `tests/api.test.ts` | MODIFIED | New test cases for metadata fallback |
| `src/types.ts` | UNCHANGED | `WikiJsPage` and `PageSearchResult` types sufficient |
| `src/server.ts` | UNCHANGED | No config changes |
| `src/routes/mcp-routes.ts` | UNCHANGED | No routing changes |
| `src/config.ts` | UNCHANGED | No new env vars |
| `src/gdpr.ts` | UNCHANGED | Redaction is orthogonal |
| `src/tool-wrapper.ts` | UNCHANGED | Timing wrapper unaffected |
| `src/request-context.ts` | UNCHANGED | Already consumed by api.ts |
| `tests/helpers/build-test-app.ts` | UNCHANGED | Mock WikiJsApi already covers searchPages |

---

## Test Architecture

### Unit Tests: Metadata Fallback Behavior

All tests go in `tests/api.test.ts`, extending the existing `describe("searchPages", ...)` block. The mock pattern is already established: `mockRequest` is a `vi.fn()` that simulates GraphQL responses.

**New test cases:**

| # | Test Case | Setup | Expected |
|---|-----------|-------|----------|
| 1 | Metadata fallback triggers when GraphQL returns 0 | search returns 0, pages.list has matching pages | Results from metadata match |
| 2 | Metadata fallback supplements partial GraphQL results | search returns 2 (limit 5), pages.list has 3 more matches | 5 total results |
| 3 | Metadata fallback deduplicates against GraphQL results | search returns page id=42, pages.list also has id=42 | id=42 appears once |
| 4 | Metadata fallback filters unpublished pages | pages.list has matching unpublished page | Unpublished page excluded |
| 5 | Metadata fallback respects limit | pages.list has 20 matches, limit=3 | At most 3 results from metadata |
| 6 | Metadata search is case-insensitive | query="coa", page title="COA Report" | Page matched |
| 7 | Metadata matches on path | query="mendix", page path="mendix/guide" | Page matched |
| 8 | Metadata matches on title | query="onboarding", page title="New Employee Onboarding" | Page matched |
| 9 | Metadata matches on description | query="deploy", page description="Deployment procedures" | Page matched |
| 10 | No fallback when GraphQL saturates limit | search returns limit results | No pages.list call for metadata |
| 11 | Metadata fallback logs when it produces results | search returns 0, metadata finds pages | Log at info level |
| 12 | Metadata fallback produces empty when no matches | search returns 0, pages.list has no matches | Empty results |

### Mock Pattern for Metadata Fallback

The metadata fallback issues a `pages.list` GraphQL call (same shape as `resolveViaPagesList`). The existing `makePagesListResponse()` test helper is reusable.

For tests where GraphQL search returns 0 and metadata fallback runs:
```typescript
// Step 1: GraphQL search returns empty
mockRequest.mockResolvedValueOnce(makeSearchResponse([], 0));
// Step 4: metadata fallback pages.list
mockRequest.mockResolvedValueOnce(makePagesListResponse([
  resolvedPage(10, "clients/coa", "COA Project Overview"),
  resolvedPage(20, "clients/coa/sla", "COA SLA Agreement"),
]));
```

For tests where GraphQL returns partial and metadata supplements:
```typescript
// Step 1: GraphQL search returns 1 result
mockRequest.mockResolvedValueOnce(makeSearchResponse([
  { id: "abc-1", path: "docs/guide", title: "Guide", description: "A guide", locale: "en" },
], 1));
// Step 2: singleByPath resolves it
mockRequest.mockResolvedValueOnce(makeSingleByPathResponse(resolvedPage(42, "docs/guide", "Guide")));
// Step 4: metadata fallback pages.list (limit=5 - 1 = 4 remaining)
mockRequest.mockResolvedValueOnce(makePagesListResponse([
  resolvedPage(42, "docs/guide", "Guide"),  // duplicate -- should be excluded
  resolvedPage(50, "docs/guide-advanced", "Advanced Guide"),  // new match
]));
```

### E2E Test Considerations

The existing `tests/e2e-redaction.test.ts` pattern could be extended for metadata search, but it requires wiring a custom `WikiJsApi` mock through `buildTestApp()`. Since the metadata fallback is entirely within `WikiJsApi.searchPages()`, unit tests with mocked GraphQL responses provide full coverage. E2E tests are not needed for v2.7.

---

## Patterns Applied

### Pattern: Pipeline Extension (Not Replacement)

The metadata fallback is added as step 4 to the existing 3-step pipeline. No existing steps are removed or reordered. Steps 1-3 execute exactly as before. Step 4 only runs when results are insufficient.

This pattern minimizes regression risk: if the metadata fallback has a bug, the worst case is that supplementary results are wrong, but the primary GraphQL search results remain correct.

### Pattern: Thin Filter Between Fetch and Serialize (Continued)

Same pattern used in v2.5 and v2.6. The metadata search fetches all pages via `pages.list`, then applies a pure filter (substring match, unpublished filter, dedup). No mutation of source data.

### Pattern: Conditional Execution for Zero Overhead

When GraphQL search saturates the limit, `searchPagesByMetadata()` is never called. No extra GraphQL request, no filtering, no overhead. The fallback is truly additive -- it adds cost only when it adds value.

### Pattern: Structured Logging at Decision Points

Log when the fallback triggers and produces results (info), but not when it is skipped (no log for "fallback not needed"). This follows the existing logging philosophy: log meaningful events, not non-events.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Always Running Metadata Search

**What:** Running metadata search on every call regardless of GraphQL result count.
**Why bad:** Doubles the GraphQL load (extra `pages.list` call) on every search. The `pages.list(500)` query fetches all pages -- expensive when unnecessary.
**Instead:** Only trigger when `resolved.length < limit`.

### Anti-Pattern 2: Caching pages.list Results

**What:** Caching the `pages.list` response to avoid redundant calls between `resolveViaPagesList` and `searchPagesByMetadata`.
**Why bad:** Adds mutable state to a currently stateless class. Creates cache invalidation complexity. The two methods run at different pipeline points and may not both trigger. Caching saves at most one GraphQL call per search request.
**Instead:** Accept the potential duplicate `pages.list` call. It is at most 2 calls total per search, and only when fallback triggers.

### Anti-Pattern 3: Fuzzy Matching or Scoring

**What:** Implementing Levenshtein distance, TF-IDF, or relevance scoring for metadata search.
**Why bad:** Adds complexity and potentially a library dependency for a problem that is fundamentally about exact token matching (acronyms, path segments). The GraphQL search already handles fuzzy/relevance matching -- the metadata fallback handles what the index misses.
**Instead:** Simple case-insensitive `includes()`. If this proves insufficient in practice, scoring can be added in a future milestone.

### Anti-Pattern 4: Modifying totalHits for Metadata Results

**What:** Adding metadata result count to `totalHits`.
**Why bad:** `totalHits` is a field from the GraphQL search index. It represents "how many documents matched in the index." Metadata fallback results are not index matches -- they are supplementary results from a different matching strategy. Mixing the two numbers would make `totalHits` misleading.
**Instead:** Keep `totalHits` as-is from the GraphQL response. The actual number of results returned may exceed `totalHits` when metadata fallback contributes, which is acceptable.

### Anti-Pattern 5: Returning Metadata Results Separately

**What:** Changing `PageSearchResult` to have separate `results` and `metadataResults` arrays.
**Why bad:** Changes the return type, breaking the `mcp-tools.ts` handler and all existing tests. The MCP client (Claude) does not need to distinguish how a result was found -- it just needs relevant pages.
**Instead:** Merge metadata results into the existing `results` array. The distinction is invisible to callers.

### Anti-Pattern 6: Adding a Separate MCP Tool for Metadata Search

**What:** Creating a `search_pages_metadata` tool alongside `search_pages`.
**Why bad:** Violates the v2.3 consolidation principle (3 tools only). Forces the LLM to decide which search tool to use. The fallback should be automatic and transparent.
**Instead:** Integrate into existing `searchPages()`. The LLM calls `search_pages` and gets the best results regardless of how they were found.

---

## Suggested Build Order

```
Phase 1: Core metadata search method + unit tests
  Files: src/api.ts (add searchPagesByMetadata), tests/api.test.ts (new test cases)
  Dependencies: none
  Rationale: The new private method can be tested in isolation via the existing
             mock pattern. Add the method and its tests without modifying the
             searchPages() pipeline yet. Test the method indirectly through
             searchPages() by adding tests that mock the full pipeline.

Phase 2: Pipeline integration + tool description update
  Files: src/api.ts (modify searchPages pipeline), src/mcp-tools.ts (description)
  Dependencies: Phase 1 (searchPagesByMetadata must exist)
  Rationale: Wire the metadata fallback into the searchPages pipeline. Update
             the tool description. Existing tests continue to pass (they mock
             GraphQL responses that saturate the limit, so the fallback never
             triggers in existing tests).

Phase 3: Integration tests + logging verification
  Files: tests/api.test.ts (additional pipeline integration tests)
  Dependencies: Phases 1-2
  Rationale: Test the full pipeline with scenarios that trigger the fallback:
             zero GraphQL results, partial results, dedup, unpublished filtering.
             Verify logging output.
```

**Alternative: 2-phase approach** (combine phases 1 and 2):

Since `searchPagesByMetadata()` is a private method, it cannot be tested directly. All tests go through `searchPages()`. It makes sense to add the method AND wire it into the pipeline in a single phase, then test everything together. This reduces to:

```
Phase 1: Metadata fallback implementation
  Files: src/api.ts (new method + pipeline integration)
  Rationale: Add searchPagesByMetadata() and wire it into searchPages() step 4.
             Both changes are in the same file and method. Separating them is
             artificial since the new method is private.

Phase 2: Tests + tool description
  Files: tests/api.test.ts (new test cases), src/mcp-tools.ts (description update)
  Rationale: All test cases for the metadata fallback behavior. Tool description
             update is a single string change that ships with the tests.
```

**Recommendation: Use the 2-phase approach.** The 3-phase split is artificial for a feature contained in one file. The private method and its integration are not independently useful.

---

## Scalability Considerations

| Concern | Impact | Mitigation |
|---------|--------|------------|
| `pages.list(500)` query cost | Fetches all pages on every fallback | Only triggers when GraphQL search is insufficient. Most searches return enough results from the index. |
| Memory: 500 pages in memory | ~500 * ~200 bytes per page metadata = ~100KB | Negligible for a Node.js process |
| Substring matching on 500 pages | O(500 * 3 fields * query.length) = O(1500 * N) | Linear scan is sub-millisecond for 500 items |
| Multiple fallback triggers | Step 3 (resolveViaPagesList) + Step 4 (metadata) could both issue pages.list | At most 2 pages.list calls per search. Both are read-only. |
| Wiki grows beyond 500 pages | pages.list limit truncates results | Wiki.js v2 `pages.list` does not support offset/pagination. 500 is the practical ceiling. If the wiki exceeds 500 pages, some pages will not be searchable via metadata fallback. This is acceptable for the current deployment scale. |

---

## Integration Points Summary

| Integration Point | Direction | What Changes |
|-------------------|-----------|--------------|
| `searchPages()` -> `searchPagesByMetadata()` | Internal call (private method) | New call at step 4 |
| `searchPages()` early return (line 194) | Modified behavior | Now routes to metadata fallback instead of returning empty |
| `requestContext.getStore()` -> logging | Consumed by new code | New log points for fallback activity |
| `mcp-tools.ts` tool description | String update | Reflects fallback capability |
| `PageSearchResult` type | Unchanged | Return type remains `{ results: WikiJsPage[], totalHits: number }` |
| `WikiJsPage` type | Unchanged | Metadata pages have same shape as GraphQL-resolved pages |

---

## Sources

- Direct code analysis of `src/api.ts` (searchPages pipeline, resolveViaPagesList pattern)
- Direct code analysis of `src/mcp-tools.ts` (tool registration and description)
- Direct code analysis of `tests/api.test.ts` (existing mock patterns and test helpers)
- Direct code analysis of `src/request-context.ts` (AsyncLocalStorage logging pattern)
- PROJECT.md v2.7 requirements for feature specification
- [Wiki.js GraphQL API documentation](https://docs.requarks.io/dev/api) for pages.list and pages.search capabilities
- [Wiki.js search content discussion](https://github.com/requarks/wiki/discussions/7335) for search engine limitations context

---

*Architecture research for: Metadata Search Fallback Integration -- wikijs-mcp-server v2.7*
*Researched: 2026-03-27*
