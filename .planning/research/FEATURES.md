# Feature Landscape

**Domain:** Marker-based GDPR content redaction and page URL injection for MCP server responses
**Researched:** 2026-03-27
**Overall confidence:** HIGH

## Context

This research covers the features needed for v2.6: replacing path-based page blocking (`isBlocked()`) with surgical marker-based content redaction using HTML comment markers (`<!-- gdpr-start -->` / `<!-- gdpr-end -->`), plus injecting page URLs into `get_page` responses. The three existing MCP tools (`get_page`, `list_pages`, `search_pages`) remain unchanged in their external API -- v2.6 modifies what happens to the `content` field after it is fetched from Wiki.js and before it is serialized into the MCP response.

**Why replace path-based blocking:** The v2.5 approach blocks entire pages when their path matches `Clients/<CompanyName>`. This is a blunt instrument -- it prevents AI assistants from reading any content on client pages, even non-sensitive project descriptions, technical notes, or methodology sections. Marker-based redaction allows wiki authors to surgically mark only the GDPR-sensitive sections (e.g., contact names, billing details, contract terms) while leaving the rest of the page accessible to AI assistants.

**How Wiki.js stores content:** The GraphQL API returns a `content` field containing the raw markdown source as written by the editor. HTML comments (`<!-- ... -->`) are preserved verbatim in the stored markdown. They are not stripped during storage or retrieval -- only during HTML rendering for browser display. This means the MCP server receives the raw markers in the content string and can operate on them with simple string operations.

---

## Table Stakes

Features users expect. Missing any one of these produces an incorrect, insecure, or unusable implementation.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Remove path-based GDPR filtering** | The `isBlocked()` predicate and all call sites in `mcp-tools.ts` must be deleted. Keeping both systems would cause confusion (which one wins?) and double-filtering. Clean removal is prerequisite to marker-based redaction. | LOW | Delete `src/gdpr.ts`, remove import/usage from `mcp-tools.ts`, delete `src/__tests__/gdpr.test.ts` and `src/__tests__/mcp-tools-gdpr.test.ts`. Also remove the `logBlockedAccess()` helper. |
| **Marker-based content redaction** | Replace content between `<!-- gdpr-start -->` and `<!-- gdpr-end -->` markers with a placeholder. This is the core feature: wiki authors mark sensitive sections, the MCP server strips them before returning content to AI assistants. | MEDIUM | Regex: `/<!-- gdpr-start -->[\s\S]*?<!-- gdpr-end -->/g` with global flag. The `[\s\S]*?` pattern (non-greedy) matches any content including newlines between the nearest start/end pair. The `s` (dotAll) flag is an alternative to `[\s\S]` but `[\s\S]` has broader engine compatibility. |
| **Redaction placeholder text** | Redacted sections must be replaced with a visible placeholder, not silently removed. Silent removal would make adjacent content flow together confusingly and hide the fact that content was redacted. | LOW | Use `[REDACTED]` as the placeholder. This is the industry-standard convention for document redaction per GDPR guidance, legal practice, and DSAR response formatting. A single consistent placeholder regardless of how much content was removed. |
| **Multiple marker pairs per page** | A single page may contain several distinct GDPR-sensitive sections (e.g., contact info in one section, billing in another). Each `<!-- gdpr-start -->` / `<!-- gdpr-end -->` pair must be handled independently. | LOW | The `/g` (global) flag on the regex handles this automatically -- all non-overlapping matches are replaced in a single `content.replace()` call. |
| **Malformed marker fail-safe (unclosed start)** | If a `<!-- gdpr-start -->` marker exists without a matching `<!-- gdpr-end -->`, the system must fail closed: redact everything from the start marker to the end of the content. This is a security-critical design choice -- fail-open (showing the content) would leak GDPR-sensitive data if a wiki author accidentally deletes the closing marker. | MEDIUM | Two-pass approach: (1) first pass with the paired regex replaces complete pairs; (2) second pass checks for any remaining `<!-- gdpr-start -->` and replaces from that point to end-of-content with the placeholder. Alternatively, a single regex with alternation: `<!-- gdpr-start -->(?:[\s\S]*?<!-- gdpr-end -->|[\s\S]*)` but the two-pass approach is clearer. |
| **Warning log for malformed markers** | When a fail-safe redaction occurs (unclosed marker), emit a structured warning log so operators can identify and fix the wiki page. Without this, broken markers would silently degrade content quality with no alerting. | LOW | Use the existing `requestContext` pattern to emit `log.warn({ pageId, malformedMarker: true }, "Unclosed gdpr-start marker; content redacted to end of page")`. Include page ID (not path) to avoid leaking sensitive path segments. |
| **Redaction applied only to `get_page` responses** | Only `get_page` returns the `content` field. `list_pages` and `search_pages` return metadata only (title, path, description, timestamps) -- no content field. Redaction logic only needs to intercept `get_page`. | LOW | This simplifies the implementation surface significantly vs. v2.5 which had to filter all three tools. |
| **Page URL injection in `get_page` responses** | When `get_page` returns a page, include the page's browsable URL in the response so AI assistants can reference it in their answers. The URL is constructed from a configurable base URL + the page path. | MEDIUM | Add `WIKIJS_PAGE_BASE_URL` env var (or reuse `WIKIJS_BASE_URL`). Construct URL as `${baseUrl}/${locale}/${page.path}`. Inject into the response JSON as a `url` field on the page object before serialization. |
| **Configurable base URL for page links** | The Wiki.js instance's public URL may differ from the API URL (e.g., API is internal `http://wikijs:3000`, but pages are browsable at `https://wiki.company.com`). A dedicated config variable avoids coupling page URLs to the API endpoint. | LOW | New env var or reuse existing `WIKIJS_BASE_URL`. Wiki.js URL format is `{base}/{locale}/{path}` where locale is typically `en`. |

