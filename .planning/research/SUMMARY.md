# Project Research Summary

**Project:** wikijs-mcp-server v2.6
**Domain:** Marker-based GDPR content redaction and page URL injection for MCP server
**Researched:** 2026-03-27
**Confidence:** HIGH

## Executive Summary

The v2.6 milestone replaces the v2.5 path-based GDPR blocking (`isBlocked()`) with surgical marker-based content redaction. Wiki authors wrap sensitive sections in `<!-- gdpr-start -->` / `<!-- gdpr-end -->` HTML comment markers; the MCP server strips those sections before returning content to AI assistants. This is a fundamentally different security model: v2.5 blocked entire pages, v2.6 redacts specific sections and makes the rest of each page accessible. The scope is tightly bounded — only `get_page` returns a `content` field, so redaction applies to one tool handler. `list_pages` and `search_pages` are simplified by removing their GDPR filters entirely.

The recommended implementation requires zero new dependencies. All capabilities — regex content redaction, malformed marker fail-safe, URL construction — are covered by Node.js built-ins and the existing stack. The redaction function is a pure string transformation (`redactContent(content: string | undefined | null): RedactionResult`) that belongs in `src/gdpr.ts` and is called from the `get_page` handler in `mcp-tools.ts`. The `WikiJsApi` layer remains policy-neutral. URL injection reuses `WIKIJS_BASE_URL` from existing config and adds the `locale` field to the `getPageById` GraphQL query.

The most significant risk is a transition window where PII is exposed: if `isBlocked()` is removed before wiki authors have added markers to all previously-blocked pages, client pages will be accessible with full PII content. The mitigation is clear — remove `isBlocked()` only after markers are in place and verified. Secondary risks are regex correctness (greedy vs. lazy quantifier, malformed marker handling) and URL encoding edge cases. All are well-understood with documented solutions.

## Key Findings

### Recommended Stack

No new dependencies are needed. The v2.6 features (regex content redaction, malformed marker handling, URL construction) are implemented with `String.prototype.replace()`, `String.prototype.indexOf()`, and the WHATWG `URL` class — all built into Node.js >= 20. The existing Zod, Pino, and Vitest dependencies cover validation, logging, and testing respectively.

