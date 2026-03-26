# Phase 15: API Layer Consolidation - Research

**Researched:** 2026-03-26
**Domain:** Wiki.js GraphQL API consolidation -- page get, list, and search methods
**Confidence:** HIGH

## Summary

Phase 15 consolidates the WikiJsApi class (src/api.ts) to provide three refined methods: a merged `getPageById` (metadata + content + isPublished in one call), a unified `listPages` (with optional includeUnpublished filter), and an enhanced `searchPages` (with database page ID resolution). The primary technical challenge is the well-documented Wiki.js search ID mismatch: `pages.search` returns `PageSearchResult.id` as `String!` (a search index ID), not the database `Int!` page ID. Resolution requires `singleByPath` lookups per result, with a `pages.list` batch fallback.

All changes are confined to `src/api.ts` and `src/types.ts`. The existing `graphql-request` v6.1 client, template string interpolation pattern, and `any`-cast response handling remain unchanged. No new dependencies are needed.

**Primary recommendation:** Implement the three consolidated API methods with `Promise.allSettled`-based parallel singleByPath resolution and a single pages.list fallback batch for unresolved results. Use the search result's `locale` field for singleByPath calls.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **get_page response shape**: Minimal fields only (id, path, title, description, content, isPublished, createdAt, updatedAt). No locale, editor, tags, or author fields. Single GraphQL query merging metadata + content + isPublished into one `pages.single` call. Replace existing `getPageById()` in-place. Extend `WikiJsPage` interface with content and isPublished (no separate PageDetail type).
- **Search ID resolution failures**: Drop unresolvable results silently. Log a warning server-side for each dropped result (path + original search index ID). Return wrapper object `{ results: [...], totalHits: N }` so AI can see if results were dropped.
- **list_pages default behavior**: `includeUnpublished` defaults to false (published pages only). Merge `getPagesList()` and `getAllPagesList()` into a single `listPages(limit, orderBy, includeUnpublished)` method. Always include isPublished field in response. Metadata only (no content).
- **Search resolution strategy**: Try `singleByPath` first for each search result (parallel via `Promise.allSettled`). If singleByPath fails, fall back to a single `pages.list` batch call. Cross-reference remaining unresolved results against pages.list by path matching. Log a warning if singleByPath fails due to missing permissions.

### Claude's Discretion
- pages.list fallback limit for cross-reference (balance coverage vs performance)
- Internal error handling patterns (how to detect permission errors vs not-found)
- Whether to cache the pages.list result if multiple search results need fallback
- Exact logging format for dropped results and permission warnings

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TOOL-01 | get_page returns metadata, content, and isPublished in a single call | Wiki.js `pages.single` resolver returns all needed fields (content, isPublished, path, title, description, createdAt, updatedAt) in one query. Confirmed via GraphQL schema. |
| TOOL-02 | list_pages supports optional includeUnpublished flag | Wiki.js `pages.list` returns `isPublished` on every `PageListItem`. Client-side filtering is required (no server-side filter exists). Pattern already used in `getAllPagesList()`. |
| SRCH-01 | search_pages resolves search index IDs to database page IDs via singleByPath | `PageSearchResult.id` is `String!` (search index ID), not the database page ID. `singleByPath(path, locale)` returns the real `Page` with `id: Int!`. Each search result includes `path` and `locale` for the lookup. |
| SRCH-02 | search_pages falls back to pages.list cross-reference if singleByPath fails | `pages.list` returns `PageListItem` with `id: Int!` and `path: String!`. Path-matching against unresolved search results provides the fallback. The list endpoint requires only `read:pages` permission (no elevated access). |
</phase_requirements>

## Standard Stack

### Core (already in project -- no additions)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| graphql-request | 6.1.0 | GraphQL HTTP client | Already used for all Wiki.js API calls |
| graphql | 16.8.1 | GraphQL language support | Peer dependency of graphql-request |

### Supporting (already in project -- no additions)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | 3.25.17 | Input validation | Validating tool input schemas (Phase 16, not this phase) |
| vitest | 4.1.1 | Test framework | Unit tests for new API methods |

