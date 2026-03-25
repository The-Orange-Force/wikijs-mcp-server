# Architecture Research

**Domain:** Docker deployment of a TypeScript/Fastify MCP server behind Caddy reverse proxy
**Researched:** 2026-03-25
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                    Docker Host                                   │
│                                                                  │
│  ┌─────────────────────────┐        ┌────────────────────────┐   │
│  │  Caddy container        │        │  wikijs-mcp container  │   │
│  │  (ports 80/443 mapped   │        │  (internal port 3200)  │   │
│  │   to host)              │──────► │  no published ports    │   │
│  │  TLS termination        │caddy_  │  stateless Fastify app │   │
│  │  reverse_proxy          │net     │                        │   │
│  │  wikijs-mcp:3200        │        │                        │   │
│  └─────────────────────────┘        └────────────┬───────────┘   │
│                                                  │               │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    caddy_net (external Docker network)       │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
        ▲                                          │ outbound HTTPS
        │ HTTPS (port 443)                         ▼
  MCP Clients                           ┌──────────────────────┐
  (Claude Desktop,                      │  Azure AD JWKS       │
   Claude Code)                         │  (login.microsoft-   │
                                        │  online.com)         │
                                        └──────────────────────┘
                                                   │
                                                   │ outbound HTTPS
                                                   ▼
                                        ┌──────────────────────┐
                                        │  Wiki.js (remote)    │
                                        │  GraphQL API         │
                                        │  WIKIJS_BASE_URL     │
                                        └──────────────────────┘
```

**Full request path:**
```
MCP Client (Claude Desktop / Claude Code)
    │ HTTPS POST https://mcp.example.com/mcp
    │ Authorization: Bearer <Azure AD token>
    ▼
Caddy (TLS terminated, routes to wikijs-mcp:3200 via caddy_net)
    │ HTTP (plain) on internal caddy_net
    ▼
wikijs-mcp Fastify (0.0.0.0:3200 inside container)
    │ Auth middleware: jwtVerify against Azure JWKS
    │ Scope enforcement (wikijs:read/write/admin)
    │ MCP tool dispatch
    ▼
Wiki.js GraphQL API (WIKIJS_BASE_URL — outbound from container)
    │ Result returned
    ▼
