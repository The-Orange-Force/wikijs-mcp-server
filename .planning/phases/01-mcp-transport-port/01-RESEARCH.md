# Phase 1: MCP Transport Port - Research

**Researched:** 2026-03-24
**Domain:** MCP SDK integration, Fastify HTTP framework, Streamable HTTP transport
**Confidence:** HIGH

## Summary

This phase ports the MCP JSON-RPC and SSE endpoints from a raw Node.js HTTP server (`lib/fixed_mcp_http_server.js`) into the existing Fastify TypeScript server (`src/server.ts`), using the official `@modelcontextprotocol/sdk` package. The existing codebase already has Zod schemas for all tool inputs in `src/schemas.ts` and tool implementations in `src/tools.ts` -- these can be directly rewired to the SDK's `registerTool()` API. The legacy code has significant duplication (a standalone `WikiJsAPI` class in tools.ts duplicating `WikiJsApi` in api.ts) and non-standard MCP response formatting that will be eliminated.

The core integration pattern is well-documented: create an `McpServer` instance, register tools using `server.registerTool()` with Zod schemas for input validation, create a `StreamableHTTPServerTransport` and wire it to Fastify route handlers via `request.raw` and `reply.raw`. The `fastify-mcp` plugin provides a reference implementation confirming this pattern works without `reply.hijack()` -- the transport's `handleRequest()` method directly manages the Node.js response object.

**Primary recommendation:** Use `@modelcontextprotocol/sdk` v1.27.1 in stateless mode (`sessionIdGenerator: undefined`) with Fastify route handlers that pass `request.raw`/`reply.raw` to `StreamableHTTPServerTransport.handleRequest()`. Register all 17 existing tools using the SDK's `registerTool()` API with the Zod schemas already defined in `schemas.ts`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Claude Desktop only -- drop Cursor-specific methods (workspace/tools, workspace/executeCommand, tools/execute)
- Standard MCP methods only: initialize, tools/list, tools/call
- Drop direct tool invocation by method name (e.g., JSON-RPC method = "search_pages")
- Target latest stable MCP protocol version (2025-03-26)
- Strict MCP spec response format -- content array with text items, isError flag. No custom fields (method, result)
- Remove all individual REST tool routes (GET /get_page, POST /create_page, etc.)
- Remove GET /tools endpoint (redundant with MCP tools/list)
- Keep GET / as server info (name, version, available endpoints)
- Keep GET /health as unauthenticated diagnostic
- Final route surface: GET /, GET /health, POST /mcp, GET /mcp/events
- Use official @modelcontextprotocol/sdk package
- Use SDK's StreamableHTTPServerTransport for HTTP+SSE, adapted to Fastify route handlers
- Register tools using SDK's server.tool() API (note: actual API is `registerTool()` in v1.27)
- Convert tool definitions from OpenAI-style (function.name, function.parameters) to MCP SDK format using existing Zod schemas from schemas.ts
- Delete lib/fixed_mcp_http_server.js (fully replaced)
- Delete lib/mcp_client.js and lib/mcp_wrapper.js (depend on old HTTP server)
- Keep lib/mcp_wikijs_stdin.js (STDIO transport still used for editor integration)
- Delete scripts/test_mcp.js and scripts/test_mcp_stdin.js (test the old server)
- Update shell scripts (start_http.sh, stop_server.sh, etc.) to point to unified Fastify server
- Remove express and @types/express from package.json (unused)
- Delete src/agent.ts (REST API client, obsolete with MCP-only access)
- Delete src/demo.ts (depends on agent.ts and REST API)