### Alternatives Considered
None -- this phase modifies existing code using existing libraries. No new dependencies needed.

**Installation:**
```bash
# No installation needed -- all dependencies already present
```

## Architecture Patterns

### Files Modified
```
src/
  api.ts             # Modify: replace getPageById, merge list methods, enhance searchPages
  types.ts           # Modify: extend WikiJsPage with content + isPublished as required fields
tests/
  api.test.ts        # NEW: unit tests for consolidated API methods (mock GraphQL responses)
```

### Pattern 1: Consolidated getPageById -- Single GraphQL Query

**What:** Replace the existing `getPageById()` method to return metadata, content, and isPublished in one `pages.single` call.

**When to use:** Every `get_page` tool invocation.

**Example:**
```typescript
// Source: Wiki.js GraphQL schema (Page type, pages.single resolver)
async getPageById(id: number): Promise<WikiJsPage> {
  const query = `
    {
      pages {
        single (id: ${id}) {
          id
          path
          title
          description
          content
          isPublished
          createdAt
          updatedAt
        }
      }
    }
  `;
  const response: any = await this.client.request(query);
  return response.pages.single;
}
```

**Key insight:** The existing `getPageById()` and `getPageContent()` are two separate queries to the same `pages.single` resolver. Merging them into one call is trivial -- just add `content` and `isPublished` to the field selection.

### Pattern 2: Unified listPages with Client-Side Filtering

**What:** Merge `getPagesList()` and `getAllPagesList()` into `listPages(limit, orderBy, includeUnpublished)`.

**When to use:** Every `list_pages` tool invocation.

**Example:**
```typescript
// Source: existing getAllPagesList pattern in src/api.ts
async listPages(
  limit: number = 50,
  orderBy: string = "TITLE",
  includeUnpublished: boolean = false,
): Promise<WikiJsPage[]> {
  const query = `
    {
      pages {
        list (limit: ${limit}, orderBy: ${orderBy}) {
          id
          path
          title
          description
          isPublished
          createdAt
          updatedAt
        }
      }
    }
  `;
  const response: any = await this.client.request(query);
  let pages: WikiJsPage[] = response.pages.list;

  if (!includeUnpublished) {
    pages = pages.filter((page) => page.isPublished);
  }

  return pages;
}
```

**Key insight:** Wiki.js `pages.list` has no server-side `isPublished` filter parameter. Client-side filtering is required. The existing `getAllPagesList()` already implements this pattern correctly.

### Pattern 3: Search ID Resolution via singleByPath + pages.list Fallback

**What:** Enhanced `searchPages()` that resolves search index IDs to real database page IDs.

**When to use:** Every `search_pages` tool invocation.

**Resolution flow:**
1. Execute `pages.search` query to get results with path + locale
2. For each result, call `pages.singleByPath(path, locale)` in parallel via `Promise.allSettled`
3. Collect resolved results (status === "fulfilled") with real database IDs
4. For unresolved results (status === "rejected"), execute a single `pages.list` batch query
5. Cross-reference unresolved paths against the batch response
6. Drop any still-unresolvable results, log warnings
7. Return `{ results: [...], totalHits: N }`

**Example:**
```typescript
// Source: Wiki.js GraphQL schema + project CONTEXT.md decisions
interface SearchResult {
  results: WikiJsPage[];
  totalHits: number;
}

async searchPages(query: string, limit: number = 10): Promise<SearchResult> {
  // Step 1: Execute search
  const gqlQuery = `
    {
      pages {
        search (query: ${JSON.stringify(query)}) {
          results {
            id
            path
            title
            description
            locale
          }
          suggestions
          totalHits
        }
      }
    }
  `;
  const response: any = await this.client.request(gqlQuery);
  const searchResults = (response.pages.search.results ?? []).slice(0, limit);
  const totalHits: number = response.pages.search.totalHits;

  if (searchResults.length === 0) {
    return { results: [], totalHits };
  }

  // Step 2: Resolve IDs via singleByPath (parallel)
  const settlements = await Promise.allSettled(
    searchResults.map((sr: any) => this.resolvePageByPath(sr.path, sr.locale))
  );

  const resolved: WikiJsPage[] = [];
  const unresolved: Array<{ path: string; locale: string; searchId: string }> = [];

  for (let i = 0; i < settlements.length; i++) {
    const settlement = settlements[i];
    if (settlement.status === "fulfilled" && settlement.value) {
      resolved.push(settlement.value);
    } else {
      unresolved.push({
        path: searchResults[i].path,
        locale: searchResults[i].locale,
        searchId: searchResults[i].id,
      });
    }
  }

  // Step 3: Fallback via pages.list for unresolved
  if (unresolved.length > 0) {
    // ... batch fallback logic (see detailed pattern below)
  }

  return { results: resolved, totalHits };
}
```

