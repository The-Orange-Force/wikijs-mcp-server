# Architecture: Marker-Based Content Redaction and Page URL Injection

**Domain:** MCP server content transformation layer (wikijs-mcp-server v2.6)
**Researched:** 2026-03-27
**Confidence:** HIGH (based on direct code analysis of existing src/ files and v2.5 architecture patterns)

---

## Existing Request Flow (Baseline from v2.5)

```
MCP Client
    |
    v
Fastify + JWT auth (mcp-routes.ts)
    |
    v
mcp-tools.ts -- tool handler (inside wrapToolHandler)
    |
    | wikiJsApi.getPageById(id)   OR
    | wikiJsApi.listPages(...)    OR
    | wikiJsApi.searchPages(...)
    v
WikiJsApi (api.ts)
    |
    v
Wiki.js GraphQL API
    |
    | returns WikiJsPage / WikiJsPage[] / PageSearchResult
    v
WikiJsApi (api.ts) -- data returned as-is
    |
    v
mcp-tools.ts -- tool handler
    |
    | isBlocked(page.path)?           <-- v2.5 (BEING REMOVED)
    |   get_page:    -> isError: true, "Page not found."
    |   list_pages:  -> .filter(p => !isBlocked(p.path))
    |   search_pages:-> .filter(p => !isBlocked(p.path))
    v
MCP response (JSON text in content array)
    |
    v
MCP Client
```

The v2.5 architecture used `isBlocked(path)` as a binary predicate: either the entire page is accessible, or it is hidden. v2.6 replaces this with surgical content redaction -- every page is accessible, but marked sections within the content are removed before the response is constructed.

---

## What Changes in v2.6

| v2.5 Behavior | v2.6 Behavior |
|----------------|---------------|
| `isBlocked(path)` blocks entire page | All pages accessible; content is redacted |
| Binary: page visible or hidden | Granular: specific content sections removed |
| Filter in each tool handler | Single `redactContent()` call in `get_page` only |
| No URL in response | `get_page` injects `url` field into response |
| `src/gdpr.ts` exports `isBlocked()` | `src/gdpr.ts` exports `redactContent()` |
| `logBlockedAccess()` in `mcp-tools.ts` | Logging moves into `redactContent()` or caller |

### Key Insight: Redaction Only Applies to `get_page`

`list_pages` and `search_pages` do NOT return page `content` -- they return metadata only (id, path, title, description, isPublished, createdAt, updatedAt). The `content` field is only present in `getPageById()` responses. Therefore:

- **`get_page`**: Apply `redactContent()` to `page.content` before response. Inject `url` field.
- **`list_pages`**: Remove all GDPR filtering. Return pages as-is.
- **`search_pages`**: Remove all GDPR filtering. Return results as-is.

This is a significant simplification over v2.5, which had to filter in all three handlers.

---

## Where the Redaction Function Lives

**Decision: Pure utility function in `src/gdpr.ts`, called from the `get_page` handler in `mcp-tools.ts`.**

The same architectural reasoning from v2.5 applies, but even more clearly:

| Location | Description | Verdict |
|----------|-------------|---------|
| Inside `WikiJsApi.getPageById()` (`api.ts`) | Redact before returning to callers | **Rejected** -- policy-neutral data layer |
| In `wrapToolHandler` (`tool-wrapper.ts`) | Redact in the timing wrapper | **Rejected** -- wrapper sees serialized JSON, not structured data |
| In `get_page` handler (`mcp-tools.ts`) | Redact after API call, before response construction | **Chosen** |
| As a Fastify plugin/middleware | Redact at the HTTP layer | **Rejected** -- see rationale below |

### Why Not a Fastify Plugin or Middleware