MCP JSON-RPC 200 response → Caddy → client
```

### Component Responsibilities

| Component | Responsibility | Notes |
|-----------|----------------|-------|
| Dockerfile (build stage) | Install all deps (including devDeps), run `tsc`, produce `dist/` | `node:20-slim AS builder`; TypeScript compiler lives only here |
| Dockerfile (runtime stage) | Copy `dist/` + run `npm ci --omit=dev` for production deps | `node:20-slim AS runtime`; no compiler, no test runner, no source files |
| docker-compose.yml | Declare service, env_file, healthcheck, network membership | Joins external `caddy_net`; no `ports:` block; `expose: ["3200"]` for documentation |
| .dockerignore | Exclude `node_modules/`, `dist/`, `src/`, `.git`, test files | Prevents stale or dev-only content entering build context; critical for performance |
| Caddyfile (external, existing) | TLS termination + `reverse_proxy wikijs-mcp:3200` | Owned by the operator's Caddy deployment; references service by Docker DNS name |

## Recommended Project Structure

```
wikijs-mcp-server/
├── src/                   # TypeScript source (existing, unchanged)
├── dist/                  # tsc output (excluded from build context via .dockerignore)
├── node_modules/          # All deps (excluded from build context via .dockerignore)
├── tests/                 # Test files (excluded from build context)
├── .planning/             # GSD planning files (excluded from build context)
├── Dockerfile             # NEW: multi-stage build (builder + runtime stages)
├── docker-compose.yml     # NEW: single-service deployment, external caddy_net
├── .dockerignore          # NEW: build context exclusions
├── example.env            # Existing: env var template (operator creates .env from this)
├── package.json           # Existing: engines.node >=20; build/start scripts unchanged
└── tsconfig.json          # Existing: outDir "dist", NodeNext — no changes needed
```

### Structure Rationale

- **Dockerfile at root:** Docker convention. `docker build .` works from repo root without extra flags.
- **docker-compose.yml at root:** Pairs with Dockerfile. `docker compose up -d` from root.
- **.dockerignore at root:** Must sit beside the Dockerfile. Docker reads it automatically on every `docker build`.
- **No `volumes:` in compose:** Server is fully stateless (all config via env vars). Wiki.js lives on a separate host; no shared filesystem needed.
- **No `ports:` in compose:** Caddy reaches the container via the shared Docker network. Publishing a host port would expose the MCP endpoint over plain HTTP, bypassing TLS.

## Architectural Patterns

### Pattern 1: Multi-Stage TypeScript Build

**What:** Split the Dockerfile into a `builder` stage (full Node.js + TypeScript toolchain) and a `runtime` stage (minimal Node.js, only compiled output and production deps). The builder stage runs `tsc`; the runtime stage copies `dist/` and runs `npm ci --omit=dev`.

**When to use:** Every TypeScript project packaged for production. The TypeScript compiler, vitest, tsx, nodemon are devDependencies — they must never appear in the final image.

**Trade-offs:** Build is slightly slower (two `npm ci` runs), but final image is ~150–200 MB instead of ~900 MB. The cache layer for `node_modules` in the builder is independent from the runtime — this is intentional and correct.

**Key detail for NodeNext/ESM:** `tsc` with `"module": "NodeNext"` and `"outDir": "dist"` emits `.js` files with `import` statements (ESM). The runtime image runs `node dist/server.js` directly — no transpilation at runtime. The existing `package.json` `"type": "module"` field is respected by Node.js, so ESM imports in `dist/` resolve correctly without any extra runtime flags.

**Dockerfile (concrete for this project):**

```dockerfile
# ── Stage 1: builder ────────────────────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app

# Layer cache: reinstall only when manifests change
COPY package*.json ./
RUN npm ci

# Copy source and compile TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build
# Result: dist/ contains compiled .js + .d.ts + .js.map files

# ── Stage 2: runtime ────────────────────────────────────────────
FROM node:20-slim AS runtime
WORKDIR /app

# Production deps only (no typescript, vitest, tsx, nodemon)
COPY package*.json ./
RUN npm ci --omit=dev

# Compiled application from builder
COPY --from=builder /app/dist ./dist

# Non-root user (security baseline)
RUN groupadd -r nodegroup && useradd -r -g nodegroup -u 1001 nodeuser
USER nodeuser

# Internal container port (documentation only; not published to host)
EXPOSE 3200

# Health check via Node built-in fetch (Node 18+; no curl install needed)
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD node -e \
    "fetch('http://localhost:3200/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
```

**Why `node:20-slim` over `node:20-alpine`:**
Alpine uses musl libc, which is not an officially supported Node.js build target. Node.js has no official Alpine builds — the available Alpine images are community-maintained and carry experimental status. `node:20-slim` is a Debian-based image that is ~25% larger than Alpine but is the de facto production recommendation. It avoids an entire class of musl/glibc incompatibility issues that can appear in transitive npm dependencies. For this project (`jose`, `fastify`, `graphql-request`, `zod` — all pure JS with no native addons), both would likely work, but `slim` is the defensible choice.

### Pattern 2: External Caddy Network in docker-compose.yml

**What:** Declare `caddy_net` as `external: true` in the `networks:` block. The service joins this pre-existing network. Caddy (which already owns `caddy_net`) resolves the container by its service name via Docker's internal DNS, routing requests to `wikijs-mcp:3200` without any host port mapping.

**When to use:** Any service that lives behind a Caddy reverse proxy on the same Docker host where Caddy already has an established external network.

**Trade-offs:** The external network must exist before `docker compose up`. This is a one-time host setup step (`docker network create caddy_net`). The benefit is that this compose file does not interfere with Caddy's compose file — they are independently managed.

**docker-compose.yml (concrete for this project):**

```yaml
services:
  wikijs-mcp:
    build: .
    image: wikijs-mcp:latest
    container_name: wikijs-mcp
    restart: unless-stopped
    networks:
      - caddy_net
    # No `ports:` block — Caddy reaches container via caddy_net
    # `expose` is metadata only; does not publish to host
    expose:
      - "3200"
    env_file:
      - .env
    environment:
      PORT: "3200"
    healthcheck:
      test:
        - "CMD"
        - "node"
        - "-e"
        - "fetch('http://localhost:3200/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s