### Claude's Discretion
- Fastify-to-StreamableHTTPServerTransport wiring approach
- Tool definition conversion strategy (bulk rewrite vs incremental)
- Error handling patterns for JSON-RPC error codes
- SSE connection lifecycle management

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TRNS-01 | MCP JSON-RPC handler (POST /mcp) ported from lib/fixed_mcp_http_server.js into Fastify TypeScript server | StreamableHTTPServerTransport.handleRequest() wired to Fastify POST route via request.raw/reply.raw; SDK handles all JSON-RPC parsing internally |
| TRNS-02 | SSE events endpoint (GET /mcp/events) ported into Fastify TypeScript server | StreamableHTTPServerTransport also handles GET requests for SSE streams; in stateless mode, GET returns 405 Method Not Allowed per spec (no long-lived sessions). The user's CONTEXT.md specifies GET /mcp/events as a route, but the Streamable HTTP spec merges this into GET /mcp. See Open Questions. |
| TRNS-03 | MCP initialize, tools/list, and tools/call methods work correctly after port | SDK's McpServer + registerTool() handles these methods automatically; tool implementations delegate to existing WikiJsApi class |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @modelcontextprotocol/sdk | 1.27.1 | MCP server SDK with McpServer, StreamableHTTPServerTransport | Official SDK, handles JSON-RPC framing, protocol negotiation, tool dispatch |
| fastify | ^4.29.1 | HTTP framework (already in project) | Already in use; provides request.raw/reply.raw for transport integration |
| zod | ^3.25.17 | Schema validation (already in project) | Already in use; SDK v1.27.1 accepts zod ^3.25 as peer dependency |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| graphql-request | ^6.1.0 | GraphQL client for WikiJS API | Already in project; WikiJsApi class uses it |
| dotenv | ^16.5.0 | Environment variable loading | Already in project; server config |

### Removals (per user decision)
| Package | Reason |
|---------|--------|
| express | Unused; Fastify is the server framework |
| @types/express | Dev dependency for removed express |
| cors | Only used by legacy HTTP server; MCP transport handles its own headers |
| node-fetch | Legacy HTTP server dependency; Fastify + SDK don't need it |
| uuid | Only used in legacy code; SDK generates session IDs internally |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Direct SDK integration | fastify-mcp plugin | Plugin adds abstraction but hides control; direct integration is simpler for this project's needs and allows easier auth hook addition in Phase 5 |
| Stateless transport | Stateful transport | Stateless is simpler, no session management needed; Claude Desktop reconnects per-request anyway. Can add stateful later if needed. |

**Installation:**
```bash
npm install @modelcontextprotocol/sdk@^1.27.1
npm uninstall express @types/express cors node-fetch uuid
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  server.ts          # Fastify server + MCP route handlers (modified)
  mcp-tools.ts       # NEW: MCP SDK tool registration using registerTool() + Zod schemas
  api.ts             # WikiJsApi class (unchanged)
  schemas.ts         # Zod schemas (unchanged, consumed by mcp-tools.ts)
  types.ts           # TypeScript interfaces (unchanged)
  tools.ts           # DEPRECATED: will be gutted or deleted (OpenAI-format definitions + duplicate WikiJsAPI class)
```

### Pattern 1: Fastify-to-StreamableHTTPServerTransport Wiring

**What:** Pass raw Node.js request/response objects from Fastify to the SDK transport.
**When to use:** For POST /mcp and GET /mcp routes.

```typescript
// Source: fastify-mcp plugin (https://github.com/haroldadmin/fastify-mcp)
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

// Stateless mode: new transport per request, server.connect() per request
fastify.post("/mcp", async (request, reply) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
  });

  reply.raw.on("close", async () => {
    await transport.close();
  });

  await mcpServer.connect(transport);
  await transport.handleRequest(request.raw, reply.raw, request.body);
});

// GET /mcp for SSE stream (in stateless mode, return 405)
fastify.get("/mcp", async (request, reply) => {
  reply.status(405).send({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed." },
    id: null,
  });
});
```

**Critical detail:** The transport's `handleRequest()` writes directly to the raw Node.js `ServerResponse`. Fastify MUST NOT attempt to send its own response after this call. In stateless mode, the response completes within the `handleRequest()` call for POST requests.

### Pattern 2: MCP Tool Registration with Zod Schemas

**What:** Register tools using `server.registerTool()` with Zod schemas for input validation.
**When to use:** For converting existing tool definitions to MCP SDK format.

