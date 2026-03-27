# Domain Pitfalls: Metadata Search Fallback

**Domain:** Adding client-side metadata search fallback to an existing GraphQL search pipeline in an MCP server
**Researched:** 2026-03-27
**Confidence:** HIGH (pitfalls derived from direct codebase inspection of src/api.ts searchPages() pipeline, existing resolveViaPagesList() fallback mechanism, type definitions, and 366 existing tests; substring matching performance characteristics verified via MDN and JavaScript performance benchmarks; GraphQL over-fetching anti-pattern verified via graphql.org and Apollo GraphQL documentation; Wiki.js pages.list limit behavior verified via requarks/wiki GitHub discussions)

**Context:** The wikijs-mcp-server (v2.6) has an existing multi-step search pipeline in `WikiJsApi.searchPages()`: (1) GraphQL `pages.search` query, (2) parallel `singleByPath` ID resolution, (3) `pages.list` batch fallback for unresolved IDs. The v2.7 milestone adds a metadata search fallback that fires when GraphQL search returns insufficient results, performing case-insensitive substring matching on page paths, titles, and descriptions fetched via `pages.list`. This creates specific integration pitfalls with the existing fallback layers.

---

## Critical Pitfalls

### Pitfall 1: Duplicate Results When GraphQL Search and Metadata Fallback Return the Same Page

**What goes wrong:**
The GraphQL search returns page X (resolved via `singleByPath` or `resolveViaPagesList`). The metadata fallback also matches page X on its title or path. The combined result array contains page X twice. The AI assistant sees duplicate entries and either presents them to the user as separate results or wastes context window tokens on redundant data.

**Why it happens:**
The existing `searchPages()` method returns `resolved: WikiJsPage[]`. The metadata fallback will produce its own `WikiJsPage[]` from `pages.list`. Both operate on path/title/description fields. A query like "getting-started" will match via GraphQL full-text search AND via path substring matching. Without explicit deduplication, the concat produces duplicates.

The deduplication trap is subtle because there are **two different ID types** in this codebase. The existing `RawSearchResult` has `id: string` (search index ID, e.g., "abc-1"), while `WikiJsPage` has `id: number` (database ID, e.g., 42). Deduplication must use the database ID (`WikiJsPage.id`), not the search index ID, and not the path (which could theoretically differ in edge cases with locale-specific pages).

**Consequences:**
- AI clients see duplicate search results, degrading trust in the tool
- Limit enforcement breaks: requesting 10 results yields 7 unique + 3 duplicates
- `totalHits` count becomes misleading when duplicates are silently merged vs. kept

**Prevention:**
1. Deduplicate by `WikiJsPage.id` (number) using a `Set<number>` built from GraphQL results BEFORE adding metadata fallback results.
2. The dedup must happen at the `WikiJsPage` level, not at the `RawSearchResult` level, because search index IDs and database IDs are different types.
3. Build the seen-set from the primary results first, then iterate metadata fallback results and skip any whose `.id` is already in the set.
4. Test: create a scenario where GraphQL returns page 42, metadata also matches page 42, verify result contains page 42 exactly once.

**Detection:**
- Test with queries matching common page titles (will hit both search paths)
- Check result arrays for duplicate `.id` values in integration tests
- Log the dedup count: `"Metadata fallback produced N results, M after dedup"`

**Phase to address:** The core implementation phase. Deduplication is not optional -- it must be part of the initial implementation, not a follow-up fix.

---

### Pitfall 2: Double `pages.list` Call -- Existing ID Resolution Fallback AND New Metadata Fallback Both Fetch All Pages

**What goes wrong:**
The existing `resolveViaPagesList()` already calls `pages.list(limit: 500)` when `singleByPath` fails for any search result. The new metadata fallback will also need to call `pages.list` to get page metadata for client-side matching. In the worst case (all `singleByPath` calls fail AND GraphQL search returns insufficient results), both fallbacks fire sequentially, making **two identical `pages.list(limit: 500)` GraphQL calls** in a single `searchPages()` invocation.

