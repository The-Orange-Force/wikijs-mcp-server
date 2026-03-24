# Phase 8: Dead Code & Tech Debt Cleanup - Research

**Researched:** 2026-03-24
**Domain:** Codebase cleanup, dead code removal, stale reference correction
**Confidence:** HIGH

## Summary

Phase 8 is a cleanup phase with no new library requirements. The research focus is understanding the exact dead code inventory, dependency relationships between files, and the safe order of deletions. All findings come from direct codebase investigation -- no external library research was needed.

The codebase has four categories of dead code: (1) an orphaned module pair (`src/auth-errors.ts` + `tests/auth-errors.test.ts`), (2) stale `GET /mcp/events` references in JSDoc/endpoint listings, (3) two entirely unused legacy files (`src/tools.ts` at 65K and `src/schemas.ts` at 10K) with no imports anywhere, and (4) the `buildServer` legacy export in `server.ts` with no consumer. The SCOPE_TOOL_MAP and TOOL_SCOPE_MAP are explicitly preserved per user decision.

**Primary recommendation:** Delete orphaned files first, fix stale references second, then run full test suite. This ordering minimizes merge conflicts and isolates each category of change.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Comprehensive cleanup: go beyond the 4 audit items and sweep for all dead code, unused exports, orphaned files, unreachable code paths, and unused dependencies in package.json
- Aggressive deletions: if it's unused in production code, delete it. Tests that only test deleted code also get deleted
- Remove unused dependencies from package.json (e.g., Express, which is installed but unused per PROJECT.md)
- No untouchable files -- if nothing imports it, it's fair game for deletion
- Trust the analysis: no special exceptions or preserved-for-unknown-reasons files
- **Keep** SCOPE_TOOL_MAP and TOOL_SCOPE_MAP in src/scopes.ts -- they are the foundation for v2 per-tool scope enforcement (ADVN-01)
- **Keep** all tests in tests/scopes.test.ts intact (15+ assertions on map completeness, reverse lookup, per-scope tool assignments)
- Update ROADMAP.md success criteria to remove the "delete SCOPE_TOOL_MAP/TOOL_SCOPE_MAP" item
- Full sweep: grep for all endpoint references (route paths, JSDoc, comments, test descriptions) across the entire codebase and verify they match actual routes
- Fix stale references everywhere -- production code, tests, comments, JSDoc, description strings
- When touching JSDoc/comments with stale paths, also improve the clarity and accuracy of surrounding documentation (not just the path)
- Delete src/auth-errors.ts (183 lines) -- orphaned, no production consumer, parallel implementation in src/auth/errors.ts is the live path
- Delete tests/auth-errors.test.ts (149 lines) -- only tests the orphaned module

### Claude's Discretion
- Dead code detection methodology (static analysis, grep-based, or combination)
- Order of cleanup operations
- Which unused dependencies to remove (verify each before removing)
- How to handle any newly discovered dead code beyond audit items

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

## Dead Code Inventory

### Category 1: Orphaned Module (from audit)

| File | Lines | Status | Evidence |
|------|-------|--------|----------|
| `src/auth-errors.ts` | 183 | ORPHANED | Zero imports from any production file. Grep confirms no `from.*auth-errors` in `src/`. Parallel implementation at `src/auth/errors.ts` is the live path used by `src/auth/middleware.ts`. |
| `tests/auth-errors.test.ts` | 149 | DEAD | Only tests `src/auth-errors.ts`. No other test file references it. |

**Total: 332 lines to delete.**

### Category 2: Stale References (from audit)

| File | Line | Current Text | Correct Text |
|------|------|--------------|--------------|
| `src/routes/mcp-routes.ts` | 4 | `POST /mcp and GET /mcp/events require a valid Bearer token` | `POST /mcp and GET /mcp require a valid Bearer token` |
| `src/routes/public-routes.ts` | 46 | `"GET /mcp/events": "MCP SSE events (requires Bearer token)"` | `"GET /mcp": "MCP SSE endpoint -- returns 405 in stateless mode (requires Bearer token)"` |

**Context:** Phase 1 decided to use `GET /mcp` per the MCP 2025-03-26 spec instead of the originally proposed `GET /mcp/events`. The stale references were never updated.

### Category 3: Unused Legacy Files (newly discovered)

