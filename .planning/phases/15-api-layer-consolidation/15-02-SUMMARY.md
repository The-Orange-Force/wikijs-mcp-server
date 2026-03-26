---
phase: 15-api-layer-consolidation
plan: 02
subsystem: api
tags: [graphql, typescript, wiki.js, search, promise-allsettled, id-resolution]

# Dependency graph
requires:
  - phase: 15-01
    provides: "WikiJsPage interface with isPublished/content, consolidated getPageById and listPages, PageSearchResult type stub"
provides:
  - "searchPages with singleByPath ID resolution and pages.list fallback"
  - "resolvePageByPath private method for path-to-page lookup"
  - "resolveViaPagesList private batch fallback method"
  - "PageSearchResult interface in types.ts"
  - "Bridge fix in mcp-tools.ts search_pages handler for new return shape"
affects: [16-tool-registration-consolidation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Promise.allSettled for parallel singleByPath resolution with per-result error handling"
    - "Two-tier fallback: singleByPath first, then pages.list batch cross-reference"
    - "Server-side warning logging for dropped search results via requestContext"

key-files:
  created: []
  modified:
    - src/api.ts
    - src/types.ts
    - src/mcp-tools.ts
    - tests/api.test.ts
    - tests/helpers/build-test-app.ts
    - tests/smoke.test.ts

key-decisions:
  - "PageSearchResult interface added in this plan (was declared in Plan 01 summary but not actually on disk)"
  - "Bridge fix in mcp-tools.ts handler extracts .results from PageSearchResult to keep existing tool output format"
  - "pages.list fallback uses limit 500 to cover typical corporate wikis"
  - "Consolidated permission warning logged when all singleByPath calls fail"

patterns-established:
  - "Two-tier ID resolution: singleByPath (parallel) then pages.list (batch fallback)"
  - "Promise.allSettled for graceful partial failure in parallel API calls"
  - "requestContext.getStore()?.log.warn for server-side operational warnings in API layer"

requirements-completed: [SRCH-01, SRCH-02]

# Metrics
duration: 3min
completed: 2026-03-26
---

# Phase 15 Plan 02: Search ID Resolution Summary

**searchPages resolves search index IDs to real database page IDs via parallel singleByPath + pages.list batch fallback, with 7 new unit tests and 227 total tests passing**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-26T14:11:55Z
- **Completed:** 2026-03-26T14:15:10Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- searchPages now returns `{ results: WikiJsPage[], totalHits: number }` with real database page IDs (Int) instead of search index IDs (String)
- singleByPath resolution runs in parallel via Promise.allSettled for each search result
- pages.list batch fallback resolves remaining results when singleByPath fails, with only one API call regardless of how many results need fallback
- Unresolvable results are silently dropped from the response with server-side warning logs for each dropped result
- Bridge fix in mcp-tools.ts keeps the search_pages tool output as an array during Phase 15-16 transition
- Full test suite passes: 227 tests across 16 files, 0 failures

## Task Commits

Each task was committed atomically:

1. **Task 1 (TDD RED): Failing tests for search ID resolution** - `6bcd6b2` (test)
2. **Task 1 (TDD GREEN): Implement searchPages with singleByPath + pages.list fallback** - `ba6ad0e` (feat)
3. **Task 2: Update mock stubs and tool handler for PageSearchResult shape** - `bb155b3` (fix)

_TDD task had separate RED and GREEN commits._

## Files Created/Modified
- `src/types.ts` - Added PageSearchResult interface (was missing from Plan 01)
- `src/api.ts` - searchPages enhanced with resolvePageByPath, resolveViaPagesList, Promise.allSettled resolution, and requestContext warning logging
- `src/mcp-tools.ts` - Bridge fix: search_pages handler extracts .results from new PageSearchResult return type
- `tests/api.test.ts` - 7 new unit tests for searchPages covering resolution, fallback, dropped results, parallelism, empty search, fallback dedup, and locale passthrough
- `tests/helpers/build-test-app.ts` - mockWikiJsApi.searchPages returns PageSearchResult shape
- `tests/smoke.test.ts` - mockWikiJsApi.searchPages returns PageSearchResult shape

## Decisions Made
- PageSearchResult interface added to src/types.ts in this plan because it was declared complete in Plan 01 summary but was not actually present on disk (Rule 3: blocking dependency)
- Bridge fix in mcp-tools.ts uses `result.results` to maintain the existing array output format for the search_pages tool; Phase 16 will rewrite the handler entirely
- pages.list fallback uses limit 500 per CONTEXT.md discretion (balances coverage vs performance for typical corporate wikis)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added missing PageSearchResult interface to types.ts**
- **Found during:** Task 1 (before writing tests)
- **Issue:** Plan 01 summary claimed PageSearchResult was added to src/types.ts but it was not present on disk
- **Fix:** Added `export interface PageSearchResult { results: WikiJsPage[]; totalHits: number; }` to src/types.ts
- **Files modified:** src/types.ts
- **Verification:** TypeScript compiles, tests reference the type successfully
- **Committed in:** 6bcd6b2 (Task 1 RED commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to provide the type that both api.ts and tests depend on. No scope creep.

## Issues Encountered
None -- plan executed smoothly.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- API layer for pages is fully consolidated: getPageById, listPages, searchPages all return proper types
- searchPages returns PageSearchResult with resolved database IDs
- Phase 16 (tool registration consolidation) can now build on the complete API layer
- Bridge fix in mcp-tools.ts ensures tools work during transition; Phase 16 will do the full handler rewrite
- Full test suite green (227/227), TypeScript compiles cleanly

## Self-Check: PASSED

All files exist, all commits verified, all tests pass.

---
*Phase: 15-api-layer-consolidation*
*Completed: 2026-03-26*
