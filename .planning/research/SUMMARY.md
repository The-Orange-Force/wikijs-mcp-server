# Project Research Summary

**Project:** wikijs-mcp-server — Docker container packaging (v2.1 milestone)
**Domain:** Docker deployment of a TypeScript/Fastify/Node.js ESM server behind a Caddy reverse proxy
**Researched:** 2026-03-25
**Confidence:** HIGH

## Executive Summary

The v2.1 milestone is a greenfield Docker packaging effort for an existing, fully functional server — not a new application. The application stack (TypeScript 5.3, Fastify 4, Node.js 20, ESM/NodeNext) is already validated and production-quality. The entire scope is three new files: a `Dockerfile`, a `docker-compose.yml`, and a `.dockerignore`. No application code changes are required. The server already binds to `0.0.0.0` (correct for Docker), all config comes from env vars (correct for containers), and the `/health` endpoint exists and is unauthenticated (correct for HEALTHCHECK). The deployment pattern — one container behind Caddy on a shared external Docker network — is well-documented with no novel components.

The recommended approach uses a two-stage Dockerfile (`node:20-slim` as base for both stages), `npm ci --omit=dev` in the runtime stage, Node.js built-in `fetch` for the HEALTHCHECK, and the built-in `node` user for non-root execution. The `docker-compose.yml` joins the pre-existing `caddy_net` external network via `expose:` (not `ports:`), preventing the MCP endpoint from being reachable over plain HTTP from the Docker host. Secrets are injected at runtime via `env_file: .env` and never baked into the image. This configuration is single-phase: write three files, verify, deploy.

The primary risks are security-related and front-loaded in the Dockerfile authoring step. Baking `.env` into the image (via absent `.dockerignore` or `ARG`/`ENV` directives) is the highest-consequence mistake, requiring credential rotation if the image reaches a registry. The second risk class is connectivity: `caddy_net` must exist before `docker compose up`, and Caddy's Caddyfile must reference the container's service name (`wikijs-mcp:3200`), not `localhost:3200`. All risks are avoidable with the verification checklist in PITFALLS-DOCKER.md.

---

## Key Findings

### Recommended Stack

No new npm packages are required. All Docker packaging is done via three plain text files. The base image for both builder and runtime stages is `node:20-slim` (Debian-based). Alpine (`node:20-alpine`) was considered but rejected: Node.js has no official Alpine builds, Alpine uses musl libc, and `@azure/msal-node` in the dependency tree has documented musl compatibility issues in some version combinations. `node:20-slim` is ~25% larger than Alpine but the defensible choice for a production deployment.

**Core technologies:**
- `node:20-slim`: base image for builder and runtime stages — official Debian-based image, glibc, no musl risk; all project deps (jose, fastify, graphql-request, zod) are pure JS and compatible
- Docker multi-stage build: separates the TypeScript compiler and devDependencies from the runtime image — reduces final image from ~900 MB (single-stage) to ~150–180 MB
- Docker Compose Specification (no `version:` field): service declaration with external network join — `version:` is officially obsolete in Compose V2 and generates deprecation warnings; omit entirely
- `npm ci --omit=dev`: deterministic, production-only dependency install in the runtime stage — `--omit=dev` is the current npm 7+ flag; `--only=production` is deprecated in npm 9

### Expected Features

**Must have (table stakes):**
- Multi-stage Dockerfile — single-stage images include the TypeScript compiler, devDependencies, and source files; result is ~1 GB and unsuitable for deployment
- `.dockerignore` with `.env` exclusion — without it, credentials enter the image build context and become visible in image layer history via `docker history`; recovery requires credential rotation
- Non-root user (`USER node`) — the official `node:20-slim` image includes a built-in `node` user (uid 1000); running as root in a container amplifies compromise impact
- HEALTHCHECK wired to `/health` — the endpoint already exists and is unauthenticated; uses Node.js built-in `fetch` (Node 18+) since `curl` and `wget` are absent from `node:20-slim`
- `docker-compose.yml` joining `caddy_net` as external network — the host already runs Caddy on `caddy_net`; Caddy routes proxied requests to the container by service name via Docker DNS
- `restart: unless-stopped` — the service must survive container crashes without manual intervention
- `env_file: .env` for secret injection — credentials injected at container runtime, never baked into the image
- `stop_grace_period: 30s` — Docker's default 10 s SIGTERM-to-SIGKILL window is insufficient for Fastify to drain active MCP connections
- Explicit `CMD ["node", "dist/server.js"]` — `npm start` adds shell and npm process indirection; SIGTERM from `docker stop` reaches npm, not Node, causing hard-kill instead of graceful shutdown

