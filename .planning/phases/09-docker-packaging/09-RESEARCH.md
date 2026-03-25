# Phase 9: Docker Packaging - Research

**Researched:** 2026-03-25
**Domain:** Docker multi-stage builds, Docker Compose external networks, Node.js container best practices
**Confidence:** HIGH

## Summary

This phase is purely infrastructure: create `.dockerignore`, `Dockerfile`, and `docker-compose.yml` for the existing Node.js/TypeScript MCP server. No application code changes. All decisions about base image, start command, user, network name, and restart policy are locked in CONTEXT.md — research focuses on confirming correct syntax and surfacing the one material pitfall that CONTEXT.md has wrong.

**Critical finding:** `node:20-slim` does NOT include `wget` or `curl` in the final runtime image. Both utilities are installed during the Node.js installation process but are then purged to keep the image minimal. CONTEXT.md's suggestion to use `wget` for HEALTHCHECK will fail at runtime. The correct approach is `node -e` with a native HTTP request — no additional packages needed.

**Primary recommendation:** Use a two-stage Dockerfile (builder: install all deps + compile; runtime: `node:20-slim` + production deps only + stripped `dist/`). Use `node -e` for HEALTHCHECK. Use `env_file: .env` in `docker-compose.yml` with `external: true` on `caddy_net`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Base image: `node:20-slim` (not Alpine — `@azure/msal-node` has documented musl libc issues)
- Start command: `CMD ["node", "dist/server.js"]` — not `npm start` (npm adds shell indirection; SIGTERM from `docker stop` reaches npm instead of Node, causing hard kill)
- Strip `.js.map` files from final image (smaller image, no TypeScript source paths exposed)
- Strip `.d.ts` declaration files too (only needed by library consumers, not a running server)
- Method: delete in the build stage before `COPY dist/` into runtime image — `find dist/ -name '*.map' -o -name '*.d.ts' | xargs rm -f`
- `.dockerignore` cannot do this (only filters host build context, not generated files inside builder stage)
- HEALTHCHECK `--start-period=30s`, `--interval=30s`, `--timeout=10s`, `--retries=3`
- Run as `node` system user: `USER node` before `CMD` in runtime stage
- No `chown` needed — `dist/` is read-only at runtime, Pino logs to stdout, nothing written to disk
- `node:20-slim` includes the `node` system user pre-created (uid 1000)
- External network name: `caddy_net`
- Service name: `wikijs-mcp-server`
- No `ports:` mapping
- `restart: unless-stopped`
- Env vars via `env_file: .env` referenced in docker-compose.yml
- Include a Caddyfile snippet as a comment block in docker-compose.yml

### Claude's Discretion
- Exact multi-stage Dockerfile structure (builder + runtime stages)
- `.dockerignore` contents (exclude: node_modules, .env, dist, .git, .planning, tests, scripts, *.md, etc.)
- npm install strategy in build stage (use `npm ci --omit=dev` for production-only install in runtime stage)
- Image tag name in docker-compose.yml

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DOCK-01 | Operator can build a production Docker image with `docker compose build` | Multi-stage Dockerfile with builder + runtime stages; `docker-compose.yml` with `build: .` |
| DOCK-02 | Built image contains only compiled output (`dist/`) and production dependencies — no TypeScript source, dev deps, or `.env` secrets | Multi-stage: builder compiles, runtime stage copies only `dist/` and `npm ci --omit=dev` modules; `.dockerignore` blocks host secrets; map/dts stripping in builder |
| DOCK-03 | Container starts the HTTP server on startup, binding to `0.0.0.0` on the configured `PORT` | `server.ts` already binds `0.0.0.0`; `CMD ["node", "dist/server.js"]` reaches the server directly; PORT from env |
| DOCK-04 | Docker reports the container healthy via HEALTHCHECK against `/health` | `/health` returns HTTP 200 always (even when Wiki.js is down); use `node -e` not `wget` — curl/wget purged from node:20-slim |
| DOCK-05 | Container is reachable by Caddy on the `caddy_net` network by service name `wikijs-mcp-server` — no port published to the host | `networks: caddy_net: external: true` in docker-compose.yml; no `ports:` key; Docker DNS resolves service name |
| DOCK-06 | Container restarts automatically on failure (`restart: unless-stopped`) | `restart: unless-stopped` in docker-compose.yml service definition |
| DOCK-07 | Operator provides all environment variables via a `.env` file referenced in `docker-compose.yml` | `env_file: .env` in service definition; `.env` excluded from image via `.dockerignore` |
</phase_requirements>

