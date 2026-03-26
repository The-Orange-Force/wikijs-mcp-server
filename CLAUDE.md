# CLAUDE.md -- wikijs-mcp-server

agent guidance for the `wikijs-mcp-server` project. Read this before touching any code.

---
## What This Project is

A **Model Context Protocol (MCP) server** that enables AI assistants (Claude Desktop, Claude Code, Cursor IDE) and other MCP-compatible clients to search, read, and list wiki pages from a Wiki.js instance. All through a GraphQL API.

- **Transport**: HTTP (Fastify)
- **Auth**: Azure AD OAuth 2.1 -- Bearer token validated via JWKS, scope-based access control
- **Tools**: 3 registered MCP tools (get_page, list_pages, search_pages)
- **Wiki.js API**: GraphQL via `graphql-request`

---

## Tech Stack

| Concern | Choice |
|---|---|
| Language | TypeScript 5.3 (strict, ESM) |
| Runtime | Node.js >= 20 |
| HTTP server | Fastify 4 |
| MCP protocol | `@modelcontextprotocol/sdk` |
| Wiki.js client | `graphql-request` + GraphQL template strings |
| Auth | `jose` (JWKS/JWT validation) |
| Validation | Zod |
| Test runner | Vitest 4 |
| Dev server | `ts-node` + `nodemon` |

TypeScript compiles to `dist/`. The project uses `NodeNext` modules -- **all imports must include `.js` extensions**.

## Project Structure

```
src/
  server.ts          # Entry point -- Fastify app factory and startup
  api.ts             # WikiJsApi class -- all GraphQL calls to Wiki.js
  mcp-tools.ts       # 3 MCP tool registrations with Zod schemas
  tool-wrapper.ts    # wrapToolHandler() -- timing + structured logging
  config.ts          # Zod-validated env config, fail-fast at startup
  types.ts           # WikiJsPage interface
  scopes.ts          # OAuth scope constants + SCOPE_TOOL_MAP
  request-context.ts # AsyncLocalStorage for correlationId + user identity
  logging.ts         # Pino logger config with UUID correlation IDs
  routes/
    mcp-routes.ts    # POST /mcp -- protected MCP JSON-RPC endpoint
    public-routes.ts # GET /, /health, /.well-known/oauth-protected-resource
    oauth-proxy.js   # OAuth proxy routes (authorization, token, register)
  auth/
    middleware.ts    # JWT validation Fastify plugin (RFC 6750)
    errors.ts        # Jose error --> RFC 6750 response mapping
    types.ts         # Auth/authenticated user interface
    __tests__/       # Auth unit tests + test helpers (JWT generation)
tests/               # Integration tests (smoke, config, discovery, scopes, etc.)
tests/helpers/       # buildTestApp() -- shared Fastify app for tests
scripts/             # Shell scripts: start, stop, test_mcp.js, setup
```

---

## Essential Commands

```bash
npm run dev          # Start dev server with auto-reload (ts-node + nodemon)
npm run build        # Compile TypeScript -> dist/
npm start            # Start HTTP server (production)
npm test             # Run all tests (vitest run)
npm run test:watch   # Tests in watch mode
npm run test:smoke   # Smoke tests only
```

## Environment Variables

Copy `example.env` to `.env`. Required vars:

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `PORT` | No | Server port (default: 8000) | `3200` |
| `WIKIJS_BASE_URL` | Yes | Wiki.js base URL (without `/graphql`) | `http://localhost:3000` |
| `WIKIJS_TOKEN` | Yes | Wiki.js API token | `your_token_here` |
| `AZURE_TENANT_ID` | Yes | Azure AD tenant (UUID) | `550e8400-e29b-41d4-a716-446655440000` |
| `AZURE_CLIENT_ID` | Yes | Azure AD client (UUID) | `550e8400-e29b-41d4-a716-446655440001` |
| `MCP_RESOURCE_URL` | Yes | Public URL of this MCP server | `http://localhost:3200` |
| `MCP_RESOURCE_DOCS_URL` | No | Documentation URL for MCP server | `https://docs.example.com` |

Optional: `PORT` (default 3200), `DEBUG`, `WIKIJS_LOCALE` (default: `en-US`)

## Docker

Build and run with Docker

```bash
docker build -t wikijs-mcp .
docker run -p 3200:3200 wikijs-mcp
```
Or with Docker Compose

```bash
docker-compose up -d
```

The server will be available at `http://localhost:3200`

## Troubleshooting

### Server won't start

Check configuration
```bash
cat .env

# Check for validation errors in logs
npm start
```

**Common issues:**
- Missing required environment variables
- invalid UUID format for Azure IDs
- malformed URLs

### Can't connect to Wiki.js

1. Verify Wiki.js is running and accessible
2. Check `WIKIJS_BASE_URL` doesn't include `/graphql`
3. Verify API token has necessary permissions
4. Test connection directly
```bash
curl -H "Authorization: Bearer $WIKIJS_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"query":"{ pages { list { id title } } }"}' \
    http://localhost:3000/graphql
```

### Authentication failures

1. Verify Azure AD credentials are correct
2. Check JWT token hasn't expired
3. Ensure token includes required scopes
4. Verify `MCP_RESOURCE_URL` matches your server URL

---
## Architecture

### Request Flow

```
+-------------+     +-----------------+     +--------------+
|  MCP Client |---->|  MCP Server     |---->|   Wiki.js    |
|  (Claude)   |     |  (Fastify)      |     |  (GraphQL)   |
+-------------+     +-----------------+     +--------------+
                           |
                           v
                    +--------------+
                    |   Azure AD   |
                    |  (JWT Auth)  |
                    +--------------+
```

### Multi-stage Search

The `search_pages` tool uses a fallback strategy:

1. **GraphQL API search** - Fast indexed search
2. **Metadata search** - Search titles, paths, descriptions
3. **HTTP content search** - Deep content search via HTTP
4. **Forced verification** - Fallback for known pages

This ensures results even with limited API permissions.

---
## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request


---
## License

This project is distributed under the MIT License. See [LICENSE](LICENSE) file for details.


---
## Links

- [Wiki.js](https://js.wiki/) - Official Wiki.js website
- [Model Context Protocol](https://spec.modelcontextprotocol.io/) - MCP specification
- [Anthropic](https://www.anthropic.com) - MCP protocol developer


---

## Support

If this project helped you, please give it a star on GitHub!

Have questions? Create an [Issue](https://github.com/heAdz0r/wikijs-mcp-server/issues).