A Fastify plugin (registered via `server.register()`) or middleware (`onSend` hook) would operate on the serialized MCP JSON-RPC response. At that layer:
1. The data is already `JSON.stringify`'d inside a `content[0].text` field inside a JSON-RPC envelope.
2. Parsing it back to modify `page.content` is fragile and wasteful.
3. Fastify hooks run for ALL routes, including non-MCP routes (`/health`, `/authorize`, etc.), requiring route filtering.
4. The MCP SDK's `StreamableHTTPServerTransport` writes directly to `reply.raw`, bypassing Fastify's `onSend` hooks entirely. A plugin physically cannot intercept MCP responses.

Reason 4 alone is disqualifying. The MCP transport writes directly to the raw Node.js response object, not through Fastify's reply pipeline.

### Why a Pure Function in `src/gdpr.ts`

The existing `src/gdpr.ts` module already houses GDPR logic (`isBlocked`). Replacing its export with `redactContent()` maintains the single-responsibility pattern: `gdpr.ts` owns GDPR policy, `mcp-tools.ts` applies it.

The function is pure: `(content: string) => { content: string; redacted: boolean }`. No side effects, no dependencies, trivially testable.

---

## New Component: `src/gdpr.ts` (Rewritten)

The existing `isBlocked()` function is deleted. The module is rewritten with a single export: `redactContent()`.

### Function Signature

```typescript
// src/gdpr.ts

export interface RedactionResult {
  /** The content with GDPR-marked sections removed */
  content: string;
  /** Whether any redaction was performed */
  redacted: boolean;
  /** Whether a malformed marker was encountered (start without matching end) */
  malformed: boolean;
}

/**
 * Redact GDPR-marked sections from page content.
 *
 * Removes content between <!-- gdpr-start --> and <!-- gdpr-end --> markers.
 * The markers themselves are also removed.
 *
 * Fail-safe: if a <!-- gdpr-start --> marker has no matching <!-- gdpr-end -->,
 * all content from the start marker to the end of the string is redacted.
 *
 * @param content - Raw page content (may be undefined/null for pages without content)
 * @returns RedactionResult with cleaned content and metadata flags
 */
export function redactContent(content: string | undefined | null): RedactionResult;
```

### Behavior Specification

**Normal markers:** `<!-- gdpr-start -->SENSITIVE<!-- gdpr-end -->` -- the markers and everything between them are removed.

**Multiple sections:** Multiple start/end pairs are supported. Each is independently redacted.

**Malformed (no end marker):** `<!-- gdpr-start -->SENSITIVE...EOF` -- everything from the start marker to end-of-string is redacted. The `malformed` flag is set to `true`.

**No markers:** Content returned unchanged. `redacted: false`, `malformed: false`.

**Null/undefined content:** Returns `{ content: "", redacted: false, malformed: false }`.

### Implementation Strategy: Iterative Scan, Not Regex

A regex approach (`content.replace(/<!-- gdpr-start -->[\s\S]*?<!-- gdpr-end -->/g, '')`) would work for the happy path but fails to handle the malformed-marker case correctly: `.*?` is non-greedy and would stop at the first `<!-- gdpr-end -->`, but if there is no end marker, it would match nothing (in a non-greedy pattern) or everything (in a greedy pattern), depending on whether there are other start/end pairs in the content.

A safer approach is an iterative scan:

```
1. Find next <!-- gdpr-start -->
2. Find next <!-- gdpr-end --> after that position
3. If found: remove start marker through end marker (inclusive)
4. If not found: remove from start marker to end of string; set malformed = true
5. Repeat from position after removal
```

This handles interleaved markers, multiple sections, and the malformed case deterministically.

However, for this codebase the regex approach with a post-check for orphaned start markers is simpler and sufficient:

```
1. Replace all <!-- gdpr-start -->...<!-- gdpr-end --> pairs (non-greedy)
2. Check if any <!-- gdpr-start --> remains (orphaned)
3. If so: remove from orphaned marker to end of string; set malformed = true
```

This works because:
- Step 1 handles all well-formed pairs
- Step 2 catches the single remaining malformed case (an orphaned start marker)
- There can be at most one orphaned start marker (any earlier ones would have been consumed by the non-greedy match with the first available end marker)