| File | Lines | Status | Evidence |
|------|-------|--------|----------|
| `src/tools.ts` | 65,245 bytes | ORPHANED | Zero imports from any file in the project. Grep for `from.*["']\.\.?/tools` and `from.*["']\.\.?/(src/)?tools` returns empty. This is the original pre-MCP-SDK tool implementation superseded by `src/mcp-tools.ts`. |
| `src/schemas.ts` | 10,756 bytes | ORPHANED | Zero imports from any file in the project. Grep for `from.*schemas` in `src/` and `tests/` returns empty. These Zod schemas were for the old tool system, superseded by inline schemas in `src/mcp-tools.ts`. |

**Total: ~76K bytes of dead code.**

**Note:** Both files import from `src/types.ts`. However, `src/types.ts` is also imported by `src/api.ts` (which is the live WikiJsApi), so `src/types.ts` is NOT dead code. Only `tools.ts` and `schemas.ts` are safe to delete.

### Category 4: Unused Exports (newly discovered)

| File | Export | Status | Evidence |
|------|--------|--------|----------|
| `src/server.ts` line 64 | `buildServer(wikiJsApi)` | DEAD | Zero imports anywhere. Comment says "legacy export for backward compatibility" but nothing consumes it. `buildApp()` is the live function used by `start()` and tests. |

**Total: ~3 lines of dead code (small, but cleanup keeps the API surface honest).**

### Category 5: Stale Documentation References

| File | Content | Issue |
|------|---------|-------|
| `QUICK_START.md` line 43 | `"events": "http://localhost:3200/mcp/events"` | Stale endpoint URL |
| `README.md` line 163 | `"events": "http://localhost:3200/mcp/events"` | Stale endpoint URL |
| `README.md` line 178 | `events: "http://localhost:3200/mcp/events"` -- URL for Server-Sent Events | Stale endpoint URL |
| `.planning/PROJECT.md` lines 29, 34 | References to `GET /mcp/events` | Stale planning references |

**Note on markdown docs:** The user decision says "fix stale references everywhere". README.md and QUICK_START.md contain stale `/mcp/events` references in client configuration examples. These should be updated to reflect the actual `GET /mcp` endpoint. However, `.planning/` files are historical records -- updating them may not be appropriate. The planner should limit doc fixes to user-facing files (README.md, QUICK_START.md) and production code.

### Preserved (NOT dead code -- per user decision)

| File | Export | Why Preserved |
|------|--------|--------------|
| `src/scopes.ts` | `SCOPE_TOOL_MAP` | Foundation for v2 per-tool scope enforcement (ADVN-01) |
| `src/scopes.ts` | `TOOL_SCOPE_MAP` | Foundation for v2 per-tool scope enforcement (ADVN-01) |
| `tests/scopes.test.ts` | All assertions | Tests the preserved maps |

### Express Dependency Clarification

The CONTEXT.md mentions "Express: noted in PROJECT.md as installed as a dependency but unused." **However, express is NOT a direct dependency in package.json.** It is a transitive dependency of `@modelcontextprotocol/sdk` (which depends on express@5.2.1 and express-rate-limit@8.3.1). There is nothing to remove from package.json for express -- it would only disappear if the SDK stopped depending on it. No action needed.

### Other Dependencies -- All Used

Every direct dependency in `package.json` has verified production consumers:
- `@modelcontextprotocol/sdk`: `src/mcp-tools.ts`, `src/routes/mcp-routes.ts`
- `dotenv`: `src/config.ts`
- `fastify`: `src/server.ts`, `src/routes/`, `src/auth/`, `src/logging.ts`, `src/request-context.ts`
- `fastify-plugin`: `src/auth/middleware.ts`
- `graphql` + `graphql-request`: `src/api.ts`, `src/tools.ts` (but tools.ts is dead -- graphql/graphql-request are also used by api.ts)
- `jose`: `src/config.ts`, `src/auth/errors.ts`, `src/auth/middleware.ts`
- `uuid`: `src/logging.ts`
- `zod`: `src/config.ts`, `src/mcp-tools.ts`

DevDependencies: `@types/node`, `@types/uuid`, `nodemon`, `ts-node`, `typescript`, `vitest` -- all standard dev tooling, none removable.

## Architecture Patterns

### Safe Deletion Order

The correct sequence for cleanup operations is critical to avoid breaking intermediate states:

```
Step 1: Delete orphaned files (auth-errors.ts, tools.ts, schemas.ts)
        -- No imports exist, so nothing breaks

Step 2: Remove dead exports (buildServer from server.ts)
        -- No consumers exist, so nothing breaks

Step 3: Fix stale references in production code (mcp-routes.ts, public-routes.ts)
        -- Content changes only, no import changes

Step 4: Fix stale references in documentation (README.md, QUICK_START.md)
        -- No code impact

Step 5: Update ROADMAP.md success criteria
        -- Remove "delete SCOPE_TOOL_MAP/TOOL_SCOPE_MAP" item per user decision

Step 6: Run full test suite
        -- Verifies nothing was accidentally broken
```

