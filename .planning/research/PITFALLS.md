# Domain Pitfalls: GDPR Path Filtering on an Existing MCP/API Server

**Domain:** Adding path-based access control (GDPR client directory blocking) to an existing MCP server
**Researched:** 2026-03-27
**Confidence:** HIGH (path normalization bypass patterns verified via security CVEs and PortSwigger research; GDPR personal-data scope verified via ICO/gdpr-info.eu official sources; existence-oracle pattern verified via Authress and LockMeDown guidance; Wiki.js path format verified via GitHub discussions)

**Context:** The wikijs-mcp-server already has 3 read-only tools (get_page, list_pages, search_pages) backed by Wiki.js GraphQL. This research covers pitfalls specific to ADDING a shared `isBlocked()` filter that silently blocks access to `Clients/<CompanyName>` paths (exactly 2 path segments where the first is "Clients"). No OAuth changes. Filter applies post-fetch.

---

## Critical Pitfalls

### Pitfall 1: Existence Oracle via Asymmetric Error Responses

**What goes wrong:**
`get_page` returns different responses for "blocked page that exists" vs "page that does not exist at all":
- Blocked: `{ isError: true, "Page not found." }`
- Not found: `{ isError: true, "Error in get_page: <GraphQL error message>." }`

A caller (AI or human) can enumerate which client company names exist in the wiki by probing IDs and comparing error messages. If `id=42` returns a generic "not found" error but `id=43` returns the same "not found" phrasing, both might be non-existent — OR 42 is a blocked client page. With enough probes and side-channel timing differences, the enumeration succeeds.

**Why it happens:**
Developers think "return not found" is sufficient. They do not realise the original API error for a truly absent page and the GDPR "not found" sentinel must be textually identical — and that latency can also differ (blocked path = no upstream call, absent path = upstream call that returns an error).

**How to avoid:**
1. `get_page` MUST call `getPageById()` first, then check `isBlocked()` on the returned `page.path`. This ensures both the blocked and the absent case go through the same upstream call and both produce identical timing.
2. Return the EXACT same error message string for blocked and truly-absent: `"Page not found."` — no mention of blocking, no GDPR language, no field names.
3. Do NOT short-circuit the upstream call by checking the numeric ID against a known list. IDs are opaque; paths are what reveal client names.

**Warning signs:**
- Blocked path returns faster (no upstream call) while absent path returns slower (upstream call fails)
- Error messages differ between the two cases
- Logs show blocked page access attempts with the page title or path in the message

**Phase to address:** `isBlocked()` utility + `get_page` integration (first implementation phase)

---

### Pitfall 2: Path Normalization Bypasses — Case, Trailing Slash, URL Encoding, Double Slash

**What goes wrong:**
Wiki.js stores paths without a leading slash and (per community discussion) folds path case — i.e., `clients/acme` and `Clients/ACME` resolve to the same page. If `isBlocked()` does a case-sensitive string comparison against `"Clients"`, the filter is bypassed by any variant casing. Additional bypass vectors:

| Input path | `isBlocked()` naively returns | Reality |
|---|---|---|
| `clients/acme` | `false` (wrong — lower-c) | Same page as `Clients/acme` |
| `Clients/acme/` | `false` (trailing slash) | Same page (Wiki.js ignores trailing slash) |
| `Clients//acme` | `false` (double slash) | Wiki.js normalises to `Clients/acme` |
| `Clients/acme/../acme` | `false` (dot-dot) | Wiki.js normalises |

**Why it happens:**
`"Clients" === segments[0]` is exact-match. The filter is implemented for the happy path, not adversarial inputs. Search results and list results return paths as Wiki.js stores them (normalised, lowercase-first-letter), so direct testing with clean data passes — but the MCP tool accepts arbitrary user input for `get_page` by ID, and the path comes back from the API. Path normalisation issues only bite if `isBlocked()` is also used on user-supplied path strings elsewhere.

**How to avoid:**
1. `isBlocked()` MUST normalise its input before comparison:
   ```typescript
   export function isBlocked(path: string): boolean {
     // Strip leading slash, collapse double slashes, strip trailing slash
     const normalised = path
       .replace(/^\/+/, '')
       .replace(/\/+/g, '/')
       .replace(/\/+$/, '');
     const segments = normalised.split('/');
     return segments.length === 2 && segments[0].toLowerCase() === 'clients';
   }
   ```
