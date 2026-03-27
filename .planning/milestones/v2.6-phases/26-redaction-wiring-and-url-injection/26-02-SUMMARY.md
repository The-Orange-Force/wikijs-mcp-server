---
phase: 26-redaction-wiring-and-url-injection
plan: 02
subsystem: mcp-tools
tags: [redaction, url-injection, gdpr, mcp, handler-pipeline, vitest, tdd]

# Dependency graph
requires:
  - phase: 26-01
    provides: "buildPageUrl() helper and WIKIJS_LOCALE config with AppConfig type"
  - phase: 25-01
    provides: "redactContent() function and REDACTION_PLACEHOLDER constant"
provides:
  - "get_page handler with redactContent + buildPageUrl wired into pipeline"
  - "createMcpServer 3-param signature (wikiJsApi, instructions, config) across entire call chain"
  - "26 GDPR/URL/redaction tests covering handler behavior"
  - "instructions.txt.example with URL citation guidance"
affects: [27-path-filter-removal]

# Tech tracking
tech-stack:
  added: []
  patterns: ["explicit field ordering in JSON response objects", "pipeline pattern: fetch -> isBlocked -> redactContent -> buildPageUrl -> serialize"]

key-files:
  created: []
  modified:
    - src/mcp-tools.ts
    - src/routes/mcp-routes.ts
    - src/server.ts
    - tests/helpers/build-test-app.ts
    - src/__tests__/mcp-tools-gdpr.test.ts
    - instructions.txt.example

key-decisions:
  - "Null page from API now returns isError:true (accessing page.id on null throws, caught by handler catch block)"
  - "Error and blocked responses do NOT include url field -- only successful responses get URLs"
  - "Response field ordering: id, path, url, title, description, content, isPublished, createdAt, updatedAt"

patterns-established:
  - "Handler pipeline pattern: fetch -> guard -> transform -> enrich -> serialize"
  - "Config propagation: AppConfig flows from buildApp -> protectedRoutes -> createMcpServer -> handler closures"

requirements-completed: [URL-01, URL-02]

# Metrics
duration: 5min
completed: 2026-03-27
---

# Phase 26 Plan 02: Handler Wiring and Integration Tests Summary

**get_page handler wired with redactContent() for GDPR marker redaction and buildPageUrl() for direct wiki page URLs, with 26 comprehensive tests**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-27T20:41:51Z
- **Completed:** 2026-03-27T20:46:26Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Wired `redactContent()` and `buildPageUrl()` into the `get_page` handler pipeline with explicit field ordering
- Updated `createMcpServer` signature to 3 params and propagated `AppConfig` through the entire call chain (server.ts -> mcp-routes.ts -> mcp-tools.ts)
- Added 10 new tests: URL injection (3), redaction wiring (3), no-URL-on-error (2), tool description (2)
- Updated all 16 existing createMcpServer calls in GDPR test suite to 3-param signature
- Updated `instructions.txt.example` with URL citation guidance for AI assistants
- TypeScript compiles cleanly, 420/421 tests pass (pre-existing docker-config test excluded)

## Task Commits

Each task was committed atomically:

1. **Task 1: Update createMcpServer signature and wire handler pipeline** - `4c58380` (feat)
2. **Task 2: Integration tests for URL injection, redaction wiring, and instructions update** - `51878d1` (test)

## Files Created/Modified
- `src/mcp-tools.ts` - Added imports for AppConfig, redactContent, buildPageUrl; updated createMcpServer to 3-param; wired get_page handler pipeline with redaction + URL injection; updated tool description to mention url
- `src/routes/mcp-routes.ts` - Added config field to ProtectedRoutesOptions interface; destructured config and passed to createMcpServer
- `src/server.ts` - Added `config: appConfig` to protectedRoutes registration
- `tests/helpers/build-test-app.ts` - Added locale to makeTestConfig; added config to protectedRoutes registration
- `src/__tests__/mcp-tools-gdpr.test.ts` - Added testConfig constant; updated all createMcpServer calls to 3-param; added URL injection, redaction wiring, no-URL-on-error, and tool description test blocks; updated null-page test expectation
- `instructions.txt.example` - Added URL citation guidance line

## Decisions Made
- Null page from API now returns `isError:true` instead of stringified null -- accessing `page.id` on null throws TypeError caught by the handler's catch block; this is a safer behavior than returning raw null data
- Error and blocked responses intentionally exclude the `url` field per CONTEXT.md design
- Response uses explicit field ordering via object literal (id, path, url, title, description, content, isPublished, createdAt, updatedAt) rather than spreading the WikiJsPage interface

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added missing resourceDocsUrl to test config**
- **Found during:** Task 2
- **Issue:** AppConfig requires `resourceDocsUrl` field (can be undefined) but testConfig omitted it, causing TypeScript compilation error
- **Fix:** Added `resourceDocsUrl: undefined` to testConfig azure section
- **Files modified:** src/__tests__/mcp-tools-gdpr.test.ts
- **Verification:** TypeScript compiles cleanly
- **Committed in:** 51878d1 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor type completeness fix. No scope creep.

## Issues Encountered
- Pre-existing test failure in `tests/docker-config.test.ts` (missing `instructions.txt` file at repo root) -- unrelated to this plan's changes. 420 of 421 total tests pass.

## User Setup Required

None - no external service configuration required. All changes are internal code wiring.

## Next Phase Readiness
- Phase 26 is now complete -- both plans (config+URL helper and handler wiring) are done
- Phase 27 (path filter removal) can safely proceed: `isBlocked()` remains in place alongside marker-based redaction, providing defense-in-depth during transition
- `redactContent()` is fully integrated and tested end-to-end through the handler
- `buildPageUrl()` produces config-driven URLs in every successful get_page response

## Self-Check: PASSED

- FOUND: src/mcp-tools.ts
- FOUND: src/routes/mcp-routes.ts
- FOUND: src/server.ts
- FOUND: tests/helpers/build-test-app.ts
- FOUND: src/__tests__/mcp-tools-gdpr.test.ts
- FOUND: instructions.txt.example
- FOUND: .planning/phases/26-redaction-wiring-and-url-injection/26-02-SUMMARY.md
- FOUND: commit 4c58380 (Task 1: handler wiring)
- FOUND: commit 51878d1 (Task 2: integration tests)

---
*Phase: 26-redaction-wiring-and-url-injection*
*Completed: 2026-03-27*