The one decision that was researched and resolved: the `re2` library (Google's linear-time regex engine) is unnecessary. The marker pattern uses fixed literal anchors (`<!-- gdpr-start -->`, `<!-- gdpr-end -->`) with a single non-greedy `[\s\S]*?` between them — this is provably linear-time with no backtracking risk. Adding `re2` would introduce a native C++ dependency that complicates the Alpine Docker image for zero security benefit.

**Core technologies (all existing — nothing added):**
- `RegExp` with `[\s\S]*?gi`: marker pair redaction — compiled once at module level, O(n) time, case-insensitive and global flags
- `String.prototype.indexOf()`: malformed marker detection — faster than regex for presence checks, used in the fail-safe path
- WHATWG `URL` class (Node.js built-in): page URL construction — handles double slashes, special characters, percent-encoding
- Zod (already installed): no new env vars needed; `WIKIJS_BASE_URL` is reused for URL construction
- Pino via Fastify (already installed): malformed marker warning logs via existing `requestContext` pattern

See `.planning/research/STACK.md` for full dependency analysis, ReDoS safety rationale, and alternatives considered.

### Expected Features

**Must have (table stakes):**
- Remove path-based GDPR filtering — delete `isBlocked()` and all call sites in `mcp-tools.ts`; prerequisite for marker-based redaction
- Marker-based content redaction — regex `/<!-- *gdpr-start *-->[\s\S]*?<!-- *gdpr-end *-->/gi` with global and case-insensitive flags
- Redaction placeholder `[REDACTED]` — industry-standard convention per GDPR guidance; single consistent placeholder regardless of amount of content removed
- Multiple marker pairs per page — handled automatically by the `g` (global) regex flag
- Malformed marker fail-safe — if `<!-- gdpr-start -->` has no matching `<!-- gdpr-end -->`, redact from start marker to end of content; fail-closed is the only GDPR-safe default
- Warning log for malformed markers — `log.warn({ pageId, malformedMarker: true }, ...)` via existing `requestContext` pattern
- Redaction scoped to `get_page` only — `list_pages` and `search_pages` return metadata only, no content field
- Page URL injection in `get_page` — construct and inject `url` field using `WIKIJS_BASE_URL` + page locale + page path

**Should have (differentiators):**
- Case-insensitive and whitespace-tolerant markers — `i` flag and ` *` around marker text prevent bypass via casing or spacing variations
- Structured audit log for redacted pages — `log.info({ pageId, redactionCount, malformed })` for GDPR Article 30 compliance trail
- Whitespace normalization — collapse excessive blank lines after redaction for cleaner output

**Defer to v2.7+:**
- URL injection for `list_pages` / `search_pages` results — not required for the core GDPR use case
- Redaction count in response text — cosmetic improvement; `[REDACTED]` placeholder already signals removal
- Fenced code block awareness — accept-and-document as a limitation for v2.6; add complexity only if it becomes a real problem

See `.planning/research/FEATURES.md` for full feature dependency graph, anti-features, and MVP definition.

### Architecture Approach

The architecture is a targeted rewrite of one module (`src/gdpr.ts`) and modifications to the `get_page` handler in `mcp-tools.ts`. The data flow is: `WikiJsApi.getPageById()` returns raw `WikiJsPage` (including a new `locale` field from the GraphQL query) → `redactContent(page.content)` strips GDPR sections → URL is constructed → response is assembled with `{ ...page, content: redacted.content, url }`. The `list_pages` and `search_pages` handlers are simplified by removing all GDPR filtering — they return data as-is from the API. The `wikiJsBaseUrl` value is threaded as a parameter through `server.ts` → `protectedRoutes` options → `createMcpServer()`, following the existing pattern for the `instructions` parameter.

**Major components:**
1. `src/gdpr.ts` (REWRITTEN) — exports `redactContent(content: string | undefined | null): RedactionResult`; pure function with no side effects; replaces `isBlocked()`
2. `src/mcp-tools.ts` (MODIFIED) — calls `redactContent()` in `get_page`; injects URL; removes all `isBlocked()` usage; accepts `wikijsBaseUrl` as a new parameter
3. `src/api.ts` (MODIFIED) — adds `locale` field to `getPageById` GraphQL query; one-line change
4. `src/types.ts` (MODIFIED) — adds `locale?: string` to `WikiJsPage` interface
5. `src/server.ts` + `src/routes/mcp-routes.ts` (MODIFIED) — thread `wikijsBaseUrl` to `createMcpServer()`

Key architectural constraint: Fastify `onSend` hooks cannot intercept MCP responses because the MCP SDK's `StreamableHTTPServerTransport` writes directly to `reply.raw`, bypassing Fastify's reply pipeline. Redaction must be applied at the tool handler layer, not at the HTTP layer.

See `.planning/research/ARCHITECTURE.md` for component boundaries, data flow diagrams, before/after code patterns, and full build order rationale.

### Critical Pitfalls

1. **Transition window PII exposure** — removing `isBlocked()` before wiki authors add markers to all previously-blocked pages exposes full PII. Mitigation: deploy redaction code first (additive alongside existing filter), add markers to all sensitive pages, audit coverage, then remove `isBlocked()` as a final separate step.

2. **Unclosed start marker causes silent PII leak** — a `<!-- gdpr-start -->` without matching `<!-- gdpr-end -->` passes content through unredacted with the naive single-regex approach. Mitigation: two-pass approach — run paired-marker regex first, then scan for remaining orphaned start markers and redact to end of content. This is fail-closed, not fail-open.

3. **Greedy quantifier consumes multiple GDPR sections** — `/<!-- gdpr-start -->[\s\S]*<!-- gdpr-end -->/g` (greedy `*`) matches from the first start marker to the last end marker, destroying public content between separate GDPR sections. Mitigation: use the lazy quantifier `[\s\S]*?`. Test with two marker pairs and public content between them.

4. **URL construction edge cases** — template literal concatenation fails on paths with spaces, Unicode, double slashes from trailing `/` on base URL. Mitigation: use the WHATWG `URL` class or `encodeURIComponent` per path segment. Add test cases for paths with spaces, Unicode, and special characters.

5. **Markers inside fenced code blocks** — regex has no concept of markdown structure; markers in code examples will be processed as real markers. Mitigation: document the limitation for v2.6; wiki authors must escape markers in code blocks.

See `.planning/research/PITFALLS.md` for all pitfalls including nested marker behavior, locale mismatch edge cases, and detection strategies.

## Implications for Roadmap

Research converges on a 3-phase implementation sequence. The phases are ordered by dependency: pure functions first, integration second, cleanup/tests last.

### Phase 1: Core Redaction Function

**Rationale:** `redactContent()` is a pure function with no dependencies. It is the foundation everything else builds on. Starting here validates the regex pattern, the malformed-marker behavior, and the `RedactionResult` interface before any integration work begins.
**Delivers:** `src/gdpr.ts` rewritten with `redactContent()`, `src/types.ts` updated with `locale?: string`, `src/__tests__/gdpr.test.ts` rewritten with full test coverage including happy path, multiple pairs, malformed marker, null/undefined inputs.
**Addresses:** Must-have features — marker redaction, fail-safe, placeholder text, multiple pairs, case/whitespace tolerance.
**Avoids:** Pitfall 2 (unclosed marker) and Pitfall 3 (greedy quantifier) — both are first-commit regex decisions that must be correct from the start.

### Phase 2: Integration — Remove Old Filtering, Wire Redaction and URL Injection

**Rationale:** With `redactContent()` tested and working, the integration changes are low-risk. This phase removes the `isBlocked()` filter from all three tool handlers, wires the new redaction into `get_page`, adds URL injection, and threads `wikijsBaseUrl` through the call chain.
**Delivers:** `src/mcp-tools.ts`, `src/api.ts`, `src/server.ts`, `src/routes/mcp-routes.ts` all updated. The `get_page` tool returns redacted content and a `url` field. `list_pages` and `search_pages` return unfiltered results.
**Uses:** `redactContent()` from Phase 1, `locale` field from Phase 1's types change, existing `WIKIJS_BASE_URL` config.
**Implements:** Content transformation between fetch and serialize; config threading pattern for `wikijsBaseUrl`.
**Avoids:** Pitfall 4 (URL construction edge cases) — use `URL` class, not template literals. Pitfall 6 (inconsistent redaction across tools) — redaction is scoped to `get_page` content only.

### Phase 3: Integration Tests and Cleanup

**Rationale:** Rewrite integration tests after the implementation is stable. Tests that mock `WikiJsApi` and exercise the full `get_page` handler verify that redaction, malformed-marker logging, and URL injection work together as a system. `isBlocked()` removal is confirmed safe only after end-to-end tests pass.
**Delivers:** `src/__tests__/mcp-tools-gdpr.test.ts` rewritten. Confirms `get_page` with markers, without markers, with malformed markers, and URL correctness. Confirms `list_pages` and `search_pages` return all pages. Removes obsolete v2.5 path-filter tests.
**Avoids:** Pitfall 1 (transition window) — the old `isBlocked()` code is removed only in this final phase, after redaction is verified end-to-end.

### Phase Ordering Rationale

- Pure function before integration: `redactContent()` has no dependencies and can be tested in complete isolation. A verified contract before touching `mcp-tools.ts` eliminates a class of integration bugs.
- `locale` in types and API before URL injection: URL construction requires `page.locale`, which requires the GraphQL query change in `api.ts` and the type change in `types.ts`. These land in Phase 1/2 before the URL injection code uses them.
- `isBlocked()` removal last: the old filter must not be removed until the new redaction is working end-to-end. This is the safety gate that prevents the transition window PII exposure (Pitfall 1).
- Three phases matches the v2.5 precedent established in ARCHITECTURE.md.

### Research Flags

No phases require `/gsd:research-phase` — the domain is fully documented across the four research files.

Phases with standard patterns (skip additional research):
- **Phase 1:** Pure regex and string operations on well-understood input. Regex pattern is analyzed and confirmed safe (linear-time, no ReDoS risk) in STACK.md and PITFALLS.md. Pure function testing follows existing Vitest patterns.
- **Phase 2:** Config threading and GraphQL query modification follow established patterns already in the codebase. All integration points are precisely identified in ARCHITECTURE.md.
- **Phase 3:** Vitest unit and integration tests follow existing test patterns. No new test infrastructure needed.

Execution-time concerns (not research gaps, flag for code review):
- **Phase 2, URL construction:** Confirm the WHATWG `URL` class is used, not template literal concatenation. Test with paths containing spaces and Unicode.
- **Phase 2, `locale` fallback:** Confirm `page.locale ?? "en"` fallback is present wherever the URL is constructed.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new dependencies; all capabilities verified against official Node.js and MDN docs; ReDoS safety confirmed via regex structure analysis |
| Features | HIGH | Requirements clearly defined in PROJECT.md; feature boundaries well-reasoned with explicit anti-features documented; dependency graph complete |
| Architecture | HIGH | Based on direct code inspection of current `src/` files; all integration points identified precisely; before/after code patterns specified |
| Pitfalls | HIGH | Regex backtracking patterns verified against authoritative regex security sources; transition safety analysis based on direct inspection of 371 existing tests; Wiki.js path/URL format verified via official docs |

**Overall confidence:** HIGH

### Gaps to Address

- **Wiki author migration prerequisite:** The transition from path-based blocking to marker-based redaction requires wiki authors to add `<!-- gdpr-start -->` / `<!-- gdpr-end -->` markers to all previously-blocked `Clients/<CompanyName>` pages before `isBlocked()` is removed. This is an operational dependency outside the codebase. The roadmap should include an explicit gate (audit step) between Phase 2 and the removal of `isBlocked()`, or treat the removal as a separate post-migration task.

- **Locale fallback correctness:** Architecture research recommends `page.locale ?? "en"` as the URL fallback. If the target Wiki.js instance uses a non-English default locale, hardcoding `"en"` produces wrong URLs. This should be validated against the actual deployment; if needed, the fallback can be driven by `WIKIJS_LOCALE` (already documented in CLAUDE.md as an optional env var).

- **URL encoding for paths with spaces and Unicode:** PITFALLS.md confirms this is a real risk and that Wiki.js allows spaces in paths (e.g., `Clients/Acme Corp`). Implementation must include test cases for paths with spaces, Unicode, and special characters. The WHATWG `URL` class handles this correctly; template literal concatenation does not.

## Sources

### Primary (HIGH confidence)

- Direct codebase analysis — `src/mcp-tools.ts`, `src/gdpr.ts`, `src/api.ts`, `src/types.ts`, `src/config.ts`, `src/server.ts`, `src/routes/mcp-routes.ts` — establishes integration points, existing patterns, and change surface
- [MDN: String.prototype.replace()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace) — regex replacement API reference
- [MDN: RegExp dotAll flag](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp/dotAll) — `s` flag availability in ES2018+
- [Node.js URL API documentation](https://nodejs.org/api/url.html) — WHATWG URL class reference and best practices
- [WHATWG HTML Comments Issue](https://github.com/whatwg/html/issues/10153) — nested comments not allowed per HTML spec
- [Wiki.js GraphQL API](https://docs.requarks.io/dev/api) — content field returns raw editor content; `locale` field confirmed on search results

### Secondary (MEDIUM confidence)

- [Sonar: Dangers of Regular Expressions in JavaScript](https://www.sonarsource.com/blog/vulnerable-regular-expressions-javascript/) — ReDoS pattern analysis confirming fixed-delimiter patterns are safe
- [AuthZed: Fail Open vs Fail Closed](https://authzed.com/blog/fail-open) — security principle definitions; GDPR mandates fail-closed for data protection
- [TermsFeed: Data Redaction Under GDPR](https://www.termsfeed.com/blog/gdpr-data-redaction/) — `[REDACTED]` as standard placeholder per GDPR guidance
- [Redactable: GDPR Redaction Guidelines](https://www.redactable.com/blog/gdpr-redaction-guidelines) — consistency in placeholder text
- [Wiki.js Locales](https://docs.requarks.io/locales) — locale prefix in page URLs
- [Wiki.js Pages](https://docs.requarks.io/guide/pages) — path-based page structure
- [How to Safely Concatenate URLs with Node.js](https://plainenglish.io/blog/how-to-safely-concatenate-url-with-node-js-f6527b623d5) — URL class vs string concatenation best practices

### Tertiary (evaluated and rejected)

- [RE2 safe regex library](https://www.oreateai.com/blog/unlocking-the-power-of-re2-a-safe-alternative-for-regular-expressions-in-nodejs/f47e51a51ef4b558a7aaeec6890a5ebb) — evaluated and rejected; native C++ dep complicates Alpine Docker image with no benefit for this pattern shape
- [html-comment-regex npm](https://www.npmjs.com/package/html-comment-regex) — evaluated and rejected; abandoned since 2016; our pattern is simpler and more specific

---
*Research completed: 2026-03-27*
*Ready for roadmap: yes*
