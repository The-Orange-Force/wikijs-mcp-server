# CLAUDE.md — wikijs-mcp-server

Agent guidance for the `wikijs-mcp-server` project. Read this before touching any code.

---

## What This Project Is

A **Model Context Protocol (MCP) server** that bridges AI assistants (Claude Desktop, Claude Code, Cursor IDE) with a Wiki.js instance. AI tools can search, read, create, update, and delete wiki pages via a GraphQL API.

- **Transport**: HTTP (Fastify) and STDIO
- **Auth**: Azure AD OAuth 2.1 — Bearer token validated via JWKS, scope-based access control
- **Tools**: 17 registered MCP tools (pages, users, groups)
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

TypeScript compiles to `dist/`. The project uses `NodeNext` modules — **all imports must include `.js` extensions**.

---

## Project Structure

```
src/
  server.ts          # Entry point — Fastify app factory and startup
  api.ts             # WikiJsApi class — all GraphQL calls to Wiki.js
  mcp-tools.ts       # 17 MCP tool registrations with Zod schemas
  tool-wrapper.ts    # wrapToolHandler() — timing + structured logging
  config.ts          # Zod-validated env config, fail-fast at startup
  types.ts           # WikiJsPage, WikiJsUser, WikiJsGroup interfaces
  scopes.ts          # OAuth scope constants + SCOPE_TOOL_MAP / TOOL_SCOPE_MAP
  request-context.ts # AsyncLocalStorage for correlationId + user identity
  logging.ts         # Pino logger config with UUID correlation IDs
  routes/
    mcp-routes.ts    # POST /mcp — protected MCP JSON-RPC endpoint
    public-routes.ts # GET /, /health, /.well-known/oauth-protected-resource
  auth/
    middleware.ts    # JWT validation Fastify plugin (RFC 6750)
    errors.ts        # Jose error → RFC 6750 response mapping
    types.ts         # AuthenticatedUser interface
    __tests__/       # Auth unit tests + test helpers (JWT generation)
tests/               # Integration tests (smoke, config, discovery, scopes, etc.)
tests/helpers/       # buildTestApp() — shared Fastify app for tests
lib/                 # mcp_wikijs_stdin.js — STDIO transport stub
scripts/             # Shell scripts: start, stop, test_mcp.js, setup
```

---

## Essential Commands

```bash
npm run dev          # Start dev server with auto-reload (ts-node + nodemon)
npm run build        # Compile TypeScript → dist/
npm start            # Start HTTP server (production)
npm test             # Run all tests (vitest run)
npm run test:watch   # Tests in watch mode
npm run test:smoke   # Smoke tests only
```

---

## Environment Variables

Copy `example.env` to `.env`. Required vars:

| Variable | Purpose |
|---|---|
| `WIKIJS_BASE_URL` | Wiki.js base URL (e.g., `http://localhost:3000`) |
| `WIKIJS_TOKEN` | Wiki.js API token |
| `AZURE_TENANT_ID` | Azure AD tenant (UUID) |
| `AZURE_CLIENT_ID` | Azure AD client (UUID) |
| `MCP_RESOURCE_URL` | Public URL of this MCP server |

Optional: `PORT` (default 3200), `DEBUG`, `WIKIJS_LOCALE`, `MCP_RESOURCE_DOCS_URL`.

Config validation fails fast at startup via Zod — missing/invalid vars abort immediately.

---

## Architecture Patterns

### Adding a New MCP Tool

1. Add an API method to `WikiJsApi` in `src/api.ts` using a GraphQL template string
2. Register the tool in `createMcpServer()` in `src/mcp-tools.ts` with a Zod input schema
3. Wrap the handler: `wrapToolHandler("tool_name", async (args) => { ... })`
4. Return `{ content: [{ type: "text", text: "..." }] }` on success
5. Catch errors and return `{ isError: true, content: [{ type: "text", text: "Error: ..." }] }`
6. Add the tool to `SCOPE_TOOL_MAP` in `src/scopes.ts` under the appropriate scope

### GraphQL Query Pattern

```typescript
const query = `
  {
    pages {
      list (limit: ${limit}, orderBy: ${orderBy}) {
        id path title description createdAt updatedAt
      }
    }
  }
`;
const response = await this.client.request(query);
```

Values are embedded via `JSON.stringify()` — there is no parameterized query layer.

### GraphQL Mutation Pattern

```typescript
const mutation = `
  mutation {
    pages {
      create(
        title: ${JSON.stringify(title)}
        content: ${JSON.stringify(content)}
        path: ${JSON.stringify(path)}
        editor: "markdown"
        isPublished: true
      ) {
        responseResult { succeeded errorCode slug message }
      }
    }
  }
`;
```

### Accessing Request Context in Tools

```typescript
import { requestContext } from "./request-context.js";

const ctx = requestContext.getStore();
ctx?.log.info({ userId: ctx.userId, field }, "message");
```

### Adding a New Route