**Why it happens:**
The existing code in `resolveViaPagesList()` fetches all pages to resolve search index IDs to database IDs (path-based lookup). The metadata fallback needs the same data (all pages with title/path/description) for substring matching. These are architecturally separate concerns (ID resolution vs. content matching) but use the same underlying data source.

The code currently has no caching or data-sharing between these two fallback layers. Each constructs its own `pages.list` query independently.

**Consequences:**
- 2x GraphQL API calls to Wiki.js for the same data in a single search request
- Doubled latency for the fallback path (each `pages.list` call involves network I/O)
- Doubled memory usage (two separate `WikiJsPage[]` arrays with 500 pages each)
- Wiki.js API token rate limiting risk if the wiki instance has request throttling

**Prevention:**
1. **Share the pages.list result** between ID resolution and metadata fallback. When `resolveViaPagesList` fetches all pages, store the result and reuse it for metadata matching.
2. Implementation pattern: extract a private method like `getAllPagesMetadata()` that caches its result within a single `searchPages()` call (not across requests -- no stale cache risk).
3. Pass the already-fetched `allPages: WikiJsPage[]` from `resolveViaPagesList` into the metadata fallback function as a parameter instead of letting it fetch independently.
4. If `resolveViaPagesList` was not called (all `singleByPath` calls succeeded), the metadata fallback fetches `pages.list` once on its own. No waste.

**Detection:**
- Count GraphQL `mockRequest` calls in unit tests: `searchPages("short")` should never call `pages.list` more than once
- Add a log entry for pages.list calls and verify via observability tests

**Phase to address:** The core implementation phase. This is an architectural decision that affects the method signature of both fallback functions.

---

### Pitfall 3: Metadata Fallback on Every Search Swamps Performance (Missing "Insufficient Results" Threshold)

**What goes wrong:**
The fallback triggers on every search that returns "insufficient" results, but the threshold for "insufficient" is poorly defined. If set too aggressively (e.g., "fewer than `limit` results"), the metadata fallback fires on nearly every search -- even when the GraphQL search returned perfectly good results that just happened to be fewer than the requested limit. This turns the optimization into a performance regression: every search now requires two API calls.

**Why it happens:**
The natural instinct is `if (resolved.length < limit) { runMetadataFallback() }`. But most legitimate searches return fewer results than the limit. A search for "deployment guide" might return 3 perfect results with `limit: 10`. Triggering a metadata fallback here adds latency and noise without value.

The real use case for metadata fallback is: (a) GraphQL search returns 0 results for a valid query (acronyms, path segments, short tokens), or (b) the query pattern is known to be poorly handled by full-text search (e.g., contains slashes suggesting a path, or is a very short token).

**Consequences:**
- Average search latency increases 2-3x for all searches, not just failing ones
- Wiki.js API receives `pages.list(limit: 500)` on every search invocation
- Tool wrapper timing logs show inflated durations, making monitoring noisy
- AI assistants experience slower response times for every wiki query

**Prevention:**
1. **Primary trigger: zero results.** The metadata fallback should fire when GraphQL search returns exactly 0 resolved results (after the full resolution pipeline).
2. **Secondary trigger (optional): query pattern heuristic.** If the query looks like a path segment (contains `/`), is very short (1-2 characters -- though this overlaps with the false positive pitfall below), or is all-uppercase (suggesting an acronym), consider also triggering the fallback even with some GraphQL results.
3. Do NOT use `resolved.length < limit` as the trigger. Use `resolved.length === 0` as the primary trigger.
4. Log the trigger reason: `"Metadata fallback triggered: reason=zero_graphql_results"` vs `"Metadata fallback skipped: graphql_returned=3"`.

