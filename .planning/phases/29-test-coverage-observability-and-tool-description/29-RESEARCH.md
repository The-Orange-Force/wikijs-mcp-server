# Phase 29: Test Coverage, Observability, and Tool Description - Research

**Researched:** 2026-03-28
**Domain:** Vitest unit testing, Pino structured logging, MCP tool descriptions
**Confidence:** HIGH

## Summary

Phase 29 has three deliverables: (1) a dedicated test file for metadata fallback scenarios, (2) an info-level structured log when metadata fallback adds results, and (3) an updated search_pages tool description mentioning path/title/description matching. All three are small, well-scoped changes to existing code with established patterns already in the codebase.

The codebase provides clear patterns to follow: `tests/api.test.ts` for the vi.mock GraphQL pattern, `tests/observability.test.ts` for the createLogCapture() Pino capture pattern, and `src/mcp-tools.ts` for tool descriptions. The existing test suite has 429 passing tests (plus 1 pre-existing failure in docker-config.test.ts due to a missing instructions.txt file -- unrelated to this phase).

**Primary recommendation:** Follow existing codebase patterns exactly. The test file, log entry, and description change are all pattern-matching exercises against established conventions.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Unit tests only -- no integration or E2E tests for fallback logic
- New dedicated file: `tests/metadata-fallback.test.ts` (not extending api.test.ts)
- Mock GraphQL client with `vi.mock()` (same pattern as api.test.ts)
- Observability log assertion included in the same test file (using createLogCapture() pattern)
- Snapshot-style test verifying search_pages description contains keywords "path", "title", "description"
- Test matrix: META-03 dedup, META-04 unpublished, META-05 limit, META-02 case-insensitivity, INTG-02 zero-results-to-fallback, INTG-01 data sharing, negative test (no fallback when enough results), META-06 totalHits adjustment
- Log emitted inside searchPages() method, after merging metadata results
- Structured fields: `{ query, metadataHits, totalResolved }`
- Message: "Metadata fallback supplemented search results"
- Info level, only when metadataHits > 0
- Add one sentence to existing search_pages description (not a rewrite)
- Capability-only wording -- no mention of "fallback" as implementation detail
- Wording direction: "Also matches against page paths, titles, and descriptions for acronyms and short tokens"
- Version bump from 2.6.0 to 2.7.0

### Claude's Discretion
- Exact test data fixtures and mock setup
- Test assertion style (expect chains vs individual expects)
- Exact final wording of the tool description sentence
- Order of test cases within the file

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| OBSV-01 | Metadata fallback logs at info level with query, hit count, and total resolved count | Existing structured logging pattern in `src/api.ts` (lines 287-300) and `src/mcp-tools.ts` (lines 77-79) provides exact template. `requestContext.getStore()?.log.info()` is the established call pattern. |
| TOOL-01 | `search_pages` tool description is updated to mention path, title, and description matching capability | Tool description is a string literal at `src/mcp-tools.ts` line 193. One sentence append. Test verifies keywords present. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | ^4.1.1 | Test runner | Already configured in project with globals: true, node environment |
| pino | (via fastify 4) | Structured JSON logging | Used throughout codebase for all observability |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:stream (Writable) | built-in | Log capture in tests | createLogCapture() pattern for asserting log output |

### Alternatives Considered
None -- all tools are already in the project. No new dependencies needed.

**Installation:**
No new packages required. All dependencies are already in package.json.

## Architecture Patterns

### Test File Pattern (from api.test.ts)

The established mock pattern for unit-testing WikiJsApi methods:

```typescript
// Source: tests/api.test.ts lines 1-24
const mockRequest = vi.fn();

vi.mock("graphql-request", () => {
  return {
    GraphQLClient: class MockGraphQLClient {
      request = mockRequest;
      constructor() {}
    },
  };
});

import { WikiJsApi } from "../src/api.js";

describe("WikiJsApi", () => {
  let api: WikiJsApi;

  beforeEach(() => {
    mockRequest.mockReset();
    api = new WikiJsApi("http://localhost:3000", "test-token");
  });
  // ...tests
});
```

### Log Capture Pattern (from observability.test.ts)

The established pattern for capturing and asserting Pino log output:

```typescript
// Source: tests/observability.test.ts lines 28-59
interface LogEntry {
  level: number;
  msg: string;
  [key: string]: unknown;
}

function createLogCapture(): {
  logs: LogEntry[];
  stream: Writable;
} {
  const logs: LogEntry[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      try {
        const line = chunk.toString().trim();
        if (line) {
          logs.push(JSON.parse(line));
        }
      } catch {
        // Ignore non-JSON lines
      }
      callback();
    },
  });
  return { logs, stream };
}
```

### Structured Log Pattern (from api.ts and mcp-tools.ts)

The established pattern for emitting structured logs from within API methods:

```typescript
// Source: src/api.ts lines 287-290 (existing warn-level log in searchPages)
const ctx = requestContext.getStore();
ctx?.log.warn(
  { path: dropped.path, searchId: dropped.searchId },
  "Search result could not be resolved to a database page; dropping from results"
);

// Source: src/mcp-tools.ts lines 77-79 (GDPR redaction info log)
ctx?.log.info(
  { pageId: page.id, path: page.path, redactionCount: redactionResult.redactionCount },
  "GDPR content redacted",
);
```

### Log in Test Context

To test the log emission from `searchPages()`, the test must run inside `requestContext.run()` with a Pino logger writing to the capture stream. Pattern from observability.test.ts lines 186-208:

```typescript
// Source: tests/observability.test.ts lines 186-208
import pino from "pino";
import { requestContext } from "../src/request-context.js";

const logCapture = createLogCapture();
const testLogger = pino({ level: "trace" }, logCapture.stream);

await requestContext.run(
  {
    correlationId: "test-id",
    userId: "test-user",
    username: "test@example.com",
    log: testLogger as unknown as FastifyBaseLogger,
  },
  async () => {
    // Call the API method under test
    await api.searchPages("coa", 10);
  },
);

// Wait for pino stream flush
await new Promise((resolve) => setTimeout(resolve, 50));

// Assert log entry
const infoLogs = logCapture.logs.filter(
  (l) => l.level === 30 && l.msg === "Metadata fallback supplemented search results"
);
```

### Tool Description Location

Tool description is a string literal in `src/mcp-tools.ts` at the `registerTool` call for `search_pages`:

```typescript
// Source: src/mcp-tools.ts lines 191-193
description:
  "Search Wiki.js pages by keyword query. Returns matching pages with metadata and content excerpts. Only searches published pages (unpublished pages are not indexed). Note: recently published pages may take a moment to appear in search results due to indexing delay. Use get_page with a result's ID to retrieve the full page content.",
```

### Anti-Patterns to Avoid
- **Testing log output with string matching on stderr**: Use createLogCapture() with structured JSON parsing, not console.log interception
- **Importing pino logger from a Fastify app instance in unit tests**: Create a standalone pino instance with the capture stream
- **Forgetting the 50ms flush delay**: Pino stream writes are async; always await a short timeout before asserting log entries

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Log capture for tests | Custom console.log spy | `createLogCapture()` from observability.test.ts | Handles pino JSON serialization, stream buffering, and line splitting |
| GraphQL client mock | Manual class stub | `vi.mock("graphql-request")` with MockGraphQLClient pattern | Established in api.test.ts, handles constructor + request mock correctly |
| Request context in unit tests | Manual AsyncLocalStorage setup | `requestContext.run()` with pino logger | Exact same context shape as production, ensures log.info() calls work |

**Key insight:** Every pattern needed for this phase already exists in the codebase. The test file is a composition of existing patterns, not a novel architecture.

## Common Pitfalls

### Pitfall 1: Pino Stream Flush Timing
**What goes wrong:** Log assertions fail intermittently because pino hasn't flushed its write buffer yet
**Why it happens:** Pino uses async stream writes; the log entry may not be in the capture array immediately after the API call returns
**How to avoid:** Always include `await new Promise((resolve) => setTimeout(resolve, 50))` after the API call and before log assertions (established pattern in observability.test.ts)
**Warning signs:** Tests pass locally but fail in CI, or pass on retry

### Pitfall 2: vi.mock Hoisting with Multiple Files
**What goes wrong:** If the new test file imports from api.ts AND tries to use the same vi.mock pattern, the mock might not apply correctly if import order differs
**Why it happens:** Vitest hoists vi.mock() calls to the top of the file, but the mock must be declared before the import of the module that depends on it
**How to avoid:** Follow the exact pattern from api.test.ts: declare mockRequest, then vi.mock(), then import WikiJsApi. Do not add other imports between vi.mock and the WikiJsApi import.
**Warning signs:** mockRequest.mockResolvedValueOnce has no effect, real GraphQL calls happen