## Standard Stack

### Core
| File | Purpose | Standard approach |
|------|---------|-------------------|
| `.dockerignore` | Exclude host files from build context | Block: `node_modules`, `.env*`, `dist/`, `.git`, `.planning`, `tests/`, `scripts/`, `*.md`, `*.log` |
| `Dockerfile` | Multi-stage build | Stage 1 `builder`: install all deps + `tsc`; Stage 2 `runtime`: copy `dist/` + `npm ci --omit=dev` |
| `docker-compose.yml` | Orchestrate container + networks | `build: .`, `env_file: .env`, `restart: unless-stopped`, external `caddy_net` |

### Multi-Stage Build Structure

Two stages are sufficient. A third "deps" stage is unnecessary for a project this size.

| Stage | From | Purpose |
|-------|------|---------|
| `builder` | `node:20-slim` | Install ALL deps, run `tsc`, strip maps/declarations |
| `runtime` | `node:20-slim` | Copy `dist/`, install production deps only, drop to `node` user |

**Why same base for both stages:** Ensures the npm/node versions are identical between compile and run, avoids architecture mismatch surprises.

### Supporting
| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| `npm ci` | bundled with node:20 | Reproducible install from lockfile | Always — never `npm install` in Docker |
| `npm ci --omit=dev` | npm v9+ | Skip devDependencies | Runtime stage only |
| `find ... | xargs rm -f` | POSIX | Strip map/dts files post-compile | Builder stage, after `npm run build` |

**Installation (already in package.json — no new packages needed):**
```bash
# Nothing to install — this phase creates config files only
```

## Architecture Patterns

### Recommended File Layout
```
wikijs-mcp-server/
├── .dockerignore       # NEW — excludes secrets and build artifacts from context
├── Dockerfile          # NEW — two-stage build
├── docker-compose.yml  # NEW — service, network, env, restart, healthcheck
└── src/                # UNCHANGED
```

### Pattern 1: Two-Stage Dockerfile

**What:** Stage 1 (`builder`) compiles TypeScript and strips artefacts; Stage 2 (`runtime`) runs only production Node.js with the compiled output.

**When to use:** Any TypeScript/compiled project where the build toolchain must not appear in the production image.

**Example:**
```dockerfile
# Source: official Docker multi-stage docs + nodejs/docker-node
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build
# Strip source maps and type declarations — not needed at runtime
RUN find dist/ -name '*.map' -o -name '*.d.ts' | xargs rm -f

FROM node:20-slim AS runtime
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist/
COPY lib/ ./lib/
USER node
HEALTHCHECK --start-period=30s --interval=30s --timeout=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 8000) + '/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"
CMD ["node", "dist/server.js"]
```

### Pattern 2: External Network in docker-compose.yml

**What:** Declare `caddy_net` as external so Docker Compose joins a pre-existing network rather than creating a new one.

**When to use:** When a reverse proxy (Caddy, Traefik) manages a shared bridge network that multiple services attach to.

**Example:**
```yaml
# Source: https://docs.docker.com/compose/how-tos/networking/
services:
  wikijs-mcp-server:
    build: .
    image: wikijs-mcp:latest
    container_name: wikijs-mcp-server
    restart: unless-stopped
    env_file: .env
    networks:
      - caddy_net
    # No ports: — Caddy accesses via caddy_net by service name

networks:
  caddy_net:
    external: true
    name: caddy_net
```

### Pattern 3: HEALTHCHECK with node -e (no curl/wget)

**What:** Use Node.js's built-in `http` module for health probing — zero dependency on curl/wget which are NOT present in `node:20-slim` after build cleanup.

**When to use:** Always — this is the only reliable tool available in the runtime stage without extra apt installs.

**Example:**
```dockerfile
HEALTHCHECK --start-period=30s --interval=30s --timeout=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 8000) + '/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"
```

Note: `PORT` default in `src/config.ts` is `8000`. CONTEXT.md mentions 3200 — code is authoritative, 8000 is correct.

### Pattern 4: .dockerignore

**What:** Exclude build context items that increase build context size or risk leaking secrets.

**When to use:** Always — a missing `.dockerignore` sends `node_modules` (hundreds of MB) and `.env` to the Docker daemon.