networks:
  caddy_net:
    external: true
```

**`expose` vs `ports`:**
- `expose: ["3200"]` — documents the port in container metadata; allows inter-container communication on the shared network; does NOT open a host port. Correct for a Caddy-backed service.
- `ports: ["3200:3200"]` — maps host port 3200 → container port 3200; makes the service reachable from outside Docker on plain HTTP. This is a security anti-pattern for a JWT-protected endpoint that expects TLS.

**Caddy Caddyfile entry (operator configures this separately):**
```caddyfile
mcp.example.com {
    reverse_proxy wikijs-mcp:3200
}
```
Docker DNS resolves `wikijs-mcp` to the container's IP address on `caddy_net`. Caddy handles TLS automatically (Let's Encrypt / ZeroSSL).

### Pattern 3: HEALTHCHECK via Node Built-in Fetch

**What:** Use Node.js 18+ `fetch` in the `HEALTHCHECK CMD` instead of `curl` or `wget`. Avoids installing additional packages in the runtime image.

**When to use:** `node:20-slim` does not include `curl` by default. Installing it via `apt-get` adds ~2 MB and a package to update. `wget` is also not present in slim. Node 18+ `fetch` is stable and available in the runtime image with no install step.

**Trade-offs:** The `node -e "..."` inline script is slightly harder to read, but it is self-contained and requires no extra image layer.

**Important note on the /health endpoint:** The existing `/health` route in `src/routes/public-routes.ts` returns HTTP 200 with `{ "status": "ok" }` when healthy and HTTP 200 with `{ "status": "error" }` when Wiki.js is unreachable. The healthcheck uses `r.ok` (true for HTTP 200–299), so it will always pass as long as Fastify is responding — even if Wiki.js is down. This is intentional for the container healthcheck (Fastify liveliness matters most; Wiki.js connectivity is an application concern). If a stricter check is wanted later, the `/health` route should return 503 when upstream is unavailable.

**`--start-period=10s`:** Fastify starts in under 1 second for this server. A 10-second start period is conservative and sufficient. No migrations, no cache warming.

### Pattern 4: .dockerignore Build Context Exclusions

**What:** A `.dockerignore` file at the repo root that prevents large and irrelevant directories from being sent to the Docker daemon as build context.

**When to use:** Always. Without `.dockerignore`, `node_modules/` (hundreds of MB) and `dist/` (stale compiled output) are included in the build context, dramatically slowing `docker build`.

**Concrete .dockerignore for this project:**

```
# Node.js
node_modules/
npm-debug.log*

# TypeScript build output (builder stage re-compiles from source)
dist/

# Test files and configuration
tests/
vitest.config.ts
*.test.ts
*.spec.ts

# Development tooling
.env
.env.*
!example.env

# Git
.git/
.gitignore

# Editor / OS
.vscode/
.DS_Store
*.swp

# Planning and docs (not needed in image)
.planning/
*.md
!package.json
```

**Key rules:**
- `node_modules/` MUST be excluded. The builder stage runs `npm ci` fresh.
- `dist/` MUST be excluded. The builder stage runs `tsc` fresh. A stale local `dist/` must not leak into the context.
- `.env` MUST be excluded. Secrets must not enter the build context (they would be visible in the image layer history).

## Data Flow

### Build-Time Flow (CI or local `docker build`)

```
docker build . -t wikijs-mcp:latest
    │
    ▼