### Pattern 4: singleByPath Helper Method

**What:** Private helper to resolve a page by path + locale.

**Key detail:** The `singleByPath` resolver requires `manage:pages` or `delete:pages` permissions on the Wiki.js API token. If the token lacks these permissions, the call will fail with a permission error.

**Example:**
```typescript
// Source: Wiki.js GraphQL schema (PageQuery.singleByPath)
private async resolvePageByPath(path: string, locale: string): Promise<WikiJsPage> {
  const query = `
    {
      pages {
        singleByPath (path: ${JSON.stringify(path)}, locale: ${JSON.stringify(locale)}) {
          id
          path
          title
          description
          isPublished
          createdAt
          updatedAt
        }
      }
    }
  `;
  const response: any = await this.client.request(query);
  return response.pages.singleByPath;
}
```

### Pattern 5: pages.list Batch Fallback

**What:** When singleByPath fails for some results, fetch a batch from pages.list and cross-reference by path.

**Example:**
```typescript
// Fallback: fetch pages.list and match by path
private async resolveViaPagesList(
  unresolved: Array<{ path: string; locale: string; searchId: string }>
): Promise<{ resolved: WikiJsPage[]; dropped: typeof unresolved }> {
  const fallbackQuery = `
    {
      pages {
        list (limit: 500, orderBy: UPDATED) {
          id
          path
          title
          description
          isPublished
          createdAt
          updatedAt
        }
      }
    }
  `;
  const response: any = await this.client.request(fallbackQuery);
  const allPages: WikiJsPage[] = response.pages.list;

  // Build path->page lookup
  const pagesByPath = new Map<string, WikiJsPage>();
  for (const page of allPages) {
    pagesByPath.set(page.path, page);
  }

  const resolved: WikiJsPage[] = [];
  const dropped: typeof unresolved = [];

  for (const item of unresolved) {
    const page = pagesByPath.get(item.path);
    if (page) {
      resolved.push(page);
    } else {
      dropped.push(item);
    }
  }

  return { resolved, dropped };
}
```

### Anti-Patterns to Avoid
- **Calling pages.list fallback unconditionally:** Only call if singleByPath actually fails for some results. If all resolve via singleByPath, skip the fallback entirely.
- **Sequential singleByPath calls:** Use `Promise.allSettled` for parallel resolution. Sequential calls multiply latency by result count.
- **Returning search index IDs as page IDs:** The entire point of this phase. Search result `id` is `String!` from the search index, not `Int!` from the database.
- **Creating a separate PageDetail type:** CONTEXT.md explicitly says to extend `WikiJsPage` rather than creating a new type. Keep one interface.
- **Adding content to list results:** CONTEXT.md specifies metadata-only for list. Content comes only via `getPageById`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parallel async resolution | Custom callback chains | `Promise.allSettled` | Built-in, handles mixed success/failure cleanly |
| GraphQL error detection | String parsing of error messages | `ClientError` from graphql-request | Has `.response.errors` array with structured error info |
| Path matching | Regex or fuzzy matching | Exact `Map.get()` lookup | Wiki.js paths are canonical -- exact match is correct |

## Common Pitfalls