**Example:**
```
# Dependencies (install inside Docker, not from host)
node_modules/

# Secrets — never in image
.env
.env.*

# Build output (will be generated inside builder stage)
dist/

# Source control
.git/
.gitignore

# Planning/docs (not needed at runtime)
.planning/
*.md
!README.md

# Tests and dev tools
tests/
scripts/

# OS/editor artifacts
.DS_Store
*.log
*.swp
*.swo
.idea/
.vscode/
```

### Anti-Patterns to Avoid

- **`npm install` instead of `npm ci`:** `npm install` may update lock file; `npm ci` is deterministic and fails if lock file is inconsistent.
- **Copying `node_modules` from host:** Host modules may be built for the wrong platform (macOS vs Linux). Always install inside the container.
- **`COPY . .` before npm install:** Busts layer cache on every source change. Copy `package*.json` first, run `npm ci`, then copy source.
- **`ENV` with secrets:** Never use `ENV` for tokens or passwords — they bake into the image layer history. Use `env_file` at runtime.
- **`ports:` mapping:** Exposes the JWT-protected MCP endpoint over plain HTTP, bypassing Caddy's TLS termination.
- **`USER root` in runtime:** Never run production Node.js as root. `node:20-slim` provides `node` user (uid 1000) pre-created.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Reproducible dep install | Custom shell scripts | `npm ci` | Strict lockfile adherence, faster, atomic |
| Health probe tool | Install curl via apt-get | `node -e` inline script | curl/wget not present in node:20-slim after purge; node is always available; no extra layer |
| Production dep filtering | Parse package.json manually | `npm ci --omit=dev` | npm handles devDependencies exclusion correctly including transitive deps |
| Network DNS resolution | `--link` or hardcoded IPs | Docker Compose service names | Docker's internal DNS resolves service names automatically on shared networks |

**Key insight:** `node:20-slim` strips curl/wget after using them to install Node.js. Do not assume network utilities exist in the final image. The Node.js runtime itself is always the most reliable tool for HTTP probing.

## Common Pitfalls

### Pitfall 1: wget/curl Not Available in node:20-slim Runtime
**What goes wrong:** `HEALTHCHECK CMD wget --spider http://localhost:PORT/health` exits non-zero immediately because wget was purged from the final image during the Node.js installation process. Docker marks container unhealthy immediately after start period.
**Why it happens:** `node:20-slim` installs curl/wget to verify Node.js download signatures, then runs `apt-get purge --auto-remove` to keep the image minimal. Neither tool survives into the final layer.
**How to avoid:** Use `node -e "require('http').get(...)"` — Node.js is always present. Or explicitly `RUN apt-get update && apt-get install -y --no-install-recommends wget && rm -rf /var/lib/apt/lists/*` in the runtime stage (adds ~3MB, not recommended).
**Warning signs:** `docker inspect <container> --format '{{.State.Health.Status}}'` returns `unhealthy` immediately; `docker logs` shows no startup error.

### Pitfall 2: WIKIJS_BASE_URL = localhost in .env on Deploy Host
**What goes wrong:** `WIKIJS_BASE_URL=http://localhost:3000` resolves to the MCP container's own loopback, not to Wiki.js running on the host or another server.
**Why it happens:** Inside a Docker container, `localhost` is the container itself. The host's services are not at `localhost`.
**How to avoid:** Use the actual host IP, hostname, or Docker service name: `http://192.168.1.x:3000` or `http://host.docker.internal:3000` (Docker Desktop only).
**Warning signs:** `/health` endpoint returns `status: "error"`, Wiki.js tools return connection errors.

### Pitfall 3: External Network Does Not Exist at docker compose up
**What goes wrong:** `docker compose up` fails with `network caddy_net declared as external, but could not be found`.
**Why it happens:** `external: true` means Compose expects the network to pre-exist. If Caddy is not running or was started with a different network name, the network is absent.
**How to avoid:** Verify with `docker network ls | grep caddy` before deploy. If absent, start the Caddy compose stack first.
**Warning signs:** Immediate `docker compose up` error mentioning the network name.

### Pitfall 4: Layer Cache Busting on Source Changes
**What goes wrong:** `npm ci` re-runs on every source file change, making builds slow.
**Why it happens:** `COPY . .` before `npm ci` means any file change (even a comment) invalidates the `npm ci` layer.
**How to avoid:** Copy `package*.json` first, run `npm ci`, then copy source. Docker caches the `npm ci` layer until `package*.json` changes.

