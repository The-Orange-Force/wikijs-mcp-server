# Phase 28: Metadata Fallback Implementation - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Private `searchPagesByMetadata()` method wired into the `searchPages()` pipeline with deduplication, unpublished filtering, and limit enforcement. When GraphQL search returns fewer results than the requested limit, metadata fallback supplements results by matching the query against page paths and titles.

</domain>

<decisions>
## Implementation Decisions

### Matching behavior
- No minimum query length — run metadata fallback for any query length
- Pure substring matching always — no word-boundary splitting, even for short queries
- Match against title and path only — skip description field (too generic, adds noise)
- Full path string matching — no splitting on `/` segments
- Case-insensitive via `toLowerCase()` + `includes()` — no regex

### Result ordering
- GraphQL results always come first, metadata results appended after
- Within metadata results: title matches ranked before path-only matches
- Within each tier (title / path-only): keep pages.list UPDATED order (recently updated first)
- Same title > path priority applies even when GraphQL returns 0 results

### Data sharing
- `resolveViaPagesList()` return type changes to `{ resolved, dropped, allPages }` — exposes the already-fetched pages array
- `searchPagesByMetadata()` accepts an optional `allPages` parameter — uses cached data when available, fetches independently when not
- When GraphQL returns 0 results (early return path): skip steps 2-3, metadata fallback fetches pages.list directly
- When all singleByPath succeed but `resolved.length < limit`: metadata fallback fetches pages.list independently (no cached data from resolveViaPagesList)

### totalHits adjustment
- `totalHits = Math.max(originalTotalHits, mergedResults.length)` — never decreases, reflects actual available results
- No extra signal to callers that metadata fallback was used — `PageSearchResult` type unchanged
- Logging of fallback activity deferred to Phase 29

### Claude's Discretion
- Exact implementation of the title-match vs path-match partitioning
- Whether to pre-lowercase page fields once during iteration or inline
- Internal cap on metadata results before final limit enforcement (e.g., 50 or 100)
- Error handling for pages.list failures within metadata fallback

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `resolveViaPagesList()` (api.ts:128): Already fetches `pages.list(500, UPDATED)` — return type will be extended to expose `allPages`
- `requestContext.getStore()` (request-context.ts): AsyncLocalStorage-based structured logging — used for fallback log points
- `WikiJsPage` type (types.ts): Already has `id`, `path`, `title`, `isPublished` fields needed for matching and filtering
- `PageSearchResult` type (types.ts): `{ results: WikiJsPage[], totalHits: number }` — unchanged

### Established Patterns
- Pipeline extension pattern: Steps 1-3 unchanged, step 4 added conditionally
- Private method on WikiJsApi: Same pattern as `resolveViaPagesList()` and `resolvePageByPath()`
- `isPublished === true` filter: Used in `listPages()` (api.ts:99-101) — same filter needed in metadata fallback

### Integration Points
- `searchPages()` early return at line 194: Must be modified to route to metadata fallback instead of returning empty
- `searchPages()` after step 3: New step 4 checks `resolved.length < limit` and triggers metadata fallback
- `resolveViaPagesList()` return value: Extended to include `allPages` for data sharing

</code_context>

<specifics>
## Specific Ideas

- The primary use case is acronym searches (e.g., "COA", "ZDG", "DSM") that return zero GraphQL results because the search engine stems or ignores short tokens
- Path segment searches ("mendix" for pages at `mendix/best-practices`) are the secondary use case
- Description matching explicitly excluded to reduce false positives — titles and paths are more reliable signals

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 28-metadata-fallback-implementation*
*Context gathered: 2026-03-28*