2. Case fold only the first segment — do not alter the company name segment (it is only used for the count check, not displayed).
3. Add a unit test suite covering every normalisation variant listed above.
4. For `list_pages` and `search_pages` the path comes from Wiki.js GraphQL responses (already normalised), so the risk is lower — but the utility should be defensive regardless.

**Warning signs:**
- Unit tests only cover `Clients/acme` (the happy path)
- `isBlocked()` does not call `.toLowerCase()` on the first segment
- No test for empty path, single-segment path, or path with leading slash

**Phase to address:** `isBlocked()` utility implementation — address before integration into any tool

---

### Pitfall 3: Search Results Leak Client Names in `description` and `title` Fields

**What goes wrong:**
`search_pages` filters blocked pages from results by checking `isBlocked(page.path)`. However, the search results also include a `description` field and a `title` field. A client page `Clients/Acme` might have the title "Acme — Client Overview" and description "All information about Acme Corp (GDPR-sensitive client)." Even if the page itself is removed from results, if ANY other non-blocked page contains a hyperlink or mention of the Acme client page in its content, `search_pages` will return that unblocked page with a content excerpt that mentions "Acme." This is an indirect leakage via search excerpt, not a path filter bypass.

**Why it happens:**
Path filtering only removes the direct client pages. It does not scrub mentions of client names from content on other pages. A wiki structure where other pages link to or discuss client pages is common.

**How to avoid:**
This is a **scope boundary decision** that must be made explicitly:
1. Accept that indirect mentions in non-blocked pages are out of scope — document this explicitly in code comments and the design doc.
2. Do not attempt content scrubbing (it would require semantic understanding and is out of scope for a path-filter implementation).
3. The GDPR requirement (per PROJECT.md) is to block "direct client directory pages" — indirect mentions in other pages are not the target.

Ensure this scope decision is documented so a future reviewer does not try to "fix" the intentional gap.

**Warning signs:**
- A reviewer or auditor flags that search for a client name returns excerpts mentioning that client
- The requirement scope is ambiguous about "indirect references"

**Phase to address:** Design phase / implementation phase — write an explicit comment in `isBlocked()` stating scope

---

### Pitfall 4: `list_pages` Leaks Blocked-Page Existence via `totalHits` Count or Page Count Discrepancy

**What goes wrong:**
`list_pages` silently filters blocked pages. The response is a JSON array of pages. If a caller knows "there are 47 pages in the wiki" (e.g., from a previous call before the filter was deployed), and after deployment `list_pages` returns 45 pages, they can infer 2 client pages exist. This is a low-severity existence oracle through count discrepancy.

For `search_pages`, the `totalHits` field from Wiki.js GraphQL reflects the unfiltered index count. After filtering `results`, the caller sees `results.length < totalHits`, which reveals that some pages were filtered.

**Why it happens:**
`totalHits` is returned as-is from the upstream GraphQL response. Filtering happens post-fetch in application code. The count is not adjusted.

**How to avoid:**
1. `search_pages` MUST NOT return `totalHits` to the caller (do not expose it in the MCP tool response), OR recalculate `totalHits` as `results.length` after filtering. The current `mcp-tools.ts` returns only `result.results` (not `result.totalHits`) — verify this is preserved after the filter integration.
2. `list_pages` returns an array; the count is implicit in the array length. This is acceptable — array length leakage is a low-severity residual risk that matches accepted scope.
3. Document the `totalHits` decision explicitly.

**Warning signs:**
- `searchPages()` in `api.ts` returns `{ results, totalHits }` and `mcp-tools.ts` passes the whole object to the caller
- Integration test that checks `totalHits` in the search response

**Phase to address:** `search_pages` integration — check `mcp-tools.ts` line 181 which currently returns `result.results` (correct — do not change this)

---

## Moderate Pitfalls

### Pitfall 5: GDPR Scope Overreach — Blocking Sub-Pages (`Clients/Acme/Projects`)

**What goes wrong:**
The filter rule is "exactly 2 segments where first is `Clients`." A path `Clients/Acme/Projects` has 3 segments and is NOT blocked by the current rule. This is correct per PROJECT.md scope. However, if sub-pages contain personal data (GDPR-sensitive contacts, contract details), the 2-segment rule creates a false sense of coverage.

**Why it happens:**
The filter rule is written to block exactly `Clients/<CompanyName>` (the directory index page). Sub-pages under a client were not assessed for GDPR sensitivity.

