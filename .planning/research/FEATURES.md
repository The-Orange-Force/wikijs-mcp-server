# Feature Research

**Domain:** Metadata search fallback for MCP server search pipeline
**Researched:** 2026-03-27
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

These are the minimum features required for a metadata search fallback that actually solves the problem. Missing any one of these would leave the fallback broken or misleading.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Metadata fallback trigger when GraphQL search returns insufficient results** | The entire reason this feature exists. Wiki.js `pages.search` uses a full-text search index that fails on acronyms (e.g., "COA", "ZDG"), short tokens (2-3 chars), and path segments that the search engine tokenizer does not index. When the search engine returns 0 results, the fallback must activate to search page metadata (path, title, description) directly. | MEDIUM | Trigger condition: GraphQL `pages.search` returns 0 results (or fewer results than the requested limit -- but 0-result trigger is simpler and avoids over-eagerness). The fallback calls `pages.list` (already used by the existing ID resolution fallback) and filters client-side. |
| **Case-insensitive substring matching on path, title, and description** | Users search with varying casing ("coa", "COA", "Coa"). Path segments use mixed casing (`Projects/ClientName`). Titles may use title case. The matching must be case-insensitive to avoid false negatives. Substring matching (not word-boundary or exact match) is essential because acronyms often appear as substrings in paths like `clients/coa-project`. | LOW | `field.toLowerCase().includes(query.toLowerCase())` on each of the three fields (path, title, description). Simple string operation -- no regex needed for the core case. |
| **Deduplication when merging primary and fallback results** | If the GraphQL search returns some results (say 2 out of 10 requested) and the metadata fallback finds additional matches, the same page could appear in both sets. Duplicate pages in the response waste the AI assistant's context window and look broken. Deduplicate by page `id` (the canonical integer database ID after resolution). | LOW | Build a `Set<number>` of IDs from primary results. Filter fallback results to exclude IDs already present. This is O(n) and trivial to implement. |
| **Unpublished-page filtering in fallback results** | The existing `pages.list` call returns both published and unpublished pages. The search tool's contract is "Only searches published pages" (per the tool description). The metadata fallback must honor this contract by filtering `isPublished === true`. | LOW | Already implemented for `listPages()` in `api.ts` -- the same filter pattern applies. The `pages.list` response includes the `isPublished` field. |
| **Limit enforcement on combined results** | The `search_pages` tool accepts a `limit` parameter (default 10, max 50). The combined result set (primary + fallback) must not exceed this limit. Without enforcement, the fallback could return hundreds of metadata matches and blow up the response. | LOW | Slice the combined results array to the requested limit after merging and deduplication. Primary results take priority (appear first), fallback results fill remaining slots. |
| **Updated tool description reflecting fallback capability** | The `search_pages` tool description currently says "Search Wiki.js pages by keyword query" with no mention of metadata fallback. AI assistants rely on tool descriptions to decide when and how to use tools. An accurate description helps the AI understand that short queries and acronyms will work. | LOW | Update the description string in `mcp-tools.ts` to mention that the search supplements full-text results with title/path/description matching when the search index returns insufficient results. |
| **Structured logging for fallback activity** | Operators need visibility into when and why the fallback activates. Without logging, failures in the fallback path would be invisible, and operators cannot assess whether the fallback is providing value or creating performance issues. | LOW | Log at `info` level when fallback activates: `{ query, primaryResultCount, fallbackResultCount, totalAfterDedup }`. Log at `debug` level for fallback details. Use the existing `requestContext` + pino pattern. |

### Differentiators (Competitive Advantage)