**Should have (low-effort, high-value — include in same milestone):**
- `NODE_ENV=production` in runtime Dockerfile stage — Fastify and Pino branch on this; baking it into the image prevents operator error
- Layer caching optimization (`COPY package*.json` before `COPY src/`) — eliminates the ~60 s `npm ci` reinstall when only source files change
- `no-new-privileges: true` security option in docker-compose.yml — prevents setuid/setgid privilege escalation; zero code changes
- Named image tag (`image: wikijs-mcp:latest`) — prevents Compose from auto-generating an opaque container name

**Defer (v2.2+):**
- Multi-arch image builds (amd64/arm64) — only relevant for ARM hosts; not needed for current x86 deployment
- Distroless base image — requires switching HEALTHCHECK to a Node.js script; add only if a security audit requires it
- `read_only: true` root filesystem — requires identifying all runtime write paths and adding `tmpfs` mounts; high-security hardening only

**Anti-features to avoid:**
- `ports: - "3200:3200"` in docker-compose.yml — exposes the JWT-protected MCP endpoint on the Docker host's network interface over plain HTTP, bypassing Caddy's TLS
- Custom Alpine user creation — the built-in `node` user in the official image is sufficient; custom UIDs are only needed for host volume ownership matching
- Multi-service compose file including Wiki.js — Wiki.js is on a separate host; coupling it here creates lifecycle management problems

### Architecture Approach

The deployment adds three files to the existing repo root. Zero application code changes are required. The Dockerfile has two stages: a `builder` stage that installs all dependencies (including devDependencies for `tsc`) and compiles TypeScript, and a `runtime` stage that copies only `dist/` and runs `npm ci --omit=dev`. The `docker-compose.yml` declares a single service that joins the pre-existing `caddy_net` external network via `expose:` — no `ports:` mapping to the host. The `.dockerignore` prevents `node_modules/`, `dist/`, `.env`, `.git/`, `src/`, and test files from entering the build context.

**Major components:**
1. `Dockerfile` (builder stage) — `node:20-slim AS builder`; installs all deps including TypeScript compiler; runs `npm run build` (tsc); produces `dist/`
2. `Dockerfile` (runtime stage) — `node:20-slim AS runtime`; copies `dist/` from builder with absolute `COPY --from=builder /app/dist ./dist`; installs only production deps; sets `USER node`; HEALTHCHECK uses `node -e "fetch('http://localhost:3200/health')..."`
3. `docker-compose.yml` — single service; `external: caddy_net`; `expose: ["3200"]` not `ports:`; `env_file: .env`; `restart: unless-stopped`; `stop_grace_period: 30s`; `security_opt: [no-new-privileges:true]`
4. `.dockerignore` — excludes `node_modules/`, `dist/`, `.env`, `.env.*`, `.git/`, `src/`, test files; preserves `package*.json`, `tsconfig.json`, `lib/`

**Key data flow:**
- Caddy (on `caddy_net`) resolves the container by service name (`wikijs-mcp:3200`) via Docker internal DNS and forwards plain HTTP; TLS is terminated at Caddy
- `dotenv` in `src/config.ts` is a no-op when vars are already injected by Docker at runtime; Zod validation runs against `process.env` and provides the same fail-fast startup behavior as in dev
- `WIKIJS_BASE_URL` must be a hostname reachable from inside the container — the dev default `http://localhost:3000` will connect to the container's own loopback, not Wiki.js

### Critical Pitfalls

1. **`.env` baked into the image** — list `.env`, `*.env`, and `.env.*` in `.dockerignore` before any `COPY` instruction; never use `ARG` or `ENV` directives for secrets in the Dockerfile; use `env_file:` only on the service (not under `build:`) in docker-compose.yml. Recovery requires credential rotation for all exposed values.