**How to avoid:**
1. The current scope is explicitly "exactly 2 segments" — preserve this.
2. Add a code comment stating: "Sub-pages (`Clients/Acme/Projects`) are out of scope for this filter. If those pages contain personal data, the rule must be extended or WikiJS permissions must be used."
3. Do not silently expand the rule to 3+ segments without an explicit decision.

**Warning signs:**
- `isBlocked()` implementation uses `segments.length >= 2` instead of `=== 2`
- No test explicitly covering 3-segment Clients paths

**Phase to address:** `isBlocked()` utility — add explicit boundary test

---

### Pitfall 6: Filter Applied Only to Tool Responses, Not to Intermediate Logging

**What goes wrong:**
`tool-wrapper.ts` uses `wrapToolHandler()` which logs timing and structured events. If the wrapper logs the full tool input or response payload at DEBUG level, a blocked page's path or content appears in server logs — which are stored and may be accessible to more people than the wiki itself.

**Why it happens:**
Logging is added for observability without considering that some payloads contain GDPR-sensitive identifiers (the client company name embedded in the path).

**How to avoid:**
1. Do not log the `path` field of blocked pages in the filter logic.
2. Log a generic event: `{ blocked: true }` — do not log `{ blocked: true, path: "Clients/Acme" }`.
3. Review `tool-wrapper.ts` to confirm it does not log full response bodies at any log level.
4. Confirm that pino's default serializers do not deep-serialize tool responses.

**Warning signs:**
- `isBlocked()` returns early and logs the path it blocked
- `wrapToolHandler` has a `log.debug({ result })` that serializes the full tool response

**Phase to address:** `isBlocked()` utility + `tool-wrapper.ts` audit

---

### Pitfall 7: MCP Instructions Field Hints at the Filter Existence

**What goes wrong:**
The `instructions.txt` file (loaded at startup and returned in the MCP `initialize` response) might contain guidance like "Note: client directory pages are blocked for GDPR compliance." An AI assistant reading the instructions learns that a `Clients/` path structure exists and that pages are blocked. This is an information disclosure via the protocol's own metadata.

**Why it happens:**
Instructions are helpful for guiding the AI, but they are also visible to any authenticated caller inspecting the `initialize` response.

**How to avoid:**
1. Do NOT mention the path filter or its structure in `instructions.txt`.
2. Do NOT name the blocked path pattern in any user-facing documentation or tool descriptions.
3. If guidance is needed for the AI, phrase it as a general capability description without naming the blocked domain.

**Warning signs:**
- `instructions.txt` contains the word "Clients" or "GDPR" or "blocked"
- Tool descriptions in `mcp-tools.ts` mention filtering or GDPR

**Phase to address:** Instructions file review — verify after filter implementation

---

### Pitfall 8: GDPR Audit Log Gap — No Record of Blocked Access Attempts

**What goes wrong:**
GDPR Article 30 and accountability principle require demonstrating that access controls are working. If a blocked access attempt produces no log entry (because the filter is silent), there is no audit trail showing the GDPR control was exercised. A DPA audit or internal security review cannot verify the filter is protecting data.

**Why it happens:**
"Silent filtering" is correct for the tool response (to prevent existence oracle), but it should still produce an internal log event that is NOT surfaced to the caller.

**How to avoid:**
1. Log blocked access attempts at `INFO` or `WARN` level server-side: `log.info({ tool: "get_page", blocked: true, userId: ctx.user.oid }, "GDPR path filter blocked access")`.
2. Do NOT include the company name (the sensitive part of the path) in the log — log that a block occurred for a "Clients/* path" without naming the specific company.
3. Use the existing `requestContext` (AsyncLocalStorage) to include correlation ID and user identity in the log entry, supporting GDPR audit requirements for "who tried to access what, when."
4. Verify that pino log level in production is `INFO` or lower (not `ERROR` only) so these events are captured.

**Warning signs:**
- `isBlocked()` returns `true` and the caller site does nothing except silently omit the page
- No test verifying that a blocked access attempt produces a log entry
- Production log level is `ERROR` (blocks at `INFO` are lost)

