# Phase 27: Path Filter Removal and End-to-End Verification - Research

**Researched:** 2026-03-27
**Domain:** Code removal (dead code elimination) + integration testing
**Confidence:** HIGH

## Summary

Phase 27 is a surgical removal phase plus end-to-end verification. The path-based GDPR filtering system (`isBlocked()`, `logBlockedAccess()`, and all call sites in `src/mcp-tools.ts`) must be completely removed, along with all 3 dedicated test files (998 lines of test code total). A new `tests/e2e-redaction.test.ts` file replaces them, verifying that the complete v2.6 system (Phase 25 redaction + Phase 26 URL injection + Phase 27 filter removal) works end-to-end.

The removal scope is well-defined: 1 source file to delete (`src/gdpr.ts`), 3 test files to delete, 5 code regions to remove from `src/mcp-tools.ts` (import, helper function, 3 isBlocked call sites), a version bump from `2.4.0` to `2.6.0`, and documentation updates to `PROJECT.md`. The new E2E test file follows the established `callTool()` integration test pattern from `tests/gdpr-filter.test.ts` and `tests/observability.test.ts`.

**Primary recommendation:** Execute as a single plan with 3 waves: (1) remove all path-filtering code and tests, (2) write E2E verification tests, (3) update version and documentation. This ordering lets the test suite stay green between waves -- removal first (tests that test dead code go away with the dead code), then new tests validate the complete system.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Delete all 3 GDPR test files entirely: `src/__tests__/gdpr.test.ts`, `src/__tests__/mcp-tools-gdpr.test.ts`, `tests/gdpr-filter.test.ts`
- SEC-03 instructions keyword audit tests are dropped -- nothing to hide with path-filtering gone
- New file: `tests/e2e-redaction.test.ts` -- dedicated end-to-end verification of complete v2.6 system
- All 4 E2E scenarios covered: (1) get_page with GDPR markers -> redacted content + URL + metadata, (2) get_page without markers -> full content + URL, (3) formerly-blocked paths accessible via all 3 tools, (4) malformed marker fail-safe
- Delete `src/gdpr.ts` (if it still only contains isBlocked())
- Remove from `src/mcp-tools.ts`: import, logBlockedAccess(), all isBlocked() checks
- No replacement audit logging -- trust Phase 25/26's own logging
- No config changes needed
- Bump version from `2.4.0` to `2.6.0` in createMcpServer()
- Update PROJECT.md: change "GDPR-compliant path filtering" to "marker-based content redaction"
- Update any CLAUDE.md references to path-blocking
- Keep docs accurate as part of the removal sweep

### Claude's Discretion
- Exact test mock setup for E2E verification (page fixtures, marker content)
- Order of removal operations
- Whether to update instructions.txt.example references

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FILTER-01 | isBlocked() path-based filtering is removed from all MCP tool handlers | Exact code locations identified: import line 12, logBlockedAccess lines 25-36, get_page check lines 90-96, list_pages filter lines 159-166, search_pages filter lines 218-227 in src/mcp-tools.ts; entire src/gdpr.ts file |
| FILTER-02 | All published wiki pages are accessible via get_page, list_pages, and search_pages without path restrictions | E2E test with formerly-blocked path fixtures (Clients/AcmeCorp pattern) verifying all 3 tools return results; removal of filter code is sufficient -- no replacement logic needed |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vitest | 4 | Test runner for E2E tests | Already configured in vitest.config.ts, all existing tests use it |
| Fastify | 4 | HTTP server (inject-based testing) | Production framework, test app builder uses it |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| buildTestApp() | N/A | Shared test Fastify app factory | For all integration/E2E tests -- accepts wikiJsApiOverride parameter |
| createTestToken() | N/A | JWT generation for test auth | For authenticated tool calls in E2E tests |

No new dependencies required. This phase only removes code and adds tests using existing infrastructure.

## Architecture Patterns

### Removal Targets (Exact Code Locations)

```
src/gdpr.ts                          -- DELETE entire file (20 lines, isBlocked() only export)
src/__tests__/gdpr.test.ts           -- DELETE entire file (96 lines)
src/__tests__/mcp-tools-gdpr.test.ts -- DELETE entire file (477 lines)
tests/gdpr-filter.test.ts            -- DELETE entire file (425 lines)

src/mcp-tools.ts                     -- MODIFY (remove 5 code regions):
  Line 12:     import { isBlocked } from "./gdpr.js";
  Lines 25-36: logBlockedAccess() helper function
  Lines 90-96: get_page isBlocked() check (inside try block)
  Lines 159-166: list_pages .filter() with isBlocked()
  Lines 218-227: search_pages .filter() with isBlocked() + totalHits adjustment
  Line 49:     version: "2.4.0" -> "2.6.0"
```

