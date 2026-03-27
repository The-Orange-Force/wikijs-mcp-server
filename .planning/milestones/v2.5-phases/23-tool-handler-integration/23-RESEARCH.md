# Phase 23: Tool Handler Integration - Research

**Researched:** 2026-03-27
**Domain:** MCP tool handler GDPR path filtering (TypeScript / Fastify / Pino)
**Confidence:** HIGH

## Summary

Phase 23 integrates the `isBlocked()` predicate from Phase 22 (`src/gdpr.ts`) into all three MCP tool handlers in `src/mcp-tools.ts`. The implementation is straightforward: inline filtering code in each handler body, a small `logBlockedAccess()` helper, and careful error message alignment for `get_page`. No new dependencies are needed -- all required infrastructure (AsyncLocalStorage request context, pino structured logging, `WikiJsPage.path` field) already exists.

The primary complexity lies in two areas: (1) ensuring `get_page` produces a byte-identical error response for blocked pages and genuinely absent pages, including always completing the upstream API call first (timing-safe), and (2) ensuring `search_pages` filtering catches all resolution paths by filtering the final resolved array after `searchPages()` returns.

**Primary recommendation:** Add ~15 lines per handler in `mcp-tools.ts` plus a ~10-line `logBlockedAccess()` helper function at the top of the file. No architectural changes needed.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- One structured log entry per blocked page (not summary counts)
- Log level: `warn`
- No path information in logs -- message is generic "GDPR path blocked" with no path hint
- Structured field `gdprBlocked: true` in the pino log object for easy filtering/alerting
- Log payload includes: `toolName`, `userId`, `username`, `correlationId`, `gdprBlocked: true`
- Adjust `totalHits` downward after filtering blocked pages (subtract filtered count from raw WikiJS value)
- Prevents information leak -- client never sees a mismatch between results.length and totalHits
- `list_pages` returns the filtered array as-is (no count metadata to adjust)
- Filter once at the end in `mcp-tools.ts` on the final resolved `WikiJsPage[]` array after `searchPages()` returns
- Keeps `api.ts` policy-neutral (per prior decision from STATE.md)
- Catches all resolution paths (GraphQL, singleByPath, resolveViaPagesList) in one place
- Blocked page response matches existing catch block format exactly: `isError: true`, text: `"Error in get_page: Page not found. Verify the page ID using search_pages or list_pages."`
- Byte-identical to genuine absent page error -- indistinguishable to MCP client
- Flow: always call `getPageById(id)` first (satisfies SEC-01 timing requirement), then check `isBlocked(page.path)` on the result
- If API returns null/undefined, skip `isBlocked` check and return data as-is (no path to check)
- Inline filtering in each handler body (~3-5 lines per handler)
- Small local `logBlockedAccess(toolName)` helper function at the top of `mcp-tools.ts`
- `isBlocked()` imported from whatever module Phase 22 creates

### Claude's Discretion
- Module name for `isBlocked()` import (Phase 22 decides this)
- Exact variable naming and code style within handlers
- Error handling edge cases not covered by the decisions above

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FILT-03 | `get_page` returns generic "Page not found" error for blocked pages (indistinguishable from absent page) | Error text format verified from `mcp-tools.ts:77`. Blocked response must use exact string `"Error in get_page: Page not found. Verify the page ID using search_pages or list_pages."` with `isError: true`. Always call `getPageById()` first, then check `isBlocked(page.path)`. |
| FILT-04 | `search_pages` silently excludes blocked pages from results | Filter applied to `result.results` array after `searchPages()` returns. Adjust `result.totalHits` by subtracting count of filtered pages. Currently only `result.results` is serialized to client (line 181), but `totalHits` should still be adjusted for correctness. |
| FILT-05 | `list_pages` silently excludes blocked pages from results | Filter applied to `pages` array before JSON serialization at line 128-131. No count metadata to adjust. |
| SEC-01 | `get_page` always completes upstream WikiJS API call before path check (prevents timing oracle) | `getPageById(id)` call on line 65 must execute and await before `isBlocked()` check. This ensures blocked and absent pages have equivalent response timing. |
| SEC-02 | Blocked access attempts are logged with tool name, user identity, and correlation ID (no company name in logs) | `requestContext.getStore()` provides `correlationId`, `userId`, `username`, and `log` (pino). Log at `warn` level with `gdprBlocked: true` structured field. Generic message "GDPR path blocked" with no path content. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.3 | Language | Project standard (strict, ESM, NodeNext) |
| Vitest | 4 | Test runner | Project standard, already configured |
| Pino | (via Fastify 4) | Structured logging | Already in use via `requestContext.getStore().log` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `src/gdpr.ts` | Phase 22 | `isBlocked()` predicate | Import in `mcp-tools.ts` for path checking |
| `src/request-context.ts` | Existing | `requestContext.getStore()` | Access `correlationId`, `userId`, `username`, `log` |
| `src/tool-wrapper.ts` | Existing | `wrapToolHandler()` | Already wraps all handlers; filter runs inside the wrapped handler |

