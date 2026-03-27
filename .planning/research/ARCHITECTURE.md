# Architecture: GDPR Path Filter Integration

**Domain:** MCP server post-fetch data filter (wikijs-mcp-server v2.5)
**Researched:** 2026-03-27
**Confidence:** HIGH (based on direct code analysis of existing src/ files)

---

## Existing Request Flow (Baseline)

```
MCP Client (Claude Desktop / Claude Code)
    |
    | POST /mcp  (Bearer token)
    v
+---------------------------+
| Fastify: mcp-routes.ts    |  JWT validation (preHandler)
| protectedRoutes plugin    |  requestContext.run() sets correlation ID + user
+---------------------------+
    |
    | Per-request McpServer + StreamableHTTPServerTransport
    v
+---------------------------+
| mcp-tools.ts              |  createMcpServer(wikiJsApi, instructions)
| registerTool() handlers   |  wrapToolHandler() — timing + structured logging
+---------------------------+
    |
    | wikiJsApi.getPageById()
    | wikiJsApi.listPages()
    | wikiJsApi.searchPages()
    v
+---------------------------+
| api.ts: WikiJsApi         |  graphql-request client
+---------------------------+
    |
    v
Wiki.js GraphQL API
```

All three tool handlers follow the same flow:
1. Call a `WikiJsApi` method to fetch data from WikiJS
2. On success, `JSON.stringify` the result and return it
3. On error, return `isError: true` with a descriptive text message

---

## Where the Filter Lives

**Decision: Tool-level filter in `mcp-tools.ts`, applied after the `WikiJsApi` call returns.**

The filter must be applied at the point where data has been fetched from WikiJS but has not yet been returned to the MCP client. There are three candidate locations:

| Location | Description | Verdict |
|----------|-------------|---------|
| Inside `WikiJsApi` methods (`api.ts`) | Filter before returning to callers | Rejected — see rationale below |
| In `wrapToolHandler` (`tool-wrapper.ts`) | Filter in the timing wrapper | Rejected — see rationale below |
| In tool handlers (`mcp-tools.ts`) | Filter after API call, before response construction | **Chosen** |

### Why Not `api.ts`

`WikiJsApi` is a data access layer. Its methods return whatever WikiJS returns. Embedding a security policy inside the data layer couples a business rule (GDPR classification) to a low-level component. If `WikiJsApi` were ever reused by a different surface (an admin endpoint that IS allowed to access GDPR pages), the filter would incorrectly block it. The API layer should remain policy-neutral.

### Why Not `tool-wrapper.ts`

`wrapToolHandler` wraps the entire handler and operates on the `TResult` (the MCP tool response object). By the time the wrapper sees the result, the data is already serialized as JSON text inside a `content` array. Parsing JSON to extract paths and re-filtering is fragile and defeats the purpose of structured data. The wrapper's responsibility is timing and logging — adding filtering there violates single responsibility.

### Why Tool-Level in `mcp-tools.ts`

The tool handlers already contain all the tool-specific business logic: which fields to return, how to format errors, what the success response looks like. Filtering belongs here because:

- `get_page`: Receives a single `WikiJsPage`; can check `page.path` before constructing the response.
- `list_pages`: Receives `WikiJsPage[]`; can `Array.filter()` before `JSON.stringify`.
- `search_pages`: Receives `PageSearchResult`; can filter `result.results` before `JSON.stringify`.

The filter is applied in-handler, after the API call and before response construction. This is the minimum-change integration point.

---

## New Component: `src/gdpr.ts`

A single shared utility module. It lives at the top level of `src/` alongside `config.ts`, `types.ts`, and `scopes.ts` — small, stateless, domain-logic modules.

**Purpose:** Export `isBlocked(path: string): boolean` — the single source of truth for GDPR path classification.

**Rule:** A path is blocked if it has exactly 2 segments and the first segment (case-insensitive) is `Clients`.