**Recommendation:** Use the regex approach with post-check. It is simpler, covers all specified cases, and is easier to read and test.

---

## Page URL Injection

### Where the URL is Constructed

Wiki.js pages are accessible at `{WIKIJS_BASE_URL}/{locale}/{path}`. However, `WIKIJS_BASE_URL` is not necessarily the public-facing URL of the Wiki.js instance -- it might be an internal Docker network URL (e.g., `http://wikijs:3000`) that the MCP server uses to reach the GraphQL API.

**Decision: Reuse `WIKIJS_BASE_URL` for URL construction. Do NOT add a new env var.**

Rationale:
1. In the current deployment (PROJECT.md), `WIKIJS_BASE_URL` is the URL of the Wiki.js instance. The MCP server reaches it directly (same Caddy network).
2. The URL is injected into `get_page` responses for human consumption -- it tells the user where to find the page in the wiki. If the MCP server can reach Wiki.js at `WIKIJS_BASE_URL`, that URL is likely reachable by the human reading the response too (they are on the same network, authenticated via the same Azure AD).
3. Adding a separate `WIKIJS_PUBLIC_URL` env var adds configuration complexity for zero current benefit. If a deployment ever has a split internal/external URL, the env var can be added then.
4. The `.env.example` already documents `WIKIJS_BASE_URL` as "Wiki.js base URL". It is the natural place to construct page URLs from.

### URL Format

Wiki.js page URLs follow the pattern: `{baseUrl}/{locale}/{path}`

- `baseUrl`: From `config.wikijs.baseUrl` (already in config)
- `locale`: The page locale. `getPageById` does not currently return locale. Wiki.js defaults to `en`.
- `path`: From `page.path`

The locale is a complication. The current `getPageById` GraphQL query does not request the `locale` field. Options:

**Option A: Hardcode locale to `en` or use WIKIJS_LOCALE env var.** This is already partially supported -- the `.env.example` mentions `WIKIJS_LOCALE` as an optional var (per CLAUDE.md), though it is not currently in the Zod schema.

**Option B: Add `locale` to the `getPageById` GraphQL query.** This makes the URL dynamically correct per page.

**Decision: Add `locale` to the `getPageById` GraphQL query AND to `WikiJsPage` type.** This is a one-line change to the GraphQL query and a one-field addition to the type. It makes the URL correct without hardcoding assumptions. The locale field is already returned by search results (visible in `api.ts` `RawSearchResult` interface), so Wiki.js definitely supports it.

### URL Construction Location

The URL is constructed in the `get_page` handler in `mcp-tools.ts`, after fetching the page and before serializing the response. It is added to the page object as a `url` property before `JSON.stringify`.

```typescript
// In get_page handler, after redaction, before serialization:
const pageWithUrl = {
  ...page,
  content: redacted.content,
  url: `${config.wikijs.baseUrl}/${page.locale ?? 'en'}/${page.path}`,
};
return {
  content: [
    { type: "text" as const, text: JSON.stringify(pageWithUrl, null, 2) },
  ],
};
```

### Config Threading

The `get_page` handler needs `config.wikijs.baseUrl` to construct URLs. Currently, `createMcpServer()` receives `wikiJsApi` and `instructions` -- it does not have direct access to config.

**Decision: Pass `wikijsBaseUrl` as a third parameter to `createMcpServer()`.** This follows the existing pattern of threading specific config values through function parameters (like `instructions`), rather than importing the global `config` singleton directly into `mcp-tools.ts`.

```typescript
// Updated signature:
export function createMcpServer(
  wikiJsApi: WikiJsApi,
  instructions: string,
  wikijsBaseUrl: string,
): McpServer;
```

This is threaded from `server.ts` -> `protectedRoutes` options -> `createMcpServer()`.

---

## Modified Files and Their Changes

### `src/gdpr.ts` -- REWRITTEN