**Detection:**
- Monitor fallback trigger rate in production logs. If >50% of searches trigger the fallback, the threshold is wrong.
- Unit test: GraphQL returns 3 valid results with `limit: 10` -- metadata fallback should NOT fire.
- Unit test: GraphQL returns 0 results -- metadata fallback SHOULD fire.

**Phase to address:** Core implementation phase. The trigger condition is a design decision that must be made upfront, not tuned after deployment.

---

## Moderate Pitfalls

### Pitfall 4: Short Query Tokens Match Everything (False Positive Explosion)

**What goes wrong:**
A user searches for "ai" (2 characters). The metadata fallback does case-insensitive substring matching on paths, titles, and descriptions. The string "ai" matches: "getting-started" (cont**ai**ns), "maintenance" (m**ai**ntenance), "domain" (dom**ai**n), "email" (em**ai**l), "training" (tr**ai**ning), and dozens more. The fallback returns nearly every page in the wiki as a match.

**Why it happens:**
`String.prototype.includes()` with a 2-character query has an extremely high match rate against English text. At 1 character, it matches literally everything. The matching is pure substring containment with no relevance scoring, word boundary awareness, or semantic understanding.

The v2.7 requirements say "case-insensitive substring matching on path, title, and description." This is correct behavior for the matching itself, but without a minimum query length or word-boundary heuristic, short queries produce results indistinguishable from "return all pages."

**Consequences:**
- AI assistant receives a wall of barely-relevant results, degrading answer quality
- Limit enforcement masks the problem (returns first N matches by insertion order, not relevance)
- User searching for the AI/ML topic gets random pages about "maintenance" and "email"

**Prevention:**
1. **Enforce minimum query length.** Do not run metadata fallback for queries shorter than 2 characters. Consider 3 characters as the practical minimum for substring matching to be useful.
2. **Prefer word-boundary matching for short queries.** For queries of 2-4 characters, consider splitting the search target into words (split on `/`, `-`, `_`, spaces) and matching against individual path segments or title words rather than the full concatenated string. "ai" matching the word "ai" in a path like "topics/ai/overview" is relevant. "ai" matching inside "maintenance" is not.
3. **Match against path segments, not the full path string.** Split `path` on `/` and match each segment individually. This turns "getting-started" (no match for "ai") vs "ai/overview" (match on "ai" segment) into meaningful distinctions.
4. Do NOT use regex with the `i` flag for this -- `String.prototype.toLowerCase()` + `String.prototype.includes()` is faster and avoids regex special character escaping pitfalls (see Pitfall 7).

**Detection:**
- Test with 1-char, 2-char, and 3-char queries. If 2-char queries match >30% of pages, word-boundary matching is needed.
- Count metadata fallback results before and after dedup/limit enforcement. If pre-limit count is routinely >50% of total pages, matching is too broad.

**Phase to address:** Core implementation phase. The matching algorithm is the core of the feature.

---

### Pitfall 5: Metadata Fallback Returns Unpublished Pages (Bypassing Existing Filter)

**What goes wrong:**
The existing `listPages()` method filters out unpublished pages when `includeUnpublished` is false. However, `resolveViaPagesList()` calls `pages.list(limit: 500)` directly (not via `listPages()`) and does NOT filter unpublished pages. If the metadata fallback reuses this same data or makes its own `pages.list` call without filtering, unpublished draft pages appear in search results.

This directly contradicts the v2.7 requirement: "Deduplication, unpublished-page filtering, and limit enforcement."

**Why it happens:**
The existing `resolveViaPagesList()` method intentionally includes all pages because it is resolving specific paths returned by the search engine -- the search engine only indexes published pages, so the paths it returns should correspond to published pages. But the metadata fallback is doing open-ended matching against all pages, including drafts.

The temptation is to reuse the existing `resolveViaPagesList` data (see Pitfall 2) without adding the `isPublished` filter, because the existing code doesn't have one.