### Pitfall 1: singleByPath Requires Elevated Permissions
**What goes wrong:** `pages.singleByPath` requires `manage:pages` or `delete:pages` permissions on the Wiki.js API token. If the token only has read permissions, every singleByPath call fails.
**Why it happens:** Wiki.js v2 GraphQL was not originally designed for external API use. Query resolvers have overly strict permission requirements.
**How to avoid:** The fallback to `pages.list` (which only requires `read:pages`) handles this gracefully. Log a warning on the first singleByPath permission failure so the admin knows to check token permissions.
**Warning signs:** All singleByPath calls fail with the same error; pages.list fallback resolves everything.

### Pitfall 2: Search Result ID is String, Page ID is Integer
**What goes wrong:** `PageSearchResult.id` is `String!` in the Wiki.js GraphQL schema, while `PageListItem.id` and `Page.id` are `Int!`. Naively using the search ID as a page ID causes type mismatches and lookup failures.
**Why it happens:** Non-basic search engines (PostgreSQL, Elasticsearch) use their own internal IDs for search results, not the database page ID.
**How to avoid:** Never use the search result's `id` field as a page ID. Always resolve via path using `singleByPath` or `pages.list` cross-reference.
**Warning signs:** Pages returned by search cannot be fetched by ID; IDs don't match what the admin panel shows.