**Phase to address:** `isBlocked()` integration at each tool call site

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Apply `isBlocked()` only in `mcp-tools.ts`, not in `api.ts` | Simpler — filter at the layer you control | If `api.ts` methods are reused by future tools or scripts, new code bypasses the filter silently | Acceptable for v2.5 if `api.ts` methods are tool-handler-only |
| Case-sensitive `"Clients"` comparison | Simple, explicit | Bypassed if Wiki.js ever stores `clients/acme` | Never — always case-fold the first segment |
| Blocking by path prefix (`startsWith("Clients/")`) instead of exact-segment count | Covers sub-pages without extra logic | Silently grows scope; breaks pages like `ClientsGuide/intro` | Never — use exact segment count |
| Returning `403 Forbidden` for blocked pages | Honest HTTP semantics | Existence oracle — reveals the page exists | Never in MCP tool context where callers are AI assistants |
| Logging full path in block events | Easier debugging | Logs become a secondary data store for GDPR-sensitive info | Never |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Wiki.js GraphQL `pages.list` (used in `resolveViaPagesList`) | Filtering after the 500-page bulk fetch is correct, but the bulk fetch itself exposes all paths to in-process memory | Acceptable — process memory is not a GDPR disclosure risk; filter before returning to caller |
| Wiki.js GraphQL `pages.search` | Search index `totalHits` is unfiltered count | Do not surface `totalHits` in tool response (current code already omits it) |
| Wiki.js GraphQL `pages.singleByPath` | Used in `resolvePageByPath` during search resolution — returns full page including path | Check `isBlocked()` on resolved pages before adding to final results |
| MCP `wrapToolHandler` | Timing differences between blocked and not-found responses | Ensure both paths call the upstream API to equalise latency |
| Pino structured logging | Default serialisers may deep-clone objects including paths | Avoid passing full `WikiJsPage` objects to log calls at `isBlocked()` sites |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Returning `403` instead of a "not found" equivalent | Existence oracle — attacker learns `Clients/Acme` exists | Always return same response as "page not found" |
| Checking `isBlocked()` before calling upstream API in `get_page` | Timing side-channel — blocked returns faster | Fetch first, then check path on returned object |
| Including company name in block log entry | Logs become secondary personal data store | Log `{ blocked: true }` without the specific company name |
| Filtering only in `list_pages` and `search_pages` but not `get_page` | Direct ID lookup bypasses the filter entirely | All three tools MUST apply `isBlocked()` |
| Applying `isBlocked()` to the INPUT path string (before API call) in `get_page` | `get_page` takes an ID, not a path — no input path to check | Retrieve by ID first, then check the returned `page.path` |
| Omitting `isBlocked()` from the `resolveViaPagesList` fallback path in `searchPages` | Fallback path bypasses filter on one code path | Apply filter after both the primary and fallback resolution in `searchPages` |

---

## "Looks Done But Isn't" Checklist

- [ ] **`get_page` filter:** Only adds `isBlocked()` call — verify the error message is IDENTICAL to the genuine-not-found error message, and that upstream is still called before the path check
- [ ] **`search_pages` filter:** Only filters `rawResults` — verify the `resolveViaPagesList` fallback path (Step 3 in `searchPages`) also has `isBlocked()` applied to its results before they are added to `resolved`
- [ ] **`list_pages` filter:** Verify the filter runs AFTER `pages.filter(p => p.isPublished)` to avoid double-filtering and ordering dependency
- [ ] **`totalHits` not exposed:** Verify `mcp-tools.ts` returns `result.results` (not the full `PageSearchResult` object including `totalHits`) — this is already correct in the current codebase; do not regress it
- [ ] **Logging:** Verify a blocked `get_page` call produces a server-side log entry (not just a silent return)
- [ ] **Case normalisation:** Verify `isBlocked("clients/acme")` returns `true` (lowercase first segment)
- [ ] **Trailing slash:** Verify `isBlocked("Clients/acme/")` returns `true`
- [ ] **3-segment path:** Verify `isBlocked("Clients/Acme/Projects")` returns `false` (out of scope)
- [ ] **Non-Clients path:** Verify `isBlocked("docs/getting-started")` returns `false`
- [ ] **Instructions file:** Verify `instructions.txt` does not mention the filter, blocked paths, or GDPR

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Existence oracle via error message mismatch | LOW | Change error string in `get_page` handler to match not-found string; deploy |
| Case-sensitive bypass discovered in production | LOW | Fix `isBlocked()` to use `.toLowerCase()` on segment[0]; add test; deploy |
| Timing side-channel (blocked returns faster) | MEDIUM | Refactor `get_page` to always call upstream first; adds one GraphQL call per blocked probe |
| `totalHits` leaking in search response | LOW | Remove from tool response (current code already omits it — prevent regression) |
| Blocked path logged with company name | MEDIUM | Redact logs retroactively; update logging; treat as personal data breach under GDPR Art. 33 (72-hour notification window) |
| Filter missing from `resolveViaPagesList` fallback | LOW | Add `isBlocked()` check in fallback results; add regression test |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Existence oracle (Pitfall 1) | `isBlocked()` utility + `get_page` integration | Test: blocked ID returns same string as non-existent ID |
| Path normalisation bypass (Pitfall 2) | `isBlocked()` utility | Unit test suite: case variants, trailing slash, double slash, leading slash |
| Indirect search leak (Pitfall 3) | Design decision, document in code | Code comment in `isBlocked()` states indirect mentions are out of scope |
| `totalHits` leakage (Pitfall 4) | `search_pages` integration | Verify `mcp-tools.ts` does not expose `totalHits` field |
| Sub-page scope overreach (Pitfall 5) | `isBlocked()` utility | Unit test: 3-segment Clients path returns `false` |
| Filter gap in `resolveViaPagesList` (Pitfall 6, secondary) | `search_pages` integration | Unit test: blocked page in fallback path is excluded from results |
| Logging GDPR-sensitive path (Pitfall 6) | `isBlocked()` call sites | Code review: no `page.path` in log calls at blocked sites |
| Instructions file disclosure (Pitfall 7) | Post-implementation review | Manual: read `instructions.txt` for filter mentions |
| No audit log of blocked attempts (Pitfall 8) | `isBlocked()` call sites | Test: blocked access produces a log entry without company name |

