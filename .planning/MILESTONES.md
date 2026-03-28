# Milestones

## v2.7 Metadata Search Fallback (Shipped: 2026-03-28)

**Phases:** 28-29 (2 phases, 2 plans, 4 tasks)
**Tests:** 441 passing across 26 files
**LOC:** 4,075 TypeScript (src/)
**Timeline:** 1 day (2026-03-27 → 2026-03-28)
**Commits:** 19 | **Lines changed:** +742 / -11
**Requirements:** 10/10 satisfied
**Audit:** tech_debt (v2.7-MILESTONE-AUDIT.md) — 0 blockers, 5 non-critical items

**Delivered:** Metadata search fallback that supplements GraphQL search with case-insensitive substring matching on page titles and paths, ensuring acronyms, path segments, and short tokens always surface results.

**Key accomplishments:**
1. `searchPagesByMetadata()` private method with title-before-path ranking and deduplication by page ID
2. Data sharing between `resolveViaPagesList()` and `searchPagesByMetadata()` via extended return type (no duplicate GraphQL calls)
3. Two integration points in `searchPages()`: zero-result early return and post-step-3 shortfall check
4. Structured info-level logging with `{ query, metadataHits, totalResolved }` fields via requestContext pino logger
5. Updated `search_pages` tool description for AI client discoverability of path/title/description matching
6. Comprehensive 12-test dedicated test file covering full fallback matrix (deduplication, unpublished filtering, limit enforcement, observability)

**Known Tech Debt:**
- Documentation discrepancy: META-01 text mentions "descriptions" but implementation only matches title/path (locked design decision)
- TOOL-01: search_pages description says "descriptions" but searchPagesByMetadata() only matches title and path
- Nyquist validation incomplete for both phases (partial compliance)
- Pre-existing: tests/docker-config.test.ts fails (instructions.txt missing at repo root)

**Archives:** [ROADMAP](milestones/v2.7-ROADMAP.md) | [REQUIREMENTS](milestones/v2.7-REQUIREMENTS.md) | [AUDIT](milestones/v2.7-MILESTONE-AUDIT.md)

---

## v2.6 GDPR Content Redaction (Shipped: 2026-03-27)

**Phases:** 25-27 (3 phases, 4 plans, 7 tasks)
**Tests:** 366 passing across 25 files
**LOC:** 7,700 TypeScript
**Timeline:** 1 day (2026-03-27)
**Commits:** 24 | **Lines changed:** +1,062 / -1,021
**Requirements:** 10/10 satisfied
**Audit:** tech_debt (v2.6-MILESTONE-AUDIT.md) — 0 blockers, 4 minor items

**Delivered:** Marker-based GDPR content redaction replacing path-based page blocking, with page URL injection in get_page responses.

**Key accomplishments:**
1. `redactContent()` pure function with two-pass regex for `<!-- gdpr-start/end -->` marker-based content redaction (26 unit tests)
2. `buildPageUrl()` helper injecting direct wiki page URLs into get_page responses with configurable locale
3. Removed `isBlocked()` path-based filtering from all 3 MCP tool handlers — all published pages now accessible
4. Fail-closed safety: unclosed GDPR markers redact to end of content with structured warning logging
5. 6-test E2E verification suite covering full redaction + URL + filter removal stack

**Known Tech Debt:**
- smoke.test.ts calls createMcpServer with 2 args instead of 3 (latent TypeError if get_page invoked)
- TypeScript compile errors in mcp-tools-phase26.test.ts (missing msgPrefix on mock)
- Version string split: public-routes.ts and package.json at 2.4.0, mcp-tools.ts at 2.6.0
- Pre-existing: tests/docker-config.test.ts fails (instructions.txt missing at repo root)

**Archives:** [ROADMAP](milestones/v2.6-ROADMAP.md) | [REQUIREMENTS](milestones/v2.6-REQUIREMENTS.md) | [AUDIT](milestones/v2.6-MILESTONE-AUDIT.md)

---

## v2.5 GDPR Path Filter (Shipped: 2026-03-27)

**Phases:** 22-24 (3 phases, 3 plans)
**Tests:** 371 passing (50 GDPR-specific across 2 files)
**LOC:** 7,663 TypeScript
**Timeline:** 1 day (2026-03-27)
**Commits:** 13 | **Lines changed:** +1,069 / -2
**Requirements:** 8/8 satisfied
**Audit:** tech_debt (v2.5-MILESTONE-AUDIT.md) — 0 blockers, Nyquist drafts only

**Delivered:** GDPR-compliant path filtering that blocks access to direct client directory pages at the MCP server level, with timing-safe responses and zero information leakage.

**Key accomplishments:**
1. `isBlocked()` GDPR path-blocking predicate with full edge-case unit test coverage (20 tests)
2. GDPR path filtering in all 3 MCP tool handlers with timing-safe error responses
3. Structured audit logging for blocked access attempts (no company names in logs)
4. Byte-identical get_page blocked responses vs genuine "not found" (prevents existence oracle)
5. End-to-end integration tests verifying MCP response shapes for blocked/non-blocked paths (14 tests)
6. Instructions security audit confirming no GDPR filter information leakage