### Pitfall 5: /health Returns 200 Even When Wiki.js Is Down
**What goes wrong:** HEALTHCHECK passes even when the MCP server cannot reach Wiki.js.
**Why it happens:** `GET /health` in `public-routes.ts` always returns HTTP 200. When `wikiJsApi.checkConnection()` fails, the response body contains `{status: "error"}` but the HTTP status is still 200.
**How to avoid:** This is intentional behavior — Docker health reflects whether the HTTP server is up, not whether Wiki.js is reachable. Wiki.js connection failures are operational concerns logged via Pino, not container lifecycle concerns. Accept this behavior.

### Pitfall 6: dist/ Copied with Source Maps Exposed
**What goes wrong:** `tsconfig.json` has `"sourceMap": true` and `"declaration": true` — `tsc` outputs `.js.map` and `.d.ts` alongside every `.js` file. Without stripping, these reach the runtime image and expose TypeScript source paths.
**Why it happens:** `.dockerignore` only filters the host build context. Files generated inside the `builder` stage are not filtered by `.dockerignore`.
**How to avoid:** Run `find dist/ -name '*.map' -o -name '*.d.ts' | xargs rm -f` in the builder stage before `COPY --from=builder`. Confirmed decision from CONTEXT.md.

## Code Examples

Verified patterns from official sources:

### Complete Dockerfile (prescriptive, ready to implement)
```dockerfile
# Source: nodejs/docker-node + official Docker multi-stage docs
FROM node:20-slim AS builder
WORKDIR /app

# Cache npm install separately from source
COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# Strip source maps and type declarations — not needed at runtime
RUN find dist/ -name '*.map' -o -name '*.d.ts' | xargs rm -f

# ---------------------------------------------------------------------------

FROM node:20-slim AS runtime
WORKDIR /app

# Production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled output from builder (already stripped)
COPY --from=builder /app/dist ./dist/

# Copy STDIO stub (used by lib/mcp_wikijs_stdin.js if needed)
COPY lib/ ./lib/

# Run as non-root (node user exists in node:20-slim, uid 1000)
USER node

HEALTHCHECK --start-period=30s --interval=30s --timeout=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 8000) + '/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/server.js"]
```

### Complete docker-compose.yml
```yaml
# Source: https://docs.docker.com/compose/how-tos/networking/
services:
  wikijs-mcp-server:
    build: .
    image: wikijs-mcp:latest
    container_name: wikijs-mcp-server
    restart: unless-stopped
    env_file: .env
    networks:
      - caddy_net
    # No ports: mapping — Caddy accesses via caddy_net by service name
    # Caddy config snippet (add to your Caddyfile):
    #
    #   your-domain.example.com {
    #     reverse_proxy wikijs-mcp-server:8000
    #   }
    #
    # Requires caddy_net to already exist:
    #   docker network create caddy_net
    #   (or it is created by your Caddy compose stack)

networks:
  caddy_net:
    external: true
    name: caddy_net
```

### Minimal .dockerignore
```
node_modules/
.env
.env.*
dist/
.git/
.gitignore
.planning/
tests/
scripts/
*.md
!README.md
*.log
.DS_Store
*.swp
*.swo
.idea/
.vscode/
```

