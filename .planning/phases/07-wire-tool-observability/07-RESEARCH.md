# Phase 7: Wire Tool Observability - Research

**Researched:** 2026-03-24
**Domain:** MCP tool handler wrapping, structured logging, AsyncLocalStorage context propagation
**Confidence:** HIGH

## Summary

Phase 7 is a wiring/integration phase with minimal new code. The core task is wrapping all 17 MCP tool handler callbacks in `src/mcp-tools.ts` with the existing `wrapToolHandler()` from `src/tool-wrapper.ts`, and adding a debug-level args log to the wrapper itself. All infrastructure is already built: `wrapToolHandler()` reads `requestContext.getStore()` for user identity/timing, and the `POST /mcp` route in `mcp-routes.ts` already establishes the AsyncLocalStorage context via `requestContext.run()`.

The secondary task is adding a debug-level log line BEFORE handler invocation (logging `toolName` and `args`) and extending the existing test suite in `tests/observability.test.ts` with integration tests that verify end-to-end log output through the real MCP stack.

**Primary recommendation:** This is a mechanical wrapping exercise. Extract tool name strings to constants, wrap each handler with `wrapToolHandler()`, add the debug log line to `tool-wrapper.ts`, and write 2-3 focused tests. No new libraries or architectural patterns needed.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Wrap each handler inline at the `registerTool()` call site -- `wrapToolHandler("tool_name", async (args) => { ... })`
- Extract tool name strings to `const` declarations at the top of `mcp-tools.ts` -- used by both `registerTool()` and `wrapToolHandler()` to avoid duplication
- Add `import { wrapToolHandler } from "./tool-wrapper.js"` alongside existing local imports
- No helper abstraction over `registerTool()` -- keep SDK API usage direct
- Info-level log per invocation: `{ toolName, duration, userId, username }` (existing behavior, unchanged)
- Add debug-level log BEFORE invocation: `{ toolName, args }` -- shows what was requested even if handler crashes
- Debug args log is a separate log line from the info timing log -- clean separation for filtering
- Do NOT log tool results (args only at debug level) -- results can be large page content
- Keep existing error-level log on handler failure unchanged
- Integration test: POST /mcp with real tool calls through the MCP stack, assert log output contains toolName + duration + userId
- Test 3 representative tools across categories (one page tool, one search tool, one admin tool) -- not all 17
- Unit test in observability.test.ts for the new debug-level args logging behavior
- Existing wrapToolHandler unit tests remain valid -- extend, don't replace

### Claude's Discretion
- Which 3 specific tools to use in integration tests
- Exact const naming convention for tool name constants
- Whether debug args log needs truncation for very large args

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| OBSV-01 | Validated JWT user identity (oid/preferred_username) logged with each MCP tool invocation | `wrapToolHandler()` already extracts `userId` and `username` from `requestContext.getStore()` and logs them at info level. Wrapping all 17 handlers ensures every tool invocation is covered. The `requestContext.run()` in `mcp-routes.ts` already populates these fields from `request.user.oid` and `request.user.preferred_username`. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pino (via Fastify) | ^4.27.2 (Fastify) | Structured JSON logging | Already integrated; Fastify's built-in logger |
| node:async_hooks | Node 20+ built-in | AsyncLocalStorage for request context | Already in use via `request-context.ts` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | ^4.1.1 | Test runner | All tests in this phase |
| pino (standalone) | via Fastify dep | Direct logger creation in unit tests | Log capture in test harness |

### Alternatives Considered
None -- all infrastructure exists. No new dependencies needed.

**Installation:**
No new packages required.

## Architecture Patterns

### Recommended Project Structure
No new files needed. Changes are confined to 3 existing files:
```
src/
  tool-wrapper.ts     # Add debug-level args log (1 line addition)
  mcp-tools.ts        # Wrap all 17 handlers, add tool name constants + import
tests/
  observability.test.ts  # Add integration tests + debug args unit test
```

### Pattern 1: Inline Handler Wrapping
**What:** Wrap the handler callback directly at the `registerTool()` call site
**When to use:** Every tool registration in `mcp-tools.ts`
**Example:**
```typescript
// Source: CONTEXT.md locked decision + existing tool-wrapper.ts API
const TOOL_GET_PAGE = "get_page";

mcpServer.registerTool(
  TOOL_GET_PAGE,
  {
    description: "Get a Wiki.js page by its ID",
    inputSchema: {
      id: z.number().int().positive().describe("Page ID"),
    },
  },
  wrapToolHandler(TOOL_GET_PAGE, async ({ id }) => {
    try {
      const page = await wikiJsApi.getPageById(id);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(page, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
        isError: true,
      };
    }
  }),
);
```