### Verification Strategy

After all deletions:
1. `npx vitest run` -- all 106 tests pass (minus the 13 deleted auth-errors tests = 93 expected)
2. `npx tsc --noEmit` -- TypeScript compilation still succeeds
3. `grep -r 'auth-errors' src/` -- returns empty
4. `grep -r 'tools\.js' src/` -- returns empty (no imports of deleted tools.ts)
5. `grep -r 'schemas\.js' src/` -- returns empty (no imports of deleted schemas.ts)
6. `grep -r 'mcp/events' src/` -- returns empty (all stale refs fixed)
7. `grep -r 'buildServer' src/ tests/` -- returns empty (dead export removed)

### Anti-Patterns to Avoid

- **Deleting types.ts:** Despite tools.ts and schemas.ts importing from types.ts, the file is NOT dead. `src/api.ts` (the live WikiJsApi class) imports `WikiJsPage`, `WikiJsUser`, `WikiJsGroup`, and `ResponseResult` from it.
- **Removing graphql/graphql-request dependencies:** Even though tools.ts is dead, `src/api.ts` is the live path and imports `GraphQLClient` and `gql` from graphql-request.
- **Updating .planning/ files:** Historical planning documents should not be modified to reflect current state. Only update ROADMAP.md success criteria as explicitly requested.
- **Removing SCOPE_TOOL_MAP/TOOL_SCOPE_MAP:** Explicitly preserved for v2 ADVN-01 per user decision. The ROADMAP success criterion must be updated instead.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dead code detection | Custom AST parser | Grep-based import tracing | For a codebase this size (~15 source files), grep is exhaustive and verifiable. AST analysis adds complexity with no benefit. |
| Dependency analysis | Custom tree-shaking | `npm ls` + grep for imports | Direct dependency verification via imports is sufficient. |

## Common Pitfalls

### Pitfall 1: Cascading Import Failures
**What goes wrong:** Deleting a file that is transitively imported causes TypeScript compilation failure.
**Why it happens:** Grepping for direct imports misses re-exports or barrel files.
**How to avoid:** After each deletion, run `npx tsc --noEmit` to verify compilation.
**Warning signs:** TypeScript errors mentioning "Cannot find module."
**This codebase:** No barrel files exist. All imports are direct. Risk is LOW.

### Pitfall 2: Test Count Mismatch After Deletion
**What goes wrong:** After deleting test files, the test count changes and someone thinks tests are "missing."
**Why it happens:** 13 tests in auth-errors.test.ts will disappear from the suite.
**How to avoid:** Document the expected test count change. Current: 106 tests in 9 files. After deletion: ~93 tests in 8 files.
**Warning signs:** Test summary shows fewer tests than expected.

### Pitfall 3: Stale Reference in Endpoint Map
**What goes wrong:** The `endpoints` object in `public-routes.ts` line 42-49 serves as API documentation to clients hitting `GET /`. If the endpoint name is wrong, clients follow wrong paths.
**Why it happens:** The endpoint map was written during Phase 1 when `/mcp/events` was the planned path.
**How to avoid:** Update the endpoint name AND the description. The GET /mcp endpoint returns 405 in stateless mode -- the description should reflect this.

### Pitfall 4: ROADMAP.md Success Criteria Conflict
**What goes wrong:** The ROADMAP success criterion #3 says "Unused SCOPE_TOOL_MAP and TOOL_SCOPE_MAP are removed from src/scopes.ts" but the user explicitly decided to keep them.
**Why it happens:** ROADMAP was written before the context discussion that decided to preserve these maps.
**How to avoid:** Update ROADMAP.md success criterion #3 to reflect the preservation decision.

## Code Examples

### Deletion Targets (exact file paths)

```
# Files to DELETE entirely
src/auth-errors.ts          # 183 lines, orphaned module
tests/auth-errors.test.ts   # 149 lines, tests for orphaned module
src/tools.ts                # ~65K bytes, legacy pre-SDK tool implementation
src/schemas.ts              # ~10K bytes, legacy Zod schemas for old tools
```

### Stale Reference Fix: mcp-routes.ts JSDoc (line 3-5)

Current:
```typescript
/**
 * Protected MCP routes as a Fastify encapsulated plugin.
 *
 * POST /mcp and GET /mcp/events require a valid Bearer token.
```