```
Clients/AcmeCorp          → blocked (direct client directory)
Clients/AcmeCorp/notes    → NOT blocked (sub-page of client directory)
Clients                   → NOT blocked (root index, not a company page)
Public/AcmeCorp           → NOT blocked (wrong top-level segment)
```

This rule is directly specified in PROJECT.md: "identifies GDPR-sensitive paths (exactly 2 segments starting with `Clients`)".

**Signature:**

```typescript
// src/gdpr.ts
export function isBlocked(path: string): boolean {
  const segments = path.split('/').filter(s => s.length > 0);
  return segments.length === 2 && segments[0].toLowerCase() === 'clients';
}
```

No configuration, no dependencies, no imports. A pure function that accepts a string and returns a boolean.

---

## Modified Files and Their Changes

### `src/gdpr.ts` — NEW

```
Exports: isBlocked(path: string): boolean
Tests: src/gdpr/__tests__/gdpr.test.ts (unit)
Dependencies: none
```

### `src/mcp-tools.ts` — MODIFIED

Three tool handlers each gain a single post-fetch filter. The filter is applied between the API call and the response construction.

**`get_page` handler change:**

```typescript
// BEFORE
const page = await wikiJsApi.getPageById(id);
return {
  content: [{ type: "text" as const, text: JSON.stringify(page, null, 2) }],
};

// AFTER
const page = await wikiJsApi.getPageById(id);
if (isBlocked(page.path)) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: "Page not found." }],
  };
}
return {
  content: [{ type: "text" as const, text: JSON.stringify(page, null, 2) }],
};
```

The "not found" response must not reveal existence. The exact error text "Page not found." is intentionally generic — it must not say "access denied", "GDPR blocked", or "Clients directory". Using `isError: true` matches the existing error pattern in the same handler (WikiJS API errors also use `isError: true`).

**`list_pages` handler change:**

```typescript
// BEFORE
const pages = await wikiJsApi.listPages(limit, orderBy, includeUnpublished);
return {
  content: [{ type: "text" as const, text: JSON.stringify(pages, null, 2) }],
};

// AFTER
const pages = await wikiJsApi.listPages(limit, orderBy, includeUnpublished);
const filtered = pages.filter(p => !isBlocked(p.path));
return {
  content: [{ type: "text" as const, text: JSON.stringify(filtered, null, 2) }],
};
```

Silent filter — no error, no indication that pages were removed. The result is a shorter list.

**`search_pages` handler change:**

```typescript
// BEFORE
const result = await wikiJsApi.searchPages(query, limit);
return {
  content: [{ type: "text" as const, text: JSON.stringify(result.results, null, 2) }],
};

// AFTER
const result = await wikiJsApi.searchPages(query, limit);
const filteredResults = result.results.filter(p => !isBlocked(p.path));
return {
  content: [{ type: "text" as const, text: JSON.stringify(filteredResults, null, 2) }],
};
```

Silent filter — same pattern as `list_pages`. Note: `result.totalHits` is already excluded from the serialized response (only `result.results` is serialized, per the existing implementation). The filtered results array is serialized directly.

### No other files require modification

| File | Status | Reason |
|------|--------|--------|
| `src/api.ts` | UNCHANGED | WikiJsApi remains policy-neutral |
| `src/tool-wrapper.ts` | UNCHANGED | Wrapper handles only timing and logging |
| `src/types.ts` | UNCHANGED | `WikiJsPage.path` already present |
| `src/config.ts` | UNCHANGED | No new env vars — rule is hardcoded |
| `src/routes/mcp-routes.ts` | UNCHANGED | Route layer has no filter role |
| `src/server.ts` | UNCHANGED | No startup registration needed |
| `src/scopes.ts` | UNCHANGED | Scope model unchanged |
| `tests/helpers/build-test-app.ts` | UNCHANGED | Mock API returns non-Clients paths |

---

## Updated Request Flow (with GDPR filter)