Features beyond the minimum that improve quality, relevance, or developer experience. Not required for the fallback to function, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Multi-token query splitting** | When a user searches "mendix best practices", the full substring unlikely matches any single metadata field. Splitting the query into individual tokens and matching pages where ALL tokens appear (across any combination of path, title, description) dramatically improves recall. | MEDIUM | Split query on whitespace. For each page, check that every token appears in at least one of the three metadata fields (case-insensitive). This is an AND-join across tokens, not OR. OR would return too many results. |
| **Path segment matching** | Wiki.js paths use `/` as a separator (e.g., `clients/coa/contracts`). Matching against individual path segments rather than the full path string would catch queries like "coa" matching the segment `coa` without also matching paths that happen to contain "coa" as a substring of another word (e.g., "coaching"). | LOW | Split path on `/`, check if any segment includes the query. This is a refinement of substring matching for the path field specifically. However, the current project scope says "case-insensitive substring matching" which is simpler and broader. Path segment matching could be a later refinement. |
| **Relevance-weighted ordering of fallback results** | Not all metadata matches are equally relevant. A title match ("COA Project Guide") is more relevant than a description substring match. Ordering fallback results by match quality improves the AI assistant's ability to find the right page. | MEDIUM | Weight: title exact match > title substring > path segment match > description substring. Assign a simple numeric score and sort descending. This is purely client-side -- no search engine involved. |
| **Configurable fallback threshold** | Instead of triggering only on 0 results, allow configuration of a minimum result count threshold (e.g., "trigger fallback if fewer than 3 results"). This handles the case where the search engine returns a few low-quality results but misses obvious metadata matches. | LOW | Add an optional threshold parameter (default: 0, meaning only trigger on empty results). A sensible default like 0 keeps behavior simple and predictable. The threshold could be bumped later if operators observe the fallback would have helped. |
| **Metadata cache to avoid redundant pages.list calls** | The metadata fallback calls `pages.list` on every invocation. If search is called frequently, this creates redundant GraphQL requests. A short-lived in-memory cache (TTL 30-60 seconds) of the `pages.list` response would reduce load on Wiki.js without stale data risk. | MEDIUM | Simple `Map` with a timestamp check. Since the MCP server is stateless per-request (no SSE sessions), the cache lives in the `WikiJsApi` instance (which persists across requests). The existing `resolveViaPagesList` already calls `pages.list` with `limit: 500` -- the fallback could reuse the same call. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems. Each is explicitly scoped out with rationale.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Full content search in the fallback** | When metadata matching fails, searching page content would catch more results. | Fetching full content for all pages via `pages.list` would require N additional `getPageById` calls (one per page). For a 500-page wiki, this is 500 GraphQL round-trips per search query. Completely impractical. The existing search engine already does content search -- if it missed the query, client-side content search cannot do better without an index. | Rely on the GraphQL search engine for content search. The metadata fallback supplements it for metadata-specific queries (acronyms, path segments) that the search engine misses. |
| **Fuzzy/Levenshtein matching** | Catches typos like "mendx" matching "mendix". | Fuzzy matching on 500 pages across 3 fields per page creates a combinatorial explosion of false positives. The search engine already handles fuzzy matching for content search. Adding another fuzzy layer for metadata creates unpredictable and confusing results. | Use exact substring matching for metadata. If the user typos a query, the search engine handles it. The metadata fallback is for structured tokens the search engine misses, not for typo correction. |
| **Regex-based query syntax** | Power users want to search with patterns like `client-.*-2024`. | Regex support exposes the server to ReDoS attacks via malicious patterns, adds complexity to input validation, and breaks the simple mental model of "type keywords, get results." The Zod schema validates `query` as a plain string -- adding regex support would change the contract. | Keep the query as a plain string. If structured search is needed, add specific filter parameters (e.g., `pathPrefix`) rather than exposing regex. |
| **Separate `search_metadata` tool** | Creating a new MCP tool specifically for metadata search would give AI assistants explicit control over when to use metadata vs. full-text search. | Adding a 4th tool increases the decision burden on the AI assistant. The assistant would need to decide between `search_pages` and `search_metadata` for every query, often guessing wrong. A single `search_pages` tool with internal fallback logic is simpler for the AI and for operators. The tool count is a design constraint (currently 3 tools -- get, list, search). | Keep one `search_pages` tool with the fallback built in. The tool description tells the AI what it does; the fallback is an internal implementation detail. |
| **Indexing page content for client-side full-text search** | Building an in-memory search index (using something like Fuse.js or MiniSearch) from fetched page content to provide better search than Wiki.js natively offers. | The MCP server is a lightweight proxy, not a search engine. Maintaining an in-memory index requires fetching all page content at startup (slow, memory-heavy), keeping it synchronized (Wiki.js has no change notification API), and handling index corruption gracefully. This is a rewrite of the search architecture, not a fallback. | Let Wiki.js own content search. The metadata fallback addresses the specific gap of acronyms and path tokens. If search quality is broadly insufficient, the solution is to configure Wiki.js's search backend (PostgreSQL full-text, Elasticsearch, Algolia) rather than duplicating search in the MCP server. |
| **Fallback to HTTP page scraping** | If GraphQL search and metadata matching both fail, scrape pages via HTTP to search their rendered content. | HTTP scraping is fragile (depends on Wiki.js HTML structure), slow (N HTTP requests), and duplicates what the search engine does. It also introduces a dependency on Wiki.js's HTML rendering pipeline, which could change between versions. The original codebase had an HTTP content search path that was removed as unreliable. | If both search and metadata fail, return 0 results honestly. An empty result is better than slow, unreliable scraping results. |

