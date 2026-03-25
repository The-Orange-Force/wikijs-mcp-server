# Stack Research

**Domain:** Docker container packaging — Node.js/TypeScript Fastify server
**Researched:** 2026-03-25
**Confidence:** HIGH

## Context: What This Covers

This research is scoped to the Docker packaging milestone only. The existing
application stack (TypeScript 5.3, Fastify 4, Node.js 20, jose, Zod, Vitest) is
validated and not re-researched here. The question is: what Dockerfile, compose
file, and tooling decisions are needed to containerize this specific server?

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `node:20-alpine` | `node:20-alpine` (floating minor) | Base image for both builder and runtime stages | Alpine gives ~120 MB base vs ~350 MB for slim. This project has zero native C addons (jose, fastify, graphql-request, zod, uuid are all pure JS), so musl libc compatibility is not a concern. Alpine's minimal attack surface (0 CVEs vs 28 for slim in recent Snyk scans) is the right tradeoff for a security-sensitive OAuth resource server. |
| Docker multi-stage build | Dockerfile syntax 1.x (built-in) | Separate build and runtime layers | Builder stage installs devDependencies and runs `tsc`. Runtime stage copies only `dist/` and production `node_modules`. Result: ~180 MB final image vs ~1.2 GB single-stage. No extra tooling required — standard Dockerfile `FROM ... AS ...` syntax. |
| Docker Compose | Compose Specification (no version field) | Single-service deployment with env var injection | The `version` field is officially obsolete as of Compose V2 (Docker 1.27.0+) and generates deprecation warnings if present. Omit it. The Compose Specification is the current standard. |

### Supporting Libraries

No new npm packages are needed for Docker packaging. Everything required
already exists in the project:

| Library | Already In Project | Role in Docker Context |
|---------|--------------------|------------------------|
| `dotenv` | Yes (`^16.5.0`) | Loads `.env` at dev time. In Docker, env vars come from `docker-compose.yml` `environment:` block — dotenv is harmless (no-op) when vars are already set in the process environment. |
| All other deps | Yes | Copied as-is into the runtime image via `npm ci --omit=dev` |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `.dockerignore` | Exclude `node_modules/`, `dist/`, `.env`, `src/`, test files from build context | Prevents shipping secrets, shrinks build context, avoids cache invalidation on source-unrelated changes. Pure file — no installation required. |
| `wget` (Alpine built-in) | Docker `HEALTHCHECK` against `/health` endpoint | Alpine ships `wget` by default; `curl` is NOT included. Use `wget --no-verbose --tries=1 --spider http://127.0.0.1:${PORT}/health`. Must use `127.0.0.1` not `localhost` — Alpine may resolve `localhost` to `::1` (IPv6) while the server binds IPv4. |

## Multi-Stage Build Recipe

The project's `npm start` currently delegates to `scripts/start_http.sh`. In the
Docker runtime stage, invoke Node directly to avoid shell script dependency:

```
node dist/server.js
```

The build stages:

**Stage 1 — builder**
- `FROM node:20-alpine AS builder`
- `WORKDIR /app`
- `COPY package*.json ./` then `npm ci` (installs all deps including devDeps for `tsc`)
- `COPY tsconfig.json .` and `COPY src/ ./src/`
- `RUN npm run build` (runs `tsc`, outputs to `dist/`)

**Stage 2 — runtime**
- `FROM node:20-alpine AS runtime`
- `WORKDIR /app`
- `COPY package*.json ./` then `npm ci --omit=dev` (installs only production deps)
- `COPY --from=builder /app/dist ./dist`
- `COPY lib/ ./lib/` (STDIO transport stub, referenced in package.json scripts)
- Non-root user: `addgroup -S appgroup && adduser -S appuser -G appgroup`, then `USER appuser`
- `EXPOSE 8000` (matches `PORT` default in `config.ts`)
- `HEALTHCHECK` with `wget` against `127.0.0.1:8000/health`
- `CMD ["node", "dist/server.js"]`

### Why `npm ci --omit=dev` Not `--only=production`

`--omit=dev` is the current npm flag (npm 7+). `--only=production` is deprecated
in npm 9 and generates warnings. They are functionally equivalent but `--omit=dev`
is the correct spelling going forward.

