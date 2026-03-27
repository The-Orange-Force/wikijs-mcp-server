# Project Research Summary

**Project:** wikijs-mcp-server v2.5 — GDPR Path Filter
**Domain:** Path-based access control utility for MCP tool layer
**Researched:** 2026-03-27
**Confidence:** HIGH

## Executive Summary

The v2.5 milestone adds a GDPR compliance layer to an existing, production-grade MCP server. The task is narrow and well-defined: implement a single `isBlocked(path: string): boolean` predicate and apply it as a post-fetch filter in all three existing tool handlers (`get_page`, `list_pages`, `search_pages`). The blocking rule is structurally deterministic — a path is blocked if it has exactly 2 segments and the first segment is "Clients" (case-insensitive). No new npm dependencies are required; the existing stack (TypeScript 5.3, Vitest, Zod) handles everything.

The recommended approach mirrors an existing codebase pattern: a pure utility function in a dedicated file (like `scope-mapper.ts`), co-located unit tests, and an import into `mcp-tools.ts` where filtering is applied at the tool layer — after the WikiJs API call returns, before the MCP response is constructed. The API layer (`api.ts`) stays policy-neutral. The two response strategies are asymmetric by design: `get_page` returns a generic "Page not found." error (preventing existence disclosure), while `list_pages` and `search_pages` silently omit blocked pages from their result arrays.

The primary risk is not implementation complexity — the predicate is two lines — but correctness in edge cases and security hygiene. Path normalization bypasses (case variants, leading/trailing slashes, double slashes) must be handled inside `isBlocked()` or the filter can be circumvented. The existence-oracle problem in `get_page` requires that the upstream WikiJs API call always completes before the path check runs, to equalize timing between blocked and absent pages. Audit logging of blocked access attempts must avoid including the company name (itself potentially GDPR-sensitive), and the MCP instructions file must not reveal the filter structure.

---

## Key Findings

### Recommended Stack

The existing stack requires no additions. Zero new npm packages are needed. The feature is implemented entirely in TypeScript built-ins: `String.prototype.split()`, `Array.prototype.filter()`, and direct string comparison. Vitest (already present) covers unit tests using the same table-driven pattern established by `scope-mapper.test.ts`. The existing `WikiJsPage.path: string` field in `src/types.ts` is the only field the filter reads.

**Core technologies (all existing — nothing added):**
- TypeScript 5.3 strict ESM — pure function with full type safety, no new TS features needed
- Vitest 4.x — existing test runner, same `describe/it/expect` pattern as `scope-mapper` tests
- Built-in `String.split()` + comparison — no glob engine, no policy framework, no regex library

Evaluated and rejected: `accesscontrol`/`casbin`/`role-acl` (wrong abstraction — RBAC for multi-role systems, 100–400 KB for a 3-line predicate), `micromatch`/`picomatch`/`minimatch` (glob engines — abstraction mismatch for a deterministic structural rule).

See `.planning/research/STACK.md` for full dependency analysis and alternatives considered.

### Expected Features

The blocking rule is exactly specified and scoped conservatively. All features below derive from that single requirement.

**Must have (table stakes — P1):**
- `isBlocked(path)` utility — pure exported function, single source of truth for all three tools
- `get_page` returns generic "Page not found." for blocked pages — indistinguishable from truly absent page; same text, same timing
- `search_pages` silently excludes blocked pages from results — no existence leak via search
- `list_pages` silently excludes blocked pages from results — no existence leak via list
- Path normalization inside `isBlocked()` — strip leading/trailing slashes, case-fold first segment — prevents bypass via path variants
- Unit tests covering all edge cases for `isBlocked()` — security predicates require full branch coverage

**Should have (differentiators — P2):**
- Structured audit logging for blocked access attempts — GDPR Article 30 accountability trail, using `requestContext` correlation ID and user identity; the log must NOT include the company name (the path segment is itself potentially sensitive)

**Defer (v2.6+):**
- Configurable block rules / pattern-based blocking — no current requirement; a code change with tests is safer than a config surface
- Block check before WikiJs fetch for `get_page` — impossible with current ID-based API; deferred until a path-based lookup tool exists
- Per-category blocking or redaction strategies — only if compliance requirements evolve beyond simple blocking

