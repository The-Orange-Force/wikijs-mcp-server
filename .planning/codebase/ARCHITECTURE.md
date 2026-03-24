# Architecture

**Analysis Date:** 2026-03-24

## Pattern Overview

**Overall:** Layered Client-Server MCP (Model Context Protocol) Architecture with abstraction of Wiki.js GraphQL API

**Key Characteristics:**
- Fastify-based HTTP server implementing MCP protocol for tool-based interactions
- GraphQL abstraction layer providing isolated communication with Wiki.js backend
- Multi-transport support (HTTP, STDIN, async wrapper patterns)
- Zod-based runtime validation for all tool inputs and outputs
- Bearer token authentication with environment-based configuration
- Stateless service design with per-request initialization of API clients

## Layers

**HTTP Server Layer:**
- Purpose: Expose MCP tools and health endpoints via HTTP REST API
- Location: `src/server.ts`
- Contains: Fastify server setup, route definitions, error handling middleware
- Depends on: `WikiJsApi` (from `api.ts`), tool definitions (from `tools.ts`)
- Used by: MCP clients, demo agents, external clients

**API Abstraction Layer:**
- Purpose: Encapsulate all Wiki.js GraphQL communication and business logic
- Location: `src/api.ts` (primary TypeScript implementation), `src/tools.ts` (extended implementation)
- Contains: GraphQL queries/mutations, HTTP client wrappers, connection pooling, error retries
- Depends on: `graphql-request` library, `types.ts` for data structures
- Used by: HTTP server layer to fulfill tool requests

**Validation Layer:**
- Purpose: Runtime type validation and schema enforcement for all inputs/outputs
- Location: `src/schemas.ts`
- Contains: Zod schema definitions, validation functions, safe parsing wrappers
- Depends on: Zod library
- Used by: HTTP server on request body validation, optional usage by API layer

**Type Definition Layer:**
- Purpose: Central TypeScript type definitions for all domain entities
- Location: `src/types.ts`
- Contains: Tool definitions, Wiki.js data types (Page, User, Group), response types
- Depends on: None (base layer)
- Used by: All other layers for type safety

**Transport/Wrapper Layer:**
- Purpose: Protocol-agnostic tool execution and multi-transport support
- Location: `lib/mcp_wrapper.js`, `lib/mcp_wikijs_stdin.js`, `lib/fixed_mcp_http_server.js`
- Contains: STDIN/STDOUT handlers, JSON-RPC message processing, SSE client management
- Depends on: Compiled TypeScript code (from `dist/`)
- Used by: Editor integrations (Cursor, VS Code), direct STDIN connections

**Agent/Orchestration Layer:**
- Purpose: High-level workflow orchestration and tool invocation management
- Location: `src/agent.ts`
- Contains: Health checks, tool discovery, multi-tool sequencing, error recovery
- Depends on: HTTP server endpoints
- Used by: Demo applications, test scripts, external automation

## Data Flow

**Tool Invocation Flow:**

1. Client (Cursor, test script, demo agent) sends HTTP request to `/[tool_name]`
2. Fastify route handler receives request with parameters
3. Parameters extracted and passed to WikiJsApi method
4. WikiJsApi constructs GraphQL query/mutation with bearer token in Authorization header
5. GraphQL Client sends request to Wiki.js `/graphql` endpoint
6. Wiki.js API validates token and returns response
7. Response marshalled into response type and returned to client
8. Fastify serializes response as JSON and sends via HTTP

**Error Handling Flow:**

1. Error occurs at any layer (network, GraphQL, validation)
2. Error caught in try-catch block
3. Server logs error detail
4. Structured error response returned to client with status and message
5. Client retries or reports to user

**State Management:**
- No persistent state - all state is request-scoped
- Configuration loaded from environment variables at startup (cached in `ServerConfig`)
- WikiJsApi instance created per server instance, reused for all requests
- GraphQL client maintains authentication headers for all requests
- No session state or user context tracking in MCP server

## Key Abstractions

**WikiJsApi Class:**
- Purpose: Unified interface to all Wiki.js GraphQL operations
- Examples: `src/api.ts`, `src/tools.ts` (WikiJsAPI class definition)
- Pattern: Singleton per server instance, stateless methods
- Responsible for: Query construction, response parsing, error transformation
- Testability: Depends on GraphQL client that can be mocked