### Pattern 2: Zero-Argument Tool Wrapping
**What:** Two tools (`list_users`, `list_groups`) have `inputSchema: {}` and handlers with no args
**When to use:** These 2 specific tools
**Critical detail:** The MCP SDK still passes an empty object `{}` as the first argument to the callback even for empty schemas. `wrapToolHandler` receives this empty object as `args`. The handler ignores it. This works fine -- no special handling needed.
**Example:**
```typescript
const TOOL_LIST_USERS = "list_users";

mcpServer.registerTool(
  TOOL_LIST_USERS,
  {
    description: "Get list of Wiki.js users",
    inputSchema: {},
  },
  wrapToolHandler(TOOL_LIST_USERS, async () => {
    // handler body unchanged -- ignores args
  }),
);
```

### Pattern 3: Debug Args Log in Wrapper
**What:** Add a debug-level log BEFORE invoking the handler
**When to use:** In `wrapToolHandler()` in `tool-wrapper.ts`
**Example:**
```typescript
// Source: CONTEXT.md locked decision
export function wrapToolHandler<TArgs, TResult>(
  toolName: string,
  handler: (args: TArgs) => Promise<TResult>,
): (args: TArgs) => Promise<TResult> {
  return async (args: TArgs): Promise<TResult> => {
    const ctx = requestContext.getStore();
    ctx?.log.debug({ toolName, args }, `Tool request: ${toolName}`);
    const start = performance.now();
    // ... existing try/catch
  };
}
```

### Anti-Patterns to Avoid
- **Creating a custom `registerWrappedTool()` helper:** User explicitly decided "no helper abstraction over registerTool() -- keep SDK API usage direct"
- **Logging tool results:** Results can be entire page contents. Only log args at debug level, never results.
- **Wrapping outside the registerTool call:** The wrapper must be the direct callback argument to `registerTool()` so the tool name string can be shared.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Timing measurement | Manual Date.now() or custom timer | `performance.now()` already in wrapToolHandler | Sub-millisecond precision, already implemented |
| Log context propagation | Passing logger through function args | `requestContext.getStore()` AsyncLocalStorage | Already established by mcp-routes.ts, no change needed |
| Test JWT tokens | Manual JWT construction | `createTestToken()` from auth helpers | Already handles RS256 signing with local JWKS |
| Test app construction | Manual Fastify setup in each test | `buildTestApp()` from test helpers | Already wires auth, public routes, protected routes |

**Key insight:** All infrastructure is built. This phase is purely wiring existing pieces together.

## Common Pitfalls

### Pitfall 1: TypeScript Generics Mismatch with wrapToolHandler
**What goes wrong:** `wrapToolHandler` has generic signature `<TArgs, TResult>`. When wrapping inline, TypeScript may infer the wrong type for args.
**Why it happens:** The MCP SDK callback type is `(args: ShapeOutput<Args>, extra: Extra) => CallToolResult | Promise<CallToolResult>`. The existing handlers only use the first arg. `wrapToolHandler` returns `(args: TArgs) => Promise<TResult>` which the SDK accepts since `extra` is optional in practice.
**How to avoid:** Keep existing handler signatures exactly as-is. The wrapper takes the handler function reference, and TypeScript infers TArgs from the destructured parameter. Do not add explicit type annotations to the wrapper call -- let inference work.
**Warning signs:** TypeScript errors about argument count or type mismatch at `registerTool()` call sites.

### Pitfall 2: Forgetting the Extra Parameter
**What goes wrong:** The MCP SDK ToolCallback signature includes an `extra: RequestHandlerExtra` second parameter. The existing handlers ignore it.
**Why it happens:** `wrapToolHandler` is typed as `(args: TArgs) => Promise<TResult>`, which only passes `args`. When the SDK calls the callback with `(args, extra)`, the `extra` is silently dropped because JavaScript ignores extra positional arguments.
**How to avoid:** This is actually fine -- it works today and will continue to work. Do NOT try to "fix" this by adding `extra` to the wrapper. The wrapToolHandler function is intentionally simpler than the full SDK callback type.
**Warning signs:** If someone adds `extra` to wrapToolHandler signature, it breaks the existing clean API.

