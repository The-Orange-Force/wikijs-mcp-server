# Domain Pitfalls: Marker-Based Content Redaction and Page URL Injection

**Domain:** Replacing path-based GDPR filtering with `<!-- gdpr-start/end -->` marker-based content redaction on an existing MCP server, plus injecting page URLs into `get_page` responses
**Researched:** 2026-03-27
**Confidence:** HIGH (regex backtracking patterns verified via javascript.info and regular-expressions.info; HTML comment parsing pitfalls verified via markedjs/marked issues and multiple regex security sources; Wiki.js path/URL format verified via official docs and GitHub discussions; transition safety analysis based on direct codebase inspection of src/mcp-tools.ts, src/gdpr.ts, and 371 existing tests)

**Context:** The wikijs-mcp-server (v2.5) currently uses path-based filtering via `isBlocked()` to block entire `Clients/<CompanyName>` pages. v2.6 replaces this with surgical marker-based content redaction: wiki authors wrap GDPR-sensitive content in `<!-- gdpr-start -->` / `<!-- gdpr-end -->` HTML comment markers, and the MCP server strips those sections before returning content. Additionally, `get_page` responses will include the page's browser-accessible URL, constructed from a configurable base URL plus the page path.

---

## Critical Pitfalls

### Pitfall 1: Transition Window Where PII Is Exposed (Old Filter Removed Before New Redaction Works)

**What goes wrong:**
Between the commit that removes `isBlocked()` and the commit that adds working marker-based redaction, all previously-blocked `Clients/<CompanyName>` pages are fully exposed. If the server is deployed in this intermediate state, or if the implementation is done in the wrong order across multiple pull requests, every client page becomes accessible with full PII content until the new redaction is complete AND wiki authors have added markers to all sensitive sections.

This is the single most dangerous pitfall because it combines a code change (removing the old filter) with a content change (adding markers to wiki pages). Even if the code is shipped atomically, the wiki pages themselves may not have markers yet.

**Why it happens:**
Three root causes converge:
1. The old filter (`isBlocked()`) operates on the path and blocks the entire page. The new redaction operates on the content and strips marked sections. These are fundamentally different mechanisms with no overlap period.
2. Marker-based redaction only works on content that HAS markers. If a wiki author has not yet added `<!-- gdpr-start -->` / `<!-- gdpr-end -->` around sensitive content, that content passes through unredacted.
3. Developers naturally think "remove old, add new" -- but the correct order is "add new AND verify markers exist, THEN remove old."

**How to avoid:**
1. Deploy marker-based redaction code FIRST, alongside the existing `isBlocked()` filter. Both mechanisms must run in parallel during the transition.
2. Add markers to ALL sensitive wiki pages BEFORE removing path-based blocking.
3. Only remove `isBlocked()` and its tests after verifying that every previously-blocked page has appropriate markers AND the redaction code is confirmed working in production.
4. Consider a phased deployment:
   - Phase A: Ship redaction function + integration into `get_page` content pipeline. `isBlocked()` still runs. Redaction is additive safety.
   - Phase B: Wiki authors add `<!-- gdpr-start/end -->` markers to all sensitive content sections.
   - Phase C: Verify via audit that all client pages have markers. Then remove `isBlocked()`.

**Warning signs:**
- PR that removes `isBlocked()` in the same commit as adding redaction code
- No integration test that verifies "content without markers passes through unmodified" (because this means unmarked PII passes through)
- No documented procedure for auditing wiki pages for marker coverage before the old filter is removed

**Phase to address:** The redaction implementation phase MUST keep `isBlocked()` intact. Removal of `isBlocked()` should be a separate, later phase with an explicit prerequisite gate.

---

### Pitfall 2: Unclosed `<!-- gdpr-start -->` Marker Causes Silent PII Leak (No Matching End Tag)

**What goes wrong:**
A wiki author writes `<!-- gdpr-start -->` but forgets `<!-- gdpr-end -->`. If the redaction function only strips content between matched start/end pairs, the entire GDPR-sensitive section remains in the output because there is no valid pair to match. This is a silent failure -- no error, no warning, full PII exposure.

Alternatively, someone accidentally deletes or corrupts the end marker during a wiki edit. The next time the page is fetched via the MCP server, all content after `<!-- gdpr-start -->` is returned unredacted.

**Why it happens:**
The naive regex approach `<!-- gdpr-start -->[\s\S]*?<!-- gdpr-end -->` only matches when both markers are present. An unclosed start marker matches nothing and the original content is returned unchanged.