### Pitfall 3: singleByPath Requires locale Parameter
**What goes wrong:** `singleByPath(path, locale)` requires both parameters. Omitting locale returns null or errors.
**Why it happens:** Wiki.js supports multi-locale content; the same path can exist in different locales.
**How to avoid:** Use the `locale` field from each search result (it's always present in `PageSearchResult`). For the fallback pages.list route, the path alone is sufficient since list results don't need locale filtering.
**Warning signs:** singleByPath returns null even though the page exists.

### Pitfall 4: pages.list Limit May Miss Pages
**What goes wrong:** If the wiki has more pages than the fallback limit, some unresolved search results may not appear in the pages.list batch.
**Why it happens:** `pages.list` accepts a `limit` parameter with no pagination support in the v2 API.
**How to avoid:** Use a generous limit (500) for the fallback batch. This covers most wikis. If the result is still not found, it gets dropped with a warning log. The `totalHits` field in the response lets the AI caller know results were dropped.
**Warning signs:** Dropped results increase as wiki size grows.

### Pitfall 5: WikiJsPage Interface Change Breaks Tests
**What goes wrong:** Making `content` and `isPublished` required on `WikiJsPage` breaks the existing mock objects in both `tests/helpers/build-test-app.ts` and `tests/smoke.test.ts`.
**Why it happens:** Two separate `mockWikiJsApi` objects exist with hardcoded return shapes.
**How to avoid:** Update both mock objects simultaneously. The mock `getPageById` must now return `content` and `isPublished`. The mock `searchPages` must return the new `{ results, totalHits }` shape.
**Warning signs:** TypeScript compilation errors in test files; test assertions on old return shapes fail.

### Pitfall 6: graphql-request ClientError Structure
**What goes wrong:** Catching errors from `this.client.request()` and checking error type incorrectly.
**Why it happens:** `graphql-request` v6 throws `ClientError` with `.response.errors` array. The error message string includes both the GraphQL error and the full request/response JSON.
**How to avoid:** Import `ClientError` from `graphql-request` and use `instanceof` check. Access `.response.errors[0].message` for the GraphQL error message. Access `.response.status` for HTTP status.
**Warning signs:** Error messages are very long and contain embedded JSON.

## Code Examples

### Example 1: Extended WikiJsPage Interface
```typescript
// Source: existing src/types.ts + CONTEXT.md decisions
export interface WikiJsPage {
  id: number;
  path: string;
  title: string;
  description: string;
  content: string;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}
```

**Note:** Making all fields required (dropping the `?` optionals) is a deliberate choice from CONTEXT.md. This means every API method must return all fields. For `listPages`, content will NOT be fetched (it's not in the GraphQL query), so we need to be careful. **Recommendation:** Keep `content` optional (`content?: string`) since list results intentionally omit it. Keep `isPublished` required since all methods will return it.

### Example 2: SearchResult Return Type
```typescript
// Source: CONTEXT.md decision -- wrapper object
export interface PageSearchResult {
  results: WikiJsPage[];
  totalHits: number;
}
```

### Example 3: Error Detection for Permission vs Not-Found
```typescript
// Source: graphql-request v6 types.js
import { ClientError } from "graphql-request";

function isPermissionError(error: unknown): boolean {
  if (error instanceof ClientError) {
    const message = error.response.errors?.[0]?.message ?? "";
    return message.includes("Forbidden") || message.includes("ERR_FORBIDDEN");
  }
  return false;
}
```

### Example 4: Logging Dropped Results
```typescript
// Source: existing request-context.ts pattern
import { requestContext } from "./request-context.js";

// Inside searchPages, after fallback resolution:
for (const dropped of droppedResults) {
  const ctx = requestContext.getStore();
  ctx?.log.warn(
    { path: dropped.path, searchId: dropped.searchId },
    "Search result dropped: could not resolve database page ID",
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate getPageById + getPageContent | Single merged getPageById | This phase | One GraphQL call instead of two |
| Two list methods (getPagesList + getAllPagesList) | Single listPages with includeUnpublished flag | This phase | Simpler API surface |
| Search returns search index IDs directly | Search resolves to real database page IDs | This phase | Search results can be reliably used with getPageById |

**Deprecated/outdated after this phase:**
- `getPageContent()` -- merged into `getPageById()`
- `getPagesList()` -- replaced by `listPages()`
- `getAllPagesList()` -- replaced by `listPages()`
- `searchUnpublishedPages()` -- removed (out of scope for v2.3; Wiki.js can't search unpublished)
- `forceDeletePage()` -- still exists but will be removed in Phase 16
- `getPageStatus()` -- merged into `getPageById()` which now returns isPublished
- `publishPage()` -- still exists but will be removed in Phase 16

## Open Questions

1. **pages.list fallback limit**
   - What we know: Wiki.js `pages.list` accepts a `limit` parameter. No pagination API exists in v2.
   - What's unclear: Optimal limit for the fallback. Larger = more coverage, slower response.
   - Recommendation: Use 500. This covers typical corporate wikis. Document the tradeoff. (Claude's Discretion per CONTEXT.md)

2. **Caching the pages.list fallback result**
   - What we know: If multiple search results fail singleByPath, we only need one pages.list call.
   - What's unclear: Whether to cache across multiple search invocations within the same request.
   - Recommendation: No cross-request caching. One pages.list call per search invocation is sufficient. The fallback is already a single batch call per search. (Claude's Discretion per CONTEXT.md)

3. **Detecting permission errors vs not-found in singleByPath**
   - What we know: `graphql-request` throws `ClientError` with `.response.errors[0].message`. Wiki.js returns error codes like `ERR_FORBIDDEN`.
   - What's unclear: Exact error message format for permission denial vs page not found.
   - Recommendation: Log the full error message on first failure. If all singleByPath calls fail with the same error pattern, log a single consolidated warning about permissions. Treat all failures the same for resolution purposes (fall back to pages.list). (Claude's Discretion per CONTEXT.md)

4. **Locale for singleByPath when using fallback**
   - What we know: Search results always include `locale` per result. The `singleByPath` resolver requires locale.
   - What's unclear: Edge case where locale in search results doesn't match actual page locale.
   - Recommendation: Trust the search result's locale value. It comes directly from the search index which mirrors the page table.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.1 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/api.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TOOL-01 | getPageById returns metadata + content + isPublished in one call | unit | `npx vitest run tests/api.test.ts -t "getPageById"` | No -- Wave 0 |
| TOOL-02 | listPages with includeUnpublished=false filters unpublished; =true returns all | unit | `npx vitest run tests/api.test.ts -t "listPages"` | No -- Wave 0 |
| SRCH-01 | searchPages resolves search index IDs to database page IDs via singleByPath | unit | `npx vitest run tests/api.test.ts -t "searchPages.*resolve"` | No -- Wave 0 |
| SRCH-02 | searchPages falls back to pages.list when singleByPath fails | unit | `npx vitest run tests/api.test.ts -t "searchPages.*fallback"` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/api.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/api.test.ts` -- NEW unit test file for WikiJsApi methods. Must mock `graphql-request` client to return controlled GraphQL responses. Covers TOOL-01, TOOL-02, SRCH-01, SRCH-02.
- [ ] Update `tests/helpers/build-test-app.ts` -- `mockWikiJsApi` needs updated method signatures: `getPageById` returns content + isPublished; `searchPages` returns `{ results, totalHits }`; remove `getPageContent`, `getPagesList`, `getAllPagesList`.
- [ ] Update `tests/smoke.test.ts` -- duplicate `mockWikiJsApi` needs same updates.

### Test Strategy: Mocking graphql-request
Since `WikiJsApi` methods use `this.client.request()` internally, tests should:
1. Create a `WikiJsApi` instance with a mock `GraphQLClient`
2. Mock `client.request()` to return controlled responses matching Wiki.js GraphQL shapes
3. Verify the method transforms and returns data correctly

```typescript
// Test pattern for mocking GraphQL responses
import { vi, describe, it, expect, beforeEach } from "vitest";
import { WikiJsApi } from "../src/api.js";

// Mock graphql-request module
vi.mock("graphql-request", () => ({
  GraphQLClient: vi.fn().mockImplementation(() => ({
    request: vi.fn(),
  })),
}));

describe("WikiJsApi.getPageById", () => {
  let api: WikiJsApi;
  let mockRequest: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    api = new WikiJsApi("http://localhost:3000", "test-token");
    mockRequest = (api as any).client.request;
  });

  it("returns metadata, content, and isPublished in one call", async () => {
    mockRequest.mockResolvedValueOnce({
      pages: {
        single: {
          id: 42,
          path: "test/page",
          title: "Test",
          description: "A test page",
          content: "# Hello",
          isPublished: true,
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
        },
      },
    });

    const page = await api.getPageById(42);
    expect(page.content).toBe("# Hello");
    expect(page.isPublished).toBe(true);
    expect(mockRequest).toHaveBeenCalledTimes(1); // Single call
  });
});
```

## Sources

### Primary (HIGH confidence)
- [Wiki.js GraphQL Page Schema](https://raw.githubusercontent.com/requarks/wiki/main/server/graph/schemas/page.graphql) -- Confirmed `PageSearchResult.id` is `String!`, `PageListItem.id` is `Int!`, and full field lists for all page types
- [Wiki.js Page Resolver](https://github.com/requarks/wiki/blob/main/server/graph/resolvers/page.js) -- Confirmed `singleByPath` requires `manage:pages` or `delete:pages` permissions, returns same fields as `single`
- Existing codebase (`src/api.ts`, `src/types.ts`) -- Confirmed current method signatures and GraphQL query patterns

### Secondary (MEDIUM confidence)
- [GitHub Discussion #5951](https://github.com/requarks/wiki/discussions/5951) -- Confirmed search result IDs are NOT page IDs; maintainer statement: "Search result IDs are not page IDs, they are search result IDs"
- [GitHub Issue #2938](https://github.com/Requarks/wiki/issues/2938) -- Confirmed PostgreSQL search engine returns `pagesVector` table IDs, not page table IDs
- [GitHub Discussion #6672](https://github.com/requarks/wiki/discussions/6672) -- Confirmed `singleByPath` permission requirements and locale parameter requirement
- [Wiki.js API Docs](https://docs.requarks.io/dev/api) -- General API access documentation

### Tertiary (LOW confidence)
- graphql-request v6 ClientError structure -- Verified from installed `node_modules/graphql-request/build/esm/types.js` source, but error message formats from Wiki.js itself (permission denied, not found) were not directly verified against a live instance

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all code patterns already established in codebase
- Architecture: HIGH -- all GraphQL schema fields confirmed from Wiki.js source, resolution strategy validated against known Wiki.js behavior
- Pitfalls: HIGH -- search ID mismatch is well-documented with multiple GitHub issues/discussions; singleByPath permission requirement confirmed from resolver source
- Test strategy: MEDIUM -- mocking pattern is standard Vitest but needs validation that vi.mock of graphql-request works with ESM imports

**Research date:** 2026-03-26
**Valid until:** 2026-04-26 (stable -- Wiki.js v2 API is frozen, project dependencies are pinned)