```typescript
// Source: official MCP docs (https://modelcontextprotocol.io/docs/develop/build-server)
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WikiJsApi } from "./api.js";

const mcpServer = new McpServer({
  name: "wikijs-mcp",
  version: "1.3.0",
});

// Example: register get_page tool using existing Zod schema
mcpServer.registerTool(
  "get_page",
  {
    description: "Get a Wiki.js page by its ID",
    inputSchema: {
      id: z.number().int().positive().describe("Page ID in Wiki.js"),
    },
  },
  async ({ id }) => {
    try {
      const page = await wikiJsApi.getPageById(id);
      return {
        content: [{ type: "text", text: JSON.stringify(page, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${String(error)}` }],
        isError: true,
      };
    }
  }
);
```

**Key difference from legacy code:** The SDK's `registerTool()` expects `inputSchema` as a flat object of Zod types (NOT wrapped in `z.object()`). The SDK wraps them internally. Tool handlers return `{ content: [...], isError?: boolean }` -- no custom `method` or `result` fields.

### Pattern 3: MCP Response Format (Strict Spec Compliance)

**What:** All tool results must follow MCP spec format.
**When to use:** Every tool handler return value.

```typescript
// CORRECT: MCP spec response format
return {
  content: [
    { type: "text", text: JSON.stringify(result, null, 2) }
  ],
};

// CORRECT: Error response
return {
  content: [
    { type: "text", text: `Error performing operation: ${error.message}` }
  ],
  isError: true,
};