### Pitfall 3: requestContext.getStore() Returns Undefined in Tests
**What goes wrong:** The log.info() call in searchPages() does nothing because requestContext.getStore() returns undefined
**Why it happens:** The test didn't wrap the API call inside requestContext.run()
**How to avoid:** For the observability test, wrap the api.searchPages() call inside requestContext.run() with a pino logger
**Warning signs:** No log entries captured even though metadata fallback clearly ran

### Pitfall 4: Log Entry at Wrong Point in searchPages Flow
**What goes wrong:** The log fires on the zero-result path but not on the under-limit path, or vice versa
**Why it happens:** searchPages() has TWO paths that invoke metadata fallback: (1) zero GraphQL results (line 248-256), and (2) resolved.length < limit (lines 305-311). The log must be added to BOTH paths.
**How to avoid:** Add the log emission inside both code paths, or refactor the metadata merge into a shared helper that logs. The simplest approach: add the log after each metadata result merge, conditioned on metadataHits > 0.
**Warning signs:** Test passes for one scenario but fails for the other

### Pitfall 5: Version String in Wrong Place
**What goes wrong:** Version bump applied to package.json but not to McpServer constructor
**Why it happens:** package.json shows "2.4.0" but McpServer constructor in mcp-tools.ts has "2.6.0" -- they are independent
**How to avoid:** The version bump target is `src/mcp-tools.ts` line 30: `version: "2.6.0"` --> `version: "2.7.0"`. package.json version is a separate concern.
**Warning signs:** MCP initialize response still shows old version

## Code Examples

### Where to Add the Info Log (searchPages method)

The log must be added in two places in `src/api.ts`:

**Path 1 -- Zero GraphQL results (lines 248-256):**
```typescript
// After line 251: const finalResults = metadataResults.slice(0, limit);
// Add log before the return statement:
if (finalResults.length > 0) {
  const ctx = requestContext.getStore();
  ctx?.log.info(
    { query, metadataHits: finalResults.length, totalResolved: finalResults.length },
    "Metadata fallback supplemented search results"
  );
}
```

**Path 2 -- Under-limit with existing results (lines 305-311):**
```typescript
// After line 309: resolved.push(...metadataResults.slice(0, remainingSlots));
// Add log before totalHits adjustment:
const metadataHits = Math.min(metadataResults.length, remainingSlots);
if (metadataHits > 0) {
  const ctx = requestContext.getStore();
  ctx?.log.info(
    { query, metadataHits, totalResolved: resolved.length },
    "Metadata fallback supplemented search results"
  );
}
```

### Tool Description Update Location

```typescript
// Source: src/mcp-tools.ts line 191-193
// Current:
description:
  "Search Wiki.js pages by keyword query. Returns matching pages with metadata and content excerpts. Only searches published pages (unpublished pages are not indexed). Note: recently published pages may take a moment to appear in search results due to indexing delay. Use get_page with a result's ID to retrieve the full page content.",

// After: append one sentence before the final sentence about get_page:
// "Also matches against page paths, titles, and descriptions for acronyms and short tokens."
```

### Version Bump Location

```typescript
// Source: src/mcp-tools.ts line 29-30
const mcpServer = new McpServer({
  name: "wikijs-mcp",
  version: "2.6.0",  // --> "2.7.0"
}, {
```

### Test for Tool Description Keywords

```typescript
// In tests/metadata-fallback.test.ts
import { createMcpServer } from "../src/mcp-tools.js";

describe("search_pages tool description", () => {
  it("mentions path, title, and description matching", () => {
    // Access registered tool descriptions from McpServer
    // The description is a string literal -- verify keywords
    // Option: import the source file and grep, or create server and inspect
  });
});
```

Note: The McpServer SDK may not expose a public API to read back registered tool descriptions. The simplest verification approach is to read the source file content in the test or use a snapshot assertion. Alternatively, since this is a static string, a source-level test that imports and checks the description would work. The planner should decide the exact approach.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| vi.mock with jest-style module factory | vi.mock with class return (ESM) | vitest 1.x+ | Must use `vi.mock()` not `jest.mock()` |
| console.log spy for log testing | Pino stream capture with JSON parse | Established in codebase | Structured assertions on log fields |