**How to avoid:**
The PROJECT.md requirement already specifies the correct behavior: "Malformed-marker fail-safe (redact to end of content + warning log)." Implement it:

1. After processing all matched `<!-- gdpr-start -->...<!-- gdpr-end -->` pairs, scan for any remaining unmatched `<!-- gdpr-start -->` markers.
2. If an unmatched start marker exists, redact from that marker to the END of the content. This is fail-safe -- it over-redacts rather than under-redacting.
3. Log a warning with the page ID (NOT the content): `log.warn({ pageId, tool }, "Unclosed gdpr-start marker, redacted to end of content")`.
4. This must be a separate step from the paired-marker regex. Process pairs first, then scan remainder for orphaned starts.

**Warning signs:**
- Redaction function uses only a single regex with no orphan-marker check
- No test case for "start marker without end marker"
- Test suite only covers the happy path (matched pairs)

**Phase to address:** Core redaction function implementation. The fail-safe MUST be implemented in the same phase as the basic redaction, not deferred.

---

### Pitfall 3: Regex Catastrophic Backtracking on Large Wiki Pages

**What goes wrong:**
A naive regex like `/<!-- gdpr-start -->([\s\S]*?)<!-- gdpr-end -->/g` uses a lazy quantifier `[\s\S]*?` which is safe in most cases. However, if the regex is more complex (e.g., attempting to handle whitespace variations in the marker itself, or using alternation within the quantifier group), it can trigger catastrophic backtracking on large pages (50KB+ of content). The Node.js event loop blocks for seconds or minutes, causing the MCP server to become unresponsive to ALL requests.

**Why it happens:**
Catastrophic backtracking occurs when a regex engine explores exponentially many paths due to nested quantifiers or overlapping alternatives. Common triggers:
- `<!--\s*gdpr-start\s*-->([\s\S]*?)<!--\s*gdpr-end\s*-->` -- the `\s*` inside the markers combined with `[\s\S]*?` in the body can interact badly if the markers are partially matched mid-content.
- Using `(.|\n)*?` instead of `[\s\S]*?` -- the alternation group `(.|\n)` creates backtracking risk.
- Attempting to match markers with flexible whitespace AND flexible content: `<!--\s*gdpr-start\s*-->(.*)<!--\s*gdpr-end\s*-->/s` with the `s` (dotAll) flag -- the `.*` is greedy and backtracks when `<!--` appears in content without being a valid end marker.

For a wiki page with 50KB of markdown content and multiple partial `<!--` sequences (common in documentation that discusses HTML comments), the regex engine may backtrack billions of times.

**How to avoid:**
1. Use the simplest possible regex with exact marker strings: `/<!-- gdpr-start -->[\s\S]*?<!-- gdpr-end -->/g`. Do NOT add flexibility for whitespace variations inside the markers.
2. Standardize the exact marker format: `<!-- gdpr-start -->` with exactly one space after `<!--` and before `-->`. Document this. Reject non-conforming markers by design.
3. AVOID these dangerous patterns:
   - `(.|\n)*?` -- use `[\s\S]*?` instead (single character class, no alternation)
   - Nested quantifiers like `(<!--\s*gdpr-start\s*-->)+`
   - Optional groups around the markers: `(<!-- gdpr-start -->)?`
4. For defense in depth, consider a non-regex approach: use `indexOf('<!-- gdpr-start -->')` and `indexOf('<!-- gdpr-end -->')` to find marker positions, then use `string.slice()` to extract and reconstruct the content. This approach has O(n) time complexity with no backtracking risk.
5. Add a performance test: redaction on a 100KB string with no markers must complete in under 5ms.

**Warning signs:**
- Regex uses `(.|\n)` instead of `[\s\S]`
- Regex attempts to handle whitespace variations inside the markers themselves
- No performance test for large content
- Content with many `<!--` substrings (e.g., HTML documentation pages) causes observable slowdowns

**Phase to address:** Core redaction function implementation. The regex pattern choice is a first-commit decision.

---

### Pitfall 4: Markers Inside Fenced Code Blocks Cause False Positive Redaction

**What goes wrong:**
A wiki page about GDPR implementation contains a code example:

````markdown
## How to Add GDPR Markers

To protect sensitive content, wrap it like this:

```html
<!-- gdpr-start -->
Sensitive content here
<!-- gdpr-end -->
```
````

The regex redaction does not understand markdown structure. It sees `<!-- gdpr-start -->` and `<!-- gdpr-end -->` inside the fenced code block and redacts the content between them -- destroying the documentation example. Worse, if only the start marker is in the code block and the end marker is elsewhere in the document, the redaction spans across the code block boundary and destroys a large section of the page.