See `.planning/research/FEATURES.md` for full feature dependency graph and MVP definition.

### Architecture Approach

The filter lives exclusively in `mcp-tools.ts` tool handlers, applied between the WikiJs API call and `JSON.stringify`. A new file `src/gdpr.ts` exports `isBlocked()` as the single source of truth; `mcp-tools.ts` imports and calls it in all three handlers. No other files change. The `api.ts` data layer remains policy-neutral. `tool-wrapper.ts` remains a timing/logging concern only.

**Major components:**
1. `src/gdpr.ts` (NEW) — exports `isBlocked(path: string): boolean`; pure function, no imports, no state; normalizes leading/trailing slashes and case-folds the first segment before the structural check
2. `src/mcp-tools.ts` (MODIFIED) — imports `isBlocked`; applies it in all three tool handlers post-fetch; `get_page` uses `isError: true` with generic text, `list_pages` and `search_pages` use `Array.filter()`
3. `src/__tests__/gdpr.test.ts` (NEW) — Vitest unit tests for `isBlocked()` covering exact match, case variants, leading/trailing slash, 1-segment, 3-segment, unrelated paths, empty string
4. `tests/gdpr-filter.test.ts` (NEW) — Integration tests using `buildTestApp()` and a mock `WikiJsApi`; verifies MCP response shapes for blocked and non-blocked paths via Fastify `inject()`

**Unchanged:** `src/api.ts`, `src/tool-wrapper.ts`, `src/types.ts`, `src/config.ts`, `src/routes/mcp-routes.ts`, `src/server.ts`, `tests/helpers/build-test-app.ts`.

**Build order:** Step 1: `src/gdpr.ts` + unit tests. Step 2: integrate into `mcp-tools.ts`. Step 3: integration tests. Linear, no parallelism needed.

See `.planning/research/ARCHITECTURE.md` for component boundaries, data flow diagrams, code patterns, and full build order rationale.

### Critical Pitfalls

1. **Existence oracle via asymmetric error responses** — `get_page` must call `getPageById()` first (to normalize timing), then check `isBlocked(page.path)`. If the upstream call is skipped for blocked paths, they return faster — timing reveals that the page exists. The error text for a blocked page must also be textually identical to a genuine absent-page error.

2. **Path normalization bypasses** — A case-sensitive comparison against `"Clients"` is bypassed by `clients/acme`, `/Clients/Acme`, `Clients/Acme/`, or `Clients//Acme`. `isBlocked()` must normalize input before comparison: strip leading slashes, collapse double slashes, strip trailing slashes, then lowercase the first segment. Unit tests must cover all variants.

3. **Search results fallback path gap** — `searchPages()` in `api.ts` uses a multi-stage resolution that includes a `resolveViaPagesList` fallback. The `isBlocked()` filter must be applied to results from ALL resolution paths in `search_pages`, not only the primary GraphQL search results. A filter on the primary results only leaves the fallback path unguarded.

4. **GDPR-sensitive data in audit logs** — Logging the blocked path (e.g., `Clients/AcmeCorp`) makes the server log a secondary store for GDPR-sensitive identifiers. Log the event type, tool name, and user identity only — never the company name segment of the path.

5. **`totalHits` leaking unfiltered count** — `search_pages` must not expose `totalHits` from the WikiJs response. The current code already omits it (returns only `result.results`). This must not be regressed during filter integration.

See `.planning/research/PITFALLS.md` for all pitfalls with detection strategies, phase warnings, and source citations.

---

## Implications for Roadmap

This milestone maps cleanly to a 3-phase linear implementation. All dependencies are sequential; no parallelism is possible or necessary.

### Phase 1: Core Utility — `isBlocked()` Function and Unit Tests

**Rationale:** Everything downstream depends on this function. It has zero dependencies and is the foundation that prevents all path-normalization bypass pitfalls. Testing it in isolation before touching `mcp-tools.ts` ensures the security predicate is verified before integration.
**Delivers:** `src/gdpr.ts` with a hardened `isBlocked()` function; `src/__tests__/gdpr.test.ts` with full branch coverage including all normalization edge cases.
**Addresses:** `isBlocked()` utility (P1 table stakes); path normalization (P1); unit test coverage requirement.
**Avoids:** Pitfall 2 (path normalization bypasses) — addressed entirely in this phase before any integration work.
**No research-phase needed:** Pattern is established (follows `scope-mapper.ts`); implementation is a pure function with no external dependencies.

