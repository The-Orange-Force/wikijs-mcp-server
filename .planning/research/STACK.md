# Stack Research

**Domain:** Marker-based GDPR content redaction and page URL injection for MCP server
**Researched:** 2026-03-27
**Confidence:** HIGH

## Context: What This Covers

This research is scoped to the v2.6 milestone. The existing application stack (TypeScript 5.3, Fastify 4, jose, Zod, Vitest, Docker) is validated and not re-researched. The v2.5 path-based GDPR filtering (`isBlocked()` predicate) is being **removed** and replaced with marker-based content redaction.

**The questions:**
1. What is needed for regex-based content redaction of `<!-- gdpr-start/end -->` markers in markdown?
2. How to handle malformed markers (start without end) safely?
3. How to construct page URLs for injection into get_page responses?

**Answer: Zero new dependencies.** All three capabilities are covered by Node.js built-ins and the existing stack.

---

## Recommended Stack Additions

### New Dependencies

None.

The v2.6 milestone features (regex content redaction, malformed marker handling, URL construction) require **zero new npm dependencies**. Everything is implemented with:

- `String.prototype.replace()` with compiled `RegExp` -- content redaction
- `String.prototype.includes()` and `String.prototype.indexOf()` -- malformed marker detection
- `URL` class (WHATWG, built into Node.js since v10) -- page URL construction
- Zod `.url().optional()` (already installed) -- new env var validation
- Pino via Fastify (already installed) -- malformed marker warning logs

### Capabilities from Existing Stack

| Capability | Provided By | How | Notes |
|------------|-------------|-----|-------|
| Regex content redaction | `String.prototype.replace()` + `RegExp` | Native V8 regex with `/g` flag | Compiled once at module level |
| Cross-line matching in markdown | `[\s\S]*?` character class | Matches any character including newlines | Alternative: dotAll `s` flag (both work on Node >= 20) |
| Malformed marker detection | `String.prototype.includes()` | Check start marker present, end marker absent | Faster than regex for presence detection |
| Fail-safe truncation | `String.prototype.indexOf()` + `substring()` | Redact from start marker to end of content | No regex needed for this path |
| URL construction | WHATWG `URL` class (Node.js built-in) | `new URL(path, baseUrl)` | Handles trailing slashes, encoding |
| Config validation | Zod (^3.25.17, already installed) | Add `WIKIJS_PAGE_URL` to `envSchema` | Optional field with `.url()` validator |
| Audit logging | Pino (via Fastify ^4.27.2, already installed) | `ctx.log.warn()` for malformed markers | Existing `requestContext` pattern |

---

## Technical Design Decisions

### 1. Regex Pattern for Marker Redaction

**Markers:** `<!-- gdpr-start -->` ... `<!-- gdpr-end -->`

```typescript
// Compiled once at module level (not per-call) -- avoids recompilation overhead
const GDPR_REDACT_RE = /<!-- gdpr-start -->[\s\S]*?<!-- gdpr-end -->/g;
```

**Why `[\s\S]*?` (non-greedy, cross-line):**
- GDPR-redacted content in markdown will span multiple lines -- `.` does not match newlines by default
- `[\s\S]*?` matches any character (including `\n`) non-greedily
- Non-greedy `*?` is essential: with greedy `*`, the pattern `start...end...start...end` would match the entire span as one block instead of two separate blocks
- The `s` (dotAll) flag + `.*?` is an equivalent alternative, available since Node 10; `[\s\S]*?` is the more widely-recognized idiom

**Why this pattern is ReDoS-safe (HIGH confidence):**

The pattern consists of two **fixed literal anchors** (`<!-- gdpr-start -->` and `<!-- gdpr-end -->`) with a single non-greedy `[\s\S]*?` between them. This is a **linear-time** pattern:
- No nested quantifiers (no `(a+)+` shapes)
- No alternation inside quantifiers (no `(a|b)*` shapes)
- No overlapping character classes
- V8's regex engine processes this in O(n) time proportional to content length