## Feature Dependencies

```
Existing pages.list call (resolveViaPagesList)
    |
    +-- reused by --> Metadata fallback data source
                          |
                          +-- requires --> Case-insensitive substring matching logic
                          |
                          +-- requires --> Unpublished-page filtering (already exists)
                          |
                          +-- requires --> Deduplication by page ID
                          |
                          +-- requires --> Limit enforcement on merged results

Metadata fallback activation
    |
    +-- requires --> Trigger condition (0-result check after GraphQL search)
    |
    +-- produces --> Combined results fed to existing response serialization

Updated tool description
    +-- independent of --> All implementation features (text-only change)

Structured logging
    +-- requires --> requestContext / pino (already exists)
    +-- independent of --> Matching logic
```

### Dependency Notes

- **Metadata fallback reuses `pages.list`:** The existing `resolveViaPagesList` private method already calls `pages.list(limit: 500)` to batch-resolve unresolvable search IDs. The metadata fallback needs the same data. This is an opportunity to avoid a redundant GraphQL call by sharing the fetched page list between both resolution paths.
- **Deduplication requires primary results to be resolved first:** The deduplication set is built from primary results (which have already gone through the `singleByPath` + `pages.list` resolution pipeline). The fallback results are then filtered against this set. This means the fallback MUST run after primary resolution completes, not in parallel.
- **Tool description update is independent:** It can be shipped with the implementation or separately. No code dependency.

## MVP Definition

### Launch With (v2.7)

Minimum viable metadata search fallback -- what is needed to solve the acronym/short-token search gap.

- [x] **0-result trigger condition** -- When `pages.search` returns 0 results, invoke the metadata fallback before returning an empty response
- [x] **Case-insensitive substring matching on path, title, description** -- Filter `pages.list` results where the query appears as a substring in any of the three metadata fields
- [x] **Deduplication by page ID** -- Prevent duplicates when primary and fallback results overlap (relevant if the trigger threshold is changed later)
- [x] **Unpublished-page filtering** -- Apply `isPublished === true` filter to fallback results
- [x] **Limit enforcement** -- Combine primary + fallback results, slice to the requested limit
- [x] **Updated tool description** -- Reflect the fallback capability so AI assistants know short queries work
- [x] **Structured logging** -- Log fallback activation with query, result counts, and timing

### Add After Validation (v2.7.x)

Features to add once the core fallback is working and operators have observed its behavior in production.

- [ ] **Multi-token query splitting** -- If single-token substring matching proves insufficient for multi-word queries, split on whitespace and AND-match across tokens
- [ ] **Relevance-weighted ordering** -- If AI assistants consistently pick the wrong page from fallback results, add title > path > description weighting
- [ ] **Configurable fallback threshold** -- If operators observe cases where the search engine returns 1-2 low-quality results and the metadata fallback would have helped, add a configurable threshold

### Future Consideration (v2.8+)

Features to defer until the metadata fallback has proven its value.

- [ ] **Metadata cache** -- If monitoring shows `pages.list` calls are a performance bottleneck due to frequent search queries, add a short-TTL in-memory cache
- [ ] **Path segment matching** -- If substring matching on paths produces too many false positives (e.g., "coa" matching "coaching"), refine to segment-aware matching

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| 0-result trigger condition | HIGH | LOW | P1 |
| Case-insensitive substring matching | HIGH | LOW | P1 |
| Deduplication by page ID | HIGH | LOW | P1 |
| Unpublished-page filtering | HIGH | LOW | P1 |
| Limit enforcement | HIGH | LOW | P1 |
| Updated tool description | MEDIUM | LOW | P1 |
| Structured logging | MEDIUM | LOW | P1 |
| Multi-token query splitting | MEDIUM | MEDIUM | P2 |
| Relevance-weighted ordering | LOW | MEDIUM | P2 |
| Configurable fallback threshold | LOW | LOW | P3 |
| Metadata cache | LOW | MEDIUM | P3 |
| Path segment matching | LOW | LOW | P3 |

