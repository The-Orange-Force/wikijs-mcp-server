# Phase 7: Wire Tool Observability - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Connect the existing `wrapToolHandler()` from `src/tool-wrapper.ts` to all 17 MCP tool registrations in `src/mcp-tools.ts`. When complete, every production tool invocation logs authenticated user identity (userId, username) and execution timing through the requestContext AsyncLocalStorage established in `mcp-routes.ts`.

</domain>

<decisions>
## Implementation Decisions

### Wrapping approach
- Wrap each handler inline at the `registerTool()` call site — `wrapToolHandler("tool_name", async (args) => { ... })`
- Extract tool name strings to `const` declarations at the top of `mcp-tools.ts` — used by both `registerTool()` and `wrapToolHandler()` to avoid duplication
- Add `import { wrapToolHandler } from "./tool-wrapper.js"` alongside existing local imports
- No helper abstraction over `registerTool()` — keep SDK API usage direct

### Log content tuning
- Info-level log per invocation: `{ toolName, duration, userId, username }` (existing behavior, unchanged)
- Add debug-level log BEFORE invocation: `{ toolName, args }` — shows what was requested even if handler crashes
- Debug args log is a separate log line from the info timing log — clean separation for filtering
- Do NOT log tool results (args only at debug level) — results can be large page content
- Keep existing error-level log on handler failure unchanged

### Testing strategy
- Integration test: POST /mcp with real tool calls through the MCP stack, assert log output contains toolName + duration + userId
- Test 3 representative tools across categories (one page tool, one search tool, one admin tool) — not all 17
- Unit test in observability.test.ts for the new debug-level args logging behavior
- Existing wrapToolHandler unit tests remain valid — extend, don't replace

### Claude's Discretion
- Which 3 specific tools to use in integration tests
- Exact const naming convention for tool name constants
- Whether debug args log needs truncation for very large args

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. All decisions followed recommended patterns with emphasis on clean log separation and debuggability.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/tool-wrapper.ts`: Fully built `wrapToolHandler()` with `performance.now()` timing, `requestContext.getStore()` for identity — needs minor enhancement for debug-level args logging
- `src/request-context.ts`: `AsyncLocalStorage<RequestContext>` with correlationId, userId, username, log fields
- `tests/observability.test.ts`: Existing test harness with pino log capture, wrapToolHandler unit tests, buildTestApp helper with local JWKS

### Established Patterns
- ESM modules throughout (`./tool-wrapper.js` import paths)
- Fastify pino logger with child bindings for request-scoped fields
- `requestContext.run()` in `mcp-routes.ts` wraps `transport.handleRequest()` — context already propagates to tool handlers
- All 17 tool handlers use try/catch returning `{ isError: true }` — wrapToolHandler wraps outside this

### Integration Points
- `src/mcp-tools.ts`: All 17 `registerTool()` calls need wrapping — this is the only file that changes structurally
- `src/tool-wrapper.ts`: Needs debug-level args log added before handler invocation
- `tests/observability.test.ts`: Extend with integration tests and debug args unit test

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-wire-tool-observability*
*Context gathered: 2026-03-24*