2. **`caddy_net` not pre-created on fresh host** — `docker compose up` fails immediately with "Network caddy_net declared as external, but could not be found." The Caddy stack must be running before the MCP server stack. Add `docker network ls | grep caddy_net` as a deployment prerequisite check. Document this in the repo.

3. **Caddy Caddyfile using `localhost:3200` instead of service name** — inside Caddy's container, `localhost` refers to Caddy's own loopback, not the MCP server. Use the Docker Compose service name: `reverse_proxy wikijs-mcp:3200`. This is documented as the #1 cause of 502 errors in Caddy+Docker setups.

4. **HEALTHCHECK using `curl` or `wget`** — neither tool is present in `node:20-slim`. Use Node.js built-in `fetch` (Node 18+): `node -e "fetch('http://localhost:3200/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"`. Use `127.0.0.1` explicitly to avoid IPv6 localhost resolution surprises.

5. **`COPY --from=builder` with relative source path** — relative paths in `COPY --from=<stage>` resolve against the build context on the Docker host, not the builder stage's filesystem. Always use absolute paths: `COPY --from=builder /app/dist ./dist`. Builds succeed silently but the container exits with `ERR_MODULE_NOT_FOUND`.

6. **devDependencies in runtime image via builder node_modules copy** — do not copy `node_modules` from the builder stage. Run `npm ci --omit=dev` independently in the runtime stage. The builder's `node_modules` includes TypeScript, Vitest, ts-node, and nodemon — 100–200 MB of dead weight with CVE exposure.

---

## Implications for Roadmap

This milestone has a single logical phase. The three files have a creation dependency order but are validated together. There is no user-facing feature work and no application code to modify.

### Phase 1: Docker Packaging

**Rationale:** `.dockerignore` must be created first — it protects against accidental `.env` inclusion during all subsequent `docker build` iterations. The Dockerfile must be validated independently before the compose file is written, because image correctness is a prerequisite for deployment correctness.

**Delivers:** A production-ready container image and deployment descriptor. The service starts with `docker compose up -d`, Caddy can proxy to it via `caddy_net`, and `docker inspect` reports `healthy` after the start period.

**Addresses:** All P1 and P2 features from FEATURES.md. P2 items (`no-new-privileges`, named image tag, `NODE_ENV=production`, layer caching optimization) cost nothing extra and should be included in the same PR.

**Avoids:** All critical pitfalls from PITFALLS-DOCKER.md. The 12-item verification checklist in PITFALLS-DOCKER.md is the acceptance criteria for this phase — each item has a concrete shell command to run.

**Build order within phase:**
1. Create `.dockerignore` — prevents secrets from entering build context from step 2 onward
2. Create `Dockerfile` — validate with `docker build . -t wikijs-mcp:test`
3. Run the PITFALLS-DOCKER.md verification checklist against the built image (secrets audit, non-root check, node_modules size, source file exclusion)
4. Create `docker-compose.yml` — validate with `docker compose config` (dry run)
5. Deploy: `docker compose up -d`; verify health with `docker inspect`; verify Caddy proxy end-to-end with `curl https://mcp.example.com/health`

### Phase Ordering Rationale

- Only one phase is needed because the scope is exclusively infrastructure files with no cross-cutting application concerns
- `.dockerignore` must precede `Dockerfile` to prevent accidental secrets inclusion during iterative builds
- Image verification must run before compose deployment — image correctness gates deployment correctness
- Caddyfile configuration (external to this repo) is an operator deployment step, not a coding task; document the required entry in a `DEPLOYMENT.md`

### Research Flags

No phases need `/gsd:research-phase` during planning. All patterns are well-documented with HIGH confidence. The implementation is mechanical: write three files, run verification commands, document the Caddyfile entry. No novel integrations or API research needed.

The one area requiring operator attention (not research) is confirming the actual `caddy_net` network name on the target deployment host. If the name differs from `caddy_net`, update `docker-compose.yml` accordingly.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | `node:20-slim` vs `node:20-alpine` debate is resolved by `@azure/msal-node` musl risk; all other decisions (npm ci --omit=dev, Compose version field omission, direct node CMD) are backed by official documentation |
| Features | HIGH | Feature set is small and precisely defined; all table-stakes features are straightforward; anti-features are documented with specific rationale |
| Architecture | HIGH | Three-file scope is standard; all component boundaries are clear; existing application code requires zero changes; the server already has `host: "0.0.0.0"` and env-var-only config |
| Pitfalls | HIGH | All critical pitfalls are backed by official Docker/Fastify/Caddy issue trackers and docs; all have deterministic prevention steps and verification commands |

