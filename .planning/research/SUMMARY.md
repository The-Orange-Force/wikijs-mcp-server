# Project Research Summary

**Project:** wikijs-mcp-server v2.7 — Metadata Search Fallback
**Domain:** MCP server search pipeline enhancement (client-side metadata matching)
**Researched:** 2026-03-27
**Confidence:** HIGH

## Executive Summary

The v2.7 milestone adds a metadata search fallback to the existing `WikiJsApi.searchPages()` pipeline in `src/api.ts`. The existing pipeline relies on Wiki.js's full-text search index (`pages.search` GraphQL query), which silently fails for acronyms (e.g., "COA", "ZDG"), short tokens, and path-segment queries because search engines tokenize and stem text, discarding exactly the short structured tokens users search for most. The fix is well-understood and requires zero new dependencies: fetch `pages.list` when GraphQL returns insufficient results, filter client-side with case-insensitive `String.includes()`, deduplicate by page ID, and merge into the existing result array.

The recommended approach is a minimal, additive pipeline extension: insert a new step 4 into the existing 3-step search pipeline inside `WikiJsApi`, add a private `searchPagesByMetadata()` method on the same class, and modify the early-return path that currently drops zero-result searches on the floor. The only other change is a one-string update to the `search_pages` tool description in `mcp-tools.ts`. No new files, no new environment variables, no new npm packages. The entire feature is contained in two modified source files and expanded test coverage.

