# External Integrations

**Analysis Date:** 2026-03-24

## APIs & External Services

**Wiki.js GraphQL API:**
- Wiki.js instance
  - What it's used for: Core integration - all page, user, and group management operations
  - SDK/Client: graphql-request 6.1.0
  - Auth: Bearer token via `Authorization: Bearer ${WIKIJS_TOKEN}` header
  - Endpoint: `${WIKIJS_BASE_URL}/graphql` (e.g., http://localhost:3000/graphql)
  - Location: `src/api.ts` (`WikiJsApi` class), `lib/mcp_wikijs_stdin.js`, `lib/fixed_mcp_http_server.js`

**Model Context Protocol (MCP):**
- Anthropic's MCP protocol
  - What it's used for: Protocol for safe AI model interaction with external tools and services
  - Implementations: Two transports supported
    - HTTP transport: `src/server.ts` (Fastify-based), `lib/fixed_mcp_http_server.js` (Node.js HTTP)
    - STDIO transport: `lib/mcp_wikijs_stdin.js` (Cursor/VS Code editor integration)
  - Configuration: `.cursor/mcp.json`

## Data Storage

**Wiki.js Backend Database:**
- Type/Provider: Not managed by this application (external Wiki.js instance)
- Connection: Via GraphQL API
- Authentication: API token stored in `WIKIJS_TOKEN`
- No direct database access - all operations go through Wiki.js GraphQL API

**Local Storage:**
- Log files: `lib/fixed_server.log` (append-mode file logging)
- Configuration: `.env` file (environment variables)

**Caching:**
- None implemented
- Each request makes fresh GraphQL query to Wiki.js

**State Management:**
- No persistent state in MCP server itself
- All state stored in Wiki.js instance
- Stateless HTTP server pattern - each request is independent

## Authentication & Identity

**Auth Provider:**
- Custom (Bearer token based)
- Implementation approach:
  - Wiki.js API token obtained from Wiki.js admin panel
  - Token stored in `.env` as `WIKIJS_TOKEN` environment variable
  - Token passed in all GraphQL requests as Bearer token in Authorization header

**Current Auth Flow:**
1. Administrator creates API key in Wiki.js admin panel (Admin → API section)
2. Token stored in `.env` file: `WIKIJS_TOKEN=token_value`
3. Server reads token via `dotenv` on startup
4. Token used in `GraphQLClient` headers initialization:
   ```typescript
   headers: {
     Authorization: `Bearer ${token}`,
   }
   ```

**Future OAuth2.1 Considerations:**
- Current token auth is NOT OAuth2.1 compliant
- Migration will require:
  - OAuth2.1 provider integration (could be Wiki.js native or external)
  - Authorization code flow implementation
  - Token refresh mechanism
  - Scope-based permission model
  - Secure token storage/rotation in production
- Key files to modify:
  - `src/api.ts` - Replace static Bearer token with dynamic OAuth token retrieval
  - `src/server.ts` - Add OAuth middleware/authentication layer
  - `src/types.ts` - Add OAuth configuration types
  - Environment variables need OAuth client credentials

## Monitoring & Observability

**Error Tracking:**
- None implemented - no integration with Sentry, DataDog, etc.

**Logs:**
- Fastify built-in logger: `fastify({ logger: true })` in `src/server.ts`
- Console logging: `console.error()` in stdio implementations (`lib/mcp_wikijs_stdin.js`)
- File logging: `lib/fixed_server.log` (append-only)
- GraphQL error handling: Logs API errors from Wiki.js responses

**Debugging:**
- Debug logs output to stderr in stdio implementation
- TypeScript source maps enabled in build output

## CI/CD & Deployment

**Hosting:**
- Self-hosted deployment model
- Requires Node.js >= 18.0.0 runtime
- Can run on any system with Node.js (development machine, server, Docker container)

**CI Pipeline:**
- None detected - no GitHub Actions, GitLab CI, or Jenkins config present

**Deployment Approach:**
- Manual: Run `npm run build` to compile TypeScript
- Manual: Run `npm run start:http` to start HTTP server or `npm run server:stdio` for stdio transport
- Scripts provided in `scripts/` directory for automation

**Startup/Shutdown:**
- Start HTTP server: `scripts/start_http.sh`
- Start STDIO server: `scripts/start_typescript.sh` or `lib/mcp_wikijs_stdin.js`
- Stop server: `scripts/stop_server.sh` (uses `pkill` to terminate processes)

## Environment Configuration

**Required env vars:**
- `WIKIJS_BASE_URL` - URL to Wiki.js instance (e.g., http://localhost:3000)
- `WIKIJS_TOKEN` - API authentication token from Wiki.js admin panel
- `PORT` - HTTP server listening port (optional, defaults to 3200)

**Secrets location:**
- `.env` file (git-ignored, created from `example.env`)
- Not committed to repository
- Should be managed via:
  - Environment variable injection in production
  - Secret management systems (Vault, AWS Secrets Manager, etc.) for enterprise deployments
  - `.cursor/mcp.json` for Cursor IDE integration (local-only)

**Sensitive Files:**
- `.env` - Contains `WIKIJS_TOKEN` (never committed)
- `.cursor/mcp.json` - Contains Wiki.js token for Cursor IDE (local-only)

## Network & Transport

**HTTP Server:**
- Fastify listening on `0.0.0.0:${PORT}` (default 3200)
- REST endpoints:
  - GET `/health` - Health check with Wiki.js connection verification
  - GET `/tools` - List available MCP tools
  - GET/POST `/get_page`, `/list_pages`, `/search_pages`, `/create_page`, `/update_page`, `/delete_page` - Page operations
  - GET/POST `/list_users`, `/search_users`, `/list_groups`, `/create_user`, `/update_user` - User/group operations
  - GET `/list_all_pages`, `/search_unpublished_pages` - Unpublished page operations
  - POST `/force_delete_page`, `/publish_page` - Advanced page management

**STDIO Protocol:**
- Line-delimited JSON over stdin/stdout
- Used for Cursor IDE integration
- Processes JSON requests and responds with JSON

**Cross-Origin:**
- CORS dependency installed but not actively configured
- No explicit CORS middleware in current HTTP server
- May need CORS headers for browser-based clients

## Webhooks & Callbacks

**Incoming Webhooks:**
- None implemented
- Server only receives requests, does not receive push notifications from Wiki.js

**Outgoing Webhooks:**
- None implemented
- Server makes requests to Wiki.js GraphQL API only
- No callbacks to external services

**Event-Based Integration:**
- Not supported - polling-based only

## GraphQL Operations

**Query Operations:**
- Pages: list, single (get by ID), search
- Users: list, search
- Groups: list

**Mutation Operations:**
- Pages: create, update, delete, render (publish), force delete
- Users: create, update

**API Version:**
- Wiki.js GraphQL API version not specified in codebase
- Assumes compatible with Wiki.js 2.x or 3.x

## Security Considerations for OAuth2.1 Migration

**Current Vulnerabilities:**
1. **Static token**: Single token stored in plaintext environment variable
   - Risk: If `.env` compromised, attacker gains full Wiki.js access
   - Mitigation: Rotate tokens regularly, restrict API token permissions in Wiki.js

2. **No token expiration**: Token never refreshes
   - Risk: Long-lived credentials increase exposure window
   - Mitigation: OAuth2.1 refresh tokens will solve this

3. **No scope restrictions**: Token likely has broad permissions
   - Risk: Compromised token enables all operations
   - Mitigation: OAuth2.1 scopes limit what MCP server can do

4. **No request signing**: HTTP requests over plaintext HTTP possible
   - Risk: MITM attacks in non-HTTPS environments
   - Mitigation: Always use HTTPS in production

**OAuth2.1 Implementation Roadmap:**
1. Implement OAuth2.1 authorization code flow
2. Store client credentials (not in `.env` plaintext)
3. Implement token refresh mechanism (short-lived access tokens + refresh tokens)
4. Add scope-based authorization model
5. Implement secure PKCE flow for public clients
6. Add JWT token validation if using self-signed JWTs
7. Implement logout/token revocation

---

*Integration audit: 2026-03-24*