**Overall confidence:** HIGH

### Gaps to Address

- **`caddy_net` actual name on the target host:** The external network name is assumed to be `caddy_net` based on common convention. Verify with `docker network ls` before writing the compose file. If the name differs, update accordingly.

- **`WIKIJS_BASE_URL` in production `.env`:** The dev default (`http://localhost:3000`) will not work inside the container. Confirm the actual production value before first deploy.

- **Source maps in runtime image:** `tsconfig.json` has `"sourceMap": true`, so `tsc` emits `.js.map` files. These end up in the runtime image unless explicitly deleted. Acceptable for an internal tool; optionally add `RUN find dist -name "*.map" -delete` to the builder stage. Flag for implementation to decide.

- **`node:20-slim` curl/wget availability:** Research recommends Node.js `fetch` for HEALTHCHECK precisely because curl/wget may be absent in slim. This gap does not block implementation — the Node `fetch` approach is the correct path regardless.

---

## Sources

### Primary (HIGH confidence)

- [Docker Official Node.js Containerize Guide](https://docs.docker.com/guides/nodejs/containerize/) — multi-stage patterns, official reference
- [nodejs/docker-node Best Practices](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md) — non-root user, signal handling, PID 1
- [Docker Docs: Compose networks — external networks](https://docs.docker.com/compose/compose-file/06-networks/) — external network declaration
- [Docker Docs: Version and name top-level elements](https://docs.docker.com/reference/compose-file/version-and-name/) — version field is obsolete
- [Docker Docs: SecretsUsedInArgOrEnv build check](https://docs.docker.com/reference/build-checks/secrets-used-in-arg-or-env/) — ARG/ENV secrets lint rule
- [Fastify issue #935: not working in Docker](https://github.com/fastify/fastify/issues/935) — 0.0.0.0 binding requirement confirmed
- [Caddy docs issue #453: use internal container port](https://github.com/caddyserver/website/issues/453) — service name vs localhost in Caddyfile
- Source code review: `src/server.ts` confirms `host: "0.0.0.0"` binding; `src/config.ts` confirms `PORT` default is `8000`; `src/routes/public-routes.ts` confirms `/health` is unauthenticated

### Secondary (MEDIUM confidence)

- [Snyk: Choosing the best Node.js Docker image](https://snyk.io/blog/choosing-the-best-node-js-docker-image/) — CVE comparison alpine vs slim; Alpine 0 CVEs vs slim 28 noted but slim recommended for musl risk
- [How to Containerize a Fastify Application with Docker (OneUptime, 2026)](https://oneuptime.com/blog/post/2026-02-08-how-to-containerize-a-fastify-application-with-docker/view) — Fastify-specific HEALTHCHECK and graceful shutdown patterns
- [Caddy as a Docker-Compose Reverse Proxy (WirelessMoves, 2025)](https://blog.wirelessmoves.com/2025/06/caddy-as-a-docker-compose-reverse-proxy.html) — external network Caddy pattern
- [Don't leak your Docker image's build secrets — pythonspeed.com](https://pythonspeed.com/articles/docker-build-secrets/) — .env in image layers, recovery cost
- [Docker HEALTHCHECK Best Practices (OneUptime, 2026)](https://oneuptime.com/blog/post/2026-01-30-docker-health-check-best-practices/view) — interval/timeout guidance, Alpine wget note

### Tertiary (LOW confidence)

- [dasroot.net: Do You Still Use version in Docker Compose? (2026-03)](https://dasroot.net/posts/2026/03/do-you-still-use-version-in-docker-compose/) — single blog, corroborates official deprecation docs
- Node.js Alpine wget availability: consistent across multiple sources but not directly verified via `docker run` — moot given `node:20-slim` recommendation

---

*Research completed: 2026-03-25*
*Ready for roadmap: yes*
