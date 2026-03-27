# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v2.5 — GDPR Path Filter

**Shipped:** 2026-03-27
**Phases:** 3 | **Plans:** 3

### What Was Built
- `isBlocked()` GDPR path-blocking predicate with 20 unit tests covering all normalization variants
- GDPR path filtering in all 3 MCP tool handlers (get_page, list_pages, search_pages)
- Timing-safe get_page responses — byte-identical to genuine "not found" (prevents existence oracle)
- Structured audit logging for blocked access (tool name, user identity, correlation ID — no company names)
- 14 end-to-end integration tests via Fastify inject() verifying MCP response shapes
- Instructions security audit confirming no GDPR filter information leakage

### What Worked
- **Strict TDD discipline across all 3 phases** — RED/GREEN commit pairs caught a real bug: Phase 24 integration tests revealed Phase 23's hardcoded error text wasn't byte-identical to genuine not-found
- **Security-first design** — timing-safe responses, no path content in logs, instructions audit all caught in requirements phase
- **Zero new dependencies** — pure TypeScript built-ins only, keeping attack surface minimal for security-sensitive code
- **Phase 24 integration tests as safety net** — caught the error format mismatch between blocked and genuine not-found paths

### What Was Inefficient
- **Nyquist VALIDATION.md left in draft for all 3 phases** — recurring pattern; validation step consistently skipped during fast execution
- **Phase 23 plan checkbox not updated** — ROADMAP.md showed `- [ ]` for completed plans (cosmetic, caught during milestone completion)

### Patterns Established
- **GDPR predicate pattern** — `split('/').filter(Boolean)` for slash normalization, case-insensitive first-segment match
- **Post-fetch security checks** — always complete upstream call before policy check to prevent timing oracles
- **logBlockedAccess at module level** — audit logging helper doesn't need handler-scoped state, only request context
- **wikiJsApiOverride for integration tests** — custom mock injection via Fastify plugin options for domain-specific test scenarios
- **assertNoForbiddenKeywords helper** — reusable keyword scanning for security hygiene tests

### Key Lessons
1. **Integration tests catch what unit tests miss** — Phase 24 tests revealed that Phase 23's error text format diverged from the catch-block format; only an end-to-end byte comparison caught it
2. **Throw, don't hardcode error strings** — both blocked and genuine not-found must flow through the same catch block to guarantee identical output
3. **GDPR filtering is a server-side responsibility** — client-side hints would reveal which paths exist; silent filtering is the only safe approach

### Cost Observations
- Model mix: ~50% sonnet (execution), ~40% opus (planning/audit/completion), ~10% haiku (research)
- Sessions: ~3 (planning/research, execution, audit/completion)
- Notable: Fastest 3-phase milestone; ~10 minutes total execution across all phases

---

## Milestone: v2.4 — MCP Instructions Field

**Shipped:** 2026-03-27
**Phases:** 3 | **Plans:** 4

### What Was Built
- Instructions loading module with async file reading and graceful default fallback (5-topic wiki guidance)
- MCP initialize response wired with `instructions` field threaded through Fastify plugin options
- Default instructions.txt template with Docker read-only volume mount for runtime customization
- Zod default for MCP_INSTRUCTIONS_PATH closing Docker flow gap for zero-config deploys

### What Worked
- **Milestone audit caught a real gap** — Phase 21 was created specifically to close the "docker-custom-instructions" flow gap identified by `/gsd:audit-milestone`
- **Small phases, fast execution** — 3 phases averaging 2-3 minutes each; total execution ~10 minutes
- **Plugin options threading pattern** — startup-loaded instructions passed through Fastify plugin chain without per-request I/O
- **TDD held across all plans** — RED/GREEN commits, 321 tests passing at completion

### What Was Inefficient
- **Phase 21 Nyquist validation left incomplete** — VALIDATION.md created in draft state but not formally completed
- **Audit → gap closure → re-audit cycle** — required two audit passes; first audit identified the Docker flow gap, Phase 21 closed it, second audit confirmed

### Patterns Established
- **Container-friendly Zod defaults** — `z.string().default('/app/instructions.txt')` matches volume mount paths, eliminating deployer env var configuration
- **Runtime-mounted config files** — host file mounted read-only into container via docker-compose volumes
- **Graceful fallback pattern** — try file load, catch returns hardcoded default with warning

### Key Lessons
1. **Milestone audits find real gaps** — the audit workflow identified a legitimate flow gap (Docker volume mount existed but config didn't default to the mount path), leading to Phase 21
2. **Zod defaults should match container filesystem conventions** — when deploying in Docker, defaults should point to well-known container paths that volume mounts target
3. **Small milestones ship fast** — 3 phases with clear scope completed in a single day with no blockers

### Cost Observations
- Model mix: ~60% sonnet (execution), ~30% opus (planning/audit/completion), ~10% haiku (research)
- Sessions: ~4 (planning, execution, audit, completion)
- Notable: Smallest milestone by phase count; audit-driven gap closure added one phase but ensured completeness

---

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
| v2.4 | 3 | 4 | Audit-driven gap closure, smallest milestone, zero-config Docker deploys |
| v2.5 | 3 | 3 | GDPR compliance, security-first design, integration tests catch error format mismatch |

### Cumulative Quality

| Milestone | Tests | LOC | New Dependencies |
|-----------|-------|-----|-----------------|
| v2.0 | 97 | 4,133 | jose, zod, pino, graphql-request |
| v2.1 | 97 | 4,133 | Docker (no runtime deps) |
| v2.2 | 209 | 6,583 | @fastify/formbody |
| v2.3 | 304 | 6,305 | None (removed msal-node) |
| v2.4 | 321 | 3,225 (src/) | None |
| v2.5 | 371 | 7,663 | None |

### Top Lessons (Verified Across Milestones)

1. **TDD catches integration issues early** — validated in v2.0 (auth middleware), v2.2 (scope mapping, AADSTS normalization), v2.3 (API method removal)
2. **Research before planning prevents rework** — v2.2 had zero plan revisions due to thorough research phases
3. **Pure function utilities as foundation** — extracting logic into tested pure functions before wiring routes has been consistently successful (scopes.ts in v2.0, scope-mapper.ts in v2.2)
4. **Aggressive simplification pays dividends** — v2.3 removal of 14 tools and 2 scopes reduced maintenance without losing value
5. **Milestone audits catch real gaps** — v2.4 audit identified Docker flow gap that led to Phase 21; validates the audit step as non-ceremonial
6. **Integration tests catch what unit tests miss** — v2.5 byte-identical comparison caught error format divergence between blocked and genuine not-found paths that passed all unit tests
