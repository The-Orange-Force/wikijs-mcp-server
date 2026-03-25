# Wiki.js MCP Server

![MCP](https://img.shields.io/badge/MCP-Compatible-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Node.js](https://img.shields.io/badge/node.js-%3E%3D18.0.0-brightgreen)

A Model Context Protocol (MCP) server that enables AI assistants like **Claude Desktop**, **Cursor**, and other MCP-compatible clients to interact with your Wiki.js instance through GraphQL API.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Claude Desktop Setup](#claude-desktop-setup)
- [Other MCP Clients](#other-mcp-clients)
- [Available Tools](#available-tools)
- [API Endpoints](#api-endpoints)
- [Authentication](#authentication)
- [Development](#development)
- [Troubleshooting](#troubleshooting)

---

## Overview

This server acts as a bridge between MCP-compatible AI assistants and Wiki.js, allowing you to:

- Search, read, create, update, and delete wiki pages
- Manage users and groups
- Work with both published and unpublished pages
- Access wiki content directly from your AI assistant

MCP (Model Context Protocol) is an open protocol developed by Anthropic that enables AI models to safely interact with external services and tools.

---

## Features

### Page Management
- Get page information and content by ID
- List pages with sorting options (by title, creation date, update date)
- Multi-stage search with fallback mechanisms
- Create, update, and delete pages
- Work with unpublished pages (list, search, publish, force delete)
- Check page publication status

### User Management
- List and search users
- Create new users
- Update user information

### Group Management
- List user groups

### Transports
- **HTTP**: For Claude Desktop, web integrations, and API access
- **STDIO**: For editor integration (Cursor, VS Code)

### Security
- Azure AD OAuth 2.0 / JWT authentication
- Scope-based access control
- Request correlation tracking

---

## Prerequisites

- **Node.js** >= 18.0.0
- **Wiki.js** instance with API access
- **Azure AD** tenant (for HTTP mode authentication)

### Obtaining Wiki.js API Token

1. Log into your Wiki.js instance as an administrator
2. Navigate to **Settings → Users → Personal Access Tokens**
3. Create a new token with appropriate permissions
4. Copy the token (shown only once)

### Obtaining Azure AD Credentials

For HTTP mode (required for Claude Desktop):

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Microsoft Entra ID** (formerly Azure AD)
3. Note your **Tenant ID** from the Overview page
4. Go to **App registrations** and create a new registration
5. Note the **Application (client) ID**
6. Configure authentication for your MCP client (single-page app, web app, etc.)

---

## Quick Start

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

# Azure AD Configuration (for HTTP mode)
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

---

## Configuration

### Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `PORT` | No | Server port (default: 8000) | `3200` |
| `WIKIJS_BASE_URL` | Yes | Wiki.js base URL (without `/graphql`) | `http://localhost:3000` |
| `WIKIJS_TOKEN` | Yes | Wiki.js API token | `your_token_here` |
| `AZURE_TENANT_ID` | Yes* | Azure AD tenant ID (UUID) | `550e8400-e29b-41d4-a716-446655440000` |
| `AZURE_CLIENT_ID` | Yes* | Azure AD application ID (UUID) | `6ba7b810-9dad-11d1-80b4-00c04fd430c8` |
| `MCP_RESOURCE_URL` | Yes* | Public URL of this MCP server | `http://localhost:3200` |
| `MCP_RESOURCE_DOCS_URL` | No | Documentation URL | `https://docs.example.com` |

*Required for HTTP mode with authentication

### Configuration Validation

The server validates all configuration on startup and will provide detailed error messages if:
- Required environment variables are missing
- URLs are malformed
- UUIDs are invalid
- API token is empty

---

## Claude Desktop Setup

Claude Desktop uses the MCP protocol to connect to external tools. Here's how to configure it:

### Step 1: Start the MCP Server

```bash
npm start
```

Verify the server is running:

```bash
curl http://localhost:3200/health
```

### Step 2: Configure Claude Desktop

1. Open Claude Desktop
2. Go to **Settings → Developer → Edit Config**
3. Add the following to your `claude_desktop_config.json`:

#### For Local Development (STDIO mode - simpler setup)

```json
{
  "mcpServers": {
    "wikijs": {
      "command": "node",
      "args": ["/absolute/path/to/wikijs-mcp-server/lib/mcp_wikijs_stdin.js"],
      "env": {
        "WIKIJS_BASE_URL": "http://localhost:3000",
        "WIKIJS_TOKEN": "your_wikijs_api_token_here"
      }
    }
  }
}
```

#### For HTTP Mode (with authentication)

```json
{
  "mcpServers": {
    "wikijs": {
      "url": "http://localhost:3200/mcp",
      "transport": "http"
    }
  }
}
```

> **Note:** HTTP mode requires Azure AD authentication. The client must provide a valid JWT bearer token.

### Step 3: Restart Claude Desktop

After saving the configuration, restart Claude Desktop completely.

### Step 4: Verify Connection

In Claude Desktop, you should now have access to Wiki.js tools. Try asking:

> "List all the pages in my wiki"

or

> "Search my wiki for pages about [topic]"

---

## Other MCP Clients

### Cursor IDE

1. Create `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "wikijs": {
      "transport": "http",
      "url": "http://localhost:3200/mcp",
      "cwd": ".",
      "env": {
        "WIKIJS_BASE_URL": "http://localhost:3000",
        "WIKIJS_TOKEN": "your_real_token_here"
      }
    }
  }
}
```

2. Restart Cursor
3. Look for tools prefixed with `mcp_wikijs_`

### VS Code (with MCP extension)

Add to your VS Code settings:

```json
{
  "mcp.servers": {
    "wikijs": {
      "command": "node",
      "args": ["/path/to/wikijs-mcp-server/lib/mcp_wikijs_stdin.js"],
      "cwd": "/path/to/wikijs-mcp-server"
    }
  }
}
```

---

## Available Tools

### Page Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `get_page` | Get page information by ID | `id` (number, required) |
| `get_page_content` | Get page content by ID | `id` (number, required) |
| `list_pages` | List published pages | `limit` (number), `orderBy` ("TITLE" \| "CREATED" \| "UPDATED") |
| `search_pages` | Search published pages | `query` (string, required), `limit` (number) |
| `create_page` | Create a new page | `title`, `content`, `path` (all required), `description` (optional) |
| `update_page` | Update page content | `id` (number, required), `content` (string, required) |
| `delete_page` | Delete a page | `id` (number, required) |
| `list_all_pages` | List all pages including unpublished | `limit`, `orderBy`, `includeUnpublished` |
| `search_unpublished_pages` | Search unpublished pages | `query` (string, required), `limit` (number) |
| `force_delete_page` | Delete page including unpublished | `id` (number, required) |
| `get_page_status` | Get page publication status | `id` (number, required) |
| `publish_page` | Publish an unpublished page | `id` (number, required) |

### User Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `list_users` | List all users | None |
| `search_users` | Search users by query | `query` (string, required) |
| `create_user` | Create a new user | `email`, `name`, `passwordRaw` (required), `providerKey`, `groups`, `mustChangePassword`, `sendWelcomeEmail` (optional) |
| `update_user` | Update user name | `id` (number, required), `name` (string, required) |

### Group Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `list_groups` | List user groups | None |

---

## API Endpoints

### HTTP Endpoints

| Endpoint | Method | Description | Auth |
|----------|--------|-------------|------|
| `/health` | GET | Health check | None |
| `/` | GET | Server info and endpoint discovery | None |
| `/mcp` | POST | MCP JSON-RPC endpoint | JWT |
| `/.well-known/oauth-protected-resource` | GET | OAuth Protected Resource Metadata | None |

### Example MCP Requests

#### Get Page

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_page",
    "arguments": { "id": 123 }
  }
}
```

#### Search Pages

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "search_pages",
    "arguments": { "query": "documentation", "limit": 10 }
  }
}
```

#### Create Page

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "create_page",
    "arguments": {
      "title": "New Page",
      "content": "# Welcome\n\nThis is **markdown** content.",
      "path": "docs/new-page",
      "description": "A new documentation page"
    }
  }
}
```

---

## Authentication

### OAuth 2.0 / JWT (HTTP Mode)

The HTTP server uses Azure AD OAuth 2.0 for authentication:

1. Client obtains JWT token from Azure AD
2. Token includes required scopes
3. Token is sent as Bearer token in Authorization header

### Supported Scopes

| Scope | Description | Access Level |
|-------|-------------|--------------|
| `wikijs:read` | Read pages and users | Read-only operations |
| `wikijs:write` | Create/update/delete pages | Write operations |
| `wikijs:admin` | Full access including user management | Admin operations |

### Protected Resource Metadata

The server implements [RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728) OAuth Protected Resource Metadata:

```bash
curl http://localhost:3200/.well-known/oauth-protected-resource
```

Response:

```json
{
  "resource": "http://localhost:3200",
  "authorization_servers": ["https://login.microsoftonline.com/{tenant-id}/v2.0"],
  "scopes_supported": ["wikijs:read", "wikijs:write", "wikijs:admin"],
  "bearer_methods_supported": ["header"]
}
```

---

## Development

### Project Structure

```
wikijs-mcp-server/
├── src/                    # TypeScript source code
│   ├── server.ts          # Fastify HTTP server entry point
│   ├── api.ts             # Wiki.js GraphQL API client
│   ├── config.ts          # Configuration with Zod validation
│   ├── types.ts           # TypeScript type definitions
│   ├── mcp-tools.ts       # MCP tool definitions and handlers
│   ├── auth/              # Authentication middleware
│   │   ├── middleware.ts  # JWT validation middleware
│   │   └── types.ts       # Auth-related types
│   └── routes/            # HTTP route definitions
│       ├── public-routes.ts   # Health check, server info
│       └── mcp-routes.ts      # MCP JSON-RPC endpoint
├── lib/                   # Compiled/legacy JavaScript
│   └── mcp_wikijs_stdin.js    # STDIO transport server
├── scripts/               # Utility scripts
├── tests/                 # Test suite
├── dist/                  # Compiled TypeScript output
├── .env                   # Environment configuration
├── example.env            # Environment template
└── package.json           # Project metadata
```

### Available Scripts

```bash
# Setup
npm run setup          # Initial project setup
npm run build          # Compile TypeScript

# Running
npm start              # Start HTTP server
npm run server:stdio   # Start STDIO server
npm run dev            # Development mode with hot reload

# Testing
npm test               # Run tests
npm run test:watch     # Watch mode

# Utilities
npm run stop           # Stop running servers
```

### Key Dependencies

| Package | Purpose |
|---------|---------|
| `@modelcontextprotocol/sdk` | MCP protocol implementation |
| `fastify` | HTTP server framework |
| `graphql-request` | Wiki.js GraphQL API client |
| `jose` | JWT processing and validation |
| `zod` | Schema validation |

---

## Troubleshooting

### Server won't start

**Check configuration:**
```bash
# Verify environment variables are set
cat .env

# Check for validation errors in logs
npm start
```

**Common issues:**
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

### Claude Desktop not seeing tools

1. Ensure MCP server is running
2. Check configuration file syntax (valid JSON)
3. Restart Claude Desktop completely
4. Check Claude Desktop logs for errors

### Authentication failures (HTTP mode)

1. Verify Azure AD credentials are correct
2. Check JWT token hasn't expired
3. Ensure token includes required scopes
4. Verify `MCP_RESOURCE_URL` matches your server URL

---

## Architecture

### Request Flow

```
┌─────────────┐     ┌─────────────────┐     ┌──────────────┐
│  MCP Client │────▶│  MCP Server     │────▶│   Wiki.js    │
│  (Claude)   │     │  (Fastify)      │     │  (GraphQL)   │
└─────────────┘     └─────────────────┘     └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │   Azure AD   │
                    │  (JWT Auth)  │
                    └──────────────┘
```

### Multi-Stage Search

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
- [Anthropic](https://www.anthropic.com/) - MCP protocol developer

---

## Support

If this project helped you, please give it a ⭐ on GitHub!

Have questions? Create an [Issue](https://github.com/heAdz0r/wikijs-mcp-server/issues).
