# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v2.3 — Tool Consolidation

**Shipped:** 2026-03-26
**Phases:** 4 | **Plans:** 8

### What Was Built
- Consolidated 17 MCP tools to 3 read-only page tools (get_page, list_pages, search_pages)
- Path-based search ID resolution with singleByPath + pages.list fallback
- Single-scope model (wikijs:read only) replacing 3-tier read/write/admin
- STDIO transport removal and Alpine Docker base image switch
- Dead code removal (types, API methods, msal-node dependency)
- Rewritten documentation for 3-tool architecture

### What Worked
- **Aggressive consolidation paid off** — removing 14 tools and 2 scopes eliminated maintenance burden without losing value
- **Rule 3 deviations were correct calls** — updating callers immediately when removing APIs prevented build breakage
- **Single-scope model simplified everything** — auth tests, discovery metadata, scope-mapper all became simpler
- **Alpine switch post-msal-node removal** — timing was right; no native dependency concerns remain

### What Was Inefficient
- **Test updates spread across multiple phases** — Phase 15-01, 15-02, 17-01 each fixed test assertions; could have been batched
- **Documentation corruption** — README.md and CLAUDE.md had diff output embedded; required full rewrite
- **VALIDATION.md files marked partial** — Nyquist compliance not formally achieved despite complete verification

### Patterns Established
- **Bridge fixes for incremental migration** — mcp-tools.ts handler extracted `.results` from PageSearchResult during Phase 15-16 transition
- **Shared mock helper pattern** — tests/helpers/build-test-app.ts mockWikiJsApi as single source of truth
- **Promise.allSettled for graceful partial failure** — search ID resolution handles dropped results without failing entire request

### Key Lessons
1. **Read-only scope is the right default for AI wiki tools** — write operations added complexity without clear use case
2. **Disk state trumps plan expectations** — several plans expected pre-Phase-15 state but disk already had Phase 15 changes; adapt immediately
3. **Single-scope model eliminates entire error classes** — no more "wrong scope for tool" failures, simpler token requirements

### Cost Observations
- Model mix: ~70% sonnet (execution), ~25% opus (planning/verification), ~5% haiku (research)
- Total execution time: ~26 minutes across 4 phases
- Notable: Fastest milestone to date; consolidation work was straightforward removal

---

## Milestone: v2.2 — OAuth Authorization Proxy

**Shipped:** 2026-03-26
**Phases:** 5 | **Plans:** 5

### What Was Built
- Scope mapping utilities (bare MCP → Azure AD `api://` format, bidirectional)
- OAuth AS metadata and OIDC discovery endpoints with identical content
- Dynamic Client Registration returning pre-configured Azure AD client_id
- GET /authorize redirect proxy with PKCE passthrough and whitelist-based parameter filtering
- POST /token proxy with AADSTS error normalization (20-entry lookup table)
- Self-referencing Protected Resource Metadata completing the discovery chain
- E2E integration test validating 6-step OAuth flow

### What Worked
- **TDD discipline held across all 5 phases** — RED/GREEN commit pattern caught integration issues early (scope mapping edge cases, AADSTS normalization)
- **Phase dependency chain was well-designed** — each phase built cleanly on the previous, no circular dependencies or rework
- **Pure function utilities first (Phase 10)** — having tested `mapScopes()`, `stripResourceParam()`, `buildAzureEndpoints()` before any route work prevented scope-related bugs
- **Injected fetch for testability** — no mocking of globals or monkey-patching; test isolation was clean
- **Research phases identified real pitfalls** — RFC 8707 resource stripping and Claude Desktop path construction issues were caught before implementation

### What Was Inefficient
- **Nyquist validation left in draft** — all 5 VALIDATION.md files created but never completed; validate-phase should be run during or immediately after execution
- **SUMMARY.md one_liner field not populated** — required manual accomplishment extraction during milestone completion

### Patterns Established
- **OAuth proxy as single Fastify plugin** (`src/routes/oauth-proxy.ts`) with optional fetch injection
- **Two-phase OAuth error handling** — JSON errors pre-redirect_uri, redirect errors post-redirect_uri
- **AADSTS error normalization** — lookup table mapping Azure-specific codes to standard OAuth errors
- **Sequential E2E chain testing** — `let` declarations shared across `it()` blocks for stateful flow validation
- **@fastify/formbody scoped to plugin** — avoid global body parsing side effects

### Key Lessons
1. **Root-level paths are mandatory for Claude Desktop** — the client constructs OAuth URLs from the base URL, ignoring metadata endpoint paths. Any `/oauth/*` subpath design would silently break.
2. **Azure AD rejects unknown parameters** — RFC 8707 `resource` parameter must be stripped (AADSTS9010010). Always test parameter forwarding against the actual IdP behavior.
3. **Self-referencing authorization_servers is the correct PRM pattern** — when the MCP server acts as its own OAuth proxy, PRM must point to self, not the upstream IdP.

### Cost Observations
- Model mix: ~60% sonnet (execution/verification), ~30% opus (planning/review), ~10% haiku (research)
- Total execution time: ~15 minutes across 5 phases
- Notable: Research phases + plan checker prevented rework; zero plan revisions needed post-execution

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v2.0 | 8 | 12 | Established TDD + phase-based GSD workflow |
| v2.1 | 1 | 1 | Docker packaging, single-phase milestone |
| v2.2 | 5 | 5 | OAuth proxy with research-driven planning, zero rework |
| v2.3 | 4 | 8 | Aggressive consolidation (17→3 tools, 3→1 scopes), fastest milestone |

### Cumulative Quality

| Milestone | Tests | LOC | New Dependencies |
|-----------|-------|-----|-----------------|
| v2.0 | 97 | 4,133 | jose, zod, pino, graphql-request |
| v2.1 | 97 | 4,133 | Docker (no runtime deps) |
| v2.2 | 209 | 6,583 | @fastify/formbody |
| v2.3 | 304 | 6,305 | None (removed msal-node) |

### Top Lessons (Verified Across Milestones)

1. **TDD catches integration issues early** — validated in v2.0 (auth middleware), v2.2 (scope mapping, AADSTS normalization), v2.3 (API method removal)
2. **Research before planning prevents rework** — v2.2 had zero plan revisions due to thorough research phases
3. **Pure function utilities as foundation** — extracting logic into tested pure functions before wiring routes has been consistently successful (scopes.ts in v2.0, scope-mapper.ts in v2.2)
4. **Aggressive simplification pays dividends** — v2.3 removal of 14 tools and 2 scopes reduced maintenance without losing value