**Why it happens:**
Regex operates on raw text. It has no concept of markdown fenced code blocks (`` ``` ``), inline code (`` ` ``), or HTML `<pre>`/`<code>` elements. Any occurrence of the marker string is treated as a real marker.

**How to avoid:**

**Option A (recommended for v2.6 -- accept the limitation, document it):**
This is an edge case that affects only pages documenting the marker syntax itself. For v2.6:
1. Document that `<!-- gdpr-start/end -->` markers in code blocks WILL be processed as real markers.
2. Wiki authors who need to document the marker syntax should use a variation that breaks the pattern, e.g., `<!-- gdpr-start -- >` (extra space before `>`) or use HTML entities.
3. Add a code comment in the redaction function explaining this known limitation.

**Option B (more robust, higher complexity):**
Strip fenced code blocks before processing markers, then restore them:
1. Extract fenced code blocks using `/```[\s\S]*?```/g` and replace with placeholders.
2. Run marker-based redaction on the remaining content.
3. Restore code block placeholders.

This adds complexity and introduces its own edge cases (nested code blocks, code blocks with more than 3 backticks). For a wiki where marker documentation pages are rare, Option A is pragmatic.

**Warning signs:**
- No test case for markers appearing inside fenced code blocks
- No documentation warning about this limitation
- Someone reports "my documentation page got mangled by the MCP server"

**Phase to address:** Core redaction function -- document the limitation in code comments. Add a test that demonstrates the behavior (markers in code blocks ARE processed).

---

## Moderate Pitfalls

### Pitfall 5: Page URL Construction With Special Characters and Locale Prefix

**What goes wrong:**
The page URL is constructed as `${WIKIJS_BASE_URL}/${locale}/${page.path}`. Several issues arise:

1. **Double slashes:** If `WIKIJS_BASE_URL` ends with `/` and the path construction adds another, the URL becomes `https://wiki.example.com//en/some-page`.
2. **Locale prefix mismatch:** Wiki.js reserves two-letter paths for locale prefixes. If locale prefixing is enabled, URLs must include the locale (e.g., `/en/page-path`). If disabled, they must not. The server currently has `WIKIJS_LOCALE` (default `en-US`) but this is a search locale, not necessarily the URL prefix locale.
3. **Spaces in paths:** Wiki.js allows spaces in paths (despite documentation saying to use dashes). The GraphQL API returns the path as-is. A path `Clients/Acme Corp` produces `https://wiki.example.com/en/Clients/Acme Corp` -- which is not a valid URL without encoding.
4. **Non-ASCII characters:** Wiki.js allows Unicode in paths (e.g., `Clients/Uenited`). These require percent-encoding in URLs.
5. **Path with hash or query characters:** A path containing `#` or `?` would break URL parsing if not encoded.

**Why it happens:**
Developers concatenate strings to build URLs without considering edge cases. The Wiki.js GraphQL API returns raw paths without URL encoding.

**How to avoid:**
1. Use Node.js `URL` constructor or `encodeURIComponent` for the path segments:
   ```typescript
   function buildPageUrl(baseUrl: string, path: string): string {
     // Ensure no double slash between base and path
     const base = baseUrl.replace(/\/+$/, '');
     // Encode each path segment individually (preserve slash separators)
     const encodedPath = path.split('/').map(encodeURIComponent).join('/');
     return `${base}/${encodedPath}`;
   }
   ```
2. Make the locale prefix inclusion configurable or omit it by default. Wiki.js pages are accessible without locale prefix when visiting the base locale. The safest approach for v2.6: do not include locale prefix in URLs. The base URL alone plus the path is sufficient for the base locale.
3. Add the `WIKIJS_PAGE_BASE_URL` (or similar) as a separate env var distinct from `WIKIJS_BASE_URL` (which points to the API endpoint). The browser-accessible URL and the GraphQL API URL may differ.
4. Validate with test cases: path with spaces, path with Unicode, path with trailing slash, path with `#` character.

**Warning signs:**
- URL construction uses string concatenation without encoding
- No test for paths containing spaces, Unicode, or special characters
- `WIKIJS_BASE_URL` is reused for both API calls and page URLs (they may differ)

**Phase to address:** Page URL injection implementation phase.

---

### Pitfall 6: Redaction Applied Inconsistently Across Tools (get_page vs search_pages vs list_pages)