```
MCP Client
    |
    v
Fastify + JWT auth (mcp-routes.ts)
    |
    v
mcp-tools.ts — tool handler (inside wrapToolHandler)
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
WikiJsApi (api.ts) — data returned as-is
    |
    v
mcp-tools.ts — tool handler
    |
    | isBlocked(page.path)?           ← NEW: src/gdpr.ts
    |   get_page:    → isError: true, "Page not found."
    |   list_pages:  → .filter(p => !isBlocked(p.path))
    |   search_pages:→ .filter(p => !isBlocked(p.path))
    v
MCP response (JSON text in content array)
    |
    v
MCP Client
```

The filter is applied at exactly one point per tool — after the API returns, before `JSON.stringify`.

---

## Component Responsibilities

| Component | Responsibility | Status |
|-----------|---------------|--------|
| `src/gdpr.ts` | `isBlocked()` — single source of truth for GDPR path classification | NEW |
| `src/mcp-tools.ts` | Apply filter in each tool handler post-fetch | MODIFIED |
| `src/api.ts` | Data access — policy-neutral, no filter | UNCHANGED |
| `src/tool-wrapper.ts` | Timing and logging — no filter | UNCHANGED |
| `src/types.ts` | `WikiJsPage.path` provides the field the filter reads | UNCHANGED |

---

## Test Architecture

### Unit tests for `isBlocked()` — `src/gdpr/__tests__/gdpr.test.ts`

Pure function with no side effects. Test with `vitest` directly — no mocking needed.

Test cases to cover:
- `Clients/AcmeCorp` → `true`
- `Clients/Smith GmbH` → `true`
- `clients/acmecorp` → `true` (case-insensitive)
- `Clients` → `false` (1 segment, no company name)
- `Clients/AcmeCorp/notes` → `false` (3 segments, sub-page)
- `Public/AcmeCorp` → `false` (wrong top-level segment)
- `docs/guide` → `false` (normal page)
- `` (empty string) → `false` (no segments)

### Integration tests for tool filter behavior — `tests/gdpr-filter.test.ts`

Uses `buildTestApp()` + a custom `WikiJsApi` mock that returns Clients paths. Sends real MCP JSON-RPC requests via Fastify's `inject()`. Verifies the MCP response content.

Test cases to cover:
- `get_page` with blocked path → `isError: true`, content text is "Page not found." (not "GDPR" or "blocked")
- `get_page` with normal path → success, page returned
- `list_pages` with mixed results → blocked pages absent from response
- `list_pages` with all-blocked results → empty array returned, no error
- `search_pages` with mixed results → blocked pages absent from response
- `search_pages` where all results blocked → empty array returned, no error

### No changes to existing tests

Existing `api.test.ts` tests `WikiJsApi` in isolation — those test paths never trigger `isBlocked()`. Existing smoke and route protection tests use the shared `mockWikiJsApi` which returns `path: "test/page"` — not a Clients path. No existing tests break.

---

## Suggested Build Order

```
Step 1: src/gdpr.ts + unit tests
  Files: src/gdpr.ts, src/gdpr/__tests__/gdpr.test.ts
  Dependencies: none
  Rationale: Pure function with no deps. Zero-risk foundation. All downstream changes depend on it.

Step 2: Modify mcp-tools.ts handlers
  Files: src/mcp-tools.ts (3 handler edits, 1 import)
  Dependencies: Step 1 (isBlocked import)
  Rationale: Each tool change is a 2-4 line addition. All three share the same import.

Step 3: Integration tests
  Files: tests/gdpr-filter.test.ts
  Dependencies: Steps 1-2
  Rationale: Tests the full stack end-to-end. Confirms correct MCP response structure.
```

Build order is linear — no parallelism needed. Total scope: 1 new file, 1 modified file, 1 new test file.

---

## Architectural Patterns Applied

### Pattern: Thin Filter Between Fetch and Serialize