```
Removes:  isBlocked(path: string): boolean
Adds:     redactContent(content: string | undefined | null): RedactionResult
          RedactionResult interface
Tests:    src/__tests__/gdpr.test.ts (rewritten -- unit tests for redactContent)
Dependencies: none
```

The module remains a pure-function utility with zero dependencies.

### `src/mcp-tools.ts` -- MODIFIED

**Changes:**
1. Remove `import { isBlocked } from "./gdpr.js"` -- replace with `import { redactContent } from "./gdpr.js"`
2. Remove `logBlockedAccess()` helper function entirely
3. **`get_page` handler**: Remove `isBlocked()` check. Add `redactContent(page.content)` call. Add URL injection. Add malformed-marker warning log.
4. **`list_pages` handler**: Remove `isBlocked()` filter. Return pages as-is.
5. **`search_pages` handler**: Remove `isBlocked()` filter. Return results as-is.
6. Update `createMcpServer` signature to accept `wikijsBaseUrl: string` parameter.

**`get_page` handler -- before and after:**

```typescript
// v2.5 (BEFORE)
const page = await wikiJsApi.getPageById(id);
if (page?.path && isBlocked(page.path)) {
  logBlockedAccess(TOOL_GET_PAGE);
  throw new Error("Page not found");
}
return {
  content: [
    { type: "text" as const, text: JSON.stringify(page, null, 2) },
  ],
};

// v2.6 (AFTER)
const page = await wikiJsApi.getPageById(id);
const redacted = redactContent(page?.content);
if (redacted.malformed) {
  const ctx = requestContext.getStore();
  ctx?.log.warn(
    { toolName: TOOL_GET_PAGE, pageId: id },
    "GDPR marker malformed: missing <!-- gdpr-end -->, redacted to end of content",
  );
}
const pageWithUrl = {
  ...page,
  content: redacted.content,
  url: `${wikijsBaseUrl}/${page.locale ?? "en"}/${page.path}`,
};
return {
  content: [
    { type: "text" as const, text: JSON.stringify(pageWithUrl, null, 2) },
  ],
};
```

**`list_pages` handler -- before and after:**

```typescript
// v2.5 (BEFORE)
const pages = await wikiJsApi.listPages(limit, orderBy, includeUnpublished);
const filtered = pages.filter(p => {
  if (isBlocked(p.path)) {
    logBlockedAccess(TOOL_LIST_PAGES);
    return false;
  }
  return true;
});
return {
  content: [
    { type: "text" as const, text: JSON.stringify(filtered, null, 2) },
  ],
};

// v2.6 (AFTER)
const pages = await wikiJsApi.listPages(limit, orderBy, includeUnpublished);
return {
  content: [
    { type: "text" as const, text: JSON.stringify(pages, null, 2) },
  ],
};
```

**`search_pages` handler -- before and after:**

```typescript
// v2.5 (BEFORE)
const result = await wikiJsApi.searchPages(query, limit);
const originalLength = result.results.length;
const filtered = result.results.filter(p => {
  if (isBlocked(p.path)) {
    logBlockedAccess(TOOL_SEARCH_PAGES);
    return false;
  }
  return true;
});
result.totalHits -= (originalLength - filtered.length);
return {
  content: [
    { type: "text" as const, text: JSON.stringify(filtered, null, 2) },
  ],
};

// v2.6 (AFTER)
const result = await wikiJsApi.searchPages(query, limit);
return {
  content: [
    { type: "text" as const, text: JSON.stringify(result.results, null, 2) },
  ],
};
```

### `src/types.ts` -- MODIFIED

Add `locale` field to `WikiJsPage`:

```typescript
export interface WikiJsPage {
  id: number;
  path: string;
  locale?: string;  // NEW -- page locale (e.g., "en")
  title: string;
  description: string;
  content?: string;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}
```

The field is optional because `listPages` and `searchPages` results may not include it (depending on the GraphQL query).

### `src/api.ts` -- MODIFIED

Add `locale` to the `getPageById` GraphQL query:

