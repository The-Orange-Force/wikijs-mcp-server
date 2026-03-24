---
phase: 02-oauth-configuration
plan: 01
subsystem: auth
tags: [zod, jose, azure-ad, jwks, env-validation, config]

# Dependency graph
requires:
  - phase: 01-mcp-transport-port
    provides: Fastify server with MCP routes (buildServer pattern)
provides:
  - Zod-validated config module (src/config.ts) with AppConfig type
  - Azure AD env var validation (tenant ID, client ID, resource URL)
  - JWKS resolver initialized with Azure AD JWKS URI (jose createRemoteJWKSet)
  - Fail-fast startup with grouped error output for missing/invalid env vars
  - Config test suite with 11 validation test cases
affects: [02-oauth-configuration, 03-jwt-auth-middleware, 04-protected-resource-metadata]

# Tech tracking
tech-stack:
  added: [jose (^6.2.2 direct dependency)]
  patterns: [Zod schema with .transform() for derived config values, envSchema export for testability, module-level loadConfig with process.exit fail-fast]

key-files:
  created: [src/config.ts, tests/config.test.ts]
  modified: [src/server.ts, src/types.ts, example.env, package.json, vitest.config.ts]

key-decisions:
  - "envSchema exported separately for direct safeParse testing without triggering process.exit"
  - "vitest.config.ts provides test env vars so module-level loadConfig succeeds during import"
  - "z.output<typeof envSchema> used for AppConfig type (semantically correct for schemas with .transform)"
  - "Node engine bumped to >=20.0.0 for vitest v4 compatibility"

patterns-established:
  - "Config module pattern: Zod schema export + loadConfig() + fail-fast process.exit"
  - "Test env vars in vitest.config.ts for modules with module-level validation"
  - "maskValue helper for safe config logging"

requirements-completed: [CONF-01, CONF-02, CONF-03, CONF-04, CONF-05]

# Metrics
duration: 4min
completed: 2026-03-24
---

# Phase 02 Plan 01: OAuth Configuration Summary

**Zod-validated config module with Azure AD env vars, JWKS init via jose, and fail-fast startup validation**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-24T20:00:36Z
- **Completed:** 2026-03-24T20:04:40Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Created src/config.ts with Zod schema validating all env vars (PORT, WIKIJS_BASE_URL, WIKIJS_TOKEN, AZURE_TENANT_ID, AZURE_CLIENT_ID, MCP_RESOURCE_URL)
- Zod .transform() derives JWKS URI and issuer URL from tenant ID automatically
- jose createRemoteJWKSet initialized lazily with derived JWKS URI (no network call at creation)
- Fail-fast startup: grouped error output categorizing missing vs invalid vars, ending with "See example.env for required variables."
- 11 config validation tests covering valid parse, missing vars, invalid formats, derived values, PORT default, and error collection
- server.ts now imports validated config instead of inline env var loading
- Masked config logging at startup (logConfig helper)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install jose, create config module and config tests** - `98efd1c` (feat) -- TDD: RED/GREEN/REFACTOR
2. **Task 2: Wire config into server.ts, update example.env, clean up types.ts** - `dfd09b9` (feat)

_Note: Task 1 was TDD -- tests written first (RED), then config module (GREEN), then review (REFACTOR)._

## Files Created/Modified
- `src/config.ts` - Zod-validated config module with envSchema, AppConfig, config, jwks, logConfig, maskValue exports
- `tests/config.test.ts` - 11 test cases for config validation (valid parse, missing vars, invalid formats, derived values)
- `src/server.ts` - Replaced inline dotenv/env loading with config module import, logConfig at startup
- `src/types.ts` - Removed ServerConfig interface (replaced by AppConfig from config.ts)
- `example.env` - Added AZURE_TENANT_ID, AZURE_CLIENT_ID, MCP_RESOURCE_URL with descriptions
- `package.json` - jose added as direct dependency, engines updated to >=20.0.0
- `vitest.config.ts` - Added test env vars for module-level config parse during test import

## Decisions Made
- **envSchema testability:** Exported envSchema separately so tests can call safeParse() directly without triggering the module-level process.exit(1). Test env vars set in vitest.config.ts so the module-level loadConfig() succeeds during import.
- **z.output type:** Used `z.output<typeof envSchema>` instead of `z.infer` since the schema has .transform() -- semantically correct for the post-transform type.
- **Node engine bump:** Updated from >=18.0.0 to >=20.0.0 since vitest v4 requires Node 20+.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required. Users will need to set Azure AD env vars when deploying, but that is documented in example.env.

## Next Phase Readiness
- Config module ready for JWT middleware (Phase 03): `config.azure.clientId`, `config.azure.issuer`, and `jwks` exports are the inputs needed for token validation
- All 18 tests pass (11 config + 7 smoke)
- TypeScript compiles cleanly

## Self-Check: PASSED

All 8 files verified present. Both task commits (98efd1c, dfd09b9) verified in git log.

---
*Phase: 02-oauth-configuration*
*Completed: 2026-03-24*