## Differentiators

Features beyond the minimum that improve quality, security, or developer experience.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Whitespace normalization around redaction** | When a redacted section is between paragraphs, the placeholder should not create awkward double-blank-lines or join previously separated paragraphs. Normalize to a single blank line before and after `[REDACTED]`. | LOW | Post-replacement cleanup: `content.replace(/\n{3,}/g, '\n\n')` to collapse excessive newlines. Not critical for correctness but improves readability. |
| **Orphaned end marker handling** | A `<!-- gdpr-end -->` without a preceding `<!-- gdpr-start -->` is a malformed marker. It should be stripped silently (it is not a security risk -- no content before a start marker needs protection) but logged as a warning for operator awareness. | LOW | After the main redaction pass, strip any remaining `<!-- gdpr-end -->` markers. Log a warning with page ID. |
| **Structured audit log for redacted pages** | Log when content redaction is applied to a page (not just when malformed markers are found). This creates an audit trail showing which pages had sensitive content redacted, useful for GDPR Article 30 compliance. | LOW | One `log.info` per page where at least one redaction occurred: `{ pageId, redactionCount, malformed: boolean }`. Do not log the redacted content. |
| **Marker case tolerance** | Accept `<!-- GDPR-START -->`, `<!-- GDPR-Start -->`, etc. Wiki authors may use inconsistent casing. Case-insensitive matching prevents accidental data leaks from casing mistakes. | LOW | Add `i` flag to the regex: `/<!-- gdpr-start -->[\s\S]*?<!-- gdpr-end -->/gi`. Minimal implementation cost, significant safety benefit. |
| **Whitespace tolerance in markers** | Accept `<!--gdpr-start-->`, `<!-- gdpr-start  -->`, `<!--  gdpr-start  -->`. Wiki editors and copy-paste can introduce spacing variations. | LOW | Adjust regex to `<!-- *gdpr-start *-->` (zero or more spaces around the marker text). Small regex change, prevents bypass via whitespace differences. |
| **Redaction count in response metadata** | Include a count of how many sections were redacted in the MCP response, so the AI assistant knows content was removed and can inform the user. | LOW | Add a note at the end of the content string like `\n\n---\n_Note: N section(s) contained restricted content and were redacted._` or embed as a separate metadata field. The text approach is simpler since MCP tool responses are text-based. |
| **URL injection for search results** | Extend URL injection beyond `get_page` to include URLs in `search_pages` and `list_pages` results. AI assistants can then provide links to any referenced page, not just the one they fetched in full. | MEDIUM | Map over results array and append `url` field to each page object before serialization. Same URL construction logic. |

## Anti-Features

