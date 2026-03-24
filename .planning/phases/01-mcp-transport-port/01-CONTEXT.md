# Phase 1: MCP Transport Port - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Port MCP JSON-RPC and SSE endpoints from the raw Node.js HTTP server (`lib/fixed_mcp_http_server.js`) into the Fastify TypeScript server (`src/server.ts`). After this phase, all MCP tool access goes through Fastify-managed routes using the official MCP SDK. Existing REST tool routes are removed. Legacy files are cleaned up.

</domain>

<decisions>
## Implementation Decisions

### MCP method support
- Claude Desktop only — drop Cursor-specific methods (workspace/tools, workspace/executeCommand, tools/execute)
- Standard MCP methods only: initialize, tools/list, tools/call
- Drop direct tool invocation by method name (e.g., JSON-RPC method = "search_pages")
- Target latest stable MCP protocol version (2025-03-26)
- Strict MCP spec response format — content array with text items, isError flag. No custom fields (method, result)

### REST endpoints
- Remove all individual REST tool routes (GET /get_page, POST /create_page, etc.)
- Remove GET /tools endpoint (redundant with MCP tools/list)
- Keep GET / as server info (name, version, available endpoints)
- Keep GET /health as unauthenticated diagnostic
- Final route surface: GET /, GET /health, POST /mcp, GET /mcp (MCP 2025-03-26 Streamable HTTP uses single /mcp endpoint; GET returns 405 in stateless mode)

### MCP SDK integration
- Use official @modelcontextprotocol/sdk package
- Use SDK's StreamableHTTPServerTransport for HTTP+SSE, adapted to Fastify route handlers
- Register tools using SDK's server.tool() API
- Convert tool definitions from OpenAI-style (function.name, function.parameters) to MCP SDK format using existing Zod schemas from schemas.ts

### Legacy cleanup
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

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. User consistently chose recommended/spec-compliant options, indicating preference for clean, standard-conforming implementation over backward compatibility.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/schemas.ts`: Zod schemas for all tool inputs/outputs — can be directly used with MCP SDK's server.tool() registration
- `src/api.ts`: WikiJsApi class with all GraphQL operations — tool implementations delegate to this
- `src/tools.ts`: Tool definitions with implementations (wikiJsTools, wikiJsToolsWithImpl) — implementations can be extracted and rewired to SDK tool handlers
- `src/types.ts`: TypeScript interfaces for WikiJS domain objects

### Established Patterns
- Fastify server with dotenv config loading (src/server.ts)
- Zod validation for tool params and results (src/schemas.ts)
- WikiJsApi class as single GraphQL client (src/api.ts)
- ESM modules throughout ("type": "module" in package.json)

### Integration Points
- Server entry point: src/server.ts — MCP routes will be added here (or in a dedicated routes file)
- Tool implementations: src/tools.ts wikiJsToolsWithImpl array — each tool's .implementation function needs to be wired into SDK handlers
- WikiJS API: src/api.ts WikiJsApi class — instantiated in server.ts, passed to tool handlers

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-mcp-transport-port*
*Context gathered: 2026-03-24*