- **Public**: add to `publicRoutes()` in `src/routes/public-routes.ts`
- **Protected** (JWT-enforced): add to `protectedRoutes()` in `src/routes/mcp-routes.ts`
- Set `reply.header("x-request-id", request.id)` for correlation tracking

---

## Testing

### Test File Locations

| File | What it tests |
|---|---|
| `tests/smoke.test.ts` | Full MCP endpoint integration (server lifecycle, tool invocation) |
| `tests/config.test.ts` | Env var schema validation |
| `tests/discovery.test.ts` | OAuth discovery endpoint |
| `tests/scopes.test.ts` | Scope-to-tool mapping |
| `tests/route-protection.test.ts` | Auth enforcement, correlation ID propagation |
| `tests/observability.test.ts` | Structured logging, timing, user identity in logs |
| `src/auth/__tests__/middleware.test.ts` | JWT validation, claims, scope enforcement |
| `src/auth/__tests__/errors.test.ts` | Jose error mapping, WWW-Authenticate headers |

### Key Test Helpers

**`tests/helpers/build-test-app.ts`** — `buildTestApp()` creates a Fastify app with:
- Local JWKS (no Azure AD needed)
- `mockWikiJsApi` object with stub implementations
- All routes registered, port 0

**`src/auth/__tests__/helpers.ts`** — JWT helpers:
- `createTestToken(claims?)` — valid RS256 signed token
- `createExpiredToken()` — expired token for rejection tests
- `createTokenWithClaims(claims, options?)` — custom audience/issuer
- `getLocalJwks()` — local JWKS set for auth plugin

### Writing a New Test

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildTestApp } from "./helpers/build-test-app.js";
import { createTestToken } from "../src/auth/__tests__/helpers.js";

describe("feature name", () => {
  let app: FastifyInstance;
  let validToken: string;

  beforeAll(async () => {
    validToken = await createTestToken();
    app = await buildTestApp();
    await app.ready();
  });

  afterAll(async () => { await app.close(); });

  it("should do the thing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: { authorization: `Bearer ${validToken}` },
      payload: { jsonrpc: "2.0", id: 1, method: "tools/call",
                 params: { name: "your_tool", arguments: {} } },
    });
    expect(res.statusCode).toBe(200);
  });
});
```

**Vitest config** (`vitest.config.ts`) pre-sets test env vars — no `.env` needed for tests.

---

## Code Conventions

- **ES modules** — `import/export`, `.js` extensions on all relative imports
- **2-space indentation**, semicolons throughout
- **TypeScript strict mode** — no `any`, no implicit types
- **Zod** for all external input validation (env vars, MCP tool inputs)
- **Never log raw tokens** — truncate or mask for debugging
- **No barrel files** — import from specific modules
- Tool names: `snake_case` (MCP standard)
- Types: `PascalCase` (e.g., `WikiJsPage`, `AppConfig`)
- Functions: `camelCase`
- Env vars: `UPPER_CASE`

---

## Commit Message Convention

Follows Conventional Commits with phase scope and co-author attribution:

```
<type>(<scope>): <subject>

<body explaining why>

Co-Authored-By: Claude <noreply@anthropic.com>
```

**Types**: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`
**Scope examples**: `(phase-08)`, `(08-01)`, `(07-01:wire-tool-observability)`

---

## Development Workflow (GSD)

This project uses a **phase-based GSD (Get Stuff Done) workflow**:

```
.planning/
  PROJECT.md     # Current state, milestone history, decisions
  ROADMAP.md     # Active milestone with phase breakdown
  STATE.md       # In-progress tracking
  phases/        # Per-phase: PLAN.md, SUMMARY.md, VALIDATION.md, VERIFICATION.md
  milestones/    # Archived completed milestones
  codebase/      # Architecture, conventions, integration docs
```

**Key slash commands** (Claude Code):
- `/gsd:progress` — Show current status and route to next action
- `/gsd:plan-phase` — Plan the next phase with research + verification loop
- `/gsd:execute-phase` — Execute all plans in a phase
- `/gsd:new-milestone` — Start a new milestone cycle
- `/gsd:debug` — Systematic debugging with persistent state

When planning new work, always start with `/gsd:progress` to understand the current milestone state.

---

## Security Notes

- This server is an **OAuth 2.1 Resource Server only** — it never issues tokens
- JWT validation uses Azure JWKS fetched from `login.microsoftonline.com`
- Scopes: `wikijs:read` (7 tools), `wikijs:write` (3 tools), `wikijs:admin` (7 tools)
- All credentials come from environment variables — never hardcode tokens
- `SCOPE_TOOL_MAP` in `src/scopes.ts` is the authoritative source for access control

---

## Current State (as of 2026-03-24)

- **Milestone**: v2.0 (OAuth 2.1 Extension) — **complete and archived**
- **Tests**: 97 passing
- **Codebase**: ~4,133 lines TypeScript
- **Next**: Run `/gsd:new-milestone` to start the next milestone cycle

Possible next milestone areas: per-tool scope enforcement (`SCOPE_TOOL_MAP` is ready), JWKS pre-warming at startup, token validation metrics.
