# Phase 24: Integration Tests and Security Hygiene - Research

**Researched:** 2026-03-27
**Domain:** Vitest integration testing with Fastify inject(), MCP JSON-RPC protocol, security side-channel auditing
**Confidence:** HIGH

## Summary

Phase 24 is a pure testing and auditing phase -- no production code changes. It verifies that the GDPR filter (Phase 22 `isBlocked()` predicate + Phase 23 tool handler integration) works correctly from the MCP client perspective, and that no information about the filter leaks through side channels (response shape, headers, instructions text).

The project already has a mature integration test infrastructure. The `buildTestApp()` helper in `tests/helpers/build-test-app.ts` creates a Fastify instance with local JWKS, mock WikiJsApi, and mock fetch. The `observability.test.ts` file contains a `callTool()` helper pattern that sends initialize + tools/call JSON-RPC requests via `inject()` -- this is the exact pattern Phase 24 needs. The existing `mockWikiJsApi` needs to be extended with blocked-path data, and a new `tests/gdpr-filter.test.ts` file will house all GDPR integration tests.

**Primary recommendation:** Create a single `tests/gdpr-filter.test.ts` file following the established `observability.test.ts` pattern (buildTestApp + inject-based callTool helper), with a custom `wikiJsApiOverride` that returns both blocked and non-blocked pages. Use byte-identical JSON string comparison for the `get_page` response identity check.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Mock WikiJsApi design:**
- Extend the existing `mockWikiJsApi` in `tests/helpers/build-test-app.ts` -- single source of truth for test data
- Include canonical blocked path (`Clients/AcmeCorp`) plus 1-2 normalization variants (e.g., `clients/acmecorp`, `/Clients/AcmeCorp/`)
- Use fictional company names (AcmeCorp, TestClient) -- no risk of real client names in test output or CI logs
- Include "safe" Clients paths that should NOT be blocked: 1-segment `Clients` (listing page) and 3-segment `Clients/AcmeCorp/Contacts` (sub-page) to verify no over-filtering

**Response identity verification:**
- Byte-identical JSON string comparison for `get_page` blocked vs genuine not-found responses -- strictest possible, matches SC wording
- Produce genuine not-found baseline by requesting a non-existent page ID (e.g., 99999) from the mock -- mock should throw/error for unknown IDs
- For `search_pages` and `list_pages`: verify blocked paths are completely absent from results (not as errors, not as entries, not as anything)
- Check response headers for side-channel leaks -- assert no custom headers hint at GDPR filtering (no `X-GDPR-Blocked` or similar)

**Instructions file audit:**
- Scan both `DEFAULT_INSTRUCTIONS` (hardcoded in `src/instructions.ts`) and `instructions.txt.example` for GDPR-revealing content
- Broad keyword set: `Clients` (case-sensitive, capital C plural), `blocked`, `GDPR`, `filter`, `isBlocked`, `restricted`, `hidden`
- Generic lowercase "client" is a false positive -- only flag exact path segment `Clients` (capital C, plural)
- Also verify at runtime via Fastify `inject()` -- check the actual instructions string returned in the MCP initialize response

**Test file organization:**
- New dedicated file: `tests/gdpr-filter.test.ts` for all GDPR integration tests
- Use Fastify `inject()` (not real HTTP listener) -- faster, no port allocation, matches SC wording
- Group by tool: `describe('get_page GDPR filtering')`, `describe('list_pages GDPR filtering')`, `describe('search_pages GDPR filtering')`, `describe('Instructions security audit')`
- Tag test cases with SC/requirement numbers following existing pattern (e.g., `SC-1:`, `SC-2:`, `SEC-03:`)

### Claude's Discretion

- Exact mock data structure and additional test page entries
- Helper function design for MCP JSON-RPC calls within the test file
- Specific header assertions beyond the custom-header leak check
- Whether to add a shared helper for the byte-identical comparison

### Deferred Ideas (OUT OF SCOPE)

None -- discussion stayed within phase scope.

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SEC-03 | MCP instructions file does not reveal filter structure or blocked path patterns | Instructions audit tests scan `DEFAULT_INSTRUCTIONS`, `instructions.txt.example`, and runtime MCP initialize response for GDPR-revealing keywords. Keyword set and false-positive handling defined in locked decisions. |