### Alternatives Considered
None -- all decisions are locked. Zero new npm dependencies (STATE.md decision).

## Architecture Patterns

### Modified File Structure
```
src/
  mcp-tools.ts       # MODIFIED: add isBlocked import, logBlockedAccess helper, inline filters in all 3 handlers
  gdpr.ts            # FROM PHASE 22: isBlocked() predicate (read-only dependency)
```

### Pattern 1: Inline Filter in Tool Handler
**What:** Each handler calls `isBlocked(page.path)` on its results and takes action (error response for get_page, array filter for list/search).
**When to use:** Every tool handler that returns page data.
**Why inline:** Keeps filtering visible at the point of use. 3-5 lines per handler is too small to extract.

```typescript
// get_page handler (after getPageById call):
const page = await wikiJsApi.getPageById(id);
if (page?.path && isBlocked(page.path)) {
  logBlockedAccess(TOOL_GET_PAGE);
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: "Error in get_page: Page not found. Verify the page ID using search_pages or list_pages.",
      },
    ],
  };
}
```

### Pattern 2: Array Filter + Audit Log per Blocked Item
**What:** Filter `WikiJsPage[]` arrays, logging each blocked page individually.
**When to use:** `list_pages` and `search_pages` handlers.

```typescript
// list_pages handler (after listPages call):
const filtered = pages.filter(p => {
  if (isBlocked(p.path)) {
    logBlockedAccess(TOOL_LIST_PAGES);
    return false;
  }
  return true;
});
```

### Pattern 3: logBlockedAccess Helper
**What:** Small function at the top of `mcp-tools.ts` that logs a structured warn entry.
**When to use:** Called from each handler when a blocked page is detected.

```typescript
function logBlockedAccess(toolName: string): void {
  const ctx = requestContext.getStore();
  ctx?.log.warn(
    {
      toolName,
      userId: ctx.userId,
      username: ctx.username,
      gdprBlocked: true,
    },
    "GDPR path blocked",
  );
}
```

**Key design notes:**
- `correlationId` is already bound to the pino logger via Fastify's `request.log` (set in `mcp-routes.ts:76-79`), so it appears automatically in every log entry without being explicitly added.
- The `gdprBlocked: true` field enables filtering in log aggregation (e.g., Datadog, Elastic).
- No path information in the log payload -- the message "GDPR path blocked" is generic.

### Pattern 4: totalHits Adjustment for search_pages
**What:** Subtract filtered count from `result.totalHits` before serialization.
**When to use:** Only in `search_pages` handler.

```typescript
const originalLength = result.results.length;
const filtered = result.results.filter(p => {
  if (isBlocked(p.path)) {
    logBlockedAccess(TOOL_SEARCH_PAGES);
    return false;
  }
  return true;
});
const adjustedTotalHits = result.totalHits - (originalLength - filtered.length);
```

**Important observation:** The current `search_pages` handler (line 181) serializes only `result.results`, NOT `result.totalHits`. The `totalHits` value is never sent to the client. However, the locked decision requires adjusting it anyway -- this is defense-in-depth in case the serialization changes later.

