---
phase: 15-api-layer-consolidation
plan: 01
subsystem: api
tags: [graphql, typescript, wiki.js, mcp, consolidation]

# Dependency graph
requires: []
provides:
  - "WikiJsPage interface with isPublished (required) and content (optional)"
  - "Consolidated getPageById returning all 8 fields in single GraphQL call"
  - "listPages method with includeUnpublished filter replacing getPagesList + getAllPagesList"
  - "PageSearchResult type for Plan 02 search consolidation"
affects: [15-02-search-resolution, 16-tool-registration-consolidation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Client-side filtering for isPublished on GraphQL list results"
    - "Single GraphQL call for full page data (metadata + content + status)"

key-files:
  created:
    - tests/api.test.ts
  modified:
    - src/types.ts
    - src/api.ts
    - src/mcp-tools.ts
    - tests/helpers/build-test-app.ts
    - tests/smoke.test.ts
    - tests/scopes.test.ts
    - tests/observability.test.ts
    - tests/discovery.test.ts
    - tests/authorize.test.ts
    - tests/oauth-proxy-discovery.test.ts
    - src/oauth-proxy/__tests__/scope-mapper.test.ts

key-decisions:
  - "Kept searchUnpublishedPages/forceDeletePage/getPageStatus/publishPage on WikiJsApi (still called by retained methods, full removal deferred)"
  - "Updated mcp-tools.ts list_pages handler to call listPages instead of getAllPagesList (Rule 3: blocking caller)"
  - "Updated test assertions for 3-tool and single-scope model to align with already-committed consolidation"

patterns-established:
  - "WikiJsApi unit tests mock graphql-request module with class-based MockGraphQLClient"
  - "listPages uses client-side filtering (GraphQL fetches all, JS filters by isPublished)"

requirements-completed: [TOOL-01, TOOL-02]

# Metrics
duration: 9min
completed: 2026-03-26
---

# Phase 15 Plan 01: API Layer Consolidation Summary

**Consolidated getPageById (single call with content + isPublished) and listPages (replacing getPagesList + getAllPagesList with includeUnpublished filter), with 8 unit tests and full suite of 220 tests green**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-26T13:59:20Z
- **Completed:** 2026-03-26T14:08:35Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- WikiJsPage interface updated: `isPublished` required, `content` optional, `description`/`createdAt`/`updatedAt` required, `url` removed
- `getPageById` now returns all 8 fields (id, path, title, description, content, isPublished, createdAt, updatedAt) in a single GraphQL call
- `listPages` replaces both `getPagesList` and `getAllPagesList` with client-side `includeUnpublished` filtering
- 8 new unit tests in `tests/api.test.ts` covering query structure, field selection, and filtering logic
- Full test suite passes: 220 tests across 16 files, 0 failures

## Task Commits

Each task was committed atomically:

1. **Task 1 (TDD RED): Failing tests for getPageById and listPages** - `205d276` (test)
2. **Task 1 (TDD GREEN): Implement consolidated API methods** - `26743da` (feat)
3. **Task 2: Update mock stubs and fix existing test suite** - `f6e0bc8` (fix)
4. **Task 2 (continued): Align scope-related tests with single-scope model** - `851ad2f` (fix)

_TDD task had separate RED and GREEN commits._

## Files Created/Modified
- `src/types.ts` - WikiJsPage interface with isPublished (required), content (optional), PageSearchResult type added
- `src/api.ts` - getPageById consolidated, getPageContent/getPagesList/getAllPagesList removed, listPages added
- `src/mcp-tools.ts` - list_pages handler updated to call listPages instead of getAllPagesList
- `tests/api.test.ts` - NEW: 8 unit tests for getPageById and listPages with mocked GraphQL client
- `tests/helpers/build-test-app.ts` - mockWikiJsApi updated with new method signatures
- `tests/smoke.test.ts` - mockWikiJsApi updated, tool count assertions updated to 3 tools
- `tests/scopes.test.ts` - Assertions updated to match single wikijs:read scope model
- `tests/observability.test.ts` - list_users test replaced with list_pages test
- `tests/discovery.test.ts` - Scope count assertion updated to 1
- `tests/authorize.test.ts` - Removed wikijs:write scope reference
- `tests/oauth-proxy-discovery.test.ts` - Scope count assertion updated to 1
- `src/oauth-proxy/__tests__/scope-mapper.test.ts` - Updated for single-scope mapping behavior

## Decisions Made
- Kept `searchUnpublishedPages`, `forceDeletePage`, `getPageStatus`, `publishPage` methods on WikiJsApi as they are still called internally; full removal deferred
- `getPageStatus` simplified to delegate to `getPageById` (which now includes isPublished) rather than maintaining a duplicate GraphQL query
- Updated `mcp-tools.ts` caller to avoid build breakage when `getAllPagesList` was removed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated mcp-tools.ts list_pages handler**
- **Found during:** Task 1 (GREEN phase implementation)
- **Issue:** Removing `getAllPagesList` from api.ts broke the `list_pages` tool handler in mcp-tools.ts which called it
- **Fix:** Updated handler to call `listPages()` instead, removed the TODO comment about this change
- **Files modified:** src/mcp-tools.ts
- **Verification:** `npx tsc --noEmit` passes, full test suite passes
- **Committed in:** 26743da (Task 1 GREEN commit)

**2. [Rule 1 - Bug] Fixed smoke/scopes/observability test assertions for 3-tool model**
- **Found during:** Task 2 (full suite verification)
- **Issue:** Tests expected 17 tools and specific tool names (list_users, get_page_content, etc.) but mcp-tools.ts and scopes.ts were already consolidated to 3 read-only tools in prior commits
- **Fix:** Updated test assertions to expect 3 tools, replaced list_users tests with list_pages
- **Files modified:** tests/smoke.test.ts, tests/scopes.test.ts, tests/observability.test.ts
- **Verification:** Full test suite passes (220/220)
- **Committed in:** f6e0bc8 (Task 2 commit)

**3. [Rule 1 - Bug] Fixed scope-related tests for single wikijs:read scope model**
- **Found during:** Task 2 (full suite verification, second round)
- **Issue:** Discovery, authorize, oauth-proxy-discovery, and scope-mapper tests still referenced wikijs:write and wikijs:admin scopes that were removed from SCOPES constant
- **Fix:** Updated all affected test files to expect single wikijs:read scope
- **Files modified:** tests/discovery.test.ts, tests/authorize.test.ts, tests/oauth-proxy-discovery.test.ts, src/oauth-proxy/__tests__/scope-mapper.test.ts
- **Verification:** Full test suite passes (220/220)
- **Committed in:** 851ad2f

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 bug)
**Impact on plan:** All fixes necessary to maintain a green build after prior consolidation commits. No scope creep.

## Issues Encountered
None -- plan executed smoothly once blocking callers were identified.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- API layer for pages is consolidated with getPageById and listPages
- PageSearchResult type is available for Plan 02 (search resolution)
- searchPages method in api.ts is ready for Plan 02 consolidation
- Full test suite green (220/220), TypeScript compiles cleanly

## Self-Check: PASSED

All files exist, all commits verified, all tests pass.

---
*Phase: 15-api-layer-consolidation*
*Completed: 2026-03-26*