**Consequences:**
- Unpublished draft pages appear in search results
- This could expose work-in-progress content that authors intended to keep hidden
- Inconsistency: `list_pages` filters unpublished by default, but `search_pages` with fallback does not

**Prevention:**
1. The metadata fallback MUST filter `page.isPublished === true` before performing substring matching.
2. If sharing data from `resolveViaPagesList`, apply the published filter at the metadata matching stage, not at the data fetching stage (because `resolveViaPagesList` needs unfiltered data for its own ID resolution purpose).
3. Test: create a mock `pages.list` response with a mix of published and unpublished pages. Search with metadata fallback. Verify only published pages appear in results.

**Detection:**
- Unit test with unpublished pages in the mock data
- Check the filter is applied before matching, not after limit enforcement

**Phase to address:** Core implementation phase. This is a correctness requirement, not an optimization.

---

### Pitfall 6: Limit Enforcement Applied at the Wrong Stage (Before Dedup, After Dedup, or Not at All)

**What goes wrong:**
The user requests `limit: 5`. GraphQL search returns 3 results. Metadata fallback returns 7 results (including 2 duplicates of GraphQL results). Depending on where the limit is applied:
- Before dedup: limit to 5, dedup removes 2, user gets 3 results (under-serving)
- After dedup but before merge: limit metadata to 5, merge with 3 GraphQL = 8 results (over-serving)
- Not at all: user gets 8 results when they asked for 5

**Why it happens:**
The existing code applies the limit at the GraphQL query level: `.slice(0, limit)` on raw results. But the metadata fallback introduces a second source of results. The limit must now be a **global** limit across both sources, applied after deduplication and merging.

**Consequences:**
- Returning more results than requested violates the tool's API contract
- Returning fewer results than available (because dedup ate into the pre-limited set) wastes the fallback effort
- Inconsistent result counts confuse the AI assistant's reasoning about completeness

**Prevention:**
1. **Order of operations:** (a) Get GraphQL results, (b) Get metadata fallback results, (c) Deduplicate by `WikiJsPage.id`, (d) Apply limit to the merged, deduplicated array.
2. The metadata fallback should NOT apply its own limit internally. It should return all matches, and the final limit should be applied once at the end.
3. Exception: if the metadata fallback matches hundreds of pages (see Pitfall 4), an internal cap (e.g., 50 or 100) prevents unnecessary processing before the final limit is applied.
4. Test: GraphQL returns 3, metadata returns 4 (2 duplicates), limit is 5. Expected: 5 unique results (3 from GraphQL + 2 new from metadata).

**Detection:**
- Unit test with various combinations of GraphQL count, metadata count, overlap count, and limit value
- Verify `result.results.length <= limit` for all test cases

**Phase to address:** Core implementation phase. The limit enforcement order is an implementation detail that is easy to get wrong.

---

### Pitfall 7: Regex Special Characters in User Query Cause Crashes or Silent Mismatches

**What goes wrong:**
If the metadata matching uses `new RegExp(query, 'i')` for case-insensitive matching (a common shortcut), a user query containing regex metacharacters like `[`, `(`, `*`, `+`, `.`, `?`, `{`, `}`, `\`, `^`, `$`, `|` throws a `SyntaxError: Invalid regular expression`. The search handler catches this as a generic error and returns "Error in search_pages", hiding the actual problem.

**Why it happens:**
Developers reach for `new RegExp(query, 'i')` because it is one line of code for case-insensitive matching. But MCP tool inputs come from AI assistants that may pass queries like "C++ guide", "FAQ (internal)", or "setup [dev]" -- all containing regex metacharacters.

**Consequences:**
- Unescaped metacharacter queries crash the metadata fallback silently
- The error is caught by the existing try/catch in the tool handler, returning a generic error message
- Users cannot search for pages with names containing parentheses, brackets, or dots

**Prevention:**
1. **Do not use regex for metadata matching.** Use `title.toLowerCase().includes(query.toLowerCase())` instead. This is both faster (see JavaScript benchmarks: `includes()` is 2-3x faster than `RegExp.test()`) and safe from metacharacter injection.
2. If regex is ever needed for more advanced matching, always escape the query: `query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')` before constructing the RegExp.
3. Pre-lowercase the query once, then compare against pre-lowercased fields. Do not call `.toLowerCase()` on every field for every page for every search -- lowercase the query once and the page fields once during iteration.