**What goes wrong:**
`get_page` returns full page content and must redact markers. `search_pages` returns content excerpts. `list_pages` returns metadata only (no content). If redaction is applied only in `get_page` but `search_pages` returns unredacted excerpts containing GDPR-sensitive text between markers, PII leaks through the search tool.

More subtly: the `description` field on all three tools contains wiki page descriptions. If a wiki author puts GDPR-sensitive information in the page description (which is metadata, not content), no amount of content-based marker redaction will catch it.

**Why it happens:**
The content field in `WikiJsPage` is optional -- `list_pages` and `search_pages` results from `resolvePageByPath` and `resolveViaPagesList` do not include `content`. But `search_pages` results from the raw search API may include content excerpts in a separate field.

Looking at the current code: `api.ts` `searchPages()` returns results with `id`, `path`, `title`, `description`, `locale` from the search query -- no `content` field. `resolvePageByPath` and `resolveViaPagesList` also do not fetch `content`. So `search_pages` results currently do NOT include page content, making content redaction inapplicable.

However: `get_page` via `getPageById()` DOES fetch `content`. Redaction must be applied here.

**How to avoid:**
1. Apply content redaction ONLY where `content` is present -- which is `get_page` (via `getPageById`).
2. Do NOT attempt to redact `description` or `title` fields with markers. These are short metadata strings unlikely to contain markers. If GDPR content is in descriptions, that is a wiki author mistake -- the redaction system should not attempt to fix metadata.
3. Document explicitly: "Redaction applies to `content` field only. Page titles and descriptions are not redacted."
4. If `search_pages` or `list_pages` ever starts returning content (e.g., search excerpts), redaction must be added at that point.

**Warning signs:**
- Redaction function is applied to the full `WikiJsPage` object (all string fields) instead of just `content`
- Someone applies redaction to `title` or `description` and the regex corrupts short strings

**Phase to address:** Integration phase -- apply redaction at the `get_page` handler level, not at the API layer.

---

### Pitfall 7: Multiple GDPR Marker Pairs on a Single Page -- Greedy Match Consumes Too Much

**What goes wrong:**
A page has two separate GDPR-sensitive sections:

```markdown
## Section 1
Public content here.

<!-- gdpr-start -->
Client A contact info
<!-- gdpr-end -->

## Section 2
More public content.

<!-- gdpr-start -->
Client B contract details
<!-- gdpr-end -->

## Section 3
More public content.
```

A greedy regex `/<!-- gdpr-start -->[\s\S]*<!-- gdpr-end -->/g` (note: `*` not `*?`) matches from the FIRST `<!-- gdpr-start -->` to the LAST `<!-- gdpr-end -->`, consuming "Section 2: More public content" along with both sensitive sections. The entire middle of the page is removed.

**Why it happens:**
Using `*` (greedy) instead of `*?` (lazy) in the regex. The greedy quantifier matches as much as possible, then backtracks only as needed. With the `g` flag and `[\s\S]*` (greedy), the first match consumes everything up to the LAST end marker.

**How to avoid:**
1. Use the lazy quantifier: `[\s\S]*?` -- this matches the minimum content between each start/end pair.
2. Verify with a test: two separate marker pairs on one page, with public content between them. Assert the public content between the pairs is preserved.
3. Consider the indexOf-based approach (non-regex) which makes the matching logic explicit and easier to reason about:
   ```typescript
   function redactMarkers(content: string): string {
     const START = '<!-- gdpr-start -->';
     const END = '<!-- gdpr-end -->';
     let result = '';
     let cursor = 0;
     while (cursor < content.length) {
       const startIdx = content.indexOf(START, cursor);
       if (startIdx === -1) {
         result += content.slice(cursor);
         break;
       }
       result += content.slice(cursor, startIdx);
       const endIdx = content.indexOf(END, startIdx + START.length);
       if (endIdx === -1) {
         // Fail-safe: no end marker, redact to end of content
         break;
       }
       cursor = endIdx + END.length;
     }
     return result;
   }
   ```

**Warning signs:**
- Regex uses `[\s\S]*` (greedy) instead of `[\s\S]*?` (lazy)
- Only one test case with a single marker pair
- No test with two marker pairs and public content between them

**Phase to address:** Core redaction function -- test suite must include multi-pair scenario.

---

### Pitfall 8: Nested or Overlapping Markers (`gdpr-start` Inside Another `gdpr-start`)

**What goes wrong:**
A wiki author accidentally nests markers:

```markdown
<!-- gdpr-start -->
Outer sensitive content
<!-- gdpr-start -->
Inner sensitive content
<!-- gdpr-end -->
More outer sensitive content
<!-- gdpr-end -->
```

