# Phase 8: Dead Code & Tech Debt Cleanup - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Remove orphaned modules, fix stale references, delete unused exports, and clean up unused dependencies — all identified by the milestone audit plus a comprehensive dead code sweep. SCOPE_TOOL_MAP and TOOL_SCOPE_MAP are explicitly preserved for v2 per-tool scope enforcement (ADVN-01).

</domain>

<decisions>
## Implementation Decisions

### Cleanup scope
- Comprehensive cleanup: go beyond the 4 audit items and sweep for all dead code, unused exports, orphaned files, unreachable code paths, and unused dependencies in package.json
- Aggressive deletions: if it's unused in production code, delete it. Tests that only test deleted code also get deleted
- Remove unused dependencies from package.json (e.g., Express, which is installed but unused per PROJECT.md)
- No untouchable files — if nothing imports it, it's fair game for deletion
- Trust the analysis: no special exceptions or preserved-for-unknown-reasons files

### Scope map preservation (overrides audit)
- **Keep** SCOPE_TOOL_MAP and TOOL_SCOPE_MAP in src/scopes.ts — they are the foundation for v2 per-tool scope enforcement (ADVN-01)
- **Keep** all tests in tests/scopes.test.ts intact (15+ assertions on map completeness, reverse lookup, per-scope tool assignments)
- Update ROADMAP.md success criteria to remove the "delete SCOPE_TOOL_MAP/TOOL_SCOPE_MAP" item
- Note: Phase 6 will have already updated these maps to colon notation before Phase 8 runs

### Stale reference fixes
- Full sweep: grep for all endpoint references (route paths, JSDoc, comments, test descriptions) across the entire codebase and verify they match actual routes
- Fix stale references everywhere — production code, tests, comments, JSDoc, description strings
- When touching JSDoc/comments with stale paths, also improve the clarity and accuracy of surrounding documentation (not just the path)

### Orphaned module deletion
- Delete src/auth-errors.ts (183 lines) — orphaned, no production consumer, parallel implementation in src/auth/errors.ts is the live path
- Delete tests/auth-errors.test.ts (149 lines) — only tests the orphaned module

### Claude's Discretion
- Dead code detection methodology (static analysis, grep-based, or combination)
- Order of cleanup operations
- Which unused dependencies to remove (verify each before removing)
- How to handle any newly discovered dead code beyond audit items

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. User wants a thorough, aggressive cleanup that leaves the codebase lean for v2 work, with the one exception of preserving scope maps for ADVN-01.

</specifics>

<code_context>
## Existing Code Insights

### Known Dead Code (from audit)
- `src/auth-errors.ts`: 183 lines, orphaned after Phase 5 gap closure removed imports from mcp-routes.ts. Parallel implementation in `src/auth/errors.ts` is the live path
- `tests/auth-errors.test.ts`: 149 lines, only tests the orphaned auth-errors.ts module
- `src/routes/mcp-routes.ts` line 4: JSDoc says "GET /mcp/events" — should be "GET /mcp"
- `src/routes/public-routes.ts` line 46: advertises "GET /mcp/events" — should be "GET /mcp"

### Preserved (NOT dead code)
- `SCOPE_TOOL_MAP` and `TOOL_SCOPE_MAP` in `src/scopes.ts` — preserved for v2 ADVN-01
- `tests/scopes.test.ts` assertions on the maps — preserved alongside maps

### Known Unused Dependencies
- Express: noted in PROJECT.md as "installed as a dependency but unused — Fastify is the active framework"

### Integration Points
- Phase 6 (Scope Format Alignment) runs before Phase 8 — scopes.ts will already have colon notation
- Phase 7 (Wire Tool Observability) runs before Phase 8 — wrapToolHandler will already be wired
- All tests must pass after cleanup (success criteria #4)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-dead-code-cleanup*
*Context gathered: 2026-03-24*