### Anti-Patterns to Avoid
- **Filtering inside `api.ts`:** Policy must stay in `mcp-tools.ts` (STATE.md decision). `api.ts` remains policy-neutral.
- **Checking `isBlocked()` before the API call in `get_page`:** This would create a timing oracle (SEC-01 violation). The API call must complete first.
- **Logging the page path in blocked access entries:** Company names in paths are GDPR-sensitive. Log message must be generic.
- **Summary count logging:** Decision requires one log entry per blocked page, not batch summaries.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Request context access | Custom parameter threading | `requestContext.getStore()` | Already propagated via AsyncLocalStorage from `mcp-routes.ts` |
| Structured logging | Console.log or custom logger | `ctx?.log.warn(...)` | Pino via Fastify is already configured with correlation IDs |
| Path blocking logic | Custom path check in each handler | `isBlocked()` from `src/gdpr.ts` | Phase 22 provides the tested, normalized predicate |
| Timing measurement | Manual timing code | `wrapToolHandler()` | Already wraps all handlers with timing and logging |

**Key insight:** All infrastructure is already in place. This phase is pure integration -- no new utilities needed beyond the `logBlockedAccess()` helper.

## Common Pitfalls

### Pitfall 1: Timing Oracle in get_page
**What goes wrong:** Checking `isBlocked()` before the API call creates a measurable timing difference between blocked and absent pages.
**Why it happens:** Natural instinct is to short-circuit early.
**How to avoid:** Always `await wikiJsApi.getPageById(id)` first, then check `isBlocked(page.path)` on the result.
**Warning signs:** The `isBlocked()` call appears before the `getPageById()` call in the handler.