Build context (filtered by .dockerignore)
  package.json, package-lock.json, tsconfig.json, src/
  [node_modules/, dist/, .env excluded]
    │
    ▼
Stage 1: builder (node:20-slim)
  COPY package*.json  ──► npm ci  (installs all deps, including typescript/vitest)
  COPY tsconfig.json, src/  ──► npm run build  (tsc → dist/)
    │
    │ dist/ layer available as builder artifact
    ▼
Stage 2: runtime (node:20-slim)
  COPY package*.json  ──► npm ci --omit=dev  (production deps only)
  COPY --from=builder /app/dist ./dist
  RUN useradd ...  ──► USER nodeuser
    │
    ▼
Final image:
  node:20-slim base
  + production node_modules (~120 MB)
  + dist/ (~1 MB)
  + non-root user
  [no typescript, vitest, tsx, nodemon, source files, devDeps]
```

### Runtime Request Flow

```
Claude Desktop (MCP client)
    │ HTTPS POST https://mcp.example.com/mcp
    │ Authorization: Bearer <Azure AD JWT>
    ▼
Caddy container (caddy_net, host ports 80/443)
    │ TLS terminated
    │ HTTP forward to wikijs-mcp:3200 (Docker DNS on caddy_net)
    ▼
wikijs-mcp container (caddy_net, internal :3200)
    │ Fastify onRequest hook
    │   → Extract Bearer token
    │   → jwtVerify (jose, against Azure JWKS)
    │   → Scope enforcement (wikijs:read/write/admin)
    │ MCP tool dispatch (tools/call)
    ▼
Wiki.js GraphQL API (WIKIJS_BASE_URL, outbound HTTPS)
    │ GraphQL query/mutation using WIKIJS_TOKEN
    ▼
JSON-RPC response
    │
    ▼
Caddy → client (HTTPS)
```

### Environment Variable Resolution

```
Operator creates .env on host (from example.env template)
    │
    ▼
docker-compose.yml: env_file: .env
    │ Docker injects each var into container environment at startup
    ▼
Container process.env (all vars available before server.ts runs)
    │
    ▼
src/config.ts: dotenv.config()  ← no-op (vars already set by Docker)
             ↓
            Zod envSchema.safeParse(process.env)
             ↓ fails fast with clear error if any var missing/invalid
             ↓
            AppConfig object → server.ts / api.ts / auth middleware