**Deprecated/outdated:**
- None relevant to this phase

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.1 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/metadata-fallback.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OBSV-01 | Info log emitted with query, metadataHits, totalResolved when fallback adds results | unit | `npx vitest run tests/metadata-fallback.test.ts -t "log"` | Wave 0 |
| OBSV-01 (negative) | No log emitted when fallback is not needed (enough GraphQL results) | unit | `npx vitest run tests/metadata-fallback.test.ts -t "no metadata fallback"` | Wave 0 |
| TOOL-01 | search_pages description contains "path", "title", "description" keywords | unit | `npx vitest run tests/metadata-fallback.test.ts -t "description"` | Wave 0 |
| META-02 | Case-insensitive matching -- "coa" matches "COA" path | unit | `npx vitest run tests/metadata-fallback.test.ts -t "case"` | Wave 0 |
| META-03 | Deduplication by page ID | unit | `npx vitest run tests/metadata-fallback.test.ts -t "dedup"` | Wave 0 |
| META-04 | Unpublished pages excluded from metadata results | unit | `npx vitest run tests/metadata-fallback.test.ts -t "unpublished"` | Wave 0 |
| META-05 | Total results capped at requested limit | unit | `npx vitest run tests/metadata-fallback.test.ts -t "limit"` | Wave 0 |
| META-06 | totalHits adjusted via Math.max | unit | `npx vitest run tests/metadata-fallback.test.ts -t "totalHits"` | Wave 0 |
| INTG-01 | Single pages.list call shared between resolveViaPagesList and searchPagesByMetadata | unit | `npx vitest run tests/metadata-fallback.test.ts -t "data sharing"` | Wave 0 |
| INTG-02 | Zero GraphQL results triggers metadata fallback | unit | `npx vitest run tests/metadata-fallback.test.ts -t "zero"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/metadata-fallback.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/metadata-fallback.test.ts` -- new dedicated test file (covers OBSV-01, TOOL-01, and test matrix)
- No framework install needed -- vitest 4.1.1 already configured
- No shared fixtures needed -- test uses self-contained mock pattern from api.test.ts

## Open Questions

1. **McpServer tool description introspection**
   - What we know: Tool descriptions are string literals passed to `registerTool()`. The MCP SDK may not expose a public getter for registered tool descriptions.
   - What's unclear: Whether McpServer has a `tools` or `listTools()` method that returns registered tool metadata including descriptions.
   - Recommendation: Two options: (a) create an McpServer instance and call the MCP `tools/list` method to get descriptions, or (b) use a simpler source-level assertion by importing mcp-tools.ts and inspecting the description string directly (e.g., by reading the source file in test). Option (b) is fragile. The planner should investigate the McpServer API or use a functional approach -- send a `tools/list` JSON-RPC call through the test app and verify the description in the response.

2. **Overlap with existing api.test.ts metadata fallback tests**
   - What we know: api.test.ts already has 12 metadata fallback tests (lines 419-652) covering META-01 through META-06, INTG-01, INTG-02, ranking, graceful degradation, path matches, and zero-result fetching.
   - What's unclear: Whether the new tests/metadata-fallback.test.ts should duplicate these or only add the NEW scenarios (observability log, negative test, case-insensitivity with both "coa"/"COA", tool description).
   - Recommendation: CONTEXT.md locks the test matrix. The new file should contain the FULL locked matrix plus the observability and description tests. Some tests will overlap with api.test.ts -- this is intentional per user decision to have a dedicated, self-contained test file.

## Sources

### Primary (HIGH confidence)
- `src/api.ts` -- current searchPages() implementation with both metadata fallback paths
- `src/mcp-tools.ts` -- current tool descriptions and version string
- `src/request-context.ts` -- AsyncLocalStorage context shape
- `src/tool-wrapper.ts` -- structured log field patterns
- `tests/api.test.ts` -- vi.mock pattern and metadata fallback test helpers
- `tests/observability.test.ts` -- createLogCapture() pattern and requestContext.run() in tests
- `vitest.config.ts` -- test environment configuration

### Secondary (MEDIUM confidence)
- Pino log levels: 10=trace, 20=debug, 30=info, 40=warn, 50=error (verified in observability.test.ts assertions)

### Tertiary (LOW confidence)
- McpServer tool description introspection API -- not verified whether the SDK exposes a getter

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in project, versions verified in package.json
- Architecture: HIGH -- all patterns copied from existing codebase files with line numbers
- Pitfalls: HIGH -- identified from actual code analysis of searchPages() dual-path and established test patterns

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable -- no dependency changes expected)