### Pitfall 2: Null Page Path in get_page
**What goes wrong:** If `getPageById()` throws (page doesn't exist), the code never reaches `isBlocked()`. If it returns null/undefined, accessing `.path` throws.
**Why it happens:** Wiki.js may return null for `pages.single` on nonexistent IDs.
**How to avoid:** Guard with `if (page?.path && isBlocked(page.path))`. If the API throws, the existing catch block handles it. If page is null/undefined, skip the `isBlocked` check and return the data as-is (the JSON serialization of null is a valid response -- or the existing code may already handle this).
**Warning signs:** `TypeError: Cannot read property 'path' of null` in tests.

### Pitfall 3: Error Message Mismatch
**What goes wrong:** The blocked page error text differs from the genuine absent page error text, allowing a client to distinguish them.
**Why it happens:** Hardcoding a slightly different string, or forgetting the period, or different casing.
**How to avoid:** Use the exact string: `"Error in get_page: Page not found. Verify the page ID using search_pages or list_pages."` -- test this with a snapshot or exact string assertion.
**Warning signs:** Compare blocked error text vs genuine API error text in tests.

### Pitfall 4: Forgetting One Search Resolution Path
**What goes wrong:** Filtering only catches some resolution paths but misses `resolveViaPagesList` fallback results.
**Why it happens:** The search has multiple resolution stages inside `api.ts`.
**How to avoid:** Filter in `mcp-tools.ts` AFTER `searchPages()` returns the fully resolved `PageSearchResult`. This is a single filtering point that catches all resolution paths.
**Warning signs:** Blocked pages appear in search results when the primary singleByPath path fails.

### Pitfall 5: ESM Import Extension
**What goes wrong:** Importing `isBlocked` without `.js` extension causes runtime module resolution failure.
**Why it happens:** TypeScript NodeNext requires `.js` extensions on all relative imports.
**How to avoid:** Use `import { isBlocked } from "./gdpr.js";`
**Warning signs:** `ERR_MODULE_NOT_FOUND` at runtime.

### Pitfall 6: correlationId Already Bound to Logger
**What goes wrong:** Manually adding `correlationId` to the log payload creates a duplicate field.
**Why it happens:** Not realizing that `request.log` already has `correlationId` bound (via Fastify's `requestIdLogLabel: "correlationId"` in `logging.ts`).
**How to avoid:** Do NOT add `correlationId` explicitly to `logBlockedAccess` payload -- it comes automatically from the pino child logger. Only add `toolName`, `userId`, `username`, and `gdprBlocked`.
**Warning signs:** Duplicate `correlationId` fields in log output.

## Code Examples

### Full get_page Handler (after modification)
```typescript
// Source: mcp-tools.ts lines 63-82, modified with isBlocked check
wrapToolHandler(TOOL_GET_PAGE, async ({ id }) => {
  try {
    const page = await wikiJsApi.getPageById(id);
    // GDPR: check after API call completes (SEC-01 timing safety)
    if (page?.path && isBlocked(page.path)) {
      logBlockedAccess(TOOL_GET_PAGE);
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: "Error in get_page: Page not found. Verify the page ID using search_pages or list_pages.",
          },
        ],
      };
    }
    return {
      content: [
        { type: "text" as const, text: JSON.stringify(page, null, 2) },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: `Error in get_page: ${String(error)}. Verify the page ID using search_pages or list_pages.`,
        },
      ],
    };
  }
}),
```

### Full search_pages Filter (after modification)
```typescript
// Source: mcp-tools.ts lines 176-195, modified with isBlocked filter
wrapToolHandler(TOOL_SEARCH_PAGES, async ({ query, limit }) => {
  try {
    const result = await wikiJsApi.searchPages(query, limit);
    // GDPR: filter blocked pages from results
    const originalLength = result.results.length;
    const filtered = result.results.filter(p => {
      if (isBlocked(p.path)) {
        logBlockedAccess(TOOL_SEARCH_PAGES);
        return false;
      }
      return true;
    });
    const adjustedTotalHits = result.totalHits - (originalLength - filtered.length);
    return {
      content: [
        { type: "text" as const, text: JSON.stringify(filtered, null, 2) },
      ],
    };
  } catch (error) {
    // ... existing catch block unchanged
  }
}),
```

### logBlockedAccess Helper
```typescript
// Source: new helper at top of mcp-tools.ts
import { isBlocked } from "./gdpr.js";
import { requestContext } from "./request-context.js";

function logBlockedAccess(toolName: string): void {
  const ctx = requestContext.getStore();
  ctx?.log.warn(
    {
      toolName,
      userId: ctx.userId,
      username: ctx.username,
      gdprBlocked: true,
    },
    "GDPR path blocked",
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No GDPR filtering | Phase 22-23 adds path filtering | v2.5 (this milestone) | Blocked client pages invisible to MCP clients |
| Policy in api.ts | Policy in mcp-tools.ts only | v2.5 design decision | api.ts stays policy-neutral, all filtering at tool layer |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FILT-03 | get_page returns "Page not found" for blocked pages | unit | `npx vitest run src/__tests__/mcp-tools-gdpr.test.ts -t "get_page.*blocked" -x` | No -- Wave 0 |
| FILT-03 | get_page error text is byte-identical to absent page error | unit | `npx vitest run src/__tests__/mcp-tools-gdpr.test.ts -t "indistinguishable" -x` | No -- Wave 0 |
| FILT-04 | search_pages excludes blocked pages from results | unit | `npx vitest run src/__tests__/mcp-tools-gdpr.test.ts -t "search_pages.*blocked" -x` | No -- Wave 0 |
| FILT-04 | search_pages adjusts totalHits after filtering | unit | `npx vitest run src/__tests__/mcp-tools-gdpr.test.ts -t "totalHits" -x` | No -- Wave 0 |
| FILT-05 | list_pages excludes blocked pages from results | unit | `npx vitest run src/__tests__/mcp-tools-gdpr.test.ts -t "list_pages.*blocked" -x` | No -- Wave 0 |
| SEC-01 | get_page calls getPageById before isBlocked (timing-safe) | unit | `npx vitest run src/__tests__/mcp-tools-gdpr.test.ts -t "timing" -x` | No -- Wave 0 |
| SEC-02 | Blocked access logged with structured fields, no path | unit | `npx vitest run src/__tests__/mcp-tools-gdpr.test.ts -t "audit log" -x` | No -- Wave 0 |

### Test Strategy Notes

Testing `mcp-tools.ts` handlers requires mocking the `WikiJsApi` and `isBlocked()`. Two approaches:

**Approach A: Direct function testing via mock WikiJsApi**
- Mock `WikiJsApi` methods to return pages with blocked paths
- Mock or spy on `isBlocked()` to control blocking behavior
- Assert on return values (error shape, filtered arrays)
- Assert on log output for SEC-02

**Approach B: Integration via buildTestApp + MCP JSON-RPC**
- Use `buildTestApp()` with a custom `mockWikiJsApi` that returns blocked paths
- Send JSON-RPC requests to `POST /mcp` and inspect responses
- More realistic but heavier

**Recommendation:** Approach A is sufficient. The handlers are pure functions wrapped by `wrapToolHandler()`. Mock the `WikiJsApi` to return pages with paths like `"Clients/AcmeCorp"`, import `isBlocked` from the real `src/gdpr.ts`, and verify the handler output. For SEC-02 log testing, capture pino output via a writable stream (pattern already used in `tests/observability.test.ts`).

**SEC-01 timing test approach:** Use `vi.fn()` for `getPageById` and `isBlocked`. Assert that `getPageById` was called before `isBlocked` by checking call order. Alternatively, make `getPageById` set a flag, and have the `isBlocked` mock verify the flag was set.

### Sampling Rate
- **Per task commit:** `npx vitest run src/__tests__/mcp-tools-gdpr.test.ts -x`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/__tests__/mcp-tools-gdpr.test.ts` -- covers FILT-03, FILT-04, FILT-05, SEC-01, SEC-02
- [ ] Phase 22 `src/gdpr.ts` must exist (dependency -- Phase 22 must be implemented first)

## Open Questions

1. **What does `getPageById()` return for nonexistent pages?**
   - What we know: The GraphQL query accesses `response.pages.single`. If Wiki.js returns null for a nonexistent ID, the function returns null. If it throws a GraphQL error, the error propagates to the catch block.
   - What's unclear: Whether the API returns null or throws for nonexistent IDs. The existing catch block handles both cases.
   - Recommendation: The guard `if (page?.path && isBlocked(page.path))` handles both cases safely. If page is null/undefined, `page?.path` is falsy and `isBlocked` is never called. This is correct behavior per CONTEXT.md ("If API returns null/undefined, skip isBlocked check").

2. **Should `totalHits` adjustment be included even though it's not serialized?**
   - What we know: Current `search_pages` handler (line 181) serializes only `result.results`, not `result.totalHits`. The value is never sent to clients.
   - What's unclear: Nothing -- this is well understood.
   - Recommendation: Adjust `totalHits` anyway per the locked decision. It's defense-in-depth and costs nothing. If serialization changes later, the adjustment is already in place.

## Sources

### Primary (HIGH confidence)
- `src/mcp-tools.ts` -- current handler implementations, exact error message format (lines 63-82, 119-146, 176-196)
- `src/tool-wrapper.ts` -- wrapper that provides timing and logging context
- `src/request-context.ts` -- AsyncLocalStorage providing correlationId, userId, username, log
- `src/types.ts` -- `WikiJsPage` (path field) and `PageSearchResult` (results + totalHits)
- `src/api.ts` -- `getPageById()`, `listPages()`, `searchPages()` implementations
- `src/logging.ts` -- `requestIdLogLabel: "correlationId"` confirms correlationId is auto-bound to logger
- `tests/helpers/build-test-app.ts` -- mockWikiJsApi pattern for testing
- `.planning/phases/22-core-gdpr-predicate/22-CONTEXT.md` -- Phase 22 will create `src/gdpr.ts` with `isBlocked()` export
- `.planning/phases/23-tool-handler-integration/23-CONTEXT.md` -- all locked decisions

### Secondary (MEDIUM confidence)
- `vitest.config.ts` -- test configuration (globals: true, environment: node)
- `tests/api.test.ts` -- mock patterns for WikiJsApi testing

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries are already in use, no new dependencies
- Architecture: HIGH - handler code is fully readable, integration points are specific line numbers
- Pitfalls: HIGH - derived from direct code analysis, not web research
- Test strategy: HIGH - follows existing project patterns (vitest, mock WikiJsApi)

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (stable -- internal project patterns, no external API changes)