The primary risks are implementation correctness hazards, not architectural risks. Six distinct correctness concerns converge in the same ~30-line `searchPages()` integration point: deduplication must use database `WikiJsPage.id` (not the search index's string ID), the trigger condition must be `resolved.length === 0` (not `< limit`), unpublished pages must be filtered before matching, limit must be enforced after deduplication, and the `pages.list` call should be shared between the existing ID-resolution fallback and the new metadata fallback to avoid a redundant GraphQL round-trip. Each of these is a testable correctness requirement, and the 12-test matrix covers all of them.

---

## Key Findings

### Recommended Stack

The v2.7 feature requires **zero new dependencies**. All required capabilities exist in the current stack (TypeScript 5.3, Fastify 4, graphql-request, jose, Zod, Vitest 4, Pino). Case-insensitive substring matching uses `String.toLowerCase().includes()`, deduplication uses `Map<number, WikiJsPage>`, filtering uses `Array.prototype.filter()`, limit enforcement uses `Array.prototype.slice()`, and fallback logging uses the existing `requestContext.getStore()?.log` Pino pattern already in `api.ts`.

Third-party search libraries (Fuse.js, FlexSearch, MiniSearch) were explicitly evaluated and rejected. The problem is substring containment for structured tokens, not fuzzy relevance matching. Fuzzy matching adds false positives ("COA" matching "COAT"), introduces package weight, and solves a different problem. `String.includes()` is faster (sub-microsecond per comparison at 500 pages), safer (no ReDoS risk from user-controlled input used as a `RegExp` pattern), and produces correct results for the stated use case.

**Core technologies (all existing — nothing added):**
- `String.toLowerCase().includes()`: case-insensitive substring matching — correct for acronyms and path segments, no false fuzzy positives
- `Map<number, WikiJsPage>`: deduplication by database page ID — O(1) lookup, preserves insertion order (GraphQL results first)
- Pino via `requestContext.getStore()`: structured fallback logging — existing pattern, no new imports in `api.ts`
- `pages.list` GraphQL query (existing): metadata data source — same query used by `resolveViaPagesList`, no schema changes

See `.planning/research/STACK.md` for full analysis, `toLowerCase()` vs `toLocaleLowerCase()` decision, and alternatives considered.

### Expected Features

The feature scope for v2.7 is precisely defined. All P1 features are low-complexity, high-value, and must ship together — they form an interdependent correctness set where omitting any one breaks the others.

**Must have (table stakes) — v2.7:**
- Metadata fallback trigger when GraphQL returns zero results — the core feature purpose
- Case-insensitive substring matching on path, title, and description — covers acronyms, path segments, and keyword variants
- Deduplication by page ID — prevents duplicate results when a page matches both search paths
- Unpublished-page filtering in fallback results — maintains consistency with the search tool's published-only contract
- Limit enforcement on merged results — honors the tool's `limit` parameter across both result sources
- Updated `search_pages` tool description — informs the AI assistant that short queries and acronyms now work
- Structured logging for fallback activity — gives operators visibility into fallback trigger rate and yield

**Should have (add after v2.7 validation):**
- Multi-token query splitting — AND-matching across tokens for multi-word queries like "mendix best practices"
- Relevance-weighted ordering — title match > path match > description match for fallback results
- Configurable fallback threshold — allow tuning the trigger condition beyond the default zero-result trigger

**Defer (v2.8+):**
- Short-TTL metadata cache — only warranted if `pages.list` call rate becomes a measured bottleneck
- Path segment matching — refinement for cases where full-path substring matching produces false positives

**Explicitly out of scope (anti-features):**
- Full content search in fallback — requires N `getPageById` calls per search, completely impractical
- Fuzzy/Levenshtein matching — false positives for structured token search; GraphQL already handles fuzzy for content
- Regex-based query syntax — ReDoS exposure from user-controlled pattern input
- Separate `search_metadata` MCP tool — increases AI tool selection complexity; fallback must be automatic and transparent

See `.planning/research/FEATURES.md` for the full feature dependency graph, MVP definition, and anti-feature rationale.

### Architecture Approach

The metadata fallback is a pure data-layer enhancement encapsulated within `WikiJsApi`. No changes propagate to routing, auth, config, GDPR redaction, or any module outside `api.ts` and `mcp-tools.ts`. The existing `search_pages` handler continues to call `api.searchPages()` with the same signature and receives the same `{ results: WikiJsPage[], totalHits: number }` return type. The fallback is invisible to callers.

**Modified components:**
1. `src/api.ts` — adds `searchPagesByMetadata()` private method (~30 lines); modifies `searchPages()` to replace the zero-result early return and add step 4 (~20 lines)
2. `src/mcp-tools.ts` — tool description string update only (±2 lines)
3. `tests/api.test.ts` — 8-12 new test cases covering all fallback scenarios

**Unchanged (all other files):** `src/types.ts`, `src/config.ts`, `src/server.ts`, `src/routes/`, `src/auth/`, `src/gdpr.ts`, `src/tool-wrapper.ts`, `src/request-context.ts`, `tests/helpers/`

The 4-step pipeline in `searchPages()` after v2.7:
1. GraphQL `pages.search` (unchanged)
2. `singleByPath` ID resolution (unchanged)
3. `pages.list` fallback for unresolved IDs (unchanged — reuse cached result in step 4)
4. **NEW:** If `resolved.length === 0`, run `searchPagesByMetadata()` against the `pages.list` data

See `.planning/research/ARCHITECTURE.md` for full data flow diagrams, all four case scenarios, anti-patterns to avoid, and the recommended 2-phase build order.

### Critical Pitfalls

1. **Duplicate results from two search paths** — Deduplicate using `Set<number>` of `WikiJsPage.id` (database IDs), built from GraphQL results before adding metadata results. The `RawSearchResult.id` (string, search index ID) and `WikiJsPage.id` (number, database ID) are different types — dedup at the `WikiJsPage` level only, not at the raw result level.

2. **Double `pages.list` GraphQL call** — The existing `resolveViaPagesList()` already calls `pages.list(500)` for ID resolution. Share the fetched page list between both functions within a single `searchPages()` invocation. The metadata fallback receives the cached list as a parameter rather than fetching independently. At most one `pages.list` call per search invocation.

3. **Overly aggressive fallback trigger** — Use `resolved.length === 0` as the primary trigger, not `resolved.length < limit`. Most legitimate searches return fewer results than the limit. Triggering on under-saturation fires the fallback on nearly every search, doubling GraphQL load without value.

4. **Unpublished pages in fallback results** — `pages.list` returns all pages (published and unpublished). `resolveViaPagesList` does not filter by `isPublished` because it resolves paths the search engine already indexed (which are all published). The metadata fallback must explicitly check `page.isPublished === true` before matching — this is not inherited from the existing code.

5. **Limit enforcement order** — Apply limit after deduplication and merge, not before. Correct order: get GraphQL results → get all metadata matches → deduplicate by ID → slice to limit.

6. **Existing test mocks break** — The existing `api.test.ts` uses sequential `mockResolvedValueOnce()` calls. Adding a `pages.list` call to the pipeline changes mock consumption order and breaks `toHaveBeenCalledTimes` assertions. Audit all 7 existing `searchPages` test cases before touching `searchPages()`.

See `.planning/research/PITFALLS.md` for all 11 pitfalls including short-query false positives (Pitfall 4), `totalHits` accuracy (Pitfall 8), and tool description behavioral risks (Pitfall 10).

---

## Implications for Roadmap

Research converges on a 2-phase implementation. A 3-phase split (separating the private method from its wiring) would be artificial — `searchPagesByMetadata()` is private and cannot be validated independently of `searchPages()`.

### Phase 1: Metadata Fallback Implementation

**Rationale:** The private `searchPagesByMetadata()` method and its wiring into `searchPages()` are co-dependent — both live in `src/api.ts` and the private method cannot be meaningfully tested without being called through the pipeline. They must ship together. This phase contains all implementation risk and all critical correctness pitfalls.

**Delivers:** A working metadata search fallback. Searching "COA", "ZDG", or other acronyms and path tokens that previously returned zero results now returns matching pages. The zero-result early return in `searchPages()` is replaced with the metadata fallback path.

**Addresses features from FEATURES.md:**
- Zero-result trigger condition
- Case-insensitive substring matching on path, title, description
- Deduplication by page ID
- Unpublished-page filtering
- Limit enforcement on merged results

**Avoids pitfalls from PITFALLS.md:**
- Pitfall 1: dedup by `WikiJsPage.id` (number), not search index ID (string)
- Pitfall 2: share `pages.list` data from `resolveViaPagesList` with metadata fallback
- Pitfall 3: trigger on `resolved.length === 0`, not `< limit`
- Pitfall 4: consider minimum query length (2-3 chars) to avoid substring explosion
- Pitfall 5: filter `isPublished === true` before matching, not inherited from existing code
- Pitfall 6: enforce limit after dedup and merge
- Pitfall 7: use `includes()`, not `RegExp`, to eliminate ReDoS risk
- Pitfall 8: update `totalHits` to reflect merged result count

### Phase 2: Tests, Logging, and Tool Description

**Rationale:** All test cases and the tool description update depend on Phase 1 existing, but are independent of each other. The 12-test matrix validates every correctness requirement from PITFALLS.md. The tool description is a single string change with behavioral implications for AI clients.

**Delivers:** Full test coverage of all fallback pipeline scenarios, structured observability logging at `info`/`debug` level, and an updated tool description that tells AI assistants that acronyms and path-based queries now work.

**Uses from STACK.md:**
- Vitest 4 — existing test runner, no new setup
- Existing `mockRequest` / `makeSearchResponse` / `makePagesListResponse` helpers
- Pino via `requestContext` — existing `ctx?.log.info()` pattern

**Implements from ARCHITECTURE.md (new test cases):**
- Fallback triggers on zero GraphQL results
- Fallback supplements partial GraphQL results
- Dedup prevents duplicate pages
- Unpublished pages are excluded
- Limit is respected across merged results
- Case-insensitive path/title/description matching
- No fallback when GraphQL saturates limit (no extra `pages.list` call)
- Logging on successful fallback

**Avoids pitfalls from PITFALLS.md:**
- Pitfall 9: audit all 7 existing `searchPages` mock sequences before modifying the method — every `toHaveBeenCalledTimes` assertion needs review
- Pitfall 10: keep description user-facing ("searches titles, paths, descriptions") not implementation-facing ("falls back to metadata substring matching when index returns zero"); verify smoke test `expect(description).toContain("published")` still passes

### Phase Ordering Rationale

- Phase 1 before Phase 2: tests and description update depend on the implementation existing
- No Phase 0 pre-research needed: all architectural decisions, method signatures, and risk mitigations are fully resolved in this research cycle
- Single-file containment: both phases touch only `src/api.ts` and `src/mcp-tools.ts`, eliminating integration coordination overhead
- The existing 366-test suite must remain green at the end of each phase

### Research Flags

Phases needing deeper research during planning:
- **Neither phase requires additional research.** All design decisions, implementation patterns, and risk mitigations are fully resolved by this research cycle. Direct codebase inspection provides higher confidence than external documentation for this scope.

Phases with standard patterns (skip research-phase):
- **Phase 1:** Pipeline extension follows the same established pattern used in v2.5 and v2.6. All data types, method signatures, and call patterns are documented from codebase inspection.
- **Phase 2:** Standard Vitest unit tests with established mock helpers. No new test infrastructure or patterns needed.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new dependencies confirmed. All implementation uses Node.js built-ins and the existing stack. Verified against actual `package.json` and codebase. `toLowerCase()` vs `toLocaleLowerCase()` decision is documented and correct for Docker Alpine. |
| Features | HIGH | Feature scope directly derived from `.planning/PROJECT.md` v2.7 milestone requirements. P1/P2/P3 split is unambiguous. Anti-features are explicitly documented with rationale. 500-page `pages.list` ceiling is an acknowledged and acceptable constraint. |
| Architecture | HIGH | Based on direct code inspection of `src/api.ts` `searchPages()` pipeline, `resolveViaPagesList()` pattern, `src/types.ts` type definitions, and existing test mock sequences. No inference from documentation alone. Component boundaries confirmed through method-level analysis. |
| Pitfalls | HIGH | 11 pitfalls identified through codebase inspection of actual code paths and data flows. Six critical pitfalls converge at the same integration point and are all testable. The double `pages.list` call (Pitfall 2) and deduplication ID-type confusion (Pitfall 1) are the highest implementation risk items. |

**Overall confidence:** HIGH

### Gaps to Address

- **`totalHits` semantics when metadata contributes results (Pitfall 8):** Two options documented: (a) update in place as `Math.max(originalTotalHits, mergedResults.length)` — no type change; (b) add `fallbackUsed: boolean` to `PageSearchResult` — requires `src/types.ts` change and handler update. Option (a) is preferred for v2.7 to minimize surface area. Resolve before starting Phase 1 to avoid a mid-implementation type change.

- **Fallback trigger threshold disagreement:** ARCHITECTURE.md suggests `resolved.length < limit` as the trigger; PITFALLS.md argues for `resolved.length === 0`. PITFALLS.md rationale is stronger — `< limit` fires the fallback on most searches, creating a performance regression. Use `=== 0` for v2.7 and validate in production before widening. This must be decided before Phase 1 code is written.

- **`pages.list` data sharing implementation detail:** Pitfall 2 requires sharing the `pages.list` result between `resolveViaPagesList` and `searchPagesByMetadata`. ARCHITECTURE.md recommends against class-level caching. Resolution: pass the pre-fetched page list as a parameter when both fallbacks run, not as class state. This requires refactoring `resolveViaPagesList` to accept an optional pre-fetched page list, or fetching pages once at the top of `searchPages()` and passing to both. Resolve the exact refactoring pattern before Phase 1 implementation to avoid structural rework.

---

## Sources

### Primary (HIGH confidence)

- Direct codebase inspection — `src/api.ts` (`searchPages()`, `resolveViaPagesList()`, `listPages()`), `src/mcp-tools.ts`, `src/types.ts`, `tests/api.test.ts` — implementation baseline and mock patterns
- `.planning/PROJECT.md` v2.7 milestone scope — feature requirements and acceptance criteria
- [MDN: String.prototype.includes()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/includes) — substring matching behavior and performance characteristics
- [MDN: String.prototype.toLowerCase()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/toLowerCase) — Unicode Default Case Mapping (locale-independent, correct for Docker Alpine C locale)
- [MDN: Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map) — insertion-order preservation guarantee used for dedup ordering
- [Wiki.js GraphQL API](https://docs.requarks.io/dev/api) — `pages.list` and `pages.search` query structure and field availability
- [Wiki.js Issue #2938](https://github.com/Requarks/wiki/issues/2938) — search index IDs are not database IDs; root cause of existing ID resolution pipeline

### Secondary (MEDIUM confidence)

- [Wiki.js Discussion #7335](https://github.com/requarks/wiki/discussions/7335) — `singleByPath` requires admin privileges; search-then-resolve pattern documented by community
- [Wiki.js Discussion #4111](https://github.com/requarks/wiki/discussions/4111) — `pages.list` limit behavior; known issues in some versions
- [Elasticsearch fallback query proposal #51840](https://github.com/elastic/elasticsearch/issues/51840) — canonical pattern for fallback queries: trigger on insufficient results, deduplicate, primary results listed first
- [Empathy Platform: Search Fallback Features](https://docs.empathy.co/play-with-empathy-platform/configure-empathy-platform/configure-search-service/search-fallback-features.html) — fallback activates on zero results; partial query splitting as secondary strategy
- [MCP Tool Descriptions Best Practices (Merge.dev)](https://www.merge.dev/blog/mcp-tool-description) — keep descriptions user-facing; AI assistants use them to decide when to invoke tools
- [JavaScript Substring Performance](https://www.javaspring.net/blog/fastest-way-to-check-a-string-contain-another-substring-in-javascript/) — `includes()` 2-3x faster than `RegExp.test()` for simple substring matching

### Tertiary (evaluated and rejected)

- Fuse.js, FlexSearch, MiniSearch documentation — evaluated and rejected; fuzzy matching produces false positives for acronym/path-segment search; all are overkill for 500-item one-shot filtering

---

*Research completed: 2026-03-27*
*Ready for roadmap: yes*