**Detection:**
- Unit test: search for "FAQ (internal)" -- must not throw
- Unit test: search for "C++ guide" -- must not throw
- Unit test: search for "[dev]" -- must not throw

**Phase to address:** Core implementation phase. The matching implementation is the core of the feature.

---

### Pitfall 8: `totalHits` Count Becomes Inaccurate After Metadata Fallback Augmentation

**What goes wrong:**
The existing `searchPages()` returns `totalHits` from the GraphQL search response. This represents the total number of matches the search engine found (which may be more than the returned `limit`). When metadata fallback adds extra results, the `totalHits` no longer accurately represents the total available results. It either under-counts (if metadata found more) or becomes meaningless (mixing counts from two different search mechanisms).

**Why it happens:**
`totalHits` is a server-side count from the Wiki.js search engine. The metadata fallback is a client-side mechanism with no equivalent "total available" count beyond the number of pages.list results that matched. These two numbers measure different things and cannot be meaningfully combined.

**Consequences:**
- AI assistant may reason about result completeness based on `totalHits` ("search found 50 results but only 10 were returned, let me narrow the query") when the actual results include metadata fallback hits not counted in `totalHits`
- Monitoring dashboards tracking `totalHits` vs. returned results see unexpected discrepancies

**Prevention:**
1. When metadata fallback contributes results, update `totalHits` to reflect the actual merged count. The simplest approach: `totalHits = Math.max(originalTotalHits, mergedResults.length)`.
2. Alternatively, add a separate field to the response indicating fallback was used: `{ results: [...], totalHits: N, fallbackUsed: true }`. This requires updating the `PageSearchResult` type.
3. Document in the tool description that totalHits is approximate when fallback is active.

**Detection:**
- Test: GraphQL returns 0 results (totalHits: 0), metadata fallback returns 5. Verify `totalHits >= 5`.
- Test: GraphQL returns 3 (totalHits: 50), metadata fallback adds 2 new. Verify `totalHits` is reasonable.

**Phase to address:** Core implementation phase, but lower priority than correctness pitfalls. Could be deferred to a polish phase if needed.

---

## Minor Pitfalls

### Pitfall 9: Existing Test Mocks Break When searchPages() Gains New API Calls

**What goes wrong:**
The existing `api.test.ts` has 7 carefully sequenced mock calls for `searchPages()` tests: (1) search response, (2-4) singleByPath responses, (5) pages.list fallback. Adding a metadata fallback that makes additional `pages.list` calls changes the expected mock call count and order. Every existing test that counts `mockRequest` calls (e.g., `expect(mockRequest).toHaveBeenCalledTimes(4)`) breaks.

**Why it happens:**
The test mocking strategy uses sequential `mockResolvedValueOnce()` / `mockRejectedValueOnce()` calls. Each mock is consumed in order. If the new metadata fallback inserts an additional `pages.list` call between existing mock expectations, subsequent mocks are consumed by the wrong call, causing cascading test failures.

**Prevention:**
1. Before modifying `searchPages()`, audit all existing `api.test.ts` tests for their mock call sequences. There are currently 7 test cases in the `searchPages` describe block.
2. When adding the metadata fallback, update each test's mock sequence to account for the new call pattern.
3. For tests where metadata fallback should NOT fire (GraphQL returned sufficient results), ensure the trigger condition prevents it, so existing mock counts remain valid.
4. Consider restructuring mocks to use a more resilient pattern: `mockRequest.mockImplementation((query) => { /* match on query string content */ })` instead of sequential `mockResolvedValueOnce()`. This makes tests independent of call order.