With the lazy regex `/<!-- gdpr-start -->[\s\S]*?<!-- gdpr-end -->/g`:
- First match: from first `<!-- gdpr-start -->` to first `<!-- gdpr-end -->` (correct -- strips outer start through inner end)
- Remaining text: `\nMore outer sensitive content\n<!-- gdpr-end -->\n`
- Second match: no start marker before the remaining end marker -- the orphaned `<!-- gdpr-end -->` remains as literal text in the output
- Result: "More outer sensitive content" LEAKS plus a visible `<!-- gdpr-end -->` artifact

**Why it happens:**
HTML comments are not nestable. Regex has no concept of nesting depth. The lazy quantifier pairs the first start with the nearest end, leaving orphaned markers.

**How to avoid:**
1. Document that markers MUST NOT be nested. This is an authoring constraint, not a code constraint.
2. The fail-safe behavior (orphaned start redacts to end) partially covers this -- but in the nested case, the orphaned element is an END marker (not a start), so the fail-safe does not trigger.
3. After all paired redaction is complete, scan the result for any remaining `<!-- gdpr-start -->` OR `<!-- gdpr-end -->` literals. If any exist:
   - An orphaned `<!-- gdpr-start -->` triggers fail-safe (redact to end)
   - An orphaned `<!-- gdpr-end -->` should be stripped (it is an artifact, not content)
   - Log a warning: malformed markers detected
4. Add a test for the nested scenario.

**Warning signs:**
- No handling of orphaned `<!-- gdpr-end -->` markers in the output
- Only orphaned start markers are handled by the fail-safe
- No test for nested markers

**Phase to address:** Core redaction function -- handle orphaned end markers as a cleanup step after paired redaction.

---

### Pitfall 9: Test Coverage Gap During Security Mechanism Replacement

**What goes wrong:**
The v2.5 test suite has 371 tests including specific GDPR filter tests across 3 files:
- `src/__tests__/gdpr.test.ts` (16 tests for `isBlocked()`)
- `src/__tests__/mcp-tools-gdpr.test.ts` (12 tests for tool-level filtering)
- `tests/gdpr-filter.test.ts` (10 integration tests)

When removing path-based filtering and adding marker-based redaction, there is a risk of:
1. Deleting the old GDPR tests before the new redaction tests are in place -- creating a window where GDPR behavior is untested.
2. Not covering equivalent scenarios in the new test suite: malformed input, empty content, null content, multiple pages with mixed redacted/unredacted content.
3. Missing the `search_pages` totalHits adjustment (currently tested) -- the new approach may not need it, but the decision must be explicit.
4. Breaking the SEC-03 instructions audit tests that check for GDPR-revealing keywords. The word "redact" or "gdpr" might appear in new code comments that get surfaced.

**Why it happens:**
"Replace" feels like "delete old, write new." In security-sensitive code, the correct approach is "write new tests, verify they pass, then delete old tests."

**How to avoid:**
1. Write the new redaction unit tests FIRST (before modifying `mcp-tools.ts`):
   - `redact()` with matched pairs
   - `redact()` with orphaned start (fail-safe)
   - `redact()` with orphaned end (cleanup)
   - `redact()` with nested markers
   - `redact()` with no markers (passthrough)
   - `redact()` with empty string
   - `redact()` with null/undefined input
   - `redact()` on large content (performance)
   - `redact()` with multiple pairs and public content between
   - `redact()` with markers adjacent (no content between)
2. Write tool-level integration tests for the new behavior BEFORE removing old filter code.
3. Only delete `isBlocked()` and its tests after the new redaction tests pass and cover equivalent scenarios.
4. Maintain the SEC-03 instructions audit test -- it should continue to pass.

**Warning signs:**
- Old GDPR test files deleted in the same commit as new ones added
- New test count is significantly lower than old test count for GDPR behavior
- No test for the "no markers present" case (passthrough)
- No performance test

**Phase to address:** Test-first approach in the redaction implementation phase. Old tests removed only in the `isBlocked()` removal phase.

---

## Minor Pitfalls

### Pitfall 10: Redaction Modifies Content Length, Breaks JSON Position Expectations

**What goes wrong:**
If the `get_page` response currently includes fields like content length or byte offsets (it does not, based on current code review), redaction would invalidate them. More practically: the AI assistant receiving the response sees content that "jumps" between sections with no indication that content was removed. The AI may hallucinate that the page is complete when sections were redacted.