```graphql
{
  pages {
    single (id: ${id}) {
      id
      path
      locale        # NEW
      title
      description
      content
      isPublished
      createdAt
      updatedAt
    }
  }
}
```

One line added to one query. No other API methods change.

### `src/server.ts` -- MODIFIED

Thread `wikijsBaseUrl` through to `protectedRoutes`:

```typescript
server.register(protectedRoutes, {
  wikiJsApi,
  instructions: effectiveInstructions,
  wikijsBaseUrl: appConfig.wikijs.baseUrl,  // NEW
  auth: { ... },
});
```

### `src/routes/mcp-routes.ts` -- MODIFIED

Accept `wikijsBaseUrl` in `ProtectedRoutesOptions` and pass to `createMcpServer`:

```typescript
export interface ProtectedRoutesOptions {
  wikiJsApi: WikiJsApi;
  auth: AuthPluginOptions;
  instructions: string;
  wikijsBaseUrl: string;  // NEW
}

// In handler:
const mcpServer = createMcpServer(wikiJsApi, instructions, wikijsBaseUrl);
```

### `src/config.ts` -- UNCHANGED

No new env vars. `WIKIJS_BASE_URL` is already validated and available as `config.wikijs.baseUrl`.

### Files Summary

| File | Status | Change |
|------|--------|--------|
| `src/gdpr.ts` | REWRITTEN | `isBlocked()` -> `redactContent()` + `RedactionResult` interface |
| `src/mcp-tools.ts` | MODIFIED | Remove path blocking, add content redaction + URL injection |
| `src/types.ts` | MODIFIED | Add `locale?: string` to `WikiJsPage` |
| `src/api.ts` | MODIFIED | Add `locale` to `getPageById` GraphQL query |
| `src/server.ts` | MODIFIED | Thread `wikijsBaseUrl` to protected routes |
| `src/routes/mcp-routes.ts` | MODIFIED | Accept + pass `wikijsBaseUrl` |
| `src/__tests__/gdpr.test.ts` | REWRITTEN | Tests for `redactContent()` |
| `src/__tests__/mcp-tools-gdpr.test.ts` | REWRITTEN | Tests for redaction integration + URL injection |
| `src/config.ts` | UNCHANGED | No new env vars |
| `src/tool-wrapper.ts` | UNCHANGED | Timing/logging unchanged |
| `src/logging.ts` | UNCHANGED | Logger config unchanged |
| `src/request-context.ts` | UNCHANGED | Context propagation unchanged |

---

## Updated Request Flow (v2.6)

```
MCP Client
    |
    v
Fastify + JWT auth (mcp-routes.ts)
    |
    v
mcp-tools.ts -- get_page handler (inside wrapToolHandler)
    |
    | wikiJsApi.getPageById(id)
    v
WikiJsApi (api.ts) -- returns WikiJsPage with locale
    |
    | returns { id, path, locale, title, description, content, ... }
    v
mcp-tools.ts -- get_page handler
    |
    | 1. redactContent(page.content)          <-- NEW: src/gdpr.ts
    |    Removes <!-- gdpr-start -->...<!-- gdpr-end --> sections
    |    Sets malformed flag if orphaned start marker
    |
    | 2. If malformed: log.warn(...)          <-- NEW: malformed marker warning
    |
    | 3. Construct URL: {baseUrl}/{locale}/{path}  <-- NEW: URL injection
    |
    | 4. Build response: { ...page, content: redacted, url }
    v
MCP response (JSON text in content array)
    |
    v
MCP Client


mcp-tools.ts -- list_pages handler
    |
    | wikiJsApi.listPages(...)
    v
WikiJsApi (api.ts) -- returns WikiJsPage[]
    |
    v
mcp-tools.ts -- list_pages handler
    |
    | (NO FILTERING -- pages returned as-is)  <-- SIMPLIFIED from v2.5
    v
MCP response


mcp-tools.ts -- search_pages handler
    |
    | wikiJsApi.searchPages(...)
    v
WikiJsApi (api.ts) -- returns PageSearchResult
    |
    v
mcp-tools.ts -- search_pages handler
    |
    | (NO FILTERING -- results returned as-is)  <-- SIMPLIFIED from v2.5
    v
MCP response
```