// WRONG: Legacy format with custom fields (what the old server did)
return {
  method: "get_page",           // REMOVE
  content: [{ type: "text", text: "..." }],
  result: rawData,              // REMOVE
};
```

### Anti-Patterns to Avoid
- **Calling reply.send() after transport.handleRequest():** The transport already wrote to reply.raw. Fastify will throw if you also try to send. Do NOT return a value from the route handler for MCP routes.
- **Using reply.hijack():** Not needed. The fastify-mcp reference implementation works without it. The transport manages the response lifecycle via reply.raw directly.
- **Creating McpServer per request in stateless mode:** Create ONE McpServer instance at startup, register all tools on it. Create a new transport per request and connect it to the existing server. The `server.connect(transport)` call is lightweight.
- **Wrapping inputSchema in z.object():** The `registerTool()` API expects a raw object of Zod types as the inputSchema shape, NOT a z.object() wrapper.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON-RPC parsing/routing | Custom method dispatch (like the legacy server's if/else chain) | SDK's McpServer internal dispatch | JSON-RPC 2.0 has edge cases (batching, error codes, notification vs request); SDK handles all of them |
| SSE streaming | Manual `res.write("event: ...\ndata: ...\n\n")` | StreamableHTTPServerTransport | SDK handles SSE framing, connection lifecycle, Content-Type headers |
| Tool schema conversion | Manual JSON Schema -> Zod conversion | `registerTool()` with Zod shapes directly | SDK converts Zod to JSON Schema internally via zod-to-json-schema |
| Session ID generation | `uuid` or `crypto.randomUUID()` | SDK's built-in sessionIdGenerator (when stateful) or undefined (stateless) | SDK manages Mcp-Session-Id header automatically |
| Protocol version negotiation | Manual protocolVersion checking | SDK's initialize handler | SDK automatically negotiates with client |

**Key insight:** The entire 900-line `fixed_mcp_http_server.js` is replaced by approximately 60 lines of Fastify route setup + MCP tool registration. The SDK handles JSON-RPC framing, method routing, error responses, SSE streaming, and protocol negotiation internally.

## Common Pitfalls

### Pitfall 1: Fastify Response Lifecycle Conflict
**What goes wrong:** Fastify throws "Reply was already sent" error because both the transport and Fastify try to write the response.
**Why it happens:** `transport.handleRequest()` writes directly to `reply.raw` (the Node.js ServerResponse), then Fastify also tries to finalize the response.
**How to avoid:** The route handler should NOT return a value and should NOT call `reply.send()`. The pattern `async (request, reply) => { await transport.handleRequest(...) }` works because returning undefined from an async handler prevents Fastify from auto-sending. However, if Fastify complains, use `reply.hijack()` before calling `handleRequest()`.
**Warning signs:** "Reply was already sent" errors in logs.

### Pitfall 2: Request Body Parsing Mismatch
**What goes wrong:** Transport receives raw string body instead of parsed JSON, or double-parsed body.
**Why it happens:** Fastify automatically parses JSON bodies via its content-type parser. The transport's `handleRequest()` accepts an optional `parsedBody` parameter.
**How to avoid:** Pass `request.body` as the third argument to `handleRequest(request.raw, reply.raw, request.body)`. This provides the pre-parsed body to the transport, avoiding double-parsing.
**Warning signs:** "Parse error" JSON-RPC responses, or "unexpected token" errors.

### Pitfall 3: Zod Schema Shape vs z.object()
**What goes wrong:** Tool input validation silently fails or generates empty JSON Schema.
**Why it happens:** `registerTool()` expects `inputSchema` as `{ fieldName: z.string(), ... }` (a raw shape object), NOT `z.object({ fieldName: z.string() })`. The SDK internally normalizes this.
**How to avoid:** Pass the shape directly: `inputSchema: { id: z.number().int().positive() }`. Do NOT pass `inputSchema: GetPageParamsSchema` (which is a z.object).
**Warning signs:** Tools/list returns empty `inputSchema` for tools; tool calls fail with missing parameters.

### Pitfall 4: Duplicate WikiJsAPI Class
**What goes wrong:** Confusion between two API classes: `WikiJsApi` in `src/api.ts` and `WikiJsAPI` in `src/tools.ts`.
**Why it happens:** The tools.ts file contains a standalone `WikiJsAPI` class (1200+ lines) that duplicates `src/api.ts`. The implementations object at line 1673 uses this duplicate class.
**How to avoid:** Use ONLY `WikiJsApi` from `src/api.ts` for new tool handlers. Delete or ignore the duplicate class in tools.ts.
**Warning signs:** Different behavior between server routes and tool calls; different GraphQL queries for the same operation.

### Pitfall 5: Missing Zod Schemas for Some Tools
**What goes wrong:** Some tools listed in `wikiJsToolsWithImpl` do not have corresponding Zod schemas in `schemas.ts`.
**Why it happens:** The project has 17 tools but `schemas.ts` only has schemas for 12 tools. Missing schemas: `list_all_pages`, `search_unpublished_pages`, `force_delete_page`, `get_page_status`, `publish_page`, `list_users` (input), `list_groups` (input).
**How to avoid:** Create new Zod schemas for missing tools, or define inputSchema inline in the `registerTool()` call.
**Warning signs:** Tool registration fails or has no input validation.

### Pitfall 6: STDIO Transport Must Keep Working
**What goes wrong:** Breaking `lib/mcp_wikijs_stdin.js` by removing dependencies it relies on.
**Why it happens:** The STDIO transport imports from `../dist/tools.js` and `../dist/schemas.js`. If tools.ts is gutted, the STDIO server breaks.
**How to avoid:** Either: (a) keep a minimal tools.ts that exports the arrays the STDIO server needs, or (b) update the STDIO server to use the new module structure, or (c) leave the STDIO server unchanged for now since it's a separate concern. Option (c) is safest -- keep tools.ts exports working even if the data is no longer used by the Fastify server.
**Warning signs:** `npm run server:stdio` fails to start.

## Code Examples

### Complete Stateless MCP Server with Fastify

```typescript
// Source: Combination of official SDK docs + fastify-mcp plugin pattern
import Fastify from "fastify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { WikiJsApi } from "./api.js";

const fastify = Fastify({ logger: true });

// Create WikiJS API client
const wikiJsApi = new WikiJsApi(
  process.env.WIKIJS_BASE_URL || "http://localhost:3000",
  process.env.WIKIJS_TOKEN || ""
);

// Create MCP server (one instance, reused across requests)
const mcpServer = new McpServer({
  name: "wikijs-mcp",
  version: "1.3.0",
});

