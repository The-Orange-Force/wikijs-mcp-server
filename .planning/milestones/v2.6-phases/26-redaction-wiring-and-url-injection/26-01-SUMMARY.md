---
phase: 26-redaction-wiring-and-url-injection
plan: 01
subsystem: config
tags: [url, locale, zod, config, encodeURIComponent, vitest, tdd]

# Dependency graph
requires: []
provides:
  - "buildPageUrl(baseUrl, locale, path) helper for wiki page URL construction"
  - "WIKIJS_LOCALE env var with Zod default 'en' in wikijs config group"
  - "WIKIJS_BASE_URL trailing slash normalization in Zod transform"
  - "8 URL unit tests and 6 config unit tests"
affects: [26-02-PLAN, 27-path-filter-removal]

# Tech tracking
tech-stack:
  added: []
  patterns: ["per-segment encodeURIComponent for URL path encoding", "Zod transform trailing slash normalization"]

key-files:
  created:
    - src/url.ts
    - src/__tests__/url.test.ts
  modified:
    - src/config.ts
    - tests/config.test.ts
    - .env.example

key-decisions:
  - "buildPageUrl uses per-segment encodeURIComponent to preserve / separators while encoding special chars and non-ASCII"
  - "WIKIJS_LOCALE defaults to 'en' and sits in wikijs config group alongside baseUrl and token"
  - "Trailing slash normalization uses regex replace in Zod transform (single pass at config load time)"

patterns-established:
  - "URL construction helper as single-purpose module (src/url.ts) following gdpr.ts convention"
  - "Config extension via Zod .default() and .transform() for new env vars"

requirements-completed: [URL-02]

# Metrics
duration: 2min
completed: 2026-03-27
---

# Phase 26 Plan 01: Config Extension and buildPageUrl Summary

**buildPageUrl() helper with per-segment URL encoding, WIKIJS_LOCALE config with default 'en', and WIKIJS_BASE_URL trailing slash normalization via Zod transform**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-27T20:37:18Z
- **Completed:** 2026-03-27T20:39:18Z
- **Tasks:** 1 (TDD RED + GREEN; no refactor needed)
- **Files modified:** 5

## Accomplishments
- Created `src/url.ts` with `buildPageUrl(baseUrl, locale, path)` that encodes each path segment individually via `encodeURIComponent`, preserving `/` separators
- Extended `src/config.ts` Zod schema with `WIKIJS_LOCALE` (default "en") and trailing slash normalization on `WIKIJS_BASE_URL`
- Added locale to `logConfig()` startup diagnostics and documented `WIKIJS_LOCALE` in `.env.example`
- 14 new tests (8 URL + 6 config) all passing; full suite green (410/411, pre-existing docker test excluded)
- TypeScript compiles cleanly with no errors

## Task Commits

Each task was committed atomically:

1. **RED: Failing tests for buildPageUrl and config extensions** - `650e691` (test)
2. **GREEN: Implement buildPageUrl and config extensions** - `913fa24` (feat)

_No refactor commit needed -- code was clean after GREEN phase._

## Files Created/Modified
- `src/url.ts` - New module: `buildPageUrl(baseUrl, locale, path)` helper with per-segment encoding
- `src/__tests__/url.test.ts` - 8 unit tests covering basic paths, leading slashes, special chars, non-ASCII, empty segments, locale
- `src/config.ts` - Added `WIKIJS_LOCALE` to Zod schema with default "en", trailing slash normalization in transform, locale in logConfig
- `tests/config.test.ts` - 6 new tests in 2 describe blocks: WIKIJS_LOCALE (3 tests) and trailing slash normalization (3 tests)
- `.env.example` - Added commented `WIKIJS_LOCALE=en` entry with description

## Decisions Made
- Used per-segment `encodeURIComponent` (split on `/`, filter empty, encode each, rejoin) rather than encoding the full path -- avoids encoding `/` separators
- Placed `WIKIJS_LOCALE` after `WIKIJS_TOKEN` in the Zod schema for logical grouping with other Wiki.js config vars
- Trailing slash normalization uses `replace(/\/+$/, "")` in the Zod `.transform()` step -- single pass at config load time, not repeated per URL construction

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

Pre-existing test failure in `tests/docker-config.test.ts` (missing `instructions.txt` file at repo root) -- unrelated to this plan's changes. 410 of 411 total tests pass.

## User Setup Required

None -- no external service configuration required. `WIKIJS_LOCALE` defaults to "en" if not set.

## Next Phase Readiness
- `buildPageUrl()` is exported from `src/url.ts` and ready for Plan 02 to wire into the `get_page` handler
- Import path for Plan 02: `import { buildPageUrl } from "./url.js"`
- Config now includes `config.wikijs.locale` and `config.wikijs.baseUrl` (trailing-slash-normalized) for Plan 02's handler integration
- `AppConfig` type automatically updated via `z.output<typeof envSchema>` -- no manual type changes needed

## Self-Check: PASSED

- FOUND: src/url.ts
- FOUND: src/__tests__/url.test.ts
- FOUND: src/config.ts
- FOUND: tests/config.test.ts
- FOUND: .env.example
- FOUND: .planning/phases/26-redaction-wiring-and-url-injection/26-01-SUMMARY.md
- FOUND: commit 650e691 (RED: failing tests)
- FOUND: commit 913fa24 (GREEN: implementation)

---
*Phase: 26-redaction-wiring-and-url-injection*
*Completed: 2026-03-27*