**Detection:**
- Run `npm test` after any change to `searchPages()`. Broken mock counts produce immediately visible failures.
- Check for `toHaveBeenCalledTimes` assertions in existing tests -- all will need review.

**Phase to address:** Core implementation phase. Test updates are mandatory, not optional.

---

### Pitfall 10: Tool Description Update Breaks Existing AI Behavior

**What goes wrong:**
The v2.7 requirements include "Updated tool description reflecting the fallback capability." Changing the `search_pages` tool description changes how AI assistants decide when and how to use the tool. An overly detailed description (mentioning internal implementation like "metadata fallback") might cause the AI to change its query strategy (e.g., searching for path segments instead of natural language). An insufficient description change means the AI does not know it can now search by path or acronym.

**Why it happens:**
MCP tool descriptions are prompt text that directly influences AI behavior. The existing description says: "Search Wiki.js pages by keyword query. Returns matching pages with metadata and content excerpts. Only searches published pages..." Changing this is a prompt engineering change with behavioral consequences.

**Consequences:**
- AI sends different query patterns than before, potentially degrading the primary GraphQL search path
- Existing smoke tests that assert on description content (e.g., `expect(searchPages.description).toContain("published")`) may break

**Prevention:**
1. Keep the description user-facing, not implementation-facing. Say "Searches page titles, paths, descriptions, and content" not "Falls back to metadata substring matching when GraphQL returns zero results."
2. Review the existing smoke test assertion: `expect(searchPages.description).toContain("published")` -- ensure the updated description still contains "published."
3. Test the updated description with a real AI assistant to verify it does not change query behavior for common use cases.

**Detection:**
- Run existing smoke tests after updating the description
- Compare before/after behavior with Claude Desktop for common wiki queries

**Phase to address:** Final polish phase, after core implementation is verified.

---

### Pitfall 11: `pages.list(limit: 500)` Silently Misses Pages Beyond the Limit

**What goes wrong:**
The existing `resolveViaPagesList` fetches `pages.list(limit: 500, orderBy: UPDATED)`. If the Wiki.js instance has more than 500 pages, the metadata fallback cannot match pages beyond position 500 in the sorted list. This is a silent data loss: the fallback appears to work but is missing pages.

**Why it happens:**
The Wiki.js GraphQL `pages.list` query does not support cursor-based pagination. The `limit` parameter caps the result set. For small-to-medium wikis (typical internal wikis have 50-300 pages), this is not an issue. For larger wikis, pages ordered by UPDATED beyond position 500 are invisible to the fallback.