### Pitfall 3: Debug Log Truncation for Large Args
**What goes wrong:** `create_page` args include full page `content` (potentially very large markdown). Debug-level logging of `{ toolName, args }` would serialize the entire content.
**Why it happens:** Debug logging is verbose by design, but page content could be 100KB+.
**How to avoid:** This is a Claude's Discretion item. Options: (a) log args as-is since debug level is only enabled intentionally, (b) truncate string values in args beyond a threshold. Recommendation: log as-is. Debug level is opt-in, and pino serialization handles large objects efficiently. If truncation is desired later, it's a single-line addition.
**Warning signs:** Very large debug log entries in development when creating/updating pages.

### Pitfall 4: Integration Test Timing
**What goes wrong:** Log lines from pino stream may not be flushed when assertions run.
**Why it happens:** Pino uses async stream writes. The existing tests use `await new Promise((resolve) => setTimeout(resolve, 50))` to wait for flush.
**How to avoid:** Follow the existing pattern -- use `setTimeout(resolve, 50)` after operations that generate logs. The existing observability tests already do this.
**Warning signs:** Flaky tests where expected log entries are sometimes missing.

### Pitfall 5: Counting Exactly 17 Tools
**What goes wrong:** Missing a tool or wrapping one twice.
**Why it happens:** Manual process across a 489-line file.
**How to avoid:** Systematic approach -- the file has clear section comments. Tools by category:
  - Page tools (10): get_page, get_page_content, list_pages, search_pages, create_page, update_page, delete_page, list_all_pages, search_unpublished_pages, force_delete_page
  - Page status tools (2): get_page_status, publish_page
  - User tools (3): list_users, search_users, create_user
  - Group tools (1): list_groups
  - User management (1): update_user
**Warning signs:** `tools/list` returns a different count than expected in tests.

## Code Examples

Verified patterns from the existing codebase:

### Tool Name Constants Block (top of mcp-tools.ts)
```typescript
// Source: CONTEXT.md decision + existing tool name strings in mcp-tools.ts
const TOOL_GET_PAGE = "get_page";
const TOOL_GET_PAGE_CONTENT = "get_page_content";
const TOOL_LIST_PAGES = "list_pages";
const TOOL_SEARCH_PAGES = "search_pages";
const TOOL_CREATE_PAGE = "create_page";
const TOOL_UPDATE_PAGE = "update_page";
const TOOL_DELETE_PAGE = "delete_page";
const TOOL_LIST_ALL_PAGES = "list_all_pages";
const TOOL_SEARCH_UNPUBLISHED_PAGES = "search_unpublished_pages";
const TOOL_FORCE_DELETE_PAGE = "force_delete_page";
const TOOL_GET_PAGE_STATUS = "get_page_status";
const TOOL_PUBLISH_PAGE = "publish_page";
const TOOL_LIST_USERS = "list_users";
const TOOL_SEARCH_USERS = "search_users";
const TOOL_CREATE_USER = "create_user";
const TOOL_LIST_GROUPS = "list_groups";
const TOOL_UPDATE_USER = "update_user";
```

### Integration Test Pattern (tools/call through MCP stack)
```typescript
// Source: existing smoke.test.ts mcpPost pattern + observability.test.ts log capture
it("tools/call logs toolName, duration, userId at info level", async () => {
  // Send tools/call via POST /mcp (same pattern as smoke.test.ts)
  const res = await app.inject({
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
      method: "tools/call",
      params: { name: "get_page", arguments: { id: 1 } },
    },
  });

  expect(res.statusCode).toBe(200);

  // Wait for pino stream flush
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Assert log output
  const toolLogs = logCapture.logs.filter(
    (l) => l.level === 30 && l.toolName === "get_page",
  );
  expect(toolLogs.length).toBe(1);
  expect(toolLogs[0].duration).toBeGreaterThanOrEqual(0);
  expect(toolLogs[0].userId).toBeDefined();
  expect(toolLogs[0].username).toBeDefined();
});
```