### ESM + NodeNext Compatibility Note

The project uses `"type": "module"` and `module: "NodeNext"` in tsconfig. The
compiled output in `dist/` includes `.js` files with `import` statements and
explicit `.js` extensions on all relative imports. `node dist/server.js` with
Node.js 20 handles this correctly — no `--experimental-vm-modules` flag needed.

### Why NOT `node:20-alpine3.XX` (Pinned Alpine Version)

Floating `node:20-alpine` pulls the latest Alpine patch for Node 20 LTS, which
includes security patches automatically on `docker pull`. Pinning to
`node:20-alpine3.21` trades security patches for strict reproducibility. For a
self-hosted internal tool, floating minor is the right default. If the team moves
to a CI/CD pipeline that rebuilds on a schedule, pinning becomes more appropriate
then.

## Compose File Decisions

**No `version:` field** — omit entirely. It is obsolete and triggers deprecation
warnings in current Docker Compose.

**No `depends_on:` for Wiki.js** — Wiki.js runs on a separate host. The MCP
server tolerates a disconnected Wiki.js at startup (logs a warning but starts
successfully, per `server.ts`). Network configuration is handled externally.

**Environment variables** — use `environment:` block with variable substitution
(`${WIKIJS_BASE_URL}` etc.) so operators set values in a `.env` file on the host
or in their shell. The Compose file should not contain secrets.

**Port mapping** — `"8000:8000"` mapping using the same `PORT` default. Operators
who change `PORT` via environment variable must update the left side of the mapping.

**`restart: unless-stopped`** — appropriate for a long-running server in
self-hosted deployment. Restarts on crash but respects explicit `docker stop`.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `node:20-alpine` | `node:20-slim` (Debian) | When native addons are present that require glibc. This project has none, so alpine is correct. |
| `node:20-alpine` | `gcr.io/distroless/nodejs20-debian12` | When no shell access or debugging tools in the container is an acceptable operational constraint. Distroless is harder to debug (no shell, no wget for healthchecks requires a Node.js-based check script). Not worth the operational complexity for an internal tool. |
| `npm ci --omit=dev` | Copy `node_modules` from builder stage | Copying node_modules from a builder to a runtime stage of the same base image works but is slower and larger than re-running `npm ci --omit=dev` in the runtime stage, because the full `node_modules` (including devDeps) gets written to a layer that then gets filtered. Re-running `npm ci --omit=dev` in the runtime stage is cleaner. |
| `node dist/server.js` CMD | `npm start` CMD | `npm start` invokes `scripts/start_http.sh` which eventually calls node, adding a shell and npm process layer. Calling node directly is leaner and produces cleaner signal handling (SIGTERM reaches Node, not npm). |
| `wget` for healthcheck | Install `curl` via `RUN apk add --no-cache curl` | Valid but adds a package install layer and increases image size. `wget` is already present in Alpine — use it. |
| Omit `version:` in compose | `version: '3.8'` | Use only if you need to run on Compose V1 (legacy, pre-2022 Docker installs). Modern Docker Compose ignores the field and warns about it. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Single-stage Dockerfile | Bundles TypeScript compiler, ts-node, nodemon, all devDeps into the image — ~900 MB. Exposes source TypeScript in the container. | Multi-stage build (builder + runtime stages) |
| `npm install` in Dockerfile | Non-deterministic: resolves latest semver ranges at build time, producing different installs across builds | `npm ci` — uses `package-lock.json` exactly |
| `localhost` in HEALTHCHECK | Alpine may resolve `localhost` to `::1` (IPv6) when the server is bound to `0.0.0.0` (IPv4). Results in healthcheck failures that are hard to debug. | `127.0.0.1` explicitly |
| `version: '3.8'` in compose | Generates `"version" attribute is obsolete` warnings in current Docker Compose. Serves no functional purpose. | Omit the field entirely |
| Running as root in container | Security anti-pattern; amplifies impact of RCE vulnerabilities | `adduser -S` + `USER appuser` in Dockerfile |
| `CMD ["npm", "start"]` | Adds npm process layer, shell script indirection. `npm` does not forward SIGTERM to Node — graceful shutdown may fail. | `CMD ["node", "dist/server.js"]` |
| `.env` file in Docker build context | Risks shipping secrets into image layers | Add `.env` to `.dockerignore`; pass secrets via compose `environment:` or Docker secrets |