</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | 4.x | Test runner | Already configured in project with vitest.config.ts |
| fastify | 4.x | HTTP framework | Provides `inject()` for integration tests without port allocation |
| @modelcontextprotocol/sdk | current | MCP protocol | JSON-RPC request/response shapes |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| jose | current | JWT generation | `createTestToken()` helper for authenticated inject() calls |
| node:fs/promises | built-in | File reading | Reading `instructions.txt.example` for static audit |

### Alternatives Considered

None -- this phase uses the existing test stack exclusively. No new dependencies.

## Architecture Patterns

### Test File Structure

```
tests/
  gdpr-filter.test.ts       # NEW: All GDPR integration tests
  helpers/
    build-test-app.ts        # EXISTING: buildTestApp() with wikiJsApiOverride param
```

### Pattern 1: Custom Mock WikiJsApi Override

**What:** Create a GDPR-aware mock that extends the default mock with blocked-path data, passed via `buildTestApp()`'s `wikiJsApiOverride` parameter.

**When to use:** All GDPR integration tests.

**Key design:** The mock must:
1. Return realistic page data for known IDs (both blocked and non-blocked pages)
2. Throw an error for unknown IDs (to generate genuine "not found" baseline)
3. Include blocked paths in `listPages()` and `searchPages()` results (the filter in mcp-tools.ts should strip them)

```typescript
// Source: tests/helpers/build-test-app.ts (existing wikiJsApiOverride parameter)
const gdprMock = {
  checkConnection: async () => true,
  getPageById: async (id: number) => {
    const pages: Record<number, WikiJsPage> = {
      1: { id: 1, path: "test/page", title: "Test Page", /* ... */ },
      42: { id: 42, path: "Clients/AcmeCorp", title: "AcmeCorp", /* ... */ },
      43: { id: 43, path: "Clients/TestClient", title: "TestClient", /* ... */ },
      44: { id: 44, path: "Clients", title: "Clients Hub", /* ... */ },           // 1-segment -- NOT blocked
      45: { id: 45, path: "Clients/AcmeCorp/Contacts", title: "Contacts", /* ... */ }, // 3-segment -- NOT blocked
    };
    const page = pages[id];
    if (!page) throw new Error("Page not found");
    return page;
  },
  listPages: async () => [/* include both blocked and non-blocked pages */],
  searchPages: async () => ({ results: [/* include both blocked and non-blocked */], totalHits: N }),
} as unknown as WikiJsApi;
```

### Pattern 2: Initialize-then-Call Tool Helper

**What:** A helper that sends an MCP `initialize` request followed by a `tools/call` request via inject(). The MCP SDK creates a fresh McpServer per request in stateless mode, so each test can call tools independently.

**When to use:** Every test that invokes an MCP tool.

**Why:** The existing `callTool()` helper in `observability.test.ts` (lines 423-475) is the exact pattern. It sends `initialize` first, then `tools/call`. This is necessary because the POST /mcp route creates a fresh `McpServer` + `StreamableHTTPServerTransport` per request.