### HEALTHCHECK node -e pattern (portable)
```dockerfile
# Reads PORT from env with fallback to 8000 (the config.ts default)
HEALTHCHECK --start-period=30s --interval=30s --timeout=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 8000) + '/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `npm install --production` | `npm ci --omit=dev` | npm v9 | `--only=production` deprecated; `--omit=dev` is the current flag |
| `--only=production` | `--omit=dev` | npm v9+ | Same behavior, new flag name; use `--omit=dev` |
| Separate "deps" stage for node_modules | Two-stage (builder + runtime) | Current best practice | Three stages add complexity with minimal benefit for this project |
| `EXPOSE` instruction required | `EXPOSE` is documentation only | Always | `EXPOSE` does not publish ports; use as documentation if desired, not required |

**Deprecated/outdated:**
- `npm install --only=production`: Deprecated since npm v9, replaced by `npm ci --omit=dev`
- `--link` for container networking: Deprecated Docker feature, replaced by user-defined networks and service DNS

## Open Questions

1. **PORT default discrepancy**
   - What we know: `src/config.ts` has `PORT: z.string().default("8000")` — default port is `8000`. CONTEXT.md states "PORT env var with default 3200".
   - What's unclear: Whether an operator `.env` file sets `PORT=3200` or whether 8000 is the actual deployment port.
   - Recommendation: HEALTHCHECK and Caddyfile comment should use `process.env.PORT || 8000` to read from the env at runtime, making the PORT value irrelevant to the image. The Caddyfile comment in docker-compose.yml should reference `PORT` generically rather than hardcoding a number.

2. **caddy_net network pre-existence**
   - What we know: `external: true` requires the network to exist before `docker compose up`.
   - What's unclear: Whether `caddy_net` is created by a separate Caddy compose stack or manually.
   - Recommendation: Add operator instructions in docker-compose.yml comments: `docker network create caddy_net` if Caddy manages it externally.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.x |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

This phase creates Docker configuration files only — no application code changes. The requirements are validated by **operator commands**, not automated unit tests.

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DOCK-01 | `docker compose build` succeeds | manual/smoke | `docker compose build` | ❌ Wave 0 — docker build verification |
| DOCK-02 | Image contains no source/dev-deps/secrets | manual | `docker history wikijs-mcp:latest` + `docker run --rm wikijs-mcp:latest ls /app/src` should fail | ❌ Wave 0 — inspection commands |
| DOCK-03 | HTTP server binds 0.0.0.0:PORT | manual | `docker compose up -d && docker exec wikijs-mcp-server curl http://localhost:8000/health` | ❌ Wave 0 — runtime check |
| DOCK-04 | Docker reports container healthy | manual | `docker inspect wikijs-mcp-server --format '{{.State.Health.Status}}'` | ❌ Wave 0 — inspect command |
| DOCK-05 | Caddy can reach container via service name | manual | `docker run --rm --network caddy_net curlimages/curl http://wikijs-mcp-server:PORT/health` | ❌ Wave 0 — network verification |
| DOCK-06 | Restart policy set | automated (lint) | `grep "restart: unless-stopped" docker-compose.yml` | ❌ Wave 0 — file check |
| DOCK-07 | env_file referenced | automated (lint) | `grep "env_file" docker-compose.yml` | ❌ Wave 0 — file check |

Existing Vitest test suite (`npm test`) remains valid — it tests application logic, not Docker packaging. No new Vitest tests are needed for this phase.

### Sampling Rate
- **Per task commit:** Existing `npm test` (97 tests) — confirm no application regressions
- **Per wave merge:** `docker compose build` + `docker compose up -d` + health inspect
- **Phase gate:** All 7 DOCK requirements verified via manual inspection commands before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `Dockerfile` — must exist before any validation
- [ ] `.dockerignore` — must exist before any validation
- [ ] `docker-compose.yml` — must exist before any validation
- [ ] Operator checklist: manual verification commands for DOCK-01 through DOCK-07

## Sources

### Primary (HIGH confidence)
- [nodejs/docker-node main/20/bookworm-slim/Dockerfile](https://github.com/nodejs/docker-node/blob/main/20/bookworm-slim/Dockerfile) — confirmed curl/wget are purged from final image
- [Docker Compose Networking docs](https://docs.docker.com/compose/how-tos/networking/) — external network syntax verified
- [npm-ci docs](https://docs.npmjs.com/cli/v11/commands/npm-ci/) — `--omit=dev` confirmed as current flag (replaces `--only=production`)
- Project source files: `src/config.ts`, `src/server.ts`, `src/routes/public-routes.ts`, `tests/smoke.test.ts` — PORT default (8000), server binding (0.0.0.0), health endpoint behavior (always HTTP 200)

### Secondary (MEDIUM confidence)
- [Docker multi-stage builds docs](https://docs.docker.com/build/building/multi-stage/) — two-stage pattern
- [curl no longer shipped with node:slim issue #1185](https://github.com/nodejs/docker-node/issues/1185) — historical context for curl/wget removal

### Tertiary (LOW confidence)
- Various community blog posts on Node.js Docker patterns — corroborated by official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Dockerfile/docker-compose.yml syntax verified against official docs; node:20-slim package availability verified against official Dockerfile source
- Architecture: HIGH — patterns are well-established, confirmed against project's actual entry points and PORT defaults
- Pitfalls: HIGH — wget/curl absence confirmed by official nodejs/docker-node source; other pitfalls from authoritative sources

**Research date:** 2026-03-25
**Valid until:** 2026-09-25 (node:20-slim is an LTS image; Docker Compose v2 syntax is stable)