---

## Component Responsibilities (v2.6)

| Component | Responsibility | Status |
|-----------|---------------|--------|
| `src/gdpr.ts` | `redactContent()` -- marker-based content redaction | REWRITTEN |
| `src/mcp-tools.ts` | Apply redaction in `get_page`, inject URL, pass through `list_pages`/`search_pages` | MODIFIED |
| `src/types.ts` | `WikiJsPage.locale` added | MODIFIED |
| `src/api.ts` | `getPageById` returns `locale` field | MODIFIED |
| `src/server.ts` | Thread `wikijsBaseUrl` to routes | MODIFIED |
| `src/routes/mcp-routes.ts` | Accept + pass `wikijsBaseUrl` to `createMcpServer` | MODIFIED |
| `src/tool-wrapper.ts` | Timing and logging -- unchanged | UNCHANGED |
| `src/config.ts` | No new env vars | UNCHANGED |

---

## Test Architecture

### Unit Tests for `redactContent()` -- `src/__tests__/gdpr.test.ts` (Rewritten)

Pure function with no side effects. Test with vitest directly -- no mocking needed.

**Test cases to cover:**

| Input | Expected Output | Flags |
|-------|----------------|-------|
| `"Hello <!-- gdpr-start -->SECRET<!-- gdpr-end --> world"` | `"Hello  world"` | `redacted: true, malformed: false` |
| `"No markers here"` | `"No markers here"` | `redacted: false, malformed: false` |
| `"Start <!-- gdpr-start -->SECRET..."` (no end marker) | `"Start "` | `redacted: true, malformed: true` |
| `"A<!-- gdpr-start -->X<!-- gdpr-end -->B<!-- gdpr-start -->Y<!-- gdpr-end -->C"` | `"ABC"` | `redacted: true, malformed: false` |
| `undefined` | `""` | `redacted: false, malformed: false` |
| `null` | `""` | `redacted: false, malformed: false` |
| `""` | `""` | `redacted: false, malformed: false` |
| `"<!-- gdpr-start -->ALL REDACTED<!-- gdpr-end -->"` | `""` | `redacted: true, malformed: false` |
| `"<!-- gdpr-start -->REST OF CONTENT"` (end missing) | `""` | `redacted: true, malformed: true` |
| Content with extra whitespace around markers | Consistent behavior | Verify marker matching is exact |

### Integration Tests for Tool Behavior -- `src/__tests__/mcp-tools-gdpr.test.ts` (Rewritten)

Uses the same `createMcpServer` + `getToolHandler` pattern from v2.5 tests.

**Test cases to cover:**

1. `get_page` with content containing GDPR markers -- markers and content between them removed from response
2. `get_page` with content containing no markers -- content unchanged
3. `get_page` with malformed marker -- content redacted to end, malformed warning logged
4. `get_page` response contains `url` field with correct format
5. `get_page` response `url` uses page's `locale` field
6. `get_page` response `url` defaults locale to `"en"` when locale is missing
7. `list_pages` returns ALL pages (no GDPR filtering)
8. `search_pages` returns ALL results (no GDPR filtering)

### Removed Tests

All v2.5 `isBlocked()`-based tests are removed or replaced:
- `src/__tests__/gdpr.test.ts` -- completely rewritten for `redactContent()`
- `src/__tests__/mcp-tools-gdpr.test.ts` -- completely rewritten for redaction + URL injection

---

## Suggested Build Order

