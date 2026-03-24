# Codebase Structure

**Analysis Date:** 2026-03-24

## Directory Layout

```
wikijs-mcp-server/
├── src/                    # TypeScript source code
│   ├── server.ts           # Main Fastify HTTP server with MCP routes
│   ├── api.ts              # Wiki.js GraphQL API client implementation
│   ├── tools.ts            # MCP tool definitions and implementations
│   ├── types.ts            # TypeScript interfaces and type definitions
│   ├── schemas.ts          # Zod validation schemas for all tools
│   ├── agent.ts            # High-level agent for tool orchestration
│   ├── demo.ts             # Demo/test agent implementation
│   └── README.md           # Source code documentation
├── lib/                    # JavaScript implementations and clients
│   ├── fixed_mcp_http_server.js   # HTTP MCP server (standalone)
│   ├── mcp_wikijs_stdin.js        # STDIN MCP server implementation
│   ├── mcp_wrapper.js             # Configuration wrapper for Cursor
│   ├── mcp_client.js              # Demo MCP client
│   └── README.md                  # Library documentation
├── dist/                   # Compiled JavaScript output (generated)
│   ├── server.js
│   ├── api.js
│   ├── tools.js
│   ├── types.js
│   ├── schemas.js
│   ├── agent.js
│   └── demo.js
├── scripts/                # Build and deployment scripts
│   ├── setup.sh
│   ├── start_http.sh
│   ├── start_typescript.sh
│   ├── start_stdin.sh
│   ├── stop_server.sh
│   ├── setup_cursor_mcp.sh
│   ├── test_mcp.js         # HTTP MCP integration tests
│   ├── test_mcp_stdin.js   # STDIN protocol tests
│   └── README.md           # Script documentation
├── .cursor/                # Cursor IDE configuration
│   └── mcp.json            # MCP server configuration for Cursor
├── .planning/              # Planning and analysis documentation
│   └── codebase/           # This directory - analysis documents
├── node_modules/           # Dependencies (generated)
├── package.json            # npm configuration
├── tsconfig.json           # TypeScript compiler options
├── example.env             # Environment variable template
├── README.md               # Main project documentation
├── QUICK_START.md          # Quick start guide
└── CHANGELOG.md            # Version history
```

## Directory Purposes

**src/:**
- Purpose: All TypeScript source code for the MCP server and tools
- Contains: HTTP server, API client, tool definitions, validation schemas, type definitions
- Key files: `server.ts` (entry point), `api.ts` (Wiki.js integration), `tools.ts` (MCP tools)
- Build output: Compiled to `dist/` directory via `npm run build` (tsc)

**lib/:**
- Purpose: Standalone JavaScript implementations, demo clients, and protocol wrappers
- Contains: HTTP and STDIN servers, MCP client examples, configuration loaders
- Key files: `fixed_mcp_http_server.js` (primary HTTP server), `mcp_wikijs_stdin.js` (STDIN server)
- Note: Separate from `dist/` - not auto-generated, manually maintained

**dist/:**
- Purpose: TypeScript compilation output, ready for Node.js execution
- Contains: JavaScript version of all `src/` files with source maps
- Generation: `npm run build` compiles TypeScript to JavaScript
- Usage: Referenced by `lib/` files via imports, executed by npm scripts

**scripts/:**
- Purpose: Deployment and development automation scripts
- Contains: Server startup scripts, test runners, configuration setup helpers
- Key scripts: `start_http.sh` (run HTTP server), `setup_cursor_mcp.sh` (configure Cursor integration)
- Executable: All `.sh` files should be executable for deployment pipelines

**.cursor/:**
- Purpose: Cursor IDE-specific MCP server configuration
- Contains: `mcp.json` with server connection details and environment setup
- Format: Cursor MCP configuration standard (JSON)
- Auto-loaded: Cursor IDE reads this on startup to register MCP servers

**.planning/codebase/:**
- Purpose: Architecture and design analysis documents (this directory)
- Contains: ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, CONCERNS.md, INTEGRATIONS.md
- Format: Markdown documentation of codebase patterns and practices
- Usage: Guides future development and code generation

## Key File Locations

**Entry Points:**
- `src/server.ts`: Main HTTP server with Fastify - starts MCP protocol handler on port 8000 or configured PORT
- `lib/mcp_wikijs_stdin.js`: STDIN server entry point for editor integrations
- `lib/mcp_wrapper.js`: Configuration wrapper that selects HTTP or STDIN mode based on `.cursor/mcp.json`
- `src/demo.ts`: Demo agent showing tool usage, executes standalone

**Configuration:**
- `package.json`: npm scripts, dependencies, project metadata
- `tsconfig.json`: TypeScript compiler configuration (ES2020 target, strict mode)
- `example.env`: Template for environment variables (copy to `.env` to use)
- `.cursor/mcp.json`: Cursor IDE MCP server registration and transport configuration