**Tool Definition Structure:**
- Purpose: Declarative tool specification for MCP protocol compliance
- Examples: `src/tools.ts` exports `wikiJsTools` array and `wikiJsToolsWithImpl`
- Pattern: Tool name → function reference mapping with validation schemas
- Used to: Advertise capabilities, route requests, validate parameters

**Response Types:**
- Purpose: Consistent result structure across all tools
- Examples: `WikiJsPage`, `WikiJsUser`, `ResponseResult` in `src/types.ts`
- Pattern: Domain-driven type definitions with optional fields for flexibility
- Used in: Validation schemas, API response handling, client contracts

**Server Configuration:**
- Purpose: Externalize all configuration from code
- Examples: `ServerConfig` interface in `src/types.ts` with `port`, `wikijs.baseUrl`, `wikijs.token`
- Pattern: Single configuration object populated from environment variables at startup
- Used by: Server initialization, WikiJsApi instantiation

## Entry Points

**HTTP Server:**
- Location: `src/server.ts` (TypeScript) or `dist/server.js` (compiled)
- Triggers: `npm start`, direct Node.js execution, container startup
- Responsibilities: Listen on configured port, route requests to appropriate handlers, serve /health endpoint
- Authentication: Enforces bearer token validation on upstream Wiki.js API, no MCP server-level auth

**STDIN Server:**
- Location: `lib/mcp_wikijs_stdin.js`
- Triggers: `npm run server:stdio`, editor MCP configuration
- Responsibilities: Read JSON-RPC from stdin, invoke tools, write responses to stdout
- Used by: Cursor IDE integration, direct stdio connections

**Demo Agent:**
- Location: `src/demo.ts` (TypeScript) or `dist/demo.js` (compiled)
- Triggers: `npm run demo`
- Responsibilities: Connect to running MCP server, test tool availability, demonstrate tool usage
- Used for: Manual testing, integration verification, development workflows

**Wrapper/Configuration:**
- Location: `lib/mcp_wrapper.js`
- Triggers: Auto-invocation from `.cursor/mcp.json` configuration
- Responsibilities: Load Cursor configuration, spawn appropriate transport (HTTP or STDIN)
- Used by: Cursor editor automatic MCP server startup

## Error Handling

**Strategy:** Multi-layer validation and graceful degradation with detailed logging

**Patterns:**
- **Input Validation:** All HTTP request bodies validated against Zod schemas before processing
- **GraphQL Errors:** Caught in try-catch, error message extracted, structured response returned
- **Connection Failures:** Logged with context, error returned to client rather than crash
- **Unknown Routes:** 404 responses from Fastify, no handler found
- **Startup Failures:** WikiJsApi connection check at startup warns but continues (non-fatal)
- **Recovery:** Tools do not implement retry logic internally; clients expected to retry

**Error Response Format:**
```json
{
  "error": "Error message string",
  "status": "error or specific error code"
}
```

## Cross-Cutting Concerns

**Logging:**
- Strategy: Fastify built-in logger for HTTP requests, console.log/console.error for application events
- Approach: Log configuration and startup info, errors logged with stack traces, sensitive data masked (token substring only)

**Validation:**
- Strategy: Zod runtime schemas for all tool parameters
- Approach: `src/schemas.ts` contains schemas for each tool, validation functions provided for safe and throwing variants
- Applied to: HTTP request bodies, tool parameter validation before API invocation

**Authentication:**
- Strategy: Bearer token via environment variable, passed to WikiJsApi which injects into GraphQL Authorization header
- Approach: No per-request auth in MCP server itself; all requests use single configured token
- Consideration: MCP server assumes trusted client environment; OAuth2.1 would integrate at this layer during future expansion

**Connection Management:**
- Strategy: Single GraphQL client instance reused for all requests, bearer token set once at initialization
- Approach: No connection pooling implemented in GraphQL client; node-fetch handles HTTP connection reuse
- Scaling consideration: Multiple server instances would share no state; each maintains own GraphQL client

---

*Architecture analysis: 2026-03-24*
