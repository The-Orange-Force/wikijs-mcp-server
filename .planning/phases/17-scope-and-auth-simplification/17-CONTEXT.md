# Phase 17: Scope and Auth Simplification - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Reduce scope enforcement from 3 scopes (wikijs:read, wikijs:write, wikijs:admin) to a single wikijs:read scope for all 3 remaining tools. This phase depends on Phase 16 having already reduced tools to 3 read-only tools.

</domain>

<decisions>
## Implementation Decisions

### SCOPES constant cleanup
- Remove WRITE and ADMIN entirely from SCOPES object — single value: `{ READ: "wikijs:read" }`
- SCOPE_TOOL_MAP collapses to one key mapping wikijs:read to all 3 tools
- SUPPORTED_SCOPES remains derived via `Object.values(SCOPES)` — single source of truth preserved
- Scope type stays derived: `type Scope = (typeof SCOPES)[keyof typeof SCOPES]` — resolves to `"wikijs:read"`

### TOOL_SCOPE_MAP
- Keep TOOL_SCOPE_MAP — still derived from SCOPE_TOOL_MAP, consistent pattern
- No per-tool scope enforcement in middleware — gate-level check is sufficient with 1 scope
- With 1 scope, `hasValidScope = scopes.some(s => SUPPORTED_SCOPES.includes(s))` IS per-tool enforcement

### Token enforcement
- wikijs:read is the ONLY valid scope — tokens with only wikijs:write or wikijs:admin get 403 insufficient_scope
- Tokens with wikijs:read plus other scopes are accepted (wikijs:read present = valid)
- No backward compatibility for write/admin-only tokens

### OAuth proxy scope mapper
- Update JSDoc comments only — code logic uses SUPPORTED_SCOPES and works correctly with 1 scope
- Remove mentions of wikijs:write and wikijs:admin from comments in scope-mapper.ts
- OAuth discovery metadata (oauth-proxy.ts) already derives scopes_supported from SUPPORTED_SCOPES — no code change needed
- Protected Resource Metadata (public-routes.ts) also derives from SUPPORTED_SCOPES — automatic

### Test updates
- Rewrite scopes.test.ts from scratch — every assertion changes (1 scope, 3 tools instead of 3 scopes, 17 tools)
- Convert auth middleware tests: tokens with only wikijs:write/admin become rejection (403) test cases
- Update smoke/integration test tokens to use `scp: "wikijs:read"` only
- Discovery test: assert `scopes_supported` equals exactly `["wikijs:read"]`
- Remove scope-mapper test cases for wikijs:write and wikijs:admin mapping

### Claude's Discretion
- Exact test case naming and organization in rewritten scopes.test.ts
- Whether to add a negative test for "SCOPES has no WRITE or ADMIN" or just assert the object shape
- Comment wording in scope-mapper.ts

</decisions>

<specifics>
## Specific Ideas

No specific requirements — clean break approach. Remove dead scopes entirely rather than commenting or documenting them in code.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SUPPORTED_SCOPES` derivation pattern: all consumers (middleware, public-routes, oauth-proxy, scope-mapper) import from scopes.ts — single change propagates everywhere
- `createTestToken()` and `createTokenWithClaims()` in auth test helpers: already support custom `scp` claim for testing specific scope combinations

### Established Patterns
- Single source of truth: SCOPES -> SCOPE_TOOL_MAP -> TOOL_SCOPE_MAP -> SUPPORTED_SCOPES — all derived, change flows from top
- OAuth proxy metadata uses `SUPPORTED_SCOPES` (line 54 of oauth-proxy.ts) — auto-reflects scope changes
- Protected Resource Metadata uses `SUPPORTED_SCOPES` (public-routes.ts line 90) — auto-reflects scope changes

### Integration Points
- `src/scopes.ts` is the single change point — 6 files import from it
- `src/auth/middleware.ts` line 86: `SUPPORTED_SCOPES` used for scope validation — no code change needed
- `src/routes/public-routes.ts` line 90: `SUPPORTED_SCOPES` in PRM metadata — no code change needed
- `src/routes/oauth-proxy.ts` line 54: `SUPPORTED_SCOPES` in AS metadata — no code change needed
- `src/oauth-proxy/scope-mapper.ts` line 22: `SUPPORTED_SCOPES.includes()` for prefix logic — no code change needed

</code_context>

<deferred>
## Deferred Ideas

- Azure AD app registration still has wikijs:write and wikijs:admin scopes defined — clean up externally (not a code change)

</deferred>

---

*Phase: 17-scope-and-auth-simplification*
*Context gathered: 2026-03-26*