```typescript
// Source: tests/observability.test.ts callTool() pattern
async function callTool(toolName: string, toolArgs: Record<string, unknown>) {
  // Step 1: initialize MCP session
  await app.inject({
    method: "POST", url: "/mcp",
    headers: {
      authorization: `Bearer ${validToken}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    payload: {
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1.0.0" } },
    },
  });

  // Step 2: call the tool
  return app.inject({
    method: "POST", url: "/mcp",
    headers: {
      authorization: `Bearer ${validToken}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    payload: {
      jsonrpc: "2.0", id: 2, method: "tools/call",
      params: { name: toolName, arguments: toolArgs },
    },
  });
}
```

### Pattern 3: Byte-Identical Response Comparison

**What:** Compare the full JSON string of a `get_page` blocked response against a genuine not-found response. This is the strictest possible identity check.

**When to use:** SC-2 verification (blocked responses indistinguishable from not-found).

**Key insight:** The response body from `inject()` is `res.body` (string). Comparing `res.body` directly gives byte-identical comparison. Alternatively, compare the parsed `result` object's content array at the JSON string level.

```typescript
// Get genuine not-found response
const notFoundRes = await callTool("get_page", { id: 99999 });
const notFoundBody = notFoundRes.json();

// Get blocked page response
const blockedRes = await callTool("get_page", { id: 42 }); // blocked: Clients/AcmeCorp
const blockedBody = blockedRes.json();

// Byte-identical comparison on the MCP result content
expect(JSON.stringify(blockedBody.result)).toBe(JSON.stringify(notFoundBody.result));
```

### Pattern 4: Instructions Runtime Audit via Initialize Response

**What:** Send an MCP `initialize` request and extract the `instructions` field from the server response to verify no GDPR-revealing content at runtime.

**When to use:** SEC-03 verification.

```typescript
const res = await app.inject({
  method: "POST", url: "/mcp",
  headers: {
    authorization: `Bearer ${validToken}`,
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  },
  payload: {
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1.0.0" } },
  },
});
const body = res.json();
const instructions = body.result.instructions;
// Audit the runtime instructions string
```

### Anti-Patterns to Avoid

- **Real HTTP listener for integration tests:** Use `inject()` -- no port allocation, faster, deterministic. The `smoke.test.ts` pattern with `server.listen({port: 0})` is for smoke tests only.
- **Modifying the shared `mockWikiJsApi` export:** Create a local override object. Mutating the shared mock affects other test files running in the same Vitest worker.
- **Testing filter logic directly:** This is integration testing -- call through the MCP JSON-RPC layer, not `isBlocked()` directly (that is Phase 22 unit test territory).
- **Hardcoding MCP protocol version:** Use the same version string as other tests (`"2025-03-26"`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Test app construction | Custom Fastify app setup | `buildTestApp(undefined, gdprMock)` | buildTestApp handles JWKS, auth plugin, route registration |
| JWT token generation | Manual JWT signing | `createTestToken()` from auth helpers | Handles key pair caching, proper claims, correct issuer/audience |
| MCP JSON-RPC protocol | Custom protocol handling | Follow established inject() + JSON-RPC payload pattern | Protocol version, required fields, content-type headers are tricky |

**Key insight:** The existing test infrastructure handles all the hard parts (auth, JWKS, MCP protocol). Phase 24 only needs a custom WikiJsApi mock and assertion logic.

## Common Pitfalls

### Pitfall 1: MCP Response Shape Depends on Transport Mode

**What goes wrong:** The MCP SDK can return responses as SSE streams or JSON objects depending on transport configuration.
**Why it happens:** `StreamableHTTPServerTransport` is configured with `enableJsonResponse: true` in `mcp-routes.ts`, so POST requests return JSON. But the `accept` header must include both `application/json` and `text/event-stream`.
**How to avoid:** Always include `accept: "application/json, text/event-stream"` in inject headers. This matches the existing test pattern in `e2e-flow.test.ts` and `observability.test.ts`.
**Warning signs:** Responses with unexpected content-type, empty bodies, or SSE-formatted text instead of JSON.

### Pitfall 2: Stateless MCP Server Creates Fresh Instance Per Request

**What goes wrong:** Assuming a single `initialize` persists across multiple `tools/call` requests.
**Why it happens:** `mcp-routes.ts` creates a new `McpServer` + `StreamableHTTPServerTransport` for every POST /mcp. There is no session state between requests.
**How to avoid:** The `callTool()` helper must send `initialize` + `tools/call` as separate requests. The initialize is needed so the McpServer created for the tools/call request knows to process tool calls (actually, re-reading the code: each request creates its own McpServer, so the initialize and tools/call are also independent). The existing pattern works because each POST creates a fresh server that handles whatever method is in the payload.
**Warning signs:** "Method not found" errors on tools/call.

### Pitfall 3: Mock Must Throw for Unknown Page IDs

**What goes wrong:** The genuine "not found" baseline cannot be established if the mock returns null instead of throwing.
**Why it happens:** The real `getPageById` returns whatever WikiJS sends (potentially null). But the `mcp-tools.ts` handler catches errors in the catch block to produce the "Page not found" error message. If the mock returns null, the handler will try to serialize null as JSON, not produce the error response.
**How to avoid:** The GDPR mock's `getPageById` must throw an error (e.g., `throw new Error("Page not found")`) for unknown IDs. This triggers the catch block in `mcp-tools.ts` which produces the canonical error response.
**Warning signs:** Blocked page response says "Error in get_page: Page not found" but not-found response returns `{"result":{"content":[{"type":"text","text":"null"}]}}`.

### Pitfall 4: Error Response Text Must Match Exactly After Phase 23

**What goes wrong:** The byte-identical comparison fails because Phase 23's blocked error text differs slightly from the genuine catch-block error text.
**Why it happens:** Phase 23 CONTEXT.md specifies: `"Error in get_page: Page not found. Verify the page ID using search_pages or list_pages."` -- this is the existing catch block format. The blocked response must use this exact string.
**How to avoid:** Phase 24 tests should NOT hardcode the expected error text. Instead, they should compare blocked response vs genuine not-found response dynamically. This way, if Phase 23's implementation differs slightly, the byte-identical check still works as long as both paths produce the same output.
**Warning signs:** Test hardcodes expected error string and breaks when Phase 23 uses slightly different wording.

### Pitfall 5: Instructions Audit False Positives on "client"

**What goes wrong:** The keyword scan flags lowercase "client" which appears legitimately in the DEFAULT_INSTRUCTIONS (line: "When client names or project names come up...").
**Why it happens:** Overly broad keyword matching.
**How to avoid:** Per locked decision: only flag exact `Clients` (capital C, plural) as a path segment indicator. Generic lowercase "client" is expected and acceptable.
**Warning signs:** Test fails on the existing DEFAULT_INSTRUCTIONS text that legitimately mentions "client names".

## Code Examples

### Example 1: GDPR Mock WikiJsApi

```typescript
// Source: derived from tests/helpers/build-test-app.ts mockWikiJsApi pattern
import { WikiJsApi } from "../../src/api.js";
import type { WikiJsPage } from "../../src/types.js";

const BLOCKED_PAGE: WikiJsPage = {
  id: 42,
  path: "Clients/AcmeCorp",
  title: "AcmeCorp",
  description: "GDPR-protected client page",
  content: "# AcmeCorp\n\nConfidential client data.",
  isPublished: true,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

const SAFE_PAGE: WikiJsPage = {
  id: 1,
  path: "test/page",
  title: "Test Page",
  description: "A safe test page",
  content: "# Test Content",
  isPublished: true,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

// Pages map for getPageById
const PAGES: Record<number, WikiJsPage> = {
  1: SAFE_PAGE,
  42: BLOCKED_PAGE,
  // ... additional pages for normalization variant testing
};
```

### Example 2: Header Side-Channel Check

```typescript
// Source: established pattern from route-protection.test.ts header assertions
const res = await callTool("get_page", { id: 42 });

// No custom headers revealing GDPR status
const headerNames = Object.keys(res.headers).map(h => h.toLowerCase());
const gdprHeaders = headerNames.filter(h =>
  h.includes("gdpr") || h.includes("blocked") || h.includes("filter")
);
expect(gdprHeaders).toEqual([]);
```

### Example 3: Instructions Static Audit

```typescript
// Source: derived from tests/instructions.test.ts pattern
import { DEFAULT_INSTRUCTIONS } from "../src/instructions.js";
import { readFile } from "node:fs/promises";

const FORBIDDEN_KEYWORDS = ["Clients", "blocked", "GDPR", "filter", "isBlocked", "restricted", "hidden"];

it("SEC-03: DEFAULT_INSTRUCTIONS contains no GDPR-revealing keywords", () => {
  for (const keyword of FORBIDDEN_KEYWORDS) {
    if (keyword === "Clients") {
      // Case-sensitive check for capital-C plural "Clients"
      expect(DEFAULT_INSTRUCTIONS).not.toContain("Clients");
    } else {
      // Case-insensitive check for other keywords
      expect(DEFAULT_INSTRUCTIONS.toLowerCase()).not.toContain(keyword.toLowerCase());
    }
  }
});

it("SEC-03: instructions.txt.example contains no GDPR-revealing keywords", async () => {
  const content = await readFile("instructions.txt.example", "utf-8");
  for (const keyword of FORBIDDEN_KEYWORDS) {
    if (keyword === "Clients") {
      expect(content).not.toContain("Clients");
    } else {
      expect(content.toLowerCase()).not.toContain(keyword.toLowerCase());
    }
  }
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Real HTTP listener tests | Fastify inject() | Established in project | No port allocation, faster, deterministic |
| Shared mutable mock | wikiJsApiOverride parameter | buildTestApp() design | Test isolation -- each suite gets its own mock |
| Manual JWT construction | createTestToken() helper | Phase 4 (v2.0) | Consistent, cached key pairs, correct claims |

**No deprecated patterns relevant to this phase.**

## Open Questions

1. **Phase 23 exact error response format**
   - What we know: CONTEXT.md specifies `"Error in get_page: Page not found. Verify the page ID using search_pages or list_pages."` and the existing catch block in `mcp-tools.ts` produces `"Error in get_page: ${String(error)}. Verify the page ID using search_pages or list_pages."`
   - What's unclear: If the mock throws `new Error("Page not found")`, the catch block produces `"Error in get_page: Error: Page not found. Verify the page ID..."` (note the `Error: ` prefix from `String(error)`). Phase 23 may or may not change this.
   - Recommendation: Use dynamic comparison (blocked vs genuine not-found) rather than hardcoded expected strings. This makes tests robust against Phase 23 implementation details.

2. **Whether callTool() needs initialize before every tools/call**
   - What we know: Each POST /mcp creates a fresh McpServer in stateless mode. The MCP SDK may or may not require an initialize handshake.
   - What's unclear: Whether a tools/call sent to a fresh McpServer without prior initialize will work or fail.
   - Recommendation: Follow the established `observability.test.ts` pattern which does initialize before each tools/call. It works reliably. If unnecessary, it adds only ~1ms per test.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.x |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/gdpr-filter.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEC-03 | Instructions do not reveal filter structure | integration | `npx vitest run tests/gdpr-filter.test.ts -t "Instructions"` | No -- Wave 0 |
| SC-1 | All tools return correct MCP shapes for blocked/non-blocked | integration | `npx vitest run tests/gdpr-filter.test.ts -t "GDPR"` | No -- Wave 0 |
| SC-2 | get_page blocked == genuine not-found (byte-identical) | integration | `npx vitest run tests/gdpr-filter.test.ts -t "byte-identical"` | No -- Wave 0 |
| SC-3 | Instructions file clean of GDPR keywords | integration | `npx vitest run tests/gdpr-filter.test.ts -t "SEC-03"` | No -- Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/gdpr-filter.test.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/gdpr-filter.test.ts` -- new file, all GDPR integration tests (covers SEC-03, SC-1, SC-2, SC-3)
- No framework install needed -- Vitest already configured
- No shared fixtures needed beyond existing `buildTestApp()` and `createTestToken()`

## Sources

### Primary (HIGH confidence)

- `tests/helpers/build-test-app.ts` -- `buildTestApp()` signature, `mockWikiJsApi` structure, `wikiJsApiOverride` parameter
- `tests/observability.test.ts` -- `callTool()` pattern (lines 423-475), log capture helper, buildTestApp with logger options
- `tests/e2e-flow.test.ts` -- MCP initialize + tools/call JSON-RPC protocol structure, accept headers
- `tests/route-protection.test.ts` -- header assertion patterns, log capture helper
- `tests/instructions.test.ts` -- DEFAULT_INSTRUCTIONS audit pattern, readFile for template audit
- `src/mcp-tools.ts` -- tool handler try/catch error format, response shapes
- `src/instructions.ts` -- `DEFAULT_INSTRUCTIONS` content, `loadInstructions()` function
- `src/routes/mcp-routes.ts` -- stateless McpServer per-request creation, `StreamableHTTPServerTransport` config
- `vitest.config.ts` -- test environment configuration, env vars
- `.planning/phases/22-core-gdpr-predicate/22-CONTEXT.md` -- `isBlocked()` design, `src/gdpr.ts` module
- `.planning/phases/23-tool-handler-integration/23-CONTEXT.md` -- filter placement in mcp-tools.ts, error response format, audit logging design

### Secondary (MEDIUM confidence)

- `instructions.txt.example` -- template content for static audit (verified via direct file read)

### Tertiary (LOW confidence)

None -- all findings from direct code inspection.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in project, no new dependencies
- Architecture: HIGH -- all patterns observed directly in existing test files
- Pitfalls: HIGH -- derived from direct code analysis of mcp-tools.ts handler behavior and MCP transport configuration

**Research date:** 2026-03-27
**Valid until:** Indefinite (testing patterns are stable; only changes to Phase 22/23 implementation would affect this)