```

**Note on dotenv in Docker:** `dotenv` calls `dotenv.config()` at module load in `config.ts`. When vars are already set in the process environment (Docker's injection), `dotenv` does not overwrite them. This means the same compiled binary works correctly both as a bare Node.js process (reads `.env` file) and inside Docker (reads injected env vars). No code change is needed.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Single-host (current target) | docker-compose.yml, one container, Caddy on same host |
| Multiple hosts (future) | Build image once, push to registry, deploy with `docker service` or Kubernetes; Caddy upstream load-balances |
| High-availability (future) | Server is already stateless (no in-process session state, no shared filesystem); horizontal scaling requires no architectural changes |

### Scaling Priorities

1. **First bottleneck:** Wiki.js GraphQL API latency and throughput. The MCP server is stateless and thin. The bottleneck will be the upstream Wiki.js instance, not this container.
2. **Second bottleneck:** Azure JWKS cache. `jose` caches JWKS per process. Multiple container instances each maintain independent caches — this is fine and correct. Azure AD rotates keys ~every 24 hours; `jose` handles auto-refresh.

## Anti-Patterns

### Anti-Pattern 1: Publishing the Container Port to the Host

**What people do:** Add `ports: - "3200:3200"` in docker-compose.yml to confirm the service works.
**Why it's wrong:** Exposes the JWT-protected MCP endpoint on the host's network interface over plain HTTP without TLS. Any host-reachable client can send requests directly to port 3200, bypassing Caddy's TLS layer entirely.
**Do this instead:** Use `expose: ["3200"]` (metadata only). Caddy reaches the container via `caddy_net` using Docker DNS (`wikijs-mcp:3200`). The port never needs to be published.

### Anti-Pattern 2: Installing TypeScript in the Runtime Stage

**What people do:** Single-stage Dockerfile — `npm ci` installs everything including typescript, vitest, tsx, nodemon.
**Why it's wrong:** Adds ~200 MB of devDependencies to the final image. TypeScript compiler, test runner, and dev server are never executed at runtime. They become dead weight with a CVE exposure surface.
**Do this instead:** Two-stage build. Builder installs all deps and compiles. Runtime stage runs `npm ci --omit=dev` independently.

### Anti-Pattern 3: Copying node_modules Between Stages

**What people do:** `COPY --from=builder /app/node_modules ./node_modules` in the runtime stage to avoid a second `npm ci`.
**Why it's wrong:** The builder's `node_modules` contains devDependencies mixed with production dependencies. Selectively filtering them is complex and fragile. Any native addon binaries (`.node` files) compiled in the builder stage may target different library paths than the runtime stage if base images ever diverge.
**Do this instead:** Run `npm ci --omit=dev` in the runtime stage. It installs only what is in `dependencies` (not `devDependencies`), is deterministic, and takes under 10 seconds for this project's deps.

### Anti-Pattern 4: Omitting .dockerignore

**What people do:** Skip `.dockerignore`, so Docker sends the entire working directory — including `node_modules/` (hundreds of MB) — to the daemon as build context.
**Why it's wrong:** Context transfer time dominates build time. On a large `node_modules`, this can add 60+ seconds per build. The builder stage runs `npm ci` anyway, so the host's `node_modules` is irrelevant and should not be sent.
**Do this instead:** Always create `.dockerignore` alongside `Dockerfile`. At minimum exclude `node_modules/`, `dist/`, `.env`, and `.git/`.

### Anti-Pattern 5: Using node:20-alpine When Native Addons May Appear

**What people do:** Choose Alpine for maximum image size reduction.
**Why it's wrong:** Alpine uses musl libc, not glibc. Node.js has no official Alpine builds. Native addons compiled against glibc will silently fail at runtime on musl. This project currently has no native addons, but `@azure/msal-node` (listed in dependencies) has shown musl incompatibilities in some version combinations.
**Do this instead:** Use `node:20-slim` (Debian-based). Slightly larger but avoids an entire class of compatibility surprises. Revisit Alpine only if image size becomes a hard constraint and musl compatibility is confirmed for all dependencies.

### Anti-Pattern 6: Running the Container as Root

**What people do:** No `USER` instruction — Node process runs as `root` inside the container.
**Why it's wrong:** If the process is compromised, the attacker operates as root inside the container, which simplifies container escape exploits and privilege escalation.
**Do this instead:** Create a dedicated non-root user (`useradd -r`) in the runtime stage and switch to it before `CMD`.

## Integration Points

### New Files to Create

| File | Purpose | Key Decisions |
|------|---------|---------------|
| `Dockerfile` | Multi-stage build (builder + runtime) | `node:20-slim`; `npm ci --omit=dev` in runtime; Node fetch for healthcheck; non-root user |
| `docker-compose.yml` | Service declaration, network join, env injection | `external: caddy_net`; `expose` not `ports`; `env_file: .env`; healthcheck mirrors Dockerfile |
| `.dockerignore` | Build context exclusions | Must exclude `node_modules/`, `dist/`, `.env`, `.git/` |

### Existing Files — No Changes Required

| File | Why Unchanged |
|------|---------------|
| `src/server.ts` | Already binds `0.0.0.0:PORT` — correct for container networking (listens on all interfaces) |
| `src/config.ts` | `dotenv` is a no-op when vars are already set; Zod validation still runs and provides fail-fast behavior |
| `package.json` | `npm run build` invokes `tsc` — correct build command for Dockerfile; `"type": "module"` enables ESM in `dist/` at runtime |
| `tsconfig.json` | `"outDir": "dist"` matches `COPY --from=builder /app/dist ./dist` exactly |
| `example.env` | Documents all required env vars; operators create `.env` from this on the host |

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Caddy reverse proxy | Shares `caddy_net` Docker network; Caddyfile entry `reverse_proxy wikijs-mcp:3200` | `wikijs-mcp` resolves via Docker DNS to the container IP on `caddy_net` |
| Azure AD JWKS | Outbound HTTPS from container to `login.microsoftonline.com` | No Docker configuration needed; standard outbound internet access from container |
| Wiki.js | Outbound HTTPS from container to `WIKIJS_BASE_URL` | `WIKIJS_BASE_URL` must be a URL reachable from inside the container (not `localhost` relative to host) |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Caddy → wikijs-mcp | HTTP on `caddy_net` (`wikijs-mcp:3200`) | Plain HTTP internally; TLS is terminated at Caddy. This is the standard Caddy + Docker pattern. |
| wikijs-mcp → Azure AD | HTTPS outbound (JWKS fetch via `jose`) | `jose` handles connection pooling and key caching; no Docker config needed |
| wikijs-mcp → Wiki.js | HTTPS/HTTP outbound (GraphQL via `graphql-request`) | `WIKIJS_BASE_URL` must be an externally reachable URL from the container's perspective |

### Build Order for the Milestone

1. **Create `.dockerignore` first** — prevents accidental context bloat during all subsequent `docker build` iterations
2. **Create `Dockerfile`** — validate with `docker build . -t wikijs-mcp:test` locally; confirm image starts and healthcheck passes
3. **Create `docker-compose.yml`** — validate with `docker compose config` (syntax check, dry run); confirm external network is declared correctly
4. **Host setup (one-time)** — create external network if not already present: `docker network create caddy_net` (idempotent)
5. **Integration** — operator adds `reverse_proxy wikijs-mcp:3200` to Caddyfile; reloads Caddy
6. **Deploy** — `docker compose up -d`; verify with `docker inspect wikijs-mcp --format '{{json .State.Health}}'`

## Sources

- [Docker Official Node.js Containerize Guide](https://docs.docker.com/guides/nodejs/containerize/)
- [Docker Publishing and Exposing Ports](https://docs.docker.com/get-started/docker-concepts/running-containers/publishing-ports/)
- [Docker Compose Networking Reference](https://docs.docker.com/compose/how-tos/networking/)
- [Caddy Reverse Proxy Docker Compose (Wirelessmoves 2025)](https://blog.wirelessmoves.com/2025/06/caddy-as-a-docker-compose-reverse-proxy.html)
- [Building a Caddy Container Stack — TechRoads](https://techroads.org/building-a-caddy-container-stack-for-easy-https-with-docker-and-ghost/)
- [Choosing the Best Node.js Docker Image — Snyk](https://snyk.io/blog/choosing-the-best-node-js-docker-image/)
- [Docker Node.js Alpine vs Slim vs Debian Comparison](https://openillumi.com/en/en-docker-nodejs-image-alpine-slim-debian-choice/)
- [How to Containerize Node.js Apps with Multi-Stage Dockerfiles — OneUptime 2026](https://oneuptime.com/blog/post/2026-01-06-nodejs-multi-stage-dockerfile/view)
- [Docker HEALTHCHECK Best Practices — OneUptime 2026](https://oneuptime.com/blog/post/2026-01-30-docker-health-check-best-practices/view)
- [Docker Tip: Expose vs Publish — Nick Janetakis](https://nickjanetakis.com/blog/docker-tip-59-difference-between-exposing-and-publishing-ports)
- [Expose vs Ports in Docker Compose — Baeldung](https://www.baeldung.com/ops/docker-compose-expose-vs-ports)

---
*Architecture research for: Docker deployment of wikijs-mcp-server behind Caddy*
*Researched: 2026-03-25*
