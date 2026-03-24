# Technology Stack

**Analysis Date:** 2026-03-24

## Languages

**Primary:**
- TypeScript 5.3.3 - Main implementation language for MCP server and API layer
- JavaScript (Node.js) - Runtime execution and utility scripts in `lib/` directory

**Secondary:**
- Bash - Deployment and setup scripts in `scripts/` directory

## Runtime

**Environment:**
- Node.js >= 18.0.0 (specified in `package.json` engines field)
- ES2020 module target with CommonJS interop enabled

**Package Manager:**
- npm (assumed, lockfile exists in repo)
- Lockfile: `package-lock.json` (committed to repository)

## Frameworks

**Core:**
- Fastify 4.27.2 - HTTP server framework in `src/server.ts`
- Express 4.21.2 - Installed but appears unused in current codebase (may be legacy or planned for wrapper)

**GraphQL:**
- graphql 16.8.1 - GraphQL query language support
- graphql-request 6.1.0 - GraphQL client for communicating with Wiki.js GraphQL API (`src/api.ts`, `lib/mcp_wikijs_stdin.js`)

**Validation:**
- zod 3.25.17 - Schema validation and type inference for tool parameters and responses (`src/schemas.ts`)

**Build/Dev:**
- TypeScript 5.3.3 - Transpilation and type checking
- ts-node 10.9.2 - Direct TypeScript execution in development
- nodemon 3.0.3 - File watching for auto-restart during development (`npm run dev`)

## Key Dependencies

**Critical:**
- node-fetch 3.3.2 - HTTP client for making GraphQL queries and API requests (used in `lib/mcp_wikijs_stdin.js` and `lib/fixed_mcp_http_server.js`)
- dotenv 16.5.0 - Environment variable loading from `.env` files (`src/server.ts`, `lib/` files)
- uuid 9.0.1 - Unique identifier generation

**Infrastructure:**
- cors 2.8.5 - Cross-Origin Resource Sharing middleware (installed but not actively used in current codebase)

## Configuration

**Environment:**
- Configuration loaded via `dotenv` from `.env` file (created from `example.env`)
- Key configs:
  - `PORT` - HTTP server listening port (default 3200)
  - `WIKIJS_BASE_URL` - Wiki.js instance URL (default http://localhost:3000)
  - `WIKIJS_TOKEN` - API authentication token for Wiki.js GraphQL access

**Build:**
- `tsconfig.json` - TypeScript compilation settings:
  - Target: ES2020
  - Module: NodeNext
  - Output directory: `dist/`
  - Strict type checking enabled
  - Source maps enabled for debugging
  - Declaration files generated (`*.d.ts`)

**Runtime Config Files:**
- `.env` - Environment variables (not committed, created from `example.env`)
- `.cursor/mcp.json` - Cursor IDE MCP server configuration (includes Wiki.js settings)
- `example.env` - Template for `.env` file

## Platform Requirements

**Development:**
- Node.js >= 18.0.0
- npm (for package management)
- Bash shell (for running setup and start scripts)
- TypeScript compiler (`tsc` via npm script)

**Production:**
- Node.js >= 18.0.0 (no breaking dependencies on newer versions)
- Network access to Wiki.js instance via HTTP/GraphQL
- Environment variables properly configured (.env file present)

## Transport Protocols

**HTTP Server:**
- Fastify-based HTTP server in `src/server.ts`
- Listens on configurable port (default 3200)
- Serves MCP protocol endpoints
- Custom HTTP server implementation in `lib/fixed_mcp_http_server.js` (alternative implementation)

**STDIO (Standard Input/Output):**
- Stdin/stdout based server in `lib/mcp_wikijs_stdin.js`
- For editor integration (Cursor, VS Code)
- Line-delimited JSON protocol

## Authentication & Security

**Current Implementation:**
- Bearer token authentication with Wiki.js
- Token passed as HTTP Authorization header: `Authorization: Bearer ${WIKIJS_TOKEN}`
- Token sourced from `WIKIJS_TOKEN` environment variable
- No built-in OAuth or advanced auth mechanism currently implemented

**Security Considerations:**
- Token storage: Environment variables only (never committed)
- CORS middleware available but not actively configured
- No request validation/rate limiting middleware active
- GraphQL queries not parameterized in some cases (potential SQL-like injection risk in string interpolation)

## Module System

**ES Modules:**
- `"type": "module"` in `package.json` enforces ES module syntax
- Import/export syntax used throughout
- Dynamic imports via `import()` for runtime module loading

## Development Tooling

**Debugging:**
- Source maps enabled in TypeScript config
- Logging via Fastify logger and `console.error` in stdio implementations
- Log file output in `lib/fixed_server.log`

**Testing:**
- No active test framework configured in current codebase
- Test scripts exist (`npm run test`, `test.sh`, `test_mcp.js`, `test_mcp_stdin.js`) but point to placeholder/manual testing

---

*Stack analysis: 2026-03-24*