```
Phase 1: Core redaction function + unit tests
  Files: src/gdpr.ts (rewrite), src/__tests__/gdpr.test.ts (rewrite), src/types.ts (add locale)
  Dependencies: none
  Rationale: Pure function with no deps. Zero-risk foundation. All downstream changes
             depend on redactContent(). Types change is trivial and needed early.

Phase 2: Remove path blocking, wire redaction + URL injection
  Files: src/mcp-tools.ts, src/api.ts, src/server.ts, src/routes/mcp-routes.ts
  Dependencies: Phase 1 (redactContent import, locale in WikiJsPage)
  Rationale: Core integration. Touches the most files but each change is small.
             api.ts gets locale field. mcp-tools.ts gets redaction + URL. server.ts
             and mcp-routes.ts thread the baseUrl config.

Phase 3: Integration tests
  Files: src/__tests__/mcp-tools-gdpr.test.ts (rewrite)
  Dependencies: Phases 1-2
  Rationale: Tests the full tool handler behavior with mock API. Confirms
             redaction, URL injection, and malformed-marker logging all work together.
```

Build order is linear -- 3 phases, matching the 3-phase pattern established in v2.5.

---

## Architectural Patterns Applied

### Pattern: Content Transformation Between Fetch and Serialize

After fetching the `WikiJsPage` with its raw `content` string and before serializing to JSON, apply a pure transformation function. The data remains typed through the transformation, ensuring field access is compile-checked.

This is the same "Thin Filter Between Fetch and Serialize" pattern from v2.5, adapted from filtering (removing pages) to transforming (modifying content).

### Pattern: Fail-Safe Redaction

When a `<!-- gdpr-start -->` marker has no matching `<!-- gdpr-end -->`, the safe default is to redact everything from the start marker to the end of content. This ensures that incomplete markup caused by editing errors never leaks GDPR-sensitive content. The principle: **when in doubt, redact more, not less**.

The `malformed` flag allows the caller to log a warning, enabling wiki editors to be notified and fix the markup. But the content is never exposed.

### Pattern: Config Threading via Function Parameters

Rather than importing the global `config` singleton in `mcp-tools.ts`, the `wikijsBaseUrl` value is threaded through function parameters: `config` -> `buildApp()` -> `protectedRoutes` options -> `createMcpServer()`. This matches the existing pattern for `instructions` and keeps modules decoupled from the config singleton for testability.

### Pattern: Optional Field with Default