**Priority key:**
- P1: Must have for v2.7 launch -- solves the core problem
- P2: Should have, add after v2.7 if operators observe gaps
- P3: Nice to have, future consideration based on production telemetry

## Implementation Context

### How the Existing Search Pipeline Works

The current `searchPages` method in `api.ts` follows a multi-step resolution pipeline:

1. **GraphQL `pages.search`** -- Executes the full-text search query, returns results with search index IDs (not database IDs), paths, titles, and descriptions
2. **`singleByPath` resolution** -- For each result, resolves the path to a real database page via `pages.singleByPath` (requires admin-level API permissions)
3. **`pages.list` fallback for unresolved IDs** -- When `singleByPath` fails (permission issues), batch-resolves via `pages.list(limit: 500)` and matches by path

The metadata search fallback inserts a new step between the existing pipeline and the empty-result return:

1. GraphQL `pages.search` -- (existing)
2. `singleByPath` resolution -- (existing)
3. `pages.list` fallback for ID resolution -- (existing)
4. **NEW: If 0 results after resolution, metadata search against `pages.list` data**
5. Merge, deduplicate, limit-enforce, return

### Why the Gap Exists

Wiki.js's search engine (regardless of backend -- Basic, PostgreSQL, Elasticsearch) tokenizes and indexes page content. Short tokens like acronyms ("COA", "ZDG"), single characters, and path segment names are often:

- Below the minimum token length threshold (many search engines skip tokens < 3 chars)
- Not indexed because they are common stopwords or too short
- Split differently by the tokenizer than the user expects (e.g., "DSM-Firmenich" might be tokenized as "DSM" and "Firmenich" separately)

The metadata fields (path, title, description) are structured data that can be matched with simple string operations, bypassing the search engine's tokenization entirely. This is why a metadata fallback works: it is not trying to replace the search engine but to cover the specific cases where tokenized full-text search fails.

### Data Source for Metadata Fallback

The `pages.list(limit: 500, orderBy: UPDATED)` call is already made by the existing `resolveViaPagesList` method. For the metadata fallback, the same call provides the data -- there is an opportunity to share this call rather than making a redundant request. The `pages.list` response includes `id`, `path`, `title`, `description`, `isPublished`, `createdAt`, and `updatedAt` -- exactly the fields needed for metadata matching and for the response.

The limit of 500 is a practical ceiling. For wikis with more than 500 pages, the metadata fallback will only search the 500 most recently updated pages. This is acceptable because:
- Most company wikis have fewer than 500 published pages
- Recently updated pages are more likely to be relevant
- The fallback is a supplement, not a replacement for the search engine

## Sources

### Wiki.js Search Architecture
- [Wiki.js GraphQL API](https://docs.requarks.io/dev/api) -- Official API documentation
- [Incorrect pages ID when searching on PostgreSQL (Issue #2938)](https://github.com/Requarks/wiki/issues/2938) -- Confirms search IDs are not database IDs; this is the root cause of the existing `singleByPath` resolution pipeline
- [Search page content through GraphQL API (Discussion #7335)](https://github.com/requarks/wiki/discussions/7335) -- Confirms `singleByPath` requires admin privileges; documents the search-then-resolve pattern

### Fallback Search Patterns
- [Elasticsearch fallback query proposal (Issue #51840)](https://github.com/elastic/elasticsearch/issues/51840) -- Canonical proposal for fallback queries: run fallback only when primary returns too few results; fallback hits listed after primary hits; deduplication needed
- [Empathy Platform: Search Fallback Features](https://docs.empathy.co/play-with-empathy-platform/configure-empathy-platform/configure-search-service/search-fallback-features.html) -- Fallback activates on 0 results; two strategies: spell check (query correction) and partial results (query splitting)
- [Verbolia: Fallback Search in Ecommerce](https://www.verbolia.com/the-power-of-fallback-search-in-ecommerce/) -- Fallback search shows related results instead of empty page; reduces user frustration

### MCP Tool Design
- [MCP Tool Descriptions Best Practices (Merge.dev)](https://www.merge.dev/blog/mcp-tool-description) -- Tool descriptions should be concise, mention capabilities, guide the AI assistant
- [MCP Specification: Tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) -- Tool definition structure, annotations, schema requirements

---
*Feature research for: v2.7 Metadata Search Fallback*
*Researched: 2026-03-27*