---

## Sources

- [PortSwigger: Access control vulnerabilities](https://portswigger.net/web-security/access-control) — existence oracle via 403 vs 404 distinction
- [Authress: Choosing 401/403/404](https://authress.io/knowledge-base/articles/choosing-the-right-http-error-code-401-403-404) — when to return 404 to prevent resource enumeration
- [LockMeDown: Return 404 instead of 403](https://lockmedown.com/when-should-you-return-404-instead-of-403-http-status-code/) — detailed guidance on existence oracle prevention
- [DailyCVE: Gateway auth bypass via path canonicalization mismatch (CWE-288)](https://dailycve.com/gateway-authentication-bypass-via-path-canonicalization-mismatch-cwe-288-moderate/) — real CVE for case/trailing-slash bypass
- [Medium: Path normalisation story (API gateway bypass)](https://medium.com/@dipanshuchhanikar/bypassing-authentication-in-a-major-api-gateway-a-path-normalization-story-5f1bea6d3f08) — practical path-canonicalization bypass examples
- [ICO: What is personal data?](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/personal-information-what-is-it/what-is-personal-data/what-is-personal-data/) — GDPR personal data definition; company names are not personal data but client contact info within client pages is
- [GDPR.eu: What is considered personal data?](https://gdpr.eu/eu-gdpr-personal-data/) — indirect identifiers; client directory pages may contain personal data about contact persons
- [Exabeam: GDPR audit logging requirements](https://www.exabeam.com/explainers/gdpr-compliance/how-does-gdpr-comply-with-log-management/) — audit trail requirements under GDPR Article 30
- [Mezmo: GDPR logging best practices](https://www.mezmo.com/blog/best-practices-for-gdpr-logging) — what to capture in access logs for GDPR accountability
- [Hoop.dev: What GDPR really expects from audit logs](https://hoop.dev/blog/what-gdpr-really-expects-from-audit-logs/) — log what is needed, not more (data minimisation in logs)
- [Wiki.js GitHub Discussion #6672: singleByPath path format](https://github.com/requarks/wiki/discussions/6672) — path format without leading slash
- [Wiki.js GitHub Discussion #5606: Two-char paths reserved for locale](https://github.com/requarks/wiki/discussions/5606) — locale prefix path behaviour
- [Red Hat: MCP security risks and controls](https://www.redhat.com/en/blog/model-context-protocol-mcp-understanding-security-risks-and-controls) — MCP-specific information leakage via tool responses
- [MCPcat: Error handling in MCP servers](https://mcpcat.io/guides/error-handling-custom-mcp-servers/) — sanitising MCP tool error responses

---
*Pitfalls research for: GDPR path filtering on MCP/API server*
*Researched: 2026-03-27*