Fixed:
```typescript
/**
 * Protected MCP routes as a Fastify encapsulated plugin.
 *
 * POST /mcp and GET /mcp require a valid Bearer token.
```

### Stale Reference Fix: public-routes.ts endpoints (line 42-49)

Current:
```typescript
endpoints: {
  "GET /": "Server info",
  "GET /health": "Health check (unauthenticated)",
  "POST /mcp": "MCP JSON-RPC endpoint (requires Bearer token)",
  "GET /mcp/events": "MCP SSE events (requires Bearer token)",
  "GET /.well-known/oauth-protected-resource":
    "RFC 9728 discovery (unauthenticated)",
},
```

Fixed:
```typescript
endpoints: {
  "GET /": "Server info",
  "GET /health": "Health check (unauthenticated)",
  "POST /mcp": "MCP JSON-RPC endpoint (requires Bearer token)",
  "GET /mcp": "MCP SSE endpoint -- returns 405 in stateless mode (requires Bearer token)",
  "GET /.well-known/oauth-protected-resource":
    "RFC 9728 discovery (unauthenticated)",
},
```

### Dead Export Removal: server.ts (line 63-66)

Remove entirely:
```typescript
// Keep legacy export for backward compatibility (Phase 1/2 consumers)
export function buildServer(wikiJsApi: WikiJsApi): FastifyInstance {
  return buildApp(config, wikiJsApi);
}
```

### ROADMAP.md Success Criteria Update

Current (line 132):
```markdown
  3. Unused `SCOPE_TOOL_MAP` and `TOOL_SCOPE_MAP` are removed from `src/scopes.ts`
```

Fixed:
```markdown
  3. `SCOPE_TOOL_MAP` and `TOOL_SCOPE_MAP` are preserved in `src/scopes.ts` for v2 per-tool scope enforcement (ADVN-01)
```

## State of the Art

Not applicable -- this is a cleanup phase, not a technology adoption phase.

## Open Questions

1. **README.md and QUICK_START.md `/mcp/events` references**
   - What we know: Both files contain client configuration examples with `"events": "http://localhost:3200/mcp/events"`. The actual endpoint is `GET /mcp`.
   - What's unclear: Whether the `events` key in the MCP client configuration JSON is even used by current MCP clients, or if it is a legacy Cursor MCP format. Removing it entirely vs. updating it to `/mcp` are both reasonable.
   - Recommendation: Update both files. Change `"events": "http://localhost:3200/mcp/events"` to `"events": "http://localhost:3200/mcp"` and update the accompanying description. If the key is no longer needed, the user can remove it later.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.1 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run` |
| Full suite command | `npx vitest run` |

### Current Test Baseline
- **9 test files, 106 tests, all passing**
- After Phase 8: expect **8 test files, ~93 tests** (loss of 13 tests from `tests/auth-errors.test.ts`)

### Phase Requirements -> Test Map

This phase has no formal requirement IDs (it is tech debt). Validation is:

| Behavior | Test Type | Automated Command | Notes |
|----------|-----------|-------------------|-------|
| Orphaned files deleted | verification | `test -f src/auth-errors.ts && echo FAIL \|\| echo PASS` | File absence check |
| Legacy files deleted | verification | `test -f src/tools.ts && echo FAIL \|\| echo PASS` | File absence check |
| Stale refs fixed | verification | `grep -r 'mcp/events' src/ && echo FAIL \|\| echo PASS` | No matches expected |
| All remaining tests pass | unit/integration | `npx vitest run` | 93+ tests expected |
| TypeScript compiles | compilation | `npx tsc --noEmit` | Zero errors expected |

### Sampling Rate
- **Per task commit:** `npx vitest run` + `npx tsc --noEmit`
- **Phase gate:** Full suite green, grep verifications clean

### Wave 0 Gaps
None -- existing test infrastructure covers all phase needs. No new tests are required for a deletion-only phase.

## Sources

### Primary (HIGH confidence)
- Direct codebase investigation via grep, file reads, and import tracing
- `npx vitest run` output: 9 files, 106 tests, all passing
- `npm ls express`: confirms express is transitive only (via @modelcontextprotocol/sdk)
- `package.json` direct inspection: all dependencies verified against import statements

## Metadata

**Confidence breakdown:**
- Dead code inventory: HIGH -- exhaustive grep-based import tracing on a small (15-file) codebase
- Stale references: HIGH -- exact line numbers verified via file reads
- Dependency analysis: HIGH -- direct npm ls + import cross-reference
- Safe deletion order: HIGH -- import graph is simple and fully traced

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable -- codebase structure changes slowly)