### Phase 2: Tool Handler Integration

**Rationale:** With a verified `isBlocked()` in place, the three tool handler changes are mechanical and low-risk — 2-4 lines each. Grouping all three tools in one phase ensures they ship together; a filter that covers only two of three tools is a compliance gap.
**Delivers:** Modified `src/mcp-tools.ts` with `isBlocked()` applied in all three handlers; `get_page` returns generic "not found" for blocked pages; `list_pages` and `search_pages` silently filter results.
**Addresses:** `get_page` generic error (P1); `search_pages` silent filter (P1); `list_pages` silent filter (P1); `totalHits` non-exposure verified (P1).
**Avoids:** Pitfall 1 (existence oracle) — `get_page` calls upstream first, then checks path; Pitfall 3 (search fallback gap) — filter applied to all resolution paths; Pitfall 5 (`totalHits` regression).
**No research-phase needed:** Architecture is fully specified; change surface is 3 handlers with identical patterns.

### Phase 3: Integration Tests and Security Audit

**Rationale:** End-to-end verification using Fastify `inject()` confirms MCP response shapes are correct from a client perspective. This phase also covers the security hygiene audit: instructions file review, log output verification, `tool-wrapper.ts` payload logging check.
**Delivers:** `tests/gdpr-filter.test.ts` with integration tests for all three tools; manual audit of `instructions.txt` for filter disclosure; verification that blocked events produce a server-side log entry without company name.
**Addresses:** Audit logging (P2 differentiator); integration test coverage from FEATURES.md MVP definition.
**Avoids:** Pitfall 4 (GDPR-sensitive data in logs); Pitfall 7 (MCP instructions file disclosure); Pitfall 8 (no audit trail for blocked access).
**No research-phase needed:** Test patterns follow existing `buildTestApp()` integration test conventions.

### Phase Ordering Rationale

- Phase 1 before Phase 2: `isBlocked()` must exist and be tested before it can be imported into tool handlers. An untested security predicate is worse than no predicate.
- Phase 2 before Phase 3: Integration tests require the full filter to be in place; testing a partial integration creates false confidence.
- All three phases belong in the same milestone: the filter is a compliance requirement — a partially deployed implementation creates a gap between "deployed" and "compliant."

### Research Flags

Phases with well-documented patterns (skip `/gsd:research-phase` for all three):

- **Phase 1:** The implementation pattern is established by `scope-mapper.ts`. The predicate logic is fully specified in ARCHITECTURE.md and PITFALLS.md. No additional research needed.
- **Phase 2:** Architecture specifies exactly which lines change in each handler. No new integrations, no new APIs. No additional research needed.
- **Phase 3:** Integration test patterns follow existing `buildTestApp()` conventions already used by `tests/helpers/`. No additional research needed.

Execution-time concerns (not research gaps, flag for code review):

- **Phase 2, `get_page` timing:** The upstream call must complete before the path check runs. Flag for review: confirm no short-circuit path was introduced.
- **Phase 2, `search_pages` fallback:** Confirm `isBlocked()` is applied to results from `resolveViaPagesList` as well as the primary search results.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Direct codebase analysis; zero new dependencies; verified against existing `scope-mapper.ts` pattern; no version compatibility concerns |
| Features | HIGH | Requirement fully specified in PROJECT.md; OWASP and GDPR sources are authoritative; scope boundaries (exactly 2 segments) are explicit |
| Architecture | HIGH | Based on direct inspection of `src/mcp-tools.ts`, `src/api.ts`, `src/tool-wrapper.ts`, `src/types.ts`; change surface fully mapped; all unchanged files identified |
| Pitfalls | HIGH | Path normalization bypass patterns sourced from real CVEs (CWE-288) and PortSwigger research; existence oracle guidance from OWASP, Authress, LockMeDown; GDPR audit logging from ICO and Exabeam |

**Overall confidence:** HIGH

### Gaps to Address