The `locale` field on `WikiJsPage` is optional (`locale?: string`). When constructing the URL, the handler uses `page.locale ?? "en"` as a fallback. This handles the case where the GraphQL response omits the field (it shouldn't, but defensive coding prevents runtime errors).

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Redacting in `WikiJsApi`

**What:** Adding `redactContent()` calls inside `getPageById()` in `api.ts`.
**Why bad:** The API layer becomes a policy layer. If a future admin tool needs unredacted content (e.g., for wiki editing), the redaction cannot be bypassed.
**Instead:** Keep `api.ts` as a pure data access layer. Apply redaction in the consumers.

### Anti-Pattern 2: Adding a New Env Var for Page URL Base

**What:** Creating `WIKIJS_PUBLIC_URL` or `WIKIJS_PAGE_BASE_URL` separate from `WIKIJS_BASE_URL`.
**Why bad:** Adds configuration complexity. Deployers must now set two URLs that in practice are the same value. Creates a new failure mode (mismatched URLs).
**Instead:** Reuse `WIKIJS_BASE_URL`. Add a separate var only when a concrete deployment needs different internal/external URLs.

### Anti-Pattern 3: Regex-Only Without Malformed Handling

**What:** Using `content.replace(/<!-- gdpr-start -->[\s\S]*?<!-- gdpr-end -->/g, '')` and calling it done.
**Why bad:** An orphaned `<!-- gdpr-start -->` with no end marker leaves GDPR-sensitive content in the response. Wiki editors make mistakes; the server must be fail-safe.
**Instead:** After regex replacement, scan for remaining `<!-- gdpr-start -->` markers and redact to end of content.

### Anti-Pattern 4: Adding URL to `list_pages` and `search_pages` Responses

**What:** Injecting a `url` field into every page in list and search results.
**Why bad:** The requirement specifies "Inject page URL into get_page responses." Over-delivering bloats list/search responses and changes their shape without a stated need.
**Instead:** Only add `url` to `get_page` responses.

### Anti-Pattern 5: Using Fastify `onSend` Hook for Redaction

**What:** Registering a Fastify `onSend` hook that intercepts MCP responses and redacts content.
**Why bad:** The MCP SDK's `StreamableHTTPServerTransport` writes directly to `reply.raw`, bypassing Fastify's reply pipeline. The hook physically cannot intercept the response. Even if it could, parsing JSON-RPC envelopes in a hook is fragile.
**Instead:** Apply redaction in the tool handler, where data is still structured.

### Anti-Pattern 6: Preserving `isBlocked()` Alongside `redactContent()`

**What:** Keeping `isBlocked()` as a "belt and suspenders" measure alongside content redaction.
**Why bad:** The requirement explicitly states "Remove path-based GDPR filtering from all MCP tools." Keeping both creates confusion about which mechanism is authoritative and adds dead code paths that need testing.
**Instead:** Remove `isBlocked()` entirely. `redactContent()` is the single GDPR mechanism.

---

## Data Flow Diagram: `get_page` Response Construction

```
WikiJsApi.getPageById(id)
    |
    | Returns WikiJsPage:
    | {
    |   id: 42,
    |   path: "Clients/AcmeCorp",
    |   locale: "en",
    |   title: "AcmeCorp",
    |   content: "Public info\n<!-- gdpr-start -->\nContract: EUR 500K\n<!-- gdpr-end -->\nMore public info",
    |   ...
    | }
    v
redactContent(page.content)
    |
    | Returns RedactionResult:
    | {
    |   content: "Public info\n\nMore public info",
    |   redacted: true,
    |   malformed: false,
    | }
    v
URL Construction
    |
    | url = `${wikijsBaseUrl}/${page.locale}/${page.path}`
    |     = "http://wikijs.example.com/en/Clients/AcmeCorp"
    v
Response Assembly
    |
    | pageWithUrl = {
    |   id: 42,
    |   path: "Clients/AcmeCorp",
    |   locale: "en",
    |   title: "AcmeCorp",
    |   content: "Public info\n\nMore public info",   <-- redacted
    |   url: "http://wikijs.example.com/en/Clients/AcmeCorp",  <-- injected
    |   isPublished: true,
    |   ...
    | }
    v
JSON.stringify(pageWithUrl, null, 2)
    |
    v
MCP Response: { content: [{ type: "text", text: "..." }] }
```

---

## Scalability Considerations

| Concern | At current scale | Notes |
|---------|-----------------|-------|
| Redaction performance | O(n) where n is content length | Single regex pass + one indexOf check. Content is typically < 100KB. |
| Memory | No additional state | Pure function, no caching. Input and output strings. |
| URL construction | O(1) per get_page call | String concatenation. Negligible. |
| Multiple markers per page | Handled by global regex flag | No performance concern at typical marker counts (< 10 per page). |
| Config threading | 1 extra string param | No performance impact. |

The redaction adds microseconds of latency per `get_page` call -- negligible at any scale this server encounters.

---

## Sources

- Direct code analysis of `src/mcp-tools.ts`, `src/gdpr.ts`, `src/api.ts`, `src/types.ts`, `src/config.ts`, `src/server.ts`, `src/routes/mcp-routes.ts` (current codebase)
- v2.5 ARCHITECTURE.md research (`.planning/research/ARCHITECTURE.md`) for architectural precedent
- PROJECT.md v2.6 requirements for feature specification
- Wiki.js URL format: `{baseUrl}/{locale}/{path}` (observed in `api.ts` `RawSearchResult` locale field and Wiki.js documentation)

---

*Architecture research for: Marker-Based Content Redaction and Page URL Injection -- wikijs-mcp-server v2.6*
*Researched: 2026-03-27*