After fetching structured data and before serializing to JSON, apply a declarative filter. The data remains typed (`WikiJsPage`) through the filter, ensuring field access is compile-checked.

This is preferable to post-serialization regex matching on JSON strings because:
- Type-safe access to `.path`
- No JSON parse/stringify overhead
- Filter logic is readable and testable independently

### Pattern: Generic Error Text for Blocked Resources

`get_page` returns `"Page not found."` — not `"Access denied"` or `"GDPR restricted"`. This is the standard privacy pattern for existence protection: the server must not confirm that the resource exists or that access is restricted. The caller sees the same response whether the page ID does not exist in WikiJS at all, or whether it is GDPR-blocked.

This matches how WikiJS itself would respond if the page did not exist (an API error is caught and returned as `isError: true`).

### Pattern: Silent Omission for Filtered Lists

`list_pages` and `search_pages` silently remove blocked pages without indicating that omission occurred. This is the correct pattern for filtered result sets: the client sees a smaller list, not a list with gaps or error markers. This prevents the client from discovering the existence of Clients pages through absence signals.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Filtering in `WikiJsApi`

**What:** Adding `isBlocked()` checks inside `getPageById`, `listPages`, or `searchPages` in `api.ts`.
**Why bad:** The API layer becomes a policy layer. If a future admin tool needs unfiltered access, the filter cannot be bypassed without duplicating or refactoring `WikiJsApi`.
**Instead:** Keep `api.ts` as a pure data access layer. Apply filters in the consumers (tool handlers).

### Anti-Pattern 2: Returning `isError: true` from List and Search

**What:** Returning a "some results were filtered" error from `list_pages` or `search_pages` when blocked pages are removed.
**Why bad:** Reveals that blocked content exists. Leaks existence. Breaks MCP client expectations (list/search should return a list, not errors).
**Instead:** Silently filter — return a shorter list with no error flag.

### Anti-Pattern 3: Case-Sensitive Path Matching

**What:** Only blocking `Clients/AcmeCorp` but not `clients/AcmeCorp` or `CLIENTS/AcmeCorp`.
**Why bad:** WikiJS paths are case-sensitive in the DB but users may enter paths inconsistently. A case-sensitive filter can be bypassed by manipulating case.
**Instead:** Normalize to lowercase before comparing the first segment.

### Anti-Pattern 4: Blocking Sub-pages

**What:** Blocking `Clients/AcmeCorp/meeting-notes` because it starts with `Clients/`.
**Why bad:** The requirement specifically targets direct client directory pages (`Clients/<CompanyName>` — exactly 2 segments). Sub-pages are pages about client work, not the client identity directory. Over-blocking is harmful.
**Instead:** Enforce the 2-segment rule strictly. Only block `Clients/<CompanyName>` (exactly).

### Anti-Pattern 5: Logging Blocked Requests

**What:** Adding a `ctx?.log.info({ path: page.path }, "GDPR path blocked")` when a blocked page is accessed.
**Why bad:** Creates an audit log of which clients were queried, which is itself a GDPR concern. Logs could be observed by unauthorized parties.
**Instead:** Apply the filter silently. If security audit logging is needed, it belongs in a dedicated audit log with access controls — not the application log.

---

## Scalability Considerations

| Concern | At current scale | Notes |
|---------|-----------------|-------|
| Filter performance | O(1) for get_page, O(n) for list/search | n is bounded — list max 100, search max 50 |
| Memory | No additional state | Pure function, no caching needed |
| Rule changes | Code change + redeploy | Hardcoded rule is intentional; no config surface |
| Multiple filter rules | Extend `isBlocked()` | Currently 1 rule; function is the extension point |

The filter adds microseconds of latency per tool call — negligible at any scale this server will encounter.

---

*Architecture research for: GDPR Path Filter — wikijs-mcp-server v2.5*
*Researched: 2026-03-27*