**Known Tech Debt:**
- Nyquist VALIDATION.md in draft state for all 3 phases
- Pre-existing: tests/docker-config.test.ts fails (instructions.txt missing at repo root)

**Archives:** [ROADMAP](milestones/v2.5-ROADMAP.md) | [REQUIREMENTS](milestones/v2.5-REQUIREMENTS.md) | [AUDIT](milestones/v2.5-MILESTONE-AUDIT.md)

---

## v2.4 MCP Instructions Field (Shipped: 2026-03-27)

**Phases:** 19-21 (3 phases, 4 plans, 8 tasks)
**Tests:** 321 passing across 23 files
**LOC:** 3,225 TypeScript (src/)
**Timeline:** 1 day (2026-03-27)
**Commits:** 31 | **Files changed:** 40 (+2,726 / -55)
**Requirements:** 7/7 satisfied
**Audit:** tech_debt (v2.4-MILESTONE-AUDIT.md) — 0 blockers, 5 non-blocking items

**Delivered:** MCP initialize response includes instructions field that guides Claude to auto-search the wiki for relevant topics, with file-based customization and Docker volume mount support.

**Key accomplishments:**
1. Instructions loading module with file-based loading, 5-topic default fallback, and graceful error handling
2. MCP initialize response wired with instructions field threaded through Fastify plugin options
3. Default instructions.txt template with Docker read-only volume mount for runtime customization
4. Zod default for MCP_INSTRUCTIONS_PATH closes Docker flow gap — zero-config deploys work out-of-the-box

**Known Tech Debt:**
- Phase 21 Nyquist validation incomplete (draft state)
- instructions.txt uses generic [TOPIC] placeholders (deployer must customize)
- FILE-03 uses console.warn not pino (accepted per phase decision)

**Archives:** [ROADMAP](milestones/v2.4-ROADMAP.md) | [REQUIREMENTS](milestones/v2.4-REQUIREMENTS.md) | [AUDIT](milestones/v2.4-MILESTONE-AUDIT.md)

---

## v2.3 Tool Consolidation (Shipped: 2026-03-26)

**Phases:** 15-18 (4 phases, 8 plans)
**Tests:** 304 passing across 21 files
**LOC:** 6,305 TypeScript
**Timeline:** 1 day (2026-03-26)
**Requirements:** 12/12 satisfied
**Audit:** Passed (v2.3-MILESTONE-AUDIT.md)

**Delivered:** Consolidated 17 MCP tools to 3 read-only page tools with simplified scope model and clean codebase.

**Key accomplishments:**
1. Consolidated 17 MCP tools to 3 read-only tools (get_page, list_pages, search_pages)
2. Fixed search ID resolution with singleByPath + pages.list fallback for correct database IDs
3. Simplified scope model from 3 scopes (read/write/admin) to single wikijs:read
4. Removed STDIO transport and switched Docker to Alpine base image
5. Removed dead code (WikiJsUser/WikiJsGroup types, unused API methods, msal-node dependency)
6. Rewrote documentation for 3-tool, 1-scope architecture

**Archives:** [ROADMAP](milestones/v2.3-ROADMAP.md) | [REQUIREMENTS](milestones/v2.3-REQUIREMENTS.md) | [AUDIT](milestones/v2.3-MILESTONE-AUDIT.md)

---

## v2.2 OAuth Authorization Proxy (Shipped: 2026-03-26)

**Phases:** 10-14 (5 phases, 5 plans)
**Tests:** 209 passing across 15 files
**LOC:** 6,583 TypeScript
**Timeline:** 2 days (2026-03-25 → 2026-03-26)
**Commits:** 42 | **Files changed:** 46 (+7,949 / -75)
**Requirements:** 13/13 satisfied
**Audit:** Passed (v2.2-MILESTONE-AUDIT.md)

**Delivered:** OAuth 2.1 authorization proxy enabling Claude Desktop to complete the full auth flow against Azure AD without pre-configured client credentials.

**Key accomplishments:**
1. Pure-function scope mapping (MCP bare → Azure AD `api://` format) with RFC 8707 resource stripping
2. OAuth AS metadata and OpenID Connect discovery at well-known endpoints
3. Dynamic Client Registration returning pre-configured Azure AD client_id (public client)
4. GET /authorize redirect proxy with PKCE passthrough and two-phase error handling
5. POST /token proxy with AADSTS error normalization and bidirectional scope mapping
6. Full E2E discovery chain: PRM → AS metadata → DCR → authorize → token → MCP call

**Archives:** [ROADMAP](milestones/v2.2-ROADMAP.md) | [REQUIREMENTS](milestones/v2.2-REQUIREMENTS.md) | [AUDIT](milestones/v2.2-MILESTONE-AUDIT.md)

---