**How to avoid:**
1. Optionally insert a redaction placeholder: replace redacted sections with `[Content redacted]` or an empty string. The placeholder approach is more transparent.
2. However: inserting a placeholder like `[GDPR content redacted]` reveals that GDPR-sensitive content exists on this page, which is mild information disclosure. For v2.6, use an empty string (no placeholder) to match the existing behavior where blocked pages simply return "not found."
3. Document the design decision: redacted content is silently removed, not replaced with placeholders.

**Phase to address:** Core redaction function -- design decision on placeholder vs silent removal.

---

### Pitfall 11: `WIKIJS_BASE_URL` Used for Both API and Page URLs

**What goes wrong:**
`WIKIJS_BASE_URL` currently points to the Wiki.js instance (e.g., `http://wikijs:3000` in Docker). This is used to construct the GraphQL endpoint: `${baseUrl}/graphql`. If the same URL is used for page URLs in `get_page` responses, the URLs will point to the internal Docker hostname, not the public-facing URL that users can open in a browser.

**Why it happens:**
Reusing the existing env var seems simpler than adding a new one.

**How to avoid:**
1. Add a separate env var (e.g., `WIKIJS_PAGE_URL` or `WIKIJS_PUBLIC_URL`) for the browser-accessible base URL.
2. Make it optional with a sensible default: fall back to `WIKIJS_BASE_URL` if not set (works for non-Docker deployments where the API URL and browser URL are the same).
3. Add Zod validation: must be a valid URL, no trailing slash.
4. Add to `example.env` with a comment explaining when to set it.

**Warning signs:**
- Page URLs in MCP responses contain `http://wikijs:3000/` (Docker internal hostname)
- No separate env var for public wiki URL
- `config.ts` schema unchanged

**Phase to address:** URL injection implementation phase -- config.ts schema update.

---

### Pitfall 12: Whitespace Sensitivity in Marker Matching

**What goes wrong:**
Wiki.js markdown editors may insert slightly different whitespace around markers. A WYSIWYG editor might produce `<!--gdpr-start-->` (no spaces) or `<!-- gdpr-start  -->` (extra space). If the regex requires exactly `<!-- gdpr-start -->`, these variants are silently ignored, leaving GDPR content unredacted.

**Why it happens:**
Different editors and manual editing produce whitespace variations. Copy-pasting from different sources may include non-breaking spaces or other Unicode whitespace.

**How to avoid:**
1. **Strict matching (recommended for v2.6):** Require exactly `<!-- gdpr-start -->` and `<!-- gdpr-end -->`. Document the exact format. Reject variations by design. This is safer than flexible matching because:
   - Flexible matching risks catastrophic backtracking (Pitfall 3)
   - Strict matching is predictable and testable
   - Wiki authors can be trained on the exact format
   - A linting check can validate wiki content
2. If flexibility is needed later, use the indexOf approach (not regex) to handle whitespace:
   ```typescript
   // Find any HTML comment containing "gdpr-start" (case-insensitive)
   const startPattern = /<!--\s*gdpr-start\s*-->/gi;
   ```
   But this introduces backtracking risk with `\s*` -- validate with a performance test.
3. Add tests for the exact marker format only. Document that variations are NOT supported.

**Warning signs:**
- Regex uses `\s*` or `\s+` inside the marker pattern without a performance test
- No documentation specifying the exact marker format
- Wiki authors report "markers don't work" because they used a slightly different format