// Register tools (example for get_page)
mcpServer.registerTool(
  "get_page",
  {
    description: "Get a Wiki.js page by its ID",
    inputSchema: {
      id: z.number().int().positive().describe("Page ID"),
    },
  },
  async ({ id }) => {
    try {
      const page = await wikiJsApi.getPageById(id);
      return {
        content: [{ type: "text", text: JSON.stringify(page, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${String(error)}` }],
        isError: true,
      };
    }
  }
);

// MCP POST endpoint (JSON-RPC handler)
fastify.post("/mcp", async (request, reply) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  reply.raw.on("close", async () => {
    await transport.close();
  });

  await mcpServer.connect(transport);
  await transport.handleRequest(request.raw, reply.raw, request.body);
});

// MCP GET endpoint (SSE - 405 in stateless mode)
fastify.get("/mcp", async (request, reply) => {
  reply.status(405).send({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed." },
    id: null,
  });
});

// Health check (unchanged)
fastify.get("/health", async () => ({ status: "ok" }));

// Server info (unchanged)
fastify.get("/", async () => ({
  name: "wikijs-mcp",
  version: "1.3.0",
  endpoints: {
    "GET /": "Server info",
    "GET /health": "Health check",
    "POST /mcp": "MCP JSON-RPC endpoint",
  },
}));

await fastify.listen({ port: 3200, host: "0.0.0.0" });
```

### Tool Registration Pattern for All 17 Tools

```typescript
// Pattern for tools with parameters
mcpServer.registerTool(
  "search_pages",
  {
    description: "Search pages in Wiki.js",
    inputSchema: {
      query: z.string().min(1).describe("Search query"),
      limit: z.number().int().positive().optional().describe("Max results"),
    },
  },
  async ({ query, limit }) => {
    const results = await wikiJsApi.searchPages(query, limit);
    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
    };
  }
);

// Pattern for tools WITHOUT parameters (empty schema)
mcpServer.registerTool(
  "list_users",
  {
    description: "Get list of Wiki.js users",
    inputSchema: {},  // empty object for no-param tools
  },
  async () => {
    const users = await wikiJsApi.getUsersList();
    return {
      content: [{ type: "text", text: JSON.stringify(users, null, 2) }],
    };
  }
);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| HTTP+SSE (separate GET /sse + POST /message) | Streamable HTTP (single endpoint POST+GET /mcp) | MCP spec 2025-03-26 | Single endpoint simplifies routing; SSE optional |
| server.tool() on McpServer | server.registerTool() on McpServer | SDK v1.26+ | registerTool is the recommended API; .tool() is deprecated |
| Custom JSON-RPC parsing | SDK handles internally | Always (when using SDK) | No manual method dispatch needed |
| protocolVersion "2023-07-01" or "2024-11-05" | protocolVersion "2025-03-26" | March 2025 | Streamable HTTP, OAuth framework, JSON-RPC batching |

**Deprecated/outdated:**
- `server.tool()`: Deprecated in favor of `server.registerTool()` (SDK v1.26+)
- HTTP+SSE transport (separate /sse and /message endpoints): Replaced by Streamable HTTP in MCP spec 2025-03-26
- Cursor-specific methods (`workspace/tools`, `workspace/executeCommand`, `tools/execute`): Non-standard, dropped per user decision

## Open Questions

1. **GET /mcp/events vs GET /mcp**
   - What we know: The MCP 2025-03-26 spec defines a SINGLE endpoint (`/mcp`) that handles both POST (JSON-RPC) and GET (SSE). There is no separate `/mcp/events` endpoint in the spec. The user's CONTEXT.md lists `GET /mcp/events` as a route.
   - What's unclear: Whether to use spec-compliant `GET /mcp` or the user-specified `GET /mcp/events`.
   - Recommendation: Use `GET /mcp` per spec. In stateless mode, GET returns 405 anyway. The user's `/mcp/events` was likely based on the legacy server's pattern. **Planner should note this discrepancy and handle via the single /mcp endpoint.** Claude Desktop connects via POST /mcp and does not rely on a separate /mcp/events path.

2. **Fastify response lifecycle with transport.handleRequest()**
   - What we know: The fastify-mcp plugin uses `request.raw`/`reply.raw` WITHOUT `reply.hijack()`, and it works. The transport writes directly to the raw ServerResponse.
   - What's unclear: Whether Fastify v4's async handler lifecycle interferes. The handler returns `undefined` (no explicit return), which may or may not trigger Fastify's auto-reply.
   - Recommendation: Test without `reply.hijack()` first. If Fastify throws "Reply already sent", add `reply.hijack()` before `handleRequest()`. The `onResponse` hook still fires after hijack, so logging is not affected.

3. **tools.ts refactoring scope**
   - What we know: tools.ts is ~2100 lines containing OpenAI-format definitions, a duplicate WikiJsAPI class, and implementations. The new approach registers tools directly via SDK.
   - What's unclear: How much of tools.ts to keep vs delete, given lib/mcp_wikijs_stdin.js imports from it.
   - Recommendation: Create new `src/mcp-tools.ts` for SDK registrations. Keep tools.ts compiling for now (STDIO server dependency). Mark for cleanup in a future phase or as a follow-up task.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected -- no test framework configured |
| Config file | none -- see Wave 0 |
| Quick run command | N/A |
| Full suite command | N/A |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TRNS-01 | POST /mcp accepts JSON-RPC, returns valid response | integration | Manual curl test or smoke script | No -- Wave 0 |
| TRNS-02 | GET /mcp returns 405 (stateless) or SSE stream | integration | Manual curl test or smoke script | No -- Wave 0 |
| TRNS-03 | initialize, tools/list, tools/call work correctly | integration | Manual curl test or smoke script | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** Manual curl smoke test against running server
- **Per wave merge:** Full smoke test of all 3 MCP methods + at least one tool call
- **Phase gate:** All 3 requirements verified via curl/MCP client before phase completion

### Wave 0 Gaps
- [ ] No test framework installed (jest, vitest, or similar)
- [ ] No integration test infrastructure for HTTP endpoint testing
- [ ] `scripts/test_mcp_smoke.sh` -- basic curl-based smoke test for POST /mcp with initialize, tools/list, tools/call
- [ ] Framework install would be: `npm install -D vitest` (lightweight, ESM-native, TypeScript-friendly)

Note: Given this is a transport port (behavior must be identical), the primary validation is smoke testing against a running server with curl or an MCP client. Full unit test infrastructure is not critical for this phase but should be established.

## Sources

### Primary (HIGH confidence)
- MCP specification 2025-03-26 - Streamable HTTP transport: https://modelcontextprotocol.io/specification/2025-03-26/basic/transports
- Official MCP TypeScript SDK build-server guide: https://modelcontextprotocol.io/docs/develop/build-server
- MCP TypeScript SDK server docs (registerTool API): https://ts.sdk.modelcontextprotocol.io/documents/server.html
- fastify-mcp plugin source (Fastify integration pattern): https://github.com/haroldadmin/fastify-mcp/blob/main/src/streamable-http.ts
- npm @modelcontextprotocol/sdk v1.27.1 package metadata (dependencies, exports, peer deps)
- Fastify Reply documentation (reply.raw, reply.hijack): https://fastify.dev/docs/latest/Reference/Reply/

### Secondary (MEDIUM confidence)
- Koyeb tutorial for StreamableHTTP deployment: https://www.koyeb.com/tutorials/deploy-remote-mcp-servers-to-koyeb-using-streamable-http-transport
- Claude Desktop remote MCP server configuration: https://support.claude.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers

### Tertiary (LOW confidence)
- SDK registerTool vs tool deprecation status: inferred from issue #1284, docs/server.md, and official build-server tutorial all using `registerTool()`. Needs runtime verification.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official SDK, verified npm versions, compatible peer dependencies
- Architecture: HIGH - Pattern verified via fastify-mcp plugin source code (actual working Fastify integration)
- Pitfalls: HIGH - Identified from actual code analysis of existing codebase + SDK documentation
- Tool registration API: MEDIUM - `registerTool()` confirmed in official tutorial but `tool()` also exists as deprecated; both may work

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (SDK v1.x is stable; spec 2025-03-26 is the current version)