Features to explicitly NOT build. Each has a rationale to prevent re-adding.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Configurable marker syntax** | Adding configuration for the marker tag names (e.g., letting users change `gdpr-start` to `sensitive-start`) adds complexity with no clear benefit. The markers are invisible to end users (HTML comments) and only wiki authors need to know them. A single well-documented convention is simpler and safer than configurable patterns. | Hardcode `gdpr-start` / `gdpr-end` markers. Document in wiki author guidelines. |
| **Redaction of `description` field** | The `description` field is a short metadata string (typically 1-2 sentences) set by the wiki author as a page summary. If it contains GDPR-sensitive data, the author should fix the description, not add markers to it. Applying marker-based redaction to a 100-character description string is over-engineering. | Wiki authors should not put GDPR-sensitive data in page descriptions. Document this as a guideline. |
| **Nested marker support** | HTML comments cannot be nested per the HTML specification. `<!-- gdpr-start --> <!-- gdpr-start --> ... <!-- gdpr-end --> <!-- gdpr-end -->` is invalid and ambiguous. Supporting nesting would require a parser, not a regex, and adds complexity for a scenario that should never occur. | Document that markers must not be nested. The regex's non-greedy matching naturally handles this correctly for the well-formed case (each start matches the nearest end). |
| **Content-type-specific redaction** | Wiki.js pages can use different editors (Markdown, HTML, Visual). Attempting to parse and redact differently based on content type adds complexity. HTML comments work in all three editor formats, so a single regex approach works universally. | Use HTML comment markers which are valid in Markdown, raw HTML, and Wiki.js visual editor output. |
| **Regex-based PII detection** | Auto-detecting sensitive content via regex patterns (email addresses, phone numbers, etc.) is unreliable, prone to false positives, and creates a false sense of security. Manual marker placement by wiki authors who understand the content is more accurate. | Rely on wiki authors to place markers around sensitive content. Provide documentation and examples. |
| **Encrypted content storage** | Encrypting the redacted content server-side (so it could be decrypted by authorized users) is out of scope. The MCP server is a read-only intermediary with a shared API token -- there is no per-user key management. | Content is simply removed from the response. The original content remains in Wiki.js, accessible to authorized wiki users through the Wiki.js UI. |
| **Real-time marker validation** | Building a webhook or background job that checks wiki pages for malformed markers is scope creep. The fail-safe (redact to end) plus warning logs provide adequate protection and alerting. | Operators monitor logs for malformed marker warnings and fix wiki pages manually. |
| **Redaction of page titles or paths** | Page titles and paths appear in `list_pages` and `search_pages` results which have no content field. Redacting titles would break page discovery and navigation. If a page title itself is GDPR-sensitive, path-based blocking (v2.5 approach) was the correct tool -- but the decision to replace it means these pages are acceptable to list by title. | If a title is sensitive, the wiki author should rename the page to use a non-sensitive title (e.g., "Client 42" instead of "Acme Corp"). |

## Feature Dependencies

```
Remove path-based filtering ─── prerequisite for ──> Marker-based redaction
                                                      (cannot have both active)

Marker-based redaction ──────── required before ───> Malformed marker handling
                                                      (fail-safe is part of redaction logic)

Marker-based redaction ──────── independent of ────> Page URL injection
                                                      (no dependency between these features)

Page URL injection ──────────── requires ──────────> Configurable base URL (env var)

Malformed marker handling ───── requires ──────────> Warning log infrastructure
                                                      (already exists via requestContext/pino)
```

## MVP Recommendation

**Phase 1 (must-have, this milestone):**

1. **Remove path-based filtering** -- Clean deletion of `gdpr.ts`, all `isBlocked()` call sites, related tests, and the `logBlockedAccess()` helper. This is a prerequisite and should be done first to avoid merge conflicts.

2. **Marker-based content redaction with fail-safe** -- The core feature. A single `redactGdprContent(content: string): RedactionResult` function that:
   - Replaces all `<!-- gdpr-start -->...<!-- gdpr-end -->` pairs with `[REDACTED]`
   - Handles unclosed `<!-- gdpr-start -->` by redacting to end of content
   - Returns `{ content: string, redactionCount: number, malformed: boolean }`
   - Case-insensitive and whitespace-tolerant markers

3. **Malformed marker warning log** -- Structured log when fail-safe triggers. Uses existing logging infrastructure.

4. **Page URL injection in `get_page`** -- Construct and inject page URL using `WIKIJS_BASE_URL` + path. This enriches AI assistant responses with source links.

**Defer to later:**

- **URL injection for `list_pages` / `search_pages`**: Nice to have but not required for the core GDPR use case. Can be added in a follow-up if AI assistants benefit from links in list results.
- **Redaction count in response text**: Low priority UX improvement. The AI assistant can see the `[REDACTED]` placeholders and infer content was removed.
- **Whitespace normalization**: Cosmetic improvement that can be added later without API changes.

## Implementation Notes

### Regex Design

The recommended regex pattern for paired markers:

```typescript
const GDPR_PAIRED = /<!-- *gdpr-start *-->[\s\S]*?<!-- *gdpr-end *-->/gi;
```