**Phase to address:** Core redaction function -- marker format decision is a first-commit decision. Document in code and wiki.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Remove `isBlocked()` in same PR as adding redaction | Fewer PRs, cleaner diff | Transition window risk; if redaction has a bug, no safety net | Never -- keep `isBlocked()` until markers are verified on all pages |
| Use complex regex with whitespace flexibility | Handles editor variations | Catastrophic backtracking risk; harder to test | Never for v2.6 -- strict matching only |
| Apply redaction in `api.ts` instead of `mcp-tools.ts` | Single place for all content processing | `api.ts` is shared infrastructure; redaction is MCP-presentation-layer concern; violates separation of concerns | Never -- redaction belongs in the tool handler layer |
| Reuse `WIKIJS_BASE_URL` for page URLs | No new env var | URLs point to internal Docker hostname; breaks in production | Only in dev; production needs separate public URL |
| Skip orphaned-marker handling | Simpler implementation | Unclosed markers silently leak PII | Never -- fail-safe is a core requirement |
| Insert `[REDACTED]` placeholder | Transparent to AI | Reveals that GDPR content exists on the page | Acceptable if information disclosure is deemed low-risk |
| Regex-only approach (no indexOf fallback) | Simpler code | Harder to reason about edge cases; backtracking risk | Acceptable if regex is simple and performance-tested |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `get_page` content pipeline | Redacting after JSON.stringify (operates on escaped content) | Redact the raw `content` string BEFORE serialization |
| `get_page` URL injection | Constructing URL after redaction (both modify the response) | Inject URL and redact content as separate steps; order does not matter since URL comes from path, not content |
| `search_pages` content excerpts | Assuming search results contain content (they do not in current API) | Verify `search_pages` response shape; content redaction not needed for metadata-only results |
| `list_pages` | Applying redaction to pages that have no `content` field | `list_pages` returns metadata only; redaction is a no-op; do not call redaction function unnecessarily |
| Config validation | Adding new env var (`WIKIJS_PAGE_URL`) without Zod schema | Add to `envSchema` in `config.ts` with URL validation and `.optional()` |
| Wiki.js page path with locale | Constructing URL as `${base}/${locale}/${path}` when locale prefixing is disabled | Check whether locale prefix is needed; safest default is `${base}/${path}` (works for base locale) |
| Existing `totalHits` adjustment in `search_pages` | Keeping the path-filter totalHits adjustment after removing `isBlocked()` | When `isBlocked()` is removed, the totalHits adjustment logic must also be removed |
| `wrapToolHandler` debug logging | New redacted content still logged at DEBUG level by the wrapper | Verify `wrapToolHandler` does not log tool response bodies (current code logs `args` at debug but not results -- keep this) |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Removing `isBlocked()` before markers are on all wiki pages | Full PII exposure of all client pages | Keep both mechanisms running in parallel during transition |
| Fail-safe not implemented (orphaned start marker silently ignored) | PII leak on any page with malformed markers | Orphaned start marker must redact to end of content |
| Redacting then logging the original content | Unredacted PII in server logs | Always log page ID, never log content |
| Using `WIKIJS_BASE_URL` for page URLs in production | URLs contain Docker-internal hostnames (not a data leak but reveals infrastructure) | Separate env var for public wiki URL |
| Regex with whitespace flexibility but no performance bound | ReDoS vulnerability; server becomes unresponsive on crafted content | Strict marker format; or add regex timeout via performance test |
| Markers in page title/description not handled | PII in metadata passes through unredacted | Document: redaction applies to `content` only; metadata is wiki author's responsibility |
| Redaction function throws on null/undefined content | Unhandled exception crashes the tool handler; error message may leak info | Guard: `if (!content) return content;` at top of redaction function |

---

## "Looks Done But Isn't" Checklist

- [ ] **Transition safety:** `isBlocked()` still runs alongside new redaction code; both mechanisms active
- [ ] **Fail-safe:** Orphaned `<!-- gdpr-start -->` causes redaction to end of content (not silent passthrough)
- [ ] **Orphaned end cleanup:** Remaining `<!-- gdpr-end -->` markers stripped from output after paired redaction
- [ ] **Multiple pairs:** Two marker pairs on one page with public content between them; public content preserved
- [ ] **No markers:** Content without any markers passes through completely unchanged
- [ ] **Null/undefined guard:** Redaction function handles null, undefined, empty string without throwing
- [ ] **Performance:** Redaction on 100KB content completes in under 10ms
- [ ] **URL encoding:** Page URLs with spaces, Unicode, and special characters are properly encoded
- [ ] **URL base:** Page URL uses public wiki URL, not Docker-internal API URL
- [ ] **No double slash:** URL construction does not produce `//` between base URL and path
- [ ] **Config schema:** New env var added to Zod schema in `config.ts` with URL validation
- [ ] **Test parity:** New GDPR test count >= old GDPR test count; equivalent scenarios covered
- [ ] **SEC-03 preserved:** Instructions audit test still passes (no "redact", "gdpr", "blocked" in instructions)
- [ ] **Logging safe:** Redaction warning logs contain page ID only, never content
- [ ] **tool-wrapper safe:** `wrapToolHandler` does not log tool response bodies at any level

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Transition window PII exposure | HIGH | Re-deploy `isBlocked()` immediately; treat as data breach (GDPR Art. 33, 72-hour DPA notification); audit access logs for the exposure window |
| Orphaned marker PII leak | MEDIUM | Hotfix fail-safe in redaction function; audit pages for malformed markers; notify wiki authors |
| Catastrophic backtracking (ReDoS) | LOW-MEDIUM | Deploy fixed regex or indexOf approach; restart server; no data breach but availability impact |
| Greedy regex consuming too much content | LOW | Fix regex to use lazy quantifier; no PII risk (over-redaction, not under-redaction) |
| Nested markers leaking content | MEDIUM | Add orphaned-end-marker cleanup; audit affected pages; the nested case leaks content between inner end and outer end markers |
| URL construction with internal hostname | LOW | Add public URL env var; redeploy; no security impact, just broken links |
| Whitespace variation not matching | MEDIUM | Fix marker format on wiki pages OR widen regex (with performance test); PII exposed until fixed |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Transition window (Pitfall 1) | Architecture decision: keep `isBlocked()` until explicit removal phase | PR review: `isBlocked()` import still present in `mcp-tools.ts` |
| Unclosed marker fail-safe (Pitfall 2) | Core redaction function | Test: content with orphaned start returns truncated content + warning log |
| Regex backtracking (Pitfall 3) | Core redaction function | Performance test: 100KB content < 10ms; regex uses `[\s\S]*?` not `(.|\n)*?` |
| Code block false positives (Pitfall 4) | Design decision, document | Code comment + test demonstrating the behavior |
| URL encoding (Pitfall 5) | URL injection implementation | Tests: space in path, Unicode in path, trailing slash in base URL |
| Inconsistent tool coverage (Pitfall 6) | Integration phase | Code review: redaction applied only where `content` is present |
| Greedy match (Pitfall 7) | Core redaction function | Test: two marker pairs with public content between |
| Nested markers (Pitfall 8) | Core redaction function | Test: nested markers do not leak intermediate content |
| Test coverage gap (Pitfall 9) | Test-first development | New GDPR tests written before old ones removed; test count >= 38 |
| Content length (Pitfall 10) | Design decision | Document: no placeholder, silent removal |
| `WIKIJS_BASE_URL` reuse (Pitfall 11) | Config phase | New optional env var in `config.ts` Zod schema |
| Whitespace sensitivity (Pitfall 12) | Design decision, document | Exact format documented; strict matching only |