### Post-Removal mcp-tools.ts Structure

After removing the path-filtering code, the tool handlers become simpler:

**get_page handler:** API call -> (Phase 26 redaction+URL injection happens here) -> return JSON
**list_pages handler:** API call -> return JSON (no filtering step)
**search_pages handler:** API call -> return JSON (no filtering step, no totalHits adjustment)

### Pattern: E2E Integration Test (callTool pattern)

The established pattern from `tests/gdpr-filter.test.ts` and `tests/observability.test.ts`:

```typescript
// Source: tests/gdpr-filter.test.ts (lines 135-176)
async function callTool(toolName: string, toolArgs: Record<string, unknown>) {
  // Step 1: send initialize
  await app.inject({
    method: "POST",
    url: "/mcp",
    headers: {
      authorization: `Bearer ${validToken}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    payload: {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0.0" },
      },
    },
  });

  // Step 2: call tool
  return app.inject({
    method: "POST",
    url: "/mcp",
    headers: {
      authorization: `Bearer ${validToken}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    payload: {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: toolArgs,
      },
    },
  });
}
```

### Pattern: WikiJsApi Mock Override

```typescript
// Source: tests/gdpr-filter.test.ts (lines 100-112)
const mockApi = {
  checkConnection: async () => true,
  getPageById: async (id: number) => { /* return page by ID */ },
  listPages: async () => ALL_PAGES,
  searchPages: async () => ({ results: [...ALL_PAGES], totalHits: ALL_PAGES.length }),
} as unknown as WikiJsApi;

// Pass to buildTestApp:
app = await buildTestApp(undefined, mockApi);
```

### Pattern: buildTestApp Signature

```typescript
// Source: tests/helpers/build-test-app.ts (lines 113-117)
export async function buildTestApp(
  configOverrides?: Partial<AppConfig["azure"]>,
  wikiJsApiOverride?: WikiJsApi,
  loggerOptions?: Record<string, unknown>,
  instructions?: string,
): Promise<FastifyInstance>
```

### Anti-Patterns to Avoid
- **Partial removal:** Do not leave any import, reference, or call to isBlocked/gdpr.js anywhere in src/. The TypeScript compiler will catch dangling imports, but grep-verify anyway.
- **Removing too much from search_pages:** After removing the isBlocked filter, the `result.results` array should be returned directly. Do NOT also remove the `result.totalHits` field -- just stop adjusting it (the adjustment code is removed with the filter).
- **Leaving logBlockedAccess orphaned:** The function and its requestContext import are only used by isBlocked call sites. When isBlocked calls go away, logBlockedAccess becomes dead code. Remove it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Test app setup | Custom Fastify server | `buildTestApp(undefined, mockApi)` | Handles JWKS, routes, plugins identically to production |
| Auth tokens for tests | Manual JWT construction | `createTestToken()` | Already configured with correct claims, signing keys, audience |
| MCP tool invocation | Direct handler calls | `callTool()` pattern via Fastify inject | Tests the full HTTP + MCP protocol stack, not just handler logic |

## Common Pitfalls

### Pitfall 1: Forgetting to Remove the totalHits Adjustment
**What goes wrong:** The search_pages handler has a `result.totalHits -= (originalLength - filtered.length)` line that only makes sense when filtering occurs. If the filter code is removed but this line remains, it will evaluate to `result.totalHits -= 0` (no-op but confusing dead logic).
**Why it happens:** The totalHits adjustment is part of the filtering block but is on a separate line after the filter.
**How to avoid:** Remove lines 218-227 as a unit (the entire block from `const originalLength` through the closing brace of the filter).
**Warning signs:** Any reference to `originalLength` or `filtered` variable names remaining in the handler.

### Pitfall 2: Dangling requestContext Import
**What goes wrong:** After removing `logBlockedAccess()`, the `import { requestContext } from "./request-context.js"` line (line 13) might appear to be unused. However, it may still be needed by Phase 25/26 code.
**Why it happens:** requestContext was imported for logBlockedAccess, but redaction logging (REDACT-05) may also use it.
**How to avoid:** Check whether any remaining code in mcp-tools.ts uses requestContext after removal. If not, remove the import. If Phase 25/26 added usage, keep it.
**Warning signs:** TypeScript compiler error or linter warning about unused imports.

### Pitfall 3: E2E Test Assumes Phase 25/26 Already Shipped
**What goes wrong:** The E2E tests verify redacted content and URL injection, but Phase 25 and 26 may not be implemented yet when the plan is written.
**Why it happens:** Phase 27 depends on Phase 25+26 being complete. The E2E tests verify the combined system.
**How to avoid:** The plan must note that Phase 25 and 26 MUST be implemented before Phase 27 executes. The E2E tests will fail if redaction/URL injection isn't present.
**Warning signs:** E2E test expects `url` field or redacted content but gets raw content back.

### Pitfall 4: PROJECT.md References Still Mention Path Filtering
**What goes wrong:** Multiple lines in PROJECT.md reference path-based GDPR filtering as a shipped feature. If not updated, documentation is inaccurate.
**Why it happens:** PROJECT.md has references on lines 5, 50-53, 84-85, 98, 141-144.
**How to avoid:** Systematic update of all path-filtering references in PROJECT.md. The "Validated" section items about isBlocked should be updated to reflect the new marker-based approach.

### Pitfall 5: search_pages Return Structure After Filter Removal
**What goes wrong:** Currently search_pages serializes `filtered` (the filtered array), not `result.results`. After removing the filter, you need to serialize `result.results` directly -- or just serialize the whole `result` object.
**Why it happens:** The variable name changes when the intermediate `filtered` variable is removed.
**How to avoid:** After removing the filter block, the handler should serialize `result.results` directly: `JSON.stringify(result.results, null, 2)`. Or optionally serialize the full result object if the planner prefers.

## Code Examples

### get_page Handler After Removal (Expected State)

```typescript
// After Phase 27 removal, the get_page handler try block becomes:
wrapToolHandler(TOOL_GET_PAGE, async ({ id }) => {
  try {
    const page = await wikiJsApi.getPageById(id);
    // Phase 25+26: redaction and URL injection happen here (already wired)
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
})
```

### list_pages Handler After Removal (Expected State)

```typescript
// After Phase 27 removal -- no filtering step:
wrapToolHandler(TOOL_LIST_PAGES, async ({ limit, orderBy, includeUnpublished }) => {
  try {
    const pages = await wikiJsApi.listPages(limit, orderBy, includeUnpublished);
    return {
      content: [
        { type: "text" as const, text: JSON.stringify(pages, null, 2) },
      ],
    };
  } catch (error) {
    // ... unchanged error handling
  }
})
```

### search_pages Handler After Removal (Expected State)

```typescript
// After Phase 27 removal -- no filtering, no totalHits adjustment:
wrapToolHandler(TOOL_SEARCH_PAGES, async ({ query, limit }) => {
  try {
    const result = await wikiJsApi.searchPages(query, limit);
    return {
      content: [
        { type: "text" as const, text: JSON.stringify(result.results, null, 2) },
      ],
    };
  } catch (error) {
    // ... unchanged error handling
  }
})
```

### E2E Test Mock Fixture Pattern

```typescript
// Recommended fixtures for e2e-redaction.test.ts
const PAGE_WITH_MARKERS: WikiJsPage = {
  id: 1,
  path: "docs/team-info",
  title: "Team Info",
  description: "Team page with PII",
  content: "# Team\n\nPublic info.\n\n<!-- gdpr-start -->\nJohn Doe: john@example.com\n<!-- gdpr-end -->\n\nMore public info.",
  isPublished: true,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

const PAGE_WITHOUT_MARKERS: WikiJsPage = {
  id: 2,
  path: "docs/getting-started",
  title: "Getting Started",
  description: "Documentation",
  content: "# Getting Started\n\nWelcome to the wiki.",
  isPublished: true,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

// Regression guard: path that was blocked under v2.5
const FORMERLY_BLOCKED_PAGE: WikiJsPage = {
  id: 42,
  path: "Clients/AcmeCorp",
  title: "AcmeCorp",
  description: "Client page",
  content: "# AcmeCorp\n\nClient details.",
  isPublished: true,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

const PAGE_WITH_MALFORMED_MARKER: WikiJsPage = {
  id: 3,
  path: "docs/incomplete",
  title: "Incomplete Page",
  description: "Page with unclosed marker",
  content: "# Notes\n\nPublic part.\n\n<!-- gdpr-start -->\nSensitive data without end marker",
  isPublished: true,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};
```

## State of the Art

| Old Approach (v2.5) | New Approach (v2.6) | When Changed | Impact |
|----------------------|---------------------|--------------|--------|
| isBlocked() path predicate hides entire pages | Marker-based content redaction preserves page access | v2.6 (this milestone) | Pages accessible but PII surgically removed |
| Blocked pages return fake "not found" | No blocking -- all pages returned | v2.6 Phase 27 | Simpler code, no timing oracle concerns |
| 998 lines of GDPR filtering tests | E2E redaction verification tests | v2.6 Phase 27 | Focused on actual GDPR mechanism, not path tricks |

## Open Questions

1. **Phase 25/26 Code State at Execution Time**
   - What we know: Phase 25 adds redactContent(), Phase 26 wires it into get_page and adds URL injection. Phase 27 depends on both.
   - What's unclear: The exact code added by Phase 25/26 (not yet implemented). The E2E tests must verify redaction and URL injection that doesn't exist yet.
   - Recommendation: The plan should clearly state Phase 25+26 are prerequisites. E2E test assertions should match the REQUIREMENTS.md specifications (REDACT-01 through REDACT-06, URL-01, URL-02).

2. **requestContext Import Retention**
   - What we know: Currently imported for logBlockedAccess(). Phase 25/26 may add new uses.
   - What's unclear: Whether Phase 25/26 code in mcp-tools.ts uses requestContext.
   - Recommendation: After removal, check if requestContext is still used. If not, remove the import. TypeScript compiler will flag this.

3. **instructions.txt.example Updates**
   - What we know: CONTEXT.md lists this as Claude's discretion. Current content has no GDPR/blocking references.
   - What's unclear: Whether the file needs any changes.
   - Recommendation: No changes needed -- instructions.txt.example contains generic template placeholders with no path-filtering references. Leave as-is.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4 |
| Config file | vitest.config.ts |
| Quick run command | `npx vitest run tests/e2e-redaction.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FILTER-01 | isBlocked() removed from all handlers | smoke (grep verification) + integration | `npx vitest run tests/e2e-redaction.test.ts` | Wave 0 |
| FILTER-02 | All published pages accessible without path restrictions | integration (E2E) | `npx vitest run tests/e2e-redaction.test.ts` | Wave 0 |

### Additional E2E Verification (Phase 25+26 Combined)
| Scenario | Behavior | Test Type | File Exists? |
|----------|----------|-----------|-------------|
| SC-1 | get_page with GDPR markers returns redacted content + URL | integration (E2E) | Wave 0 |
| SC-2 | get_page without markers returns full content + URL | integration (E2E) | Wave 0 |
| SC-3 | Formerly-blocked paths (Clients/AcmeCorp) accessible via all 3 tools | integration (E2E) | Wave 0 |
| SC-4 | Malformed marker fail-safe: unclosed gdpr-start redacts to end | integration (E2E) | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/e2e-redaction.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/e2e-redaction.test.ts` -- new E2E test file covering FILTER-01, FILTER-02, and all 4 verification scenarios
- No framework install needed -- Vitest already configured
- No shared fixtures needed -- test is self-contained with inline mock data

## Sources

### Primary (HIGH confidence)
- Direct code inspection of `src/mcp-tools.ts` (248 lines) -- all isBlocked references mapped
- Direct code inspection of `src/gdpr.ts` (20 lines) -- confirmed isBlocked is sole export
- Direct code inspection of all 3 GDPR test files (998 lines total) -- deletion scope confirmed
- Direct code inspection of `tests/helpers/build-test-app.ts` -- buildTestApp signature and wikiJsApiOverride parameter
- Direct code inspection of `tests/gdpr-filter.test.ts` -- callTool() pattern and mock structure
- Direct code inspection of `.planning/PROJECT.md` -- all path-filtering references identified (lines 5, 50-53, 84-85, 98, 141-144)
- Direct code inspection of `CLAUDE.md` -- no GDPR/path-filtering references found (no changes needed)
- `npx vitest run` output -- 370 passing, 1 pre-existing failure (docker-config.test.ts, known issue)

### Secondary (MEDIUM confidence)
- `.planning/REQUIREMENTS.md` -- FILTER-01, FILTER-02 requirement definitions
- `.planning/ROADMAP.md` -- Phase dependency chain (27 depends on 26 depends on 25)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new libraries, all existing infrastructure
- Architecture: HIGH - code locations precisely identified via direct inspection, exact line numbers known
- Pitfalls: HIGH - removal scope is well-bounded, all edge cases identified from actual code
- E2E test design: MEDIUM - depends on Phase 25/26 implementation details not yet written; test patterns are established but specific assertions for redaction/URL depend on their API shape

**Research date:** 2026-03-27
**Valid until:** 2026-04-10 (stable -- removal scope is fixed, no external dependencies to shift)