The `re2` library (Google's linear-time regex engine) is unnecessary for this pattern shape. Adding `re2` would introduce a native C++ dependency that complicates the Alpine Docker image and CI pipeline for zero security benefit.

**Performance characteristics:**

| Input Size | Expected Time | Basis |
|------------|---------------|-------|
| 5-20 KB (typical wiki page) | < 0.1 ms | Linear scan, no backtracking |
| 100-500 KB (large page) | < 1 ms | Still linear; negligible vs GraphQL round-trip |

These times are negligible compared to the Wiki.js GraphQL API round-trip (typically 50-200 ms).

### 2. Malformed Marker Fail-Safe

**Requirement:** If `<!-- gdpr-start -->` appears but `<!-- gdpr-end -->` is missing (or typo'd), redact from the start marker through the end of the content. Log a structured warning.

**Strategy: Detection first, then branch.**

```typescript
// Fast presence detection via indexOf (O(n), no regex compilation)
const startIdx = content.indexOf('<!-- gdpr-start -->');

if (startIdx !== -1 && !content.includes('<!-- gdpr-end -->')) {
  // Malformed: redact from start marker to EOF
  content = content.substring(0, startIdx) + '[Content redacted]';
  // Log warning via existing Pino/requestContext pattern
  ctx?.log.warn({ pageId, malformedMarker: true }, 'GDPR marker missing end tag; redacted to end of content');
} else {
  // Well-formed: regex handles matched pairs
  content = content.replace(GDPR_REDACT_RE, '[Content redacted]');
}
```

**Why not regex for the malformed case:**
- `String.indexOf()` is O(n) and avoids regex compilation
- The malformed case is simpler (find first occurrence, truncate) -- regex is the wrong tool
- Separating well-formed (regex) from malformed (string ops) makes each path testable and readable
- The fail-safe approach (redact more, not less) is the correct GDPR-safe default

### 3. URL Construction

**Use the WHATWG `URL` class**, not string concatenation.

```typescript
function buildPageUrl(baseUrl: string, pagePath: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  return new URL(pagePath, base).toString();
}
```

**Why `URL` class over template literals:**
- Handles edge cases: double slashes (`https://wiki.example.com//Clients/Acme`), special characters in paths (spaces, unicode), proper percent-encoding
- Wiki.js paths can contain spaces (e.g., `Clients/Acme Corp`), apostrophes, umlauts
- TypeScript types are built-in (`URL` is globally available in Node.js)
- `new URL(relative, base)` correctly resolves relative paths against the base, handling trailing slash presence/absence

**Configuration:** New optional env var `WIKIJS_PAGE_URL` validated via Zod. When absent, page URLs are omitted from responses (backward-compatible; no breaking change for existing deployments).

### 4. Where Redaction Executes

Redaction belongs in `mcp-tools.ts` (the tool handler layer), **not** in `api.ts` (the API client layer).

**Rationale:**
- `api.ts` is a thin GraphQL client -- it should return raw data from Wiki.js unchanged
- Content redaction is a server-level GDPR policy, not an API concern
- This matches the existing pattern where `isBlocked()` is called in tool handlers, not in `api.ts`
- Testing is cleaner: the redaction function is pure (string in, string out), tested independently without API mocking
- The redaction module replaces `src/gdpr.ts` (which currently exports `isBlocked()`)

---

## Configuration Changes

### New Environment Variable

| Variable | Required | Type | Default | Purpose |
|----------|----------|------|---------|---------|
| `WIKIJS_PAGE_URL` | No | URL string | (none) | Base URL for constructing page links in get_page responses |

**Zod schema addition to `config.ts`:**
```typescript
WIKIJS_PAGE_URL: z.string().url("WIKIJS_PAGE_URL must be a valid URL").optional(),
```

**Example values:**
- `https://wiki.example.com/en/` -- produces URLs like `https://wiki.example.com/en/Clients/AcmeCorp`
- If unset, the `url` field is omitted from get_page JSON responses (no breaking change)

---

## Files Modified (no new dependencies)

| File | Change | Reason |
|------|--------|--------|
| `src/gdpr.ts` | **Rewrite**: replace `isBlocked()` with `redactContent()` and `buildPageUrl()` | Marker-based redaction replaces path-based blocking |
| `src/mcp-tools.ts` | Call `redactContent()` on content; inject page URL; remove `isBlocked()` calls and `logBlockedAccess()` | New redaction + URL injection; remove old path filtering |
| `src/config.ts` | Add `WIKIJS_PAGE_URL` to `envSchema` | New optional env var |
| `example.env` | Add `WIKIJS_PAGE_URL` example | Document new config |
| `src/__tests__/gdpr.test.ts` | **Rewrite**: test `redactContent()` and `buildPageUrl()` | New functions replace old ones |
| `tests/gdpr-filter.test.ts` | **Remove or rewrite**: integration tests for old path-based filtering | Old filtering is removed |

**No changes needed to:**
- `src/api.ts` -- returns raw Wiki.js data unchanged
- `src/types.ts` -- `WikiJsPage.content` is already `string | undefined`; URL is injected at serialization time in the tool handler, not stored on the type
- Docker / docker-compose -- no new dependencies or volumes

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `re2` / `node-re2` | Native C++ dependency; complicates Alpine Docker image; unnecessary because the marker pattern is provably linear-time (fixed delimiters + non-greedy quantifier) | Native `RegExp` with `[\s\S]*?` |
| `html-comment-regex` npm | Abandoned (last publish 2016); generic HTML comment matching we do not need; our pattern is specific to `<!-- gdpr-start/end -->` | Specific hardcoded regex literal |
| `sanitize-html` / `DOMPurify` | Designed for HTML sanitization for browser rendering; we are doing string-level content redaction on markdown source text | `String.prototype.replace()` with targeted regex |
| `cheerio` / HTML parsers | Markdown content is not valid HTML; parsing as HTML would mangle the markdown | Direct string/regex operations on markdown |
| Regex with greedy `.*` | Greedy quantifier matches across multiple GDPR blocks: `start...end...start...end` becomes one giant match instead of two | Non-greedy `[\s\S]*?` |
| `String.prototype.replaceAll()` | With regex + `g` flag it is identical to `.replace()` with `g` flag; no benefit | `.replace()` with global regex |
| Dynamic regex from user input | Never construct regex from user-provided strings (ReDoS vector) | All patterns are hardcoded literal strings compiled at module load |
| `path` module for URL construction | `path.join()` uses OS-specific separators (backslash on Windows); URLs always use forward slashes | WHATWG `URL` class |

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| Native `RegExp` `[\s\S]*?` | `re2` (Google RE2 engine) | ReDoS is not a risk with fixed-literal-delimiter patterns; re2 adds native C++ dep that breaks Alpine Docker builds |
| Native `RegExp` `[\s\S]*?` | `html-comment-regex` npm | Unmaintained since 2016; our pattern is simpler and more specific |
| `String.prototype.replace()` | Custom streaming parser | Wiki.js pages are small (< 100 KB typically); full-string replacement is simpler and sufficient |
| WHATWG `URL` class | Template literal concatenation | Template literals mishandle double slashes, special characters, and encoding edge cases |
| `String.indexOf()` for malformed detection | Regex lookahead assertion | indexOf is faster and clearer for simple presence checks |
| Pure functions in `src/gdpr.ts` | Inline logic in `mcp-tools.ts` | Separate module is more testable; follows existing pattern of `gdpr.ts` as a self-contained utility |
| `WIKIJS_PAGE_URL` optional env var | Derive URL from `WIKIJS_BASE_URL` | Wiki.js base URL (API endpoint) may differ from the user-facing page URL (e.g., internal API vs public wiki hostname) |
| Zod `.url().optional()` | Manual URL validation | Consistent with existing config pattern; fail-fast at startup |

---

## Version Compatibility

| Dependency | Current Version | v2.6 Compatible | Notes |
|------------|-----------------|-----------------|-------|
| Node.js | >= 20 | Yes | `URL` class, `RegExp` with `[\s\S]`, `String.includes()` all available since Node 10+ |
| TypeScript | ^5.3.3 | Yes | ES2020 target supports all needed string/regex features |
| Zod | ^3.25.17 | Yes | `.url().optional()` stable since Zod 3.0 |
| Vitest | ^4.1.1 | Yes | Pure function tests need no special configuration |
| Fastify/Pino | ^4.27.2 | Yes | Existing `ctx.log.warn()` pattern unchanged |

No new packages means no version compatibility concerns.

---

## Installation

```bash
# No new dependencies to install.
# All v2.6 features use existing dependencies + Node.js built-ins.
```

---

## Sources

- [MDN: String.prototype.replace()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace) -- regex replacement API reference. HIGH confidence.
- [MDN: RegExp dotAll flag](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp/dotAll) -- `s` flag documentation confirming availability in ES2018+. HIGH confidence.
- [Node.js URL API documentation](https://nodejs.org/api/url.html) -- WHATWG URL class reference and best practices. HIGH confidence.
- [Sonar: Dangers of Regular Expressions in JavaScript](https://www.sonarsource.com/blog/vulnerable-regular-expressions-javascript/) -- ReDoS pattern analysis confirming fixed-delimiter patterns are safe. MEDIUM confidence.
- [RE2 safe regex library evaluation](https://www.oreateai.com/blog/unlocking-the-power-of-re2-a-safe-alternative-for-regular-expressions-in-nodejs/f47e51a51ef4b558a7aaeec6890a5ebb) -- evaluated and rejected for this use case. MEDIUM confidence.
- [How to Safely Concatenate URLs with Node.js](https://plainenglish.io/blog/how-to-safely-concatenate-url-with-node-js-f6527b623d5) -- URL class vs string concatenation best practices. MEDIUM confidence.
- [html-comment-regex npm](https://www.npmjs.com/package/html-comment-regex) -- evaluated and rejected (unmaintained since 2016). MEDIUM confidence.
- Codebase analysis of `src/gdpr.ts`, `src/mcp-tools.ts`, `src/api.ts`, `src/config.ts`, `src/types.ts` -- existing patterns and integration points. HIGH confidence (direct code inspection).

---
*Stack research for: v2.6 GDPR Content Redaction and Page URL Injection -- wikijs-mcp-server*
*Researched: 2026-03-27*
