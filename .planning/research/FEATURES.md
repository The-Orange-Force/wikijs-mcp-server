# Feature Research

**Domain:** GDPR path filtering for API middleware (MCP server, path-based access control)
**Researched:** 2026-03-27
**Confidence:** HIGH

## Context

This research covers only the new features needed for v2.5: a GDPR path filter applied to the three existing MCP tools. The existing tools (`get_page`, `list_pages`, `search_pages`) already work; this milestone adds a blocking layer on top of them.

**The blocking rule:** A page is blocked if its path has exactly 2 segments AND the first segment is `Clients` (case-sensitive). Examples: `Clients/CompanyA` is blocked; `Clients/CompanyA/ProjectA` is not; `clients/CompanyA` is not (wrong case).

**Why this design:** The `Clients/` tree in Wiki.js holds a flat directory where each direct child is a company's root page — the page that aggregates everything about that client. Sub-pages (`Clients/CompanyA/ProjectA`) describe work, not the data subject, so they are not in scope for this GDPR restriction. The filter is surgical: block exactly the pages that directly identify a GDPR data subject (the company as client), leave everything else accessible.

---

## Feature Landscape

### Table Stakes (Users Expect These)

These are the behaviors any GDPR-compliant access control layer must exhibit. Missing any one of them produces an insecure or incorrect implementation.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Shared `isBlocked(path)` utility** | All three tools must apply the same rule. Duplicating the predicate would allow them to diverge silently. A single function is the canonical source of truth. | LOW | Pure function: `(path: string) => boolean`. No I/O, no state. Splits on `/`, checks `segments.length === 2 && segments[0] === 'Clients'`. |
| **`get_page` returns generic "not found" for blocked pages** | OWASP and GDPR both recommend returning 404 (not found) rather than 403 (forbidden) when the resource existence itself is sensitive. Returning a distinct error for blocked pages leaks that the page exists, which can be used to enumerate client names. The MCP tool layer mirrors this: return an error indistinguishable from a legitimate "page not found". | LOW | The `getPageById` call must happen first (to get the path), then `isBlocked(page.path)` is checked. If blocked, return the same error shape as a missing page. Alternative: resolve path before fetching — but page IDs are opaque to the caller, so fetching first is required. |
| **`search_pages` silently excludes blocked pages from results** | A search for "Acme" should not return a result for `Clients/Acme` even though it is indexed in Wiki.js. Leaking the result (even without content) reveals that a client named "Acme" exists. Silent omission is the correct pattern for search and list contexts: the response is "here are the results I can share", not "here are the results, some were hidden". | LOW | Post-fetch filter: call WikiJs search, then `results.filter(p => !isBlocked(p.path))`. No WikiJs API change needed. |
| **`list_pages` silently excludes blocked pages from results** | Same rationale as `search_pages`. List results are already filtered by `isPublished` in the existing code; GDPR blocking is a second filter applied after that. | LOW | Post-fetch filter: same pattern as `search_pages`. |
| **Filter applied server-side, not client-side** | OWASP explicitly calls out client-side filtering as a security anti-pattern (API4:2023 Unrestricted Resource Consumption). The filter must live in the MCP server, not in the AI assistant's prompt or Claude's reasoning. | LOW | Already the case — this is a server-side code change. Noted here to prevent future regression where someone moves the logic into the instructions file. |
| **Path comparison is case-sensitive** | Wiki.js paths are case-sensitive (`Clients/` and `clients/` are different paths). The filter must match the actual convention used in the wiki (`Clients` with capital C) and not over-block or under-block based on case variations. | LOW | Use strict string equality: `segments[0] === 'Clients'`, not `.toLowerCase()`. If the wiki ever uses `clients/` (lowercase), that is a separate data issue, not a filter issue. |

### Differentiators (Competitive Advantage)