### Debug Args Unit Test Pattern
```typescript
// Source: existing wrapToolHandler unit test pattern in observability.test.ts
it("debug-level log emitted before handler invocation with toolName and args", async () => {
  const logCapture = createLogCapture();
  const testLogger = pino({ level: "trace" }, logCapture.stream);

  const handler = async (args: { query: string }) => ({ results: [] });
  const wrapped = wrapToolHandler("search_pages", handler);

  await requestContext.run(
    {
      correlationId: "test-id",
      userId: "user-oid",
      username: "test@example.com",
      log: testLogger as unknown as FastifyBaseLogger,
    },
    async () => {
      await wrapped({ query: "test" });
    },
  );

  await new Promise((resolve) => setTimeout(resolve, 50));

  // Debug level = 20 in pino
  const debugLogs = logCapture.logs.filter(
    (l) => l.level === 20 && l.toolName === "search_pages",
  );
  expect(debugLogs.length).toBe(1);
  expect(debugLogs[0].args).toEqual({ query: "test" });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `mcpServer.tool()` | `mcpServer.registerTool()` | MCP SDK 1.27+ | The `.tool()` method is deprecated. Project already uses `registerTool()`. |

**Deprecated/outdated:**
- `McpServer.tool()` is deprecated in favor of `McpServer.registerTool()` -- project already uses the current API.

## Open Questions

1. **Debug args truncation for large payloads**
   - What we know: `create_page` and `update_page` accept full page content as args. Debug logging serializes these.
   - What's unclear: Whether production debug logs will ever be enabled for high-volume use.
   - Recommendation: Log args as-is. Debug level is opt-in. If truncation is ever needed, it can be added in a future change with a simple `JSON.stringify(args).slice(0, N)` approach.

2. **Integration test tool selection**
   - What we know: Need 3 representative tools (page, search, admin). Must use the mock WikiJsApi from buildTestApp.
   - Recommendation: Use `get_page` (page tool, simple args), `search_pages` (search tool, string + optional args), and `list_users` (admin/zero-arg tool). These cover the three categories and the two handler signatures (with-args and without-args).

3. **Pre-existing test failures in scopes.test.ts**
   - What we know: 4 tests in `tests/scopes.test.ts` fail due to scope format mismatch (`wikijs:read` vs `wikijs.read`). This is unrelated to Phase 7.
   - Recommendation: Ignore for Phase 7 scope. These failures predate this phase and affect Phase 8 (scope enforcement).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.1 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/observability.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OBSV-01 | Info log with toolName, duration, userId, username on every tool invocation | integration | `npx vitest run tests/observability.test.ts -t "tools/call logs"` | Partial -- unit tests exist, integration tests needed |
| OBSV-01 (debug) | Debug log with toolName and args before invocation | unit | `npx vitest run tests/observability.test.ts -t "debug-level"` | No -- needs new test |
| OBSV-01 (coverage) | Wrapping verified across 3 representative tool categories | integration | `npx vitest run tests/observability.test.ts -t "representative"` | No -- needs new test |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/observability.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work` (excluding pre-existing scopes.test.ts failures)

### Wave 0 Gaps
- [ ] Integration test describe block in `tests/observability.test.ts` -- covers OBSV-01 end-to-end through MCP stack
- [ ] Debug args unit test in `tests/observability.test.ts` -- covers new debug log behavior
- No framework install or config needed -- vitest already configured

## Sources

### Primary (HIGH confidence)
- `src/tool-wrapper.ts` -- existing wrapToolHandler implementation (lines 28-58)
- `src/mcp-tools.ts` -- all 17 registerTool() calls with full handler bodies (489 lines)
- `src/request-context.ts` -- AsyncLocalStorage<RequestContext> with userId, username fields
- `src/routes/mcp-routes.ts` -- requestContext.run() wrapping transport.handleRequest()
- `tests/observability.test.ts` -- existing unit tests for wrapToolHandler + log capture helper
- `tests/helpers/build-test-app.ts` -- shared test app builder with local JWKS + mock WikiJsApi
- `@modelcontextprotocol/sdk` v1.27.1 -- registerTool type signature (from node_modules d.ts)

### Secondary (MEDIUM confidence)
- `tests/smoke.test.ts` -- integration test patterns for tools/call through MCP stack
- `src/auth/__tests__/helpers.ts` -- createTestToken() for generating valid test JWTs

### Tertiary (LOW confidence)
None -- all findings verified from source code.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use, no new dependencies
- Architecture: HIGH -- pattern is directly visible in existing code, wrapper API is simple
- Pitfalls: HIGH -- verified handler signatures, type constraints, and zero-arg edge case from source

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable -- no external dependencies or fast-moving APIs)