**Core Logic:**
- `src/api.ts`: WikiJsApi class - all GraphQL queries, mutations, and API communication
- `src/tools.ts`: Tool definitions array and WikiJsAPI class with extended functionality
- `src/server.ts`: Fastify route handlers that call WikiJsApi methods and return responses
- `src/schemas.ts`: Zod schemas for input validation of all tool parameters

**Testing/Demo:**
- `scripts/test_mcp.js`: Integration test suite for HTTP server functionality
- `scripts/test_mcp_stdin.js`: Tests for STDIN protocol implementation
- `lib/mcp_client.js`: Demo MCP client showing how to connect and invoke tools
- `src/demo.ts`: Demo agent showing end-to-end tool usage

**Documentation:**
- `README.md`: Main project overview and quick start
- `src/README.md`: Detailed documentation of source code structure and patterns
- `lib/README.md`: Documentation of JavaScript files and their purposes
- `scripts/README.md`: Script descriptions and usage instructions

## Naming Conventions

**Files:**
- `*.ts` files in `src/`: TypeScript source files follow domain.ts pattern (api.ts, server.ts, tools.ts)
- `*.js` files in `lib/`: Standalone implementations named descriptively (fixed_mcp_http_server.js, mcp_wrapper.js)
- `*.js` files in `dist/`: Direct transpiled output of TypeScript (same names as source)
- Scripts in `scripts/`: Named by function with transport/mode suffix (start_http.sh, test_mcp_stdin.js)

**Functions:**
- TypeScript functions: camelCase (checkConnection, getPageById, createUser)
- Tool names: snake_case (get_page, list_users, create_page) - MCP standard
- Class names: PascalCase (WikiJsApi, WikiJsAgent, ServerConfig)
- Private members: prefix with underscore (\_client, \_token, \_baseUrl)

**Variables:**
- Constants: UPPER_SNAKE_CASE (WIKIJS_BASE_URL, API_URL, PORT)
- Configuration objects: camelCase (config, serverConfig, toolConfig)
- Zod schemas: PascalCase ending in Schema (WikiPageSchema, GetPageParamsSchema)

**Types:**
- Interfaces: PascalCase with I prefix optional (ServerConfig, WikiJsPage, ResponseResult)
- Enums: PascalCase (OrderBy has values TITLE, CREATED, UPDATED)
- Type aliases: PascalCase (WikiPage, WikiUser, WikiGroup)

## Where to Add New Code

**New Tool:**
1. **Define schema in** `src/schemas.ts`: Create GetMyToolParamsSchema and GetMyToolResultSchema using Zod
2. **Add type in** `src/types.ts`: Create corresponding TypeScript interface if needed
3. **Implement method in** `src/api.ts` or `src/tools.ts`: Add async method to WikiJsApi class
4. **Add tool definition in** `src/tools.ts`: Add to wikiJsTools array with name, description, parameters, implementation
5. **Route created automatically**: Server routes all /[tool_name] requests to tool registry lookup
6. **Tests:** Add test case to `scripts/test_mcp.js` calling the new endpoint

**New Utility Function:**
- Location: Create `src/utils.ts` if not exists, or add to existing utility module
- Pattern: Export pure functions, no side effects
- Type safety: Always fully typed with TypeScript generics if applicable
- Usage: Import in files that need it, avoid circular dependencies

**New Configuration:**
- Location: Add to `src/types.ts` ServerConfig interface
- Environment: Document in `example.env` with default value
- Loading: Initialize in `src/server.ts` from process.env, validate with Zod schema

**New Test:**
- Location: Add to `scripts/test_mcp.js` or create `scripts/test_new_feature.js`
- Pattern: Follow fetch-based HTTP test pattern shown in existing tests
- Coverage: Test happy path, error cases, parameter validation

**New API Endpoint:**
- Location: Add route handler in `src/server.ts`
- Pattern: GET for read operations, POST for write operations
- Response: Wrapped in try-catch with error handling, return JSON
- Example: `server.get("/my_endpoint", async (request) => { ... })`

## Special Directories

**node_modules/:**
- Purpose: npm dependency installation directory
- Generated: Yes (created by `npm install`)
- Committed: No (in .gitignore)
- Size: ~200MB+ with all transitive dependencies

**dist/:**
- Purpose: Compiled TypeScript output, ready for production execution
- Generated: Yes (created by `npm run build` / tsc)
- Committed: No (in .gitignore)
- Usage: Required for execution; run `npm run build` before deploy

**.git/:**
- Purpose: Git repository metadata
- Committed: Core of repository
- Size: ~50MB with full history
- Note: Never edit files in this directory

---

*Structure analysis: 2026-03-24*