Features beyond the minimum that improve security posture, observability, or future extensibility.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Structured audit log for blocked access attempts** | GDPR Article 30 requires records of how personal data is processed. Logging blocked access attempts (with correlation ID, user identity, and the fact that access was blocked — but NOT the page path, which is itself sensitive) creates an audit trail for compliance reporting. This is separate from general request logging. | LOW | One `log.warn` or `log.info` call per blocked attempt, using the existing `requestContext` correlation ID and `user` identity. Log event type (`gdpr_block`), tool name, and timestamp. Do NOT log the path — it reveals client identity. |
| **Block check runs before network call in `get_page`** | For `get_page`, the ID is opaque — you cannot know the path without fetching the page first. But for defensive depth: if in a future refactor the path becomes available earlier (e.g. through a path-based tool), the check should be as early as possible. Document this constraint explicitly. | LOW | Current constraint: path is only known after `getPageById`. Future opportunity: if a `getPageByPath` variant is added, block before the WikiJs call entirely. |
| **Deterministic segment parsing** | Using `path.split('/')` and checking `segments.length === 2 && segments[0] === 'Clients'` handles edge cases: trailing slash (`Clients/Acme/` has 3 segments after split, but a trailing empty string needs trimming), leading slash (`/Clients/Acme`), empty paths. Codify the exact parsing contract in unit tests. | LOW | Strip leading/trailing slashes before splitting: `path.replace(/^\/+\|\/+$/g, '').split('/')`. This is a small detail but prevents bypass via path normalization tricks. |
| **`isBlocked` exported and unit-tested in isolation** | The utility being a pure exported function makes it independently testable without starting a server. This is the correct design for a security predicate — 100% branch coverage is achievable and expected. | LOW | Export from a new `src/gdpr-filter.ts` module (or similar). Keep it separate from `mcp-tools.ts` so it can be tested without mock setup. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Returning 403 Forbidden for blocked pages in `get_page`** | 403 is semantically "you don't have permission" which is technically accurate | 403 reveals that the page exists. An AI model or user could enumerate all client names by systematically calling `get_page` and observing 403 vs 404. OWASP API Security Top 10 (BOLA) explicitly recommends 404 over 403 when resource existence is sensitive. | Return the same generic "page not found" error as any non-existent page ID. The MCP tool's `isError: true` response with a neutral message is correct. |
| **Logging the blocked page path in audit logs** | Seems useful for debugging "why was this request blocked?" | The path itself is the sensitive data — it contains the client company name. Logging `Clients/CompanyA` was blocked means the log file now contains GDPR-sensitive data. If logs are shipped to an external system (Datadog, Splunk), this expands the data processing footprint. | Log the event type and tool name only. "A GDPR-blocked page was accessed via get_page by user X" is sufficient for audit purposes without logging the path. |
| **Pattern-based blocking (regex or glob config)** | Seems flexible — what if the rule changes? | Adds configuration surface that must be validated, documented, and tested. The rule for this milestone is fixed and well-understood. Premature generalization creates bugs in the blocking predicate itself. | Hard-code the specific rule in `isBlocked()`. If the rule needs to change, it is a code change with tests — safer than a config change with no tests. |
| **Blocking at the WikiJs API layer (in `api.ts`)** | "Better to block early" — seems like defense in depth | `api.ts` is a thin GraphQL client; injecting security policy there mixes concerns. It also cannot block `get_page` without fetching first anyway (ID is opaque). The tool layer is the right place: it has access to the full page object and the tool context. | Apply the filter in `mcp-tools.ts` tool handlers, where the full page object with path is available. |
| **Per-user blocking (different users see different pages)** | Could allow admins to access blocked pages | This project uses a shared API token — all users have identical access. Adding per-user exceptions requires user-identity-based logic that the current architecture does not support. Also out of scope per PROJECT.md ("Per-user WikiJS permissions — everyone has equal access via shared API token"). | GDPR blocking is uniform. All users are subject to the same filter. |
| **Blocking sub-paths too (e.g., `Clients/CompanyA/ProjectA`)** | "If the company is sensitive, all their pages should be blocked" | Over-blocking. Sub-pages describe work products, not the data subject directly. The PROJECT.md requirement is explicit: exactly 2 segments. Blocking sub-paths would hide legitimate technical content that colleagues need to access. | Block only the exact top-level client directory page as specified: `segments.length === 2 && segments[0] === 'Clients'`. |
| **Blocking the entire `Clients/` tree via prefix match** | Simpler to implement — just check `path.startsWith('Clients/')` | Same over-blocking problem as above. Sub-pages like `Clients/CompanyA/Deployment` are not GDPR-sensitive in the same way. | Exact 2-segment match only. |