## Stack Patterns by Variant

**If deploying to Kubernetes (future):**
- Replace `docker-compose.yml` with a `Deployment` + `Service` manifest
- Use `livenessProbe` and `readinessProbe` against `/health` instead of Docker `HEALTHCHECK`
- Consider pinning `node:20-alpine3.XX` for reproducible builds in CI
- `HEALTHCHECK` in Dockerfile is ignored by Kubernetes but harmless to keep

**If Wiki.js is on the same Docker host (same compose project):**
- Add `depends_on: wikijs` and a `healthcheck:` for the wikijs service
- Use Docker internal network name (`wikijs`) as `WIKIJS_BASE_URL`

**If native addons are ever added (unlikely given current deps):**
- Switch runtime stage to `node:20-slim` (Debian-based, glibc)
- Keep builder on `node:20-alpine` or switch to `node:20-slim` to match glibc

## Version Compatibility

| Package | Node.js 20 Alpine | Notes |
|---------|-------------------|-------|
| `node:20-alpine` | Native | Node.js 20 LTS + Alpine Linux; stable combination |
| `fastify@^4.27.2` | Compatible | Pure JS; works with Node 20 on Alpine |
| `jose@^6.2.2` | Compatible | ESM-only, pure JS, no native deps |
| `graphql-request@^6.1.0` | Compatible | Pure JS |
| `zod@^3.25.17` | Compatible | Pure JS |
| `uuid@^13.0.0` | Compatible | Pure JS |
| `@azure/msal-node@^5.1.1` | Compatible | Has some native-looking deps but pure JS for token cache |

## Installation

No new npm packages are needed. All Docker packaging is done via Dockerfile and
`docker-compose.yml` — plain text files checked into the repository.

```bash
# Verify the build locally after writing the Dockerfile:
docker build -t wikijs-mcp-server .
docker run --env-file .env -p 8000:8000 wikijs-mcp-server
```

## Sources

- [Docker Hub node image](https://hub.docker.com/_/node/) — Tag variants confirmed (20-alpine, 20-slim)
- [Snyk: Choosing the best Node.js Docker image](https://snyk.io/blog/choosing-the-best-node-js-docker-image/) — CVE comparison (alpine 0 vs slim 28), MEDIUM confidence (WebSearch verified with official hub)
- [Docker Docs: Version and name top-level elements](https://docs.docker.com/reference/compose-file/version-and-name/) — Version field is obsolete, HIGH confidence (official docs)
- [Docker community forum: version is obsolete](https://forums.docker.com/t/docker-compose-yml-version-is-obsolete/141313) — Confirms deprecation warnings, MEDIUM confidence
- [dasroot.net: Do You Still Use version in Docker Compose? (2026-03)](https://dasroot.net/posts/2026/03/do-you-still-use-version-in-docker-compose/) — Current community practice, LOW confidence (single blog)
- [Chatwoot issue: healthcheck fails, curl not found in Alpine](https://github.com/chatwoot/chatwoot/issues/13776) — wget vs curl on Alpine, HIGH confidence (confirmed by Alpine documentation)
- [docker/for-mac issue: localhost resolves to ::1](https://github.com/docker/for-mac/issues/7269) — IPv6 localhost issue requiring 127.0.0.1, HIGH confidence (Docker official issue tracker)
- [GoogleContainerTools/distroless](https://github.com/GoogleContainerTools/distroless) — Evaluated distroless; rejected for operational complexity, MEDIUM confidence
- [iximiuz Labs: How to Choose Node.js Container Image](https://labs.iximiuz.com/tutorials/how-to-choose-nodejs-container-image) — musl vs glibc tradeoffs, MEDIUM confidence
- [Fastify issue #935: not working in Docker](https://github.com/fastify/fastify/issues/935) — 0.0.0.0 binding requirement confirmed, HIGH confidence (official Fastify repo)
- Source code review: `src/server.ts` line 81 confirms `host: "0.0.0.0"` binding; `src/config.ts` line 11 confirms `PORT` default is `8000`

---
*Stack research for: Docker container packaging — wikijs-mcp-server v2.1*
*Researched: 2026-03-25*