---

## Sources

- [Catastrophic Backtracking in JavaScript](https://javascript.info/regexp-catastrophic-backtracking) -- nested quantifiers and ReDoS patterns in JavaScript regex engine
- [Runaway Regular Expressions: Catastrophic Backtracking](https://www.regular-expressions.info/catastrophic.html) -- comprehensive guide to backtracking-prone regex patterns
- [Sonar: Dangers of Regular Expressions in JavaScript](https://www.sonarsource.com/blog/vulnerable-regular-expressions-javascript/) -- security analysis of regex vulnerabilities in JS
- [Snyk: ReDoS and Catastrophic Backtracking](https://snyk.io/blog/redos-and-catastrophic-backtracking/) -- practical ReDoS examples and prevention
- [Do NOT try parsing with regular expressions](https://kore-nordmann.de/blog/do_NOT_parse_using_regexp.html) -- why regex cannot handle nested structures (Chomsky level 3 limitation)
- [markedjs/marked PR #1135: HTML comments compliance](https://github.com/markedjs/marked/pull/1135) -- HTML comment parsing edge cases in markdown
- [Wiki.js Pages Documentation](https://docs.requarks.io/guide/pages) -- path format requirements, URL-safe characters
- [Wiki.js Locales Documentation](https://docs.requarks.io/locales) -- locale prefix behavior in URLs
- [Wiki.js GitHub Discussion #3578: Illegal characters in paths](https://github.com/requarks/wiki/discussions/3578) -- special character handling in Wiki.js paths
- [Wiki.js GitHub Discussion #5606: Two-char path reservation](https://github.com/requarks/wiki/discussions/5606) -- locale prefix URL conflicts
- [Wiki.js Feedback: Replace spaces in paths](https://feedback.js.wiki/wiki/p/replace-spaces-and-special-characters-in-path-with-underscores) -- spaces in Wiki.js paths
- [ArjanCodes: Regex Performance and Security Best Practices](https://arjancodes.com/blog/regex-performance-optimization-and-security-best-practices/) -- timeout and validation strategies for regex
- [Finding Unclosed Tags with Regex](https://concepts.waetech.com/unclosed_tags/) -- challenges of detecting unclosed HTML structures
- [MDN: String.prototype.replaceAll()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replaceAll) -- performance characteristics of string replacement methods
- [Redactable: Complete Guide to PII Redaction](https://www.redactable.com/blog/the-complete-guide-to-pii-redaction) -- proper vs improper redaction approaches and transition risks

---
*Pitfalls research for: Marker-based GDPR content redaction and page URL injection on MCP server (wikijs-mcp-server v2.6)*
*Researched: 2026-03-27*