---

## Feature Dependencies

```
isBlocked(path) utility [src/gdpr-filter.ts]
    |
    +--applied-in--> get_page handler [src/mcp-tools.ts]
    |                    |
    |                    +--requires--> page fetch first (path not known from ID)
    |                    |
    |                    +--returns--> generic "not found" error (not GDPR-specific message)
    |
    +--applied-in--> search_pages handler [src/mcp-tools.ts]
    |                    |
    |                    +--applied-after--> WikiJs search results returned
    |                    |
    |                    +--returns--> filtered results array (silent omission)
    |
    +--applied-in--> list_pages handler [src/mcp-tools.ts]
                         |
                         +--applied-after--> existing isPublished filter
                         |
                         +--returns--> filtered results array (silent omission)
```

### Dependency Notes

- **`get_page` requires page fetch before block check:** Page IDs are opaque integers. The path is only known after calling `wikiJsApi.getPageById(id)`. The fetch must happen first, then `isBlocked(page.path)` is evaluated. This means one WikiJs API call is made for every blocked `get_page` request — unavoidable with the current ID-based API.
- **`search_pages` and `list_pages` are post-fetch filters:** These tools receive arrays of `WikiJsPage` objects (which have `path` fields). The filter is applied after the WikiJs API returns results, before returning to the MCP client. No extra API calls needed.
- **`isBlocked` has no dependencies:** It is a pure function that only inspects the `path` string. It does not call any APIs, read config, or require async I/O. This makes it trivially testable and impossible to fail at runtime.
- **Audit logging enhances `get_page`, `search_pages`, `list_pages`:** The `requestContext` (AsyncLocalStorage with correlation ID and user identity) is already available in all three tool handlers. The audit log call is additive — it does not change the control flow.

---

## MVP Definition

### Launch With (v2.5)

Minimum viable product — what is needed to comply with the GDPR requirement.

- [x] `isBlocked(path: string): boolean` utility — pure function, 2-segment `Clients/` rule, exported and unit-tested
- [x] `get_page` returns generic "not found" for blocked pages — no existence leak
- [x] `search_pages` silently filters blocked pages from results — no result leak
- [x] `list_pages` silently filters blocked pages from results — no result leak
- [x] Unit tests: `isBlocked` edge cases (exact 2-segment, sub-paths, case variants, empty, leading/trailing slashes)
- [x] Integration tests: each tool returns correct response shape for blocked pages

### Add After Validation (v2.5.x)

Features to add once the core filter is working and verified in production.

- [ ] Structured audit logging for blocked access attempts — add after confirming correlation IDs are correctly threaded in all three tools
- [ ] Expand `isBlocked` test suite with property-based tests for path normalization edge cases — if any path normalization bugs surface in production

### Future Consideration (v3+)

Features to defer until there is a demonstrated need.

