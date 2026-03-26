# WikiJS MCP Server

![MCP](https://img.shields.io/badge/MCP-Compatible-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Node.js](https://img.shields.io/badge/node.js-%3E%3D18.0.0-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-strict-blue)
![HTTP](https://img.shields.io/badge/HTTP-Fastify-green)
![OAuth 2.1](https://img.shields.io/badge/OAuth%202.1-blue)

A **WikiJS MCP Server** is a read-only Model Context Protocol (MCP) server that enables AI assistants like Claude Desktop, Claude Code, Cursor IDE, and other MCP-compatible clients to search, read, and list wiki pages from a Wiki.js instance, all through a GraphQL API.

## Features

- **3 tools**: `get_page`, `list_pages`, `search_pages`
- **HTTP-only transport** (STDIO removed in v2.3)
- **OAuth 2.1** Azure AD authentication with `wikijs:read` scope
- **Docker**: Alpine-based image for minimal deployment size

### Page Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `get_page` | Retrieve a Wiki.js page by database ID. Returns full page object with title, path, description, markdown content, publication status, timestamps. | `id` (number, required) |
| `list_pages` | Browse pages with sorting options (limit, orderBy). Returns page metadata without content. | `limit` (number), `orderBy` ("TITLE" \| "CREATED" \| "UPDATED") |
| `search_pages` | Keyword search across published pages. Returns matching pages with metadata and content excerpts. | `query` (string, required), `limit` (number) |

## Quick Start

### Prerequisites

- **Node.js** >= 18.0.0
- **Wiki.js** instance with API access
- **Azure AD** tenant (for authentication)

### 1. Clone and Install

```bash
git clone https://github.com/heAdz0r/wikijs-mcp-server.git
cd wikijs-mcp-server
npm install
```
### 2. Configure Environment

```bash
cp example.env .env
```
Edit `.env` with your settings:

```env
# Server Configuration
PORT=3200

# Wiki.js Configuration
WIKIJS_BASE_URL=http://localhost:3000
WIKIJS_TOKEN=your_wikijs_api_token_here

# Azure AD Configuration
AZURE_TENANT_ID=your_azure_tenant_id_here
AZURE_CLIENT_ID=your_azure_client_id_here
MCP_RESOURCE_URL=http://localhost:3200
```

### 3. Build and Run

```bash
npm run build
npm start
```

The server will start on port 3200 (or your configured PORT).


## Configuration

### Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `PORT` | No | Server port (default: 3200) | `3200` |
| `WIKIJS_BASE_URL` | Yes | Wiki.js base URL (without `/graphql`) | `http://localhost:3000` |
| `WIKIJS_TOKEN` | Yes | Wiki.js API token | `your_token_here` |
| `WIKIJS_LOCALE` | No | Wiki.js locale | `en-US` |
| `AZURE_TENANT_ID` | Yes | Azure AD tenant ID (UUID) | `550e8400-e29b-41d4-a716-446655440000` |
| `AZURE_CLIENT_ID` | Yes | Azure AD client ID (UUID) | `550e8400-e29b-41d4-a716-446655440001` |
| `MCP_RESOURCE_URL` | Yes | Public URL of this MCP server | `http://localhost:3200` |
| `MCP_RESOURCE_DOCS_URL` | No | Documentation URL for MCP server | `https://docs.example.com` |


## Authentication

The server uses Azure AD OAuth 2.1 for authentication. Clients must obtain a JWT token from Azure AD and include it in the Authorization header.

### Flow

1. Client obtains JWT token from Azure AD
2. Token is sent as Bearer token in Authorization header
3. Server validates token signature using JWKS
4. Server checks `wikijs:read` scope is present

### Required Scope

| Scope | Description | Tools |
|------|-------------|-------|
| `wikijs:read` | Read access to wiki pages | get_page, list_pages, search_pages |


## API Endpoints

| Endpoint | Method | Description | Auth |
|----------|--------|-------------|------|
| `/` | GET | Server info and endpoint discovery | None |
| `/health` | GET | Health check | None |
| `/mcp` | POST | MCP JSON-RPC endpoint | JWT |
| `/.well-known/oauth-protected-resource` | GET | OAuth Protected Resource Metadata | None |
| `/.well-known/oauth-authorization-server` | GET | OAuth Authorization Server Metadata | None |
| `/.well-known/openid-configuration` | GET | OpenID Connect Discovery | None |
| `/register` | POST | Dynamic Client Registration | None |
| `/authorize` | GET | OAuth authorization redirect | None |
| `/token` | POST | OAuth token proxy | None |


## Development

```bash
npm run dev          # Start dev server with auto-reload
npm run build        # Compile TypeScript
npm start            # Start HTTP server (production)
npm test             # Run tests
npm run test:watch   # Watch mode
```

### Project Structure

```
src/
  server.ts          # Fastify HTTP server entry point
  api.ts             # WikiJsApi class -- all GraphQL calls to Wiki.js
  mcp-tools.ts       # 3 MCP tool registrations with Zod schemas
  tool-wrapper.ts    # wrapToolHandler() -- timing + structured logging
  config.ts          # Zod-validated env config, fail-fast at startup
  types.ts           # WikiJsPage interface
  scopes.ts          # OAuth scope constants + SCOPE_TOOL_MAP
  request-context.ts # AsyncLocalStorage for correlationId + user identity
  logging.ts         # Pino logger config with UUID correlation IDs
  routes/
    public-routes.ts   # Public endpoints (/, /health, discovery)
    mcp-routes.ts      # POST /mcp -- protected MCP JSON-RPC endpoint
    oauth-proxy.js     # OAuth proxy routes (authorization, token, register)
  auth/
    middleware.ts    # JWT validation Fastify plugin (RFC 6750)
    errors.ts        # Error mapping utilities
    types.ts         # AuthenticatedUser interface
    __tests__/       # Auth unit tests + test helpers (JWT generation)
tests/               # Integration tests
tests/helpers/       # buildTestApp() -- shared Fastify app for tests
```

## Docker

Build and run with Docker:

```bash
docker build -t wikijs-mcp .
docker run -p 3200:3200 wikijs-mcp
```

Or with Docker Compose:

```bash
docker-compose up -d
```

The server will be available at `http://localhost:3200`.


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


## Troubleshooting

### Server won't start

Check configuration:

```bash
cat .env
npm start
```

Common issues:

- Missing required environment variables
- Invalid UUID format for Azure IDs
- Malformed URLs


### Can't connect to Wiki.js

1. Verify Wiki.js is running and accessible
2. Check `WIKIJS_BASE_URL` doesn't include `/graphql`
3. Verify API token has necessary permissions
4. Test connection directly:

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


## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request


## License

This project is distributed under the MIT License. See [LICENSE](LICENSE) file for details.


## Links

- [Wiki.js](https://js.wiki/) - Official Wiki.js website
- [Model Context Protocol](https://spec.modelcontextprotocol.io/) - MCP specification
- [Anthropic](https://www.anthropic.com/) - MCP protocol developer


## Support

If this project helped you, please give it a star on GitHub!

Have questions? Create an [Issue](https://github.com/heAdz0r/wikijs-mcp-server/issues).