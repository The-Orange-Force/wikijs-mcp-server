# Phase 9: Docker Packaging - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Create three Docker configuration files — `.dockerignore`, `Dockerfile` (multi-stage), `docker-compose.yml` — to package the MCP server as a deployable container reachable by Caddy on caddy_net with no host port exposure. No application code changes.

</domain>

<decisions>
## Implementation Decisions

### Base image and runtime (carried forward from roadmap)
- Base image: `node:20-slim` (not Alpine — `@azure/msal-node` has documented musl libc issues)
- Start command: `CMD ["node", "dist/server.js"]` — not `npm start` (npm adds shell indirection; SIGTERM from `docker stop` reaches npm instead of Node, causing hard kill)

### Source maps and declaration files
- Strip `.js.map` files from final image (smaller image, no TypeScript source paths exposed)
- Strip `.d.ts` declaration files too (only needed by library consumers, not a running server)
- Method: delete in the build stage before `COPY dist/` into runtime image — `find dist/ -name '*.map' -o -name '*.d.ts' | xargs rm -f`
- `.dockerignore` cannot do this (only filters host build context, not generated files inside builder stage)

### HEALTHCHECK
- `--start-period=30s` — enough for Node.js + Fastify startup; JWKS is fetched lazily on first JWT validation, not at startup, so `/health` is fast
- `--interval=30s` (Docker default)
- `--timeout=10s` (Docker default)
- `--retries=3` (Docker default) — tolerates transient blips before triggering restart

### Non-root user
- Run as `node` system user: add `USER node` before `CMD` in runtime stage
- No `chown` needed — `dist/` is read-only at runtime, Pino logs to stdout, nothing written to disk
- `node:20-slim` includes the `node` system user pre-created (uid 1000)

### Docker Compose / Caddy network
- External network name: `caddy_net` (confirmed — matches actual Caddy network on target host)
- Service name: `wikijs-mcp-server` (Caddy config: `reverse_proxy wikijs-mcp-server:PORT`)
- No `ports:` mapping — Caddy accesses via `caddy_net` network only; publishing a port would expose the JWT-protected endpoint over plain HTTP
- `restart: unless-stopped` for automatic failure recovery
- Env vars via `env_file: .env` referenced in docker-compose.yml
- Include a Caddyfile snippet as a comment block in docker-compose.yml showing how to wire Caddy

### Claude's Discretion
- Exact multi-stage Dockerfile structure (builder + runtime stages)
- `.dockerignore` contents (exclude: node_modules, .env, dist, .git, .planning, tests, scripts, *.md, etc.)
- npm install strategy in build stage (use `npm ci --omit=dev` for production-only install in runtime stage)
- Image tag name in docker-compose.yml

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `/health` endpoint (unauthenticated GET): lives in `src/routes/public-routes.ts` — HEALTHCHECK target, confirmed fast (no auth, no external calls)
- `npm run build` = `tsc` — compile TypeScript to `dist/`
- `engines.node: ">=20.0.0"` in package.json — aligns with `node:20-slim` base image

### Established Patterns
- Entry point: `dist/server.js` (from `package.json` `main` field)
- PORT env var with default 3200 (from `src/config.ts`)
- All config via environment variables, Zod-validated at startup — `.env` file is the deployment mechanism

### Integration Points
- Container must be on `caddy_net` Docker network so Caddy can reach `wikijs-mcp-server:PORT`
- No database or other container dependencies — Wiki.js runs on a separate host, accessed via `WIKIJS_BASE_URL`
- Production dependencies only needed at runtime: @azure/msal-node, @modelcontextprotocol/sdk, dotenv, fastify, fastify-plugin, graphql, graphql-request, jose, uuid, zod
- Dev dependencies (typescript, tsx, nodemon, vitest, @types/*) must NOT be in final image

</code_context>

<specifics>
## Specific Ideas

- Source map stripping happens inside the builder stage (not via .dockerignore) — `find dist/ -name '*.map' -o -name '*.d.ts' | xargs rm -f` before the runtime COPY
- Caddyfile snippet in docker-compose.yml as a comment: `reverse_proxy wikijs-mcp-server:3200` on `caddy_net`
- HEALTHCHECK probe should use `wget` (available in slim) or `curl` against `http://localhost:PORT/health`

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 09-docker-packaging*
*Context gathered: 2026-03-25*