- [ ] Configurable block rules (pattern-based blocking) — only if new GDPR-sensitive path patterns emerge that require the same treatment
- [ ] Block check before WikiJs fetch for `get_page` — only possible if a path-based lookup tool is added; current ID-based API makes this impossible
- [ ] Per-category blocking with different response strategies (block vs. redact) — only if compliance requirements evolve beyond simple blocking

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| `isBlocked()` utility | HIGH (foundation for all blocking) | LOW | P1 |
| `get_page` generic not-found for blocked | HIGH (prevents existence leak) | LOW | P1 |
| `search_pages` silent filter | HIGH (prevents result leak) | LOW | P1 |
| `list_pages` silent filter | HIGH (prevents result leak) | LOW | P1 |
| Path normalization (trim slashes) | MEDIUM (prevents bypass) | LOW | P1 |
| Unit tests for `isBlocked` edge cases | HIGH (security predicate must be correct) | LOW | P1 |
| Structured audit logging | MEDIUM (GDPR Article 30 compliance) | LOW | P2 |
| Configurable block rules | LOW (no current need) | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## Implementation Notes

### Exact predicate logic

```typescript
// src/gdpr-filter.ts
export function isBlocked(path: string): boolean {
  const normalized = path.replace(/^\/+|\/+$/g, '');
  const segments = normalized.split('/');
  return segments.length === 2 && segments[0] === 'Clients';
}
```

Edge cases this handles:
- `Clients/CompanyA` → blocked (exactly 2 segments)
- `Clients/CompanyA/ProjectA` → not blocked (3 segments)
- `Clients` → not blocked (1 segment — the tree root, not a client page)
- `/Clients/CompanyA` → blocked (leading slash stripped before split)
- `Clients/CompanyA/` → blocked (trailing slash stripped before split)
- `clients/CompanyA` → not blocked (case mismatch)
- `` (empty) → not blocked (0 segments)

### Response shape for blocked `get_page`

The blocked response must be indistinguishable from a legitimate "page not found" error:

```typescript
// Inside get_page handler, after fetching the page:
if (isBlocked(page.path)) {
  return {
    isError: true,
    content: [{ type: 'text', text: 'Error in get_page: page not found. Verify the page ID using search_pages or list_pages.' }],
  };
}
```

The error message matches what the tool would return for an invalid ID — no distinct wording that reveals the page was blocked.

### Filter placement for `search_pages` and `list_pages`

```typescript
// In search_pages handler:
const result = await wikiJsApi.searchPages(query, limit);
const filtered = result.results.filter(p => !isBlocked(p.path));
// return filtered (not result.results)

// In list_pages handler:
const pages = await wikiJsApi.listPages(limit, orderBy, includeUnpublished);
const filtered = pages.filter(p => !isBlocked(p.path));
// return filtered (not pages)
```

Note: `list_pages` already filters by `isPublished` inside `api.ts`. The GDPR filter is applied in the tool handler after `api.ts` returns. This keeps security policy out of the data-access layer.

---

## Sources

- [OWASP BOLA - Return 404 over 403 to prevent information leakage](https://owasp.org/API-Security/editions/2023/) — HIGH confidence, official OWASP API Security Top 10
- [OWASP REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html) — HIGH confidence
- [When to return 404 instead of 403](https://www.insights.cgi.com/blog/when-should-you-return-404-instead-of-403-http-status-code) — MEDIUM confidence, consistent with OWASP guidance
- [API Authorization Code Patterns - NCC Group](https://www.nccgroup.com/research-blog/code-patterns-for-api-authorization-designing-for-security/) — MEDIUM confidence
- [Security Trimming Pattern - Azure AI Search](https://learn.microsoft.com/en-us/azure/search/search-security-trimming-for-azure-search) — HIGH confidence, authoritative Microsoft docs; establishes "silent filter" as the standard pattern for search result access control
- [GDPR Audit Logging Best Practices](https://last9.io/blog/gdpr-log-management/) — MEDIUM confidence; GDPR Article 30 requires processing records
- [GDPR Logging and Monitoring](https://www.konfirmity.com/blog/gdpr-logging-and-monitoring) — MEDIUM confidence
- PROJECT.md — requirement source (v2.5 milestone, "Clients/<CompanyName>" blocking rule, out-of-scope list)

---
*Feature research for: GDPR path filtering in wikijs-mcp-server v2.5*
*Researched: 2026-03-27*