- **Case sensitivity discrepancy between research files:** FEATURES.md specifies strict case-sensitive matching (`segments[0] === 'Clients'`), while ARCHITECTURE.md and PITFALLS.md both specify case-insensitive matching (`segments[0].toLowerCase() === 'clients'`). The safe and correct answer is case-insensitive matching — use `.toLowerCase()`. FEATURES.md's strict case guidance should be treated as an error in the research output and the ARCHITECTURE.md / PITFALLS.md specification should govern implementation.

- **`resolveViaPagesList` fallback coverage:** PITFALLS.md flags this as a risk but does not enumerate the exact lines in `mcp-tools.ts` or `api.ts` where the fallback results are assembled. During Phase 2, the developer must trace the full resolution path and confirm `isBlocked()` is applied at every point where pages are added to the results before returning.

- **Audit log event shape:** PITFALLS.md and FEATURES.md agree that audit logging must not include the company name. The exact log fields are not specified. Recommend: `log.info({ tool, blocked: true, userId: ctx.user.oid, correlationId }, "gdpr-path-filter: access blocked")` — event type, user identity, correlation ID; no path.

---

## Sources

### Primary (HIGH confidence)

- Direct codebase analysis: `src/oauth-proxy/scope-mapper.ts`, `src/oauth-proxy/__tests__/scope-mapper.test.ts`, `src/mcp-tools.ts`, `src/api.ts`, `src/tool-wrapper.ts`, `src/types.ts` — establishes implementation pattern, integration points, and existing type definitions
- [OWASP API Security Top 10 (2023)](https://owasp.org/API-Security/editions/2023/) — BOLA: return 404 over 403 to prevent resource enumeration; server-side filtering requirement
- [OWASP REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html) — client-side filtering as anti-pattern
- [PortSwigger: Access control vulnerabilities](https://portswigger.net/web-security/access-control) — existence oracle via 403 vs 404 distinction
- [DailyCVE: Gateway auth bypass via path canonicalization mismatch (CWE-288)](https://dailycve.com/gateway-authentication-bypass-via-path-canonicalization-mismatch-cwe-288-moderate/) — real CVE for case/trailing-slash bypass patterns
- [ICO: What is personal data?](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/personal-information-what-is-it/what-is-personal-data/what-is-personal-data/) — GDPR personal data scope; company names and client directory pages
- [Azure AI Search: Security Trimming Pattern](https://learn.microsoft.com/en-us/azure/search/search-security-trimming-for-azure-search) — silent filter as the standard pattern for search result access control
- PROJECT.md — authoritative requirement source for the v2.5 milestone and the exact blocking rule

### Secondary (MEDIUM confidence)

- [Authress: Choosing 401/403/404](https://authress.io/knowledge-base/articles/choosing-the-right-http-error-code-401-403-404) — existence oracle prevention; consistent with OWASP guidance
- [LockMeDown: Return 404 instead of 403](https://lockmedown.com/when-should-you-return-404-instead-of-403-http-status-code/) — practical 404-over-403 guidance
- [Exabeam: GDPR audit logging requirements](https://www.exabeam.com/explainers/gdpr-compliance/how-does-gdpr-comply-with-log-management/) — GDPR Article 30 audit trail requirements
- [Mezmo: GDPR logging best practices](https://www.mezmo.com/blog/best-practices-for-gdpr-logging) — what to capture without over-logging sensitive identifiers
- [Hoop.dev: What GDPR really expects from audit logs](https://hoop.dev/blog/what-gdpr-really-expects-from-audit-logs/) — data minimisation principle applied to log content
- [Wiki.js GitHub Discussion #6672](https://github.com/requarks/wiki/discussions/6672) — path format without leading slash; Wiki.js path normalization behavior
- [Medium: Path normalisation story (API gateway bypass)](https://medium.com/@dipanshuchhanikar/bypassing-authentication-in-a-major-api-gateway-a-path-normalization-story-5f1bea6d3f08) — practical path-canonicalization bypass examples

### Tertiary (evaluated and rejected)

- [accesscontrol npm](https://www.npmjs.com/package/accesscontrol), [casbin/node-casbin](https://github.com/casbin/node-casbin), [micromatch npm](https://www.npmjs.com/package/micromatch), [picomatch npm](https://www.npmjs.com/package/picomatch) — each evaluated and rejected as wrong abstraction for a deterministic 2-segment structural predicate

---
*Research completed: 2026-03-27*
*Ready for roadmap: yes*