Key design decisions:
- `[\s\S]*?` instead of `.*?` with `s` flag: `[\s\S]` is universally supported across all JS engines and avoids confusion about whether the `s` flag is available. Both work in Node 20+, but `[\s\S]` is the more idiomatic choice.
- `*?` (non-greedy): Matches the shortest possible span between a start and the nearest end marker. This prevents a single start marker from consuming content past multiple end markers.
- `gi` flags: `g` for global (handle multiple pairs), `i` for case-insensitive.
- ` *` around marker text: Zero or more spaces to handle whitespace variations.

For the fail-safe (unclosed start marker):

```typescript
const GDPR_ORPHANED_START = /<!-- *gdpr-start *-->[\s\S]*/gi;
```

This matches from an unclosed start marker to end of string. Applied after the paired regex has already consumed all complete pairs.

### Wiki.js Page URL Format

Wiki.js uses the URL format `{base_url}/{locale}/{page_path}`:
- `https://wiki.company.com/en/Projects/SomePage`
- The locale is typically `en` but is configurable per Wiki.js instance
- The `WIKIJS_BASE_URL` env var already points to the Wiki.js base (e.g., `https://wiki.company.com`)

For URL injection, the simplest approach is `${WIKIJS_BASE_URL}/en/${page.path}` with the locale either hardcoded to `en` or pulled from an env var. The existing `WIKIJS_LOCALE` env var (mentioned in CLAUDE.md as optional, default `en-US`) could be adapted, but Wiki.js URL paths use the short locale code (`en`), not the full locale (`en-US`).

### Response Shape for URL Injection

The current `get_page` response serializes the full `WikiJsPage` object as JSON:

```json
{
  "id": 42,
  "path": "Projects/SomePage",
  "title": "Some Page",
  "description": "...",
  "content": "...",
  "isPublished": true,
  "createdAt": "...",
  "updatedAt": "..."
}
```

After URL injection:

```json
{
  "id": 42,
  "path": "Projects/SomePage",
  "title": "Some Page",
  "description": "...",
  "content": "... (with [REDACTED] placeholders) ...",
  "url": "https://wiki.company.com/en/Projects/SomePage",
  "isPublished": true,
  "createdAt": "...",
  "updatedAt": "..."
}
```

The `url` field is injected into the serialized object, not stored in the database. This keeps the `WikiJsPage` type clean (the `url` field can be added via a response-level spread, not by modifying the interface).

## Sources

### HTML Comments in Markdown
- [Daring Fireball: Markdown Syntax](https://daringfireball.net/projects/markdown/syntax) -- HTML comments are valid in Markdown
- [Wiki.js Markdown Reference](https://www.markdownguide.org/tools/wiki-js/) -- Wiki.js Markdown support
- [Wiki.js Rendering Pipeline](https://docs.requarks.io/rendering) -- How content flows through rendering
- [WHATWG HTML Comments Issue](https://github.com/whatwg/html/issues/10153) -- Nested comments not allowed per spec

### Regex Patterns for HTML Comments
- [Webtips: Select Everything Between HTML Comments](https://webtips.dev/solutions/select-everything-between-html-comments) -- Regex pattern for matching between HTML comment markers
- [MDN: RegExp dotAll](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp/dotAll) -- `s` flag documentation
- [html-comment-regex npm](https://www.npmjs.com/package/html-comment-regex) -- Reference regex for HTML comments

### Fail-Safe / Fail-Closed Security
- [AuthZed: Fail Open vs Fail Closed](https://authzed.com/blog/fail-open) -- Security principle definitions
- [OpenText: Fail Open vs Fail Closed](https://community.opentext.com/cybersec/b/cybersecurity-blog/posts/security-fundamentals-part-1-fail-open-vs-fail-closed) -- GDPR mandates fail-closed for data protection
- [RFC 7103: Advice for Safe Handling of Malformed Messages](https://datatracker.ietf.org/doc/html/rfc7103) -- Tolerance vs. strictness in parsing

### GDPR Redaction Conventions
- [TermsFeed: Data Redaction Under GDPR](https://www.termsfeed.com/blog/gdpr-data-redaction/) -- `[REDACTED]` as standard placeholder
- [Redactable: GDPR Redaction Guidelines](https://www.redactable.com/blog/gdpr-redaction-guidelines) -- Consistency in placeholder text
- [Ailance: GDPR-compliant Redaction](https://2b-advice.com/en/2025/01/24/blackening-of-documents-and-images-dsgvo-compliant-implementation/) -- Deletion preferred over masking; placeholders acceptable

### Wiki.js URL Structure
- [Wiki.js Locales](https://docs.requarks.io/locales) -- Locale prefix in page URLs
- [Wiki.js Pages](https://docs.requarks.io/guide/pages) -- Path-based page structure
- [Wiki.js GraphQL API](https://docs.requarks.io/dev/api) -- Content field returns raw editor content