Additionally, there is a known Wiki.js bug (requarks/wiki discussion #4111) where the `limit` parameter does not work as expected in some versions, potentially returning fewer results than requested.

**Consequences:**
- Metadata fallback returns incomplete results for wikis with >500 pages
- Pages that have not been updated recently (old but still relevant) are missed first (because `orderBy: UPDATED` sorts by most recent)
- No error or warning -- the fallback silently returns partial results

**Prevention:**
1. Log the page count from `pages.list`: `"Metadata fallback working with N pages"`. If N equals the limit, log a warning: `"pages.list returned exactly 500 pages; metadata search may be incomplete"`.
2. For this milestone, 500 is sufficient. Document the limitation and add it to the response when applicable.
3. If the wiki grows beyond 500 pages, consider making multiple paginated calls (if Wiki.js supports offset-based pagination) or increasing the limit.

**Detection:**
- Log-based monitoring: alert when pages.list returns exactly 500 results
- Unit test: verify the limit parameter is passed to the GraphQL query

**Phase to address:** Not blocking for v2.7 (internal wikis are typically small). Document as a known limitation. Address in a future milestone if the wiki grows.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Core metadata matching function | Pitfall 4 (false positives with short queries) | Enforce minimum query length of 2-3 chars; consider word-boundary matching for short queries |
| Core metadata matching function | Pitfall 7 (regex special chars) | Use `toLowerCase()` + `includes()`, not `RegExp` |
| Integration into searchPages() | Pitfall 1 (duplicate results) | Deduplicate by `WikiJsPage.id` using `Set<number>` |
| Integration into searchPages() | Pitfall 2 (double pages.list call) | Share pages.list data between ID resolution and metadata fallback |
| Integration into searchPages() | Pitfall 3 (trigger condition) | Trigger on `resolved.length === 0`, not `resolved.length < limit` |
| Integration into searchPages() | Pitfall 5 (unpublished pages) | Filter `isPublished === true` before matching |
| Integration into searchPages() | Pitfall 6 (limit enforcement order) | Apply limit AFTER merge + dedup, not before |
| Integration into searchPages() | Pitfall 8 (totalHits accuracy) | Update totalHits to reflect merged count |
| Test updates | Pitfall 9 (mock sequence breaks) | Audit all existing searchPages tests before modifying the method |
| Tool description update | Pitfall 10 (AI behavior change) | Keep description user-facing; verify existing smoke test assertions still pass |
| Scalability | Pitfall 11 (500-page limit) | Log warning when pages.list returns exactly limit count |

---

## Integration Risk Summary

The highest-risk integration point is **the merge between GraphQL results and metadata fallback results** within `searchPages()`. This single method must correctly handle:

1. Deduplication (Pitfall 1)
2. Data sharing to avoid double fetching (Pitfall 2)
3. Trigger conditions (Pitfall 3)
4. Published-page filtering (Pitfall 5)
5. Limit enforcement ordering (Pitfall 6)
6. totalHits accuracy (Pitfall 8)

All six concerns converge in the same ~30 lines of code. The recommended implementation order within `searchPages()`:

```
1. Execute GraphQL search (existing)
2. Resolve IDs via singleByPath (existing)
3. Resolve unresolved IDs via pages.list (existing) -- CACHE the pages.list result
4. Check trigger condition (resolved.length === 0)
5. If triggered: run metadata matching against CACHED pages.list data
6. Filter metadata results: isPublished === true
7. Deduplicate: merge GraphQL results + metadata results, dedup by WikiJsPage.id
8. Apply limit to merged results
9. Update totalHits
10. Return
```

This order ensures each pitfall is addressed at the correct stage and avoids redundant API calls.

## Sources

- [Apollo GraphQL: How to Search and Filter Results](https://www.apollographql.com/blog/how-to-search-and-filter-results-with-graphql) -- over-fetching anti-patterns
- [GraphQL Performance Best Practices](https://graphql.org/learn/performance/) -- client-side filtering cost
- [Wiki.js GraphQL API Docs](https://docs.requarks.io/dev/api) -- pages.list query structure
- [Wiki.js Discussion #4111: pages.list limit bug](https://github.com/requarks/wiki/discussions/4111) -- limit field behavior
- [Wiki.js Discussion #7335: Search content via GraphQL](https://github.com/requarks/wiki/discussions/7335) -- search API limitations, singleByPath permissions
- [MDN: String.prototype.includes()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/includes) -- substring matching behavior
- [JavaScript Substring Performance Guide](https://www.javaspring.net/blog/fastest-way-to-check-a-string-contain-another-substring-in-javascript/) -- includes() vs regex performance
- [Optimized GraphQL Data Fetching Strategies](https://dev.to/wallacefreitas/optimized-graphql-data-fetching-strategies-best-practices-for-performance-19bm) -- pagination and memory
- Direct codebase inspection: `src/api.ts` (searchPages, resolveViaPagesList), `src/types.ts` (WikiJsPage, PageSearchResult), `tests/api.test.ts` (7 searchPages test cases with mock sequences)
