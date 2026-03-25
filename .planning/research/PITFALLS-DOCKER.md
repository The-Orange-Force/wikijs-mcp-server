# Pitfalls Research — Docker Deployment

**Domain:** Dockerizing a TypeScript/Fastify/Node.js ESM server behind a Caddy reverse proxy
**Researched:** 2026-03-25
**Confidence:** HIGH (verified against Fastify GitHub issues, Docker official docs, Node.js docker-node repo, Caddy docs)

---

## Critical Pitfalls

### Pitfall 1: Fastify Bound to 127.0.0.1 — Unreachable Inside Docker Network

**What goes wrong:**
Fastify's default `host` is `127.0.0.1` (loopback). Inside a Docker container this means the process only accepts connections from within the same container — Caddy on `caddy_net` gets "connection refused" on every request, even though the container is running and healthy.

**Why it happens:**
Developers use `server.listen({ port: 3200 })` without specifying `host`. This works on the dev machine where the browser shares the same loopback interface. The Fastify maintainers documented this as a Docker-specific footgun in issues #935 and #2775.

**How to avoid:**
`src/server.ts` already has `server.listen({ port: config.port, host: "0.0.0.0" })`. This is correct — do not change `host` to `"localhost"` or remove it. Verify the value is preserved after any refactor to the listen call.

In docker-compose, expose only the internal port to the shared network:
```yaml
services:
  wikijs-mcp:
    expose:
      - "3200"   # visible on caddy_net; NOT published to Docker host
```
Use `ports:` only for local debugging — never in the production compose file.

**Warning signs:**
- Caddy logs show "upstream connection refused" or "dial tcp: connection refused"
- `curl` from another container to the MCP service returns "Connection refused"
- Health check passes from inside the container (`docker exec ... curl localhost:3200/health`) but fails from Caddy

**Phase to address:** Dockerfile/docker-compose authoring phase (first Docker phase)

---

### Pitfall 2: `.env` File Baked Into the Docker Image

**What goes wrong:**
`WIKIJS_TOKEN`, `AZURE_TENANT_ID`, and `AZURE_CLIENT_ID` end up inside image layers, visible to anyone who runs `docker history --no-trunc <image>` or pulls the image. This is a total credential compromise requiring immediate token rotation.

**Why it happens:**
Three paths to accidental inclusion:

1. `.dockerignore` is absent or missing `.env` — a `COPY . .` in the builder stage includes the live `.env` file
2. A developer passes secrets via `ARG WIKIJS_TOKEN` or `ENV WIKIJS_TOKEN` in the Dockerfile to make the build "self-contained" — Docker bakes these permanently into image history
3. `docker-compose.yml` uses `env_file: .env` under a `build:` section, causing compose to pass values as `ENV` instructions during build rather than injecting them at runtime

**How to avoid:**
- `.dockerignore` must list `.env`, `*.env`, and `.env.*` before any `COPY` instruction
- Never use `ARG` or `ENV` directives for secrets; Docker's official lint rule `SecretsUsedInArgOrEnv` flags this pattern
- Supply secrets at runtime only — via `environment:` or `env_file:` on the **service** (not on `build:`):
  ```yaml
  services:
    wikijs-mcp:
      env_file: .env        # injected at docker run time, NOT baked into image
  ```
- Confirm: `dotenv`'s `dotenvConfig()` in `src/config.ts` silently skips the `.env` file if it is absent in the container, then Zod validates `process.env` (populated by Docker's runtime injection) and exits fast if vars are missing. This is the correct behavior.

**Warning signs:**
- `docker history --no-trunc wikijs-mcp-server | grep -i token` returns output
- `docker image inspect wikijs-mcp-server --format '{{.Config.Env}}'` lists secret values
- Image builds successfully even when `.env` is deleted from the project root (the app is reading a baked copy)

**Phase to address:** `.dockerignore` creation (very first task); validated by image audit before any push

---

### Pitfall 3: External Network `caddy_net` Not Pre-Created — Hard Failure on First Deploy

**What goes wrong:**
`docker compose up` fails immediately on a fresh host with:
```
Network caddy_net declared as external, but could not be found.
Please create the network manually using `docker network create caddy_net`
```
Every clean host provisioning silently requires manual prep that is never documented.

**Why it happens:**
`external: true` tells Compose this network's lifecycle is managed outside its own file. Compose will not create it and will error if it is absent. The Caddy stack creates `caddy_net`; the MCP server stack joins it. If the Caddy stack has not run first, the network does not exist.

**How to avoid:**
Choose one strategy and document it clearly in the repo:

**Strategy A (preferred — two-stack setup):** Caddy's compose file creates and owns `caddy_net`. The MCP server's compose file declares it `external: true`. Add a comment to `docker-compose.yml`:
```yaml
networks:
  caddy_net:
    external: true   # Must exist: start Caddy stack first (docker compose -f caddy/docker-compose.yml up -d)
```
Add a startup check to the deployment runbook: `docker network ls | grep caddy_net`.

**Strategy B (single-stack fallback):** Remove `external: true` and let the MCP compose file own the network. Simpler, but couples the two stacks and requires Caddy to be declared in the same compose file.

**Warning signs:**
- First `docker compose up` on any new machine always fails
- CI/CD first-deploy step consistently errors
- `docker network ls` shows no `caddy_net` before startup

**Phase to address:** docker-compose authoring phase; network pre-creation step in deployment docs

---

### Pitfall 4: TypeScript Source and Source Maps in the Runtime Image

**What goes wrong:**
The final Docker image contains `src/`, `tsconfig.json`, `*.d.ts`, and `dist/**/*.map` files. The `src/` directory adds ~500 KB+ of source code and reveals implementation. Source maps expose original source paths. Both are unnecessary at runtime and increase image attack surface.

**Why it happens:**
Two common mistakes:
1. Single-stage Dockerfile with `COPY . .` — no separation between build artifacts and source
2. Multi-stage Dockerfile where the runtime stage uses `COPY --from=builder /app .` instead of copying only `dist/`, `package.json`, and `package-lock.json`

The current `tsconfig.json` has `"sourceMap": true`, so `tsc` emits `.js.map` alongside every compiled file. These are included unless explicitly excluded or deleted.

**How to avoid:**
Use a strict multi-stage Dockerfile where the runtime stage only receives:
```dockerfile
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
```
Never `COPY --from=builder /app/src`.

For source maps: either add a post-compile cleanup in the builder stage before copying:
```dockerfile
RUN find dist -name "*.map" -delete
```
Or create a `tsconfig.prod.json` that overrides `"sourceMap": false` and use it in the Docker build: `tsc -p tsconfig.prod.json`.

`.dockerignore` should also list `src/` and `tsconfig*.json` as a safety net for single-stage builds.

**Warning signs:**
- `docker run --rm wikijs-mcp-server ls /app/src` lists files (should return error)
- `docker run --rm wikijs-mcp-server ls /app/dist | grep ".map"` returns map files
- Image size is 50+ MB larger than expected for a slim Node.js image with prod deps only

**Phase to address:** Dockerfile authoring phase

---

### Pitfall 5: `node_modules` Contains devDependencies in the Runtime Image

**What goes wrong:**
The runtime image ships `typescript`, `tsx`, `ts-node`, `nodemon`, and `vitest` — build and test tools only needed during development. These add 100–200 MB to the image and introduce CVE surface from tools that are never executed in production.

**Why it happens:**
Two root causes:
1. Running `npm install` (not `npm ci --omit=dev`) in the runtime stage
2. Copying `node_modules` from the builder stage with `COPY --from=builder /app/node_modules ./node_modules` — the builder needed devDependencies to run `tsc`, so its `node_modules` includes them all

**How to avoid:**
Do NOT copy `node_modules` from the builder stage. Instead, install production deps fresh in the runtime stage:
```dockerfile
COPY --from=builder /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev
```
This is cleaner than copying and pruning because `npm prune` has documented bugs in some npm versions where devDependencies of devDependencies survive (npm/cli#8277).

**Warning signs:**
- `docker run --rm wikijs-mcp-server ls /app/node_modules | grep typescript` returns output
- `docker run --rm wikijs-mcp-server du -sh /app/node_modules` shows more than ~100 MB
- Image size exceeds 300 MB (production should be ~150–180 MB with node:20-slim base)

**Phase to address:** Dockerfile authoring phase

---

### Pitfall 6: `COPY --from=builder` With Relative Source Paths — Silent Wrong Copy

**What goes wrong:**
Relative source paths in `COPY --from=<stage>` resolve against the **build context** on the Docker host, not the builder stage's filesystem. `COPY --from=builder dist ./dist` copies the local `dist/` directory (which may be empty, stale, or absent) instead of the freshly compiled output in the builder stage. The build succeeds silently but the runtime container immediately exits with `ERR_MODULE_NOT_FOUND`.

**Why it happens:**
Developers assume `--from=builder` makes all paths relative to the builder's working directory. This is not how Docker works. The source path in `COPY --from=<stage> <src> <dest>` is always an absolute path within the named stage's filesystem (or resolved from `/` if relative).

There is also a known Docker/moby issue (#36643) where `WORKDIR` in multi-stage builds does not behave as expected when mixing relative paths across stages.

**How to avoid:**
Always use absolute source paths in `COPY --from=<stage>`:
```dockerfile
# Correct:
COPY --from=builder /app/dist ./dist

# Wrong — resolves from build context, not from builder stage:
COPY --from=builder dist ./dist
```
Keep `WORKDIR /app` consistent across all stages to eliminate ambiguity.

**Warning signs:**
- Container starts but immediately exits with `ERR_MODULE_NOT_FOUND` for `dist/server.js`
- `docker run --rm wikijs-mcp-server ls /app/dist` returns empty or missing directory
- Build completes with no errors but runtime fails

**Phase to address:** Dockerfile authoring phase; also caught by a post-build smoke test in CI

---

### Pitfall 7: Caddy Proxying to Host-Mapped Port Instead of Container Service Name

**What goes wrong:**
Caddyfile routes to `localhost:3200` (Docker host's loopback) instead of `wikijs-mcp:3200` (the Docker service's internal address on `caddy_net`). Inside Caddy's own container, `localhost` refers to Caddy's loopback, not the MCP server's. Result: 502 Bad Gateway from Caddy on every request.

**Why it happens:**
Developers familiar with non-Docker setups write `reverse_proxy localhost:3200`. The Caddy documentation team specifically flagged this as the #1 cause of connection refusals in Docker setups (caddyserver/website issue #453): when Caddy runs in a container, it must use the Docker DNS service name and the container-internal port.

**How to avoid:**
In the Caddyfile, use the Docker Compose service name and the **container-internal port** (the port in `expose:`, not any `ports:` mapping to the host):
```caddyfile
mcp.example.com {
    reverse_proxy wikijs-mcp:3200
}
```
`wikijs-mcp` must match the service name defined in the MCP server's `docker-compose.yml`. Both containers must be on `caddy_net`. The MCP server should use `expose:` not `ports:` in docker-compose.

**Warning signs:**
- Caddy logs `dial tcp 127.0.0.1:3200: connect: connection refused`
- `https://mcp.example.com/health` returns 502; direct `curl http://localhost:3200/health` from the Docker host works
- Caddyfile contains `localhost` or `127.0.0.1` as the upstream

**Phase to address:** Caddyfile/docker-compose authoring phase

---

### Pitfall 8: Container Running as Root

**What goes wrong:**
The container process runs as `root` (uid 0). If the application is compromised (e.g., via a dependency CVE or injection flaw), the attacker has root inside the container and a much better position to attempt container escape to the host.

**Why it happens:**
No `USER` directive in the Dockerfile — Docker defaults to root. Many developers do not add it because "it works without it."

**How to avoid:**
Use the `node` user that is built into all official `node:*` images (uid 1000):
```dockerfile
# In the runtime stage, after copying files:
USER node
```
Ensure file ownership allows the `node` user to read `dist/` and `node_modules/`. In the builder stage, files are owned by root. Use `COPY --chown=node:node` in the runtime stage:
```dockerfile
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/package.json ./package.json
COPY --chown=node:node --from=builder /app/package-lock.json ./package-lock.json
RUN npm ci --omit=dev
USER node
```
Note: `npm ci` must run as the user who will own the files. Run it before `USER node` if you need write access, or use `--chown` on the npm ci layer.

The server already listens on port 3200 (>1024), so no privileged port binding issue applies.

**Warning signs:**
- `docker run --rm wikijs-mcp-server whoami` returns `root`
- No `USER` directive in the Dockerfile
- Container security scanners report "container runs as root"

**Phase to address:** Dockerfile authoring phase (add before first deploy)

---

### Pitfall 9: `HEALTHCHECK` Using `curl` That Is Absent in Alpine / Slim Images

**What goes wrong:**
`HEALTHCHECK CMD curl --fail http://localhost:3200/health || exit 1` works in full Debian images but fails with `curl: not found` in `node:20-alpine` and sometimes in `node:20-slim`. The container immediately enters `unhealthy` state. Docker Compose `depends_on: condition: service_healthy` blocks deployment indefinitely.

**Why it happens:**
Alpine Linux does not include `curl` by default. `node:20-slim` strips Debian to essentials — `curl` is often absent. Developers copy HEALTHCHECK examples from non-Alpine Dockerfiles without checking tool availability.

**How to avoid:**
Two safe approaches for Alpine or slim images:

**Option A (preferred — zero extra dependencies):** Use Node.js itself as the health check runner via a small inline script or a dedicated `healthcheck.js` file:
```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3200/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"
```
Use `127.0.0.1` not `localhost` — Alpine's `/etc/hosts` may resolve `localhost` to `::1` (IPv6) while the app binds to `0.0.0.0` (IPv4 only).

**Option B:** Add `curl` explicitly in the runtime stage:
```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
```
This works for Debian-based images only.

`node:20-slim` is recommended (not Alpine) for this project because Alpine uses musl libc and Node.js has no official Alpine build — musl can cause compatibility issues with npm packages that use native extensions. Slim + Debian gives the smallest defensible image without musl risk.

**Warning signs:**
- Container health status is `unhealthy` immediately after startup
- `docker events` shows health check failing with exit code 127 ("command not found")
- `docker exec <container> curl` returns "OCI runtime exec failed" or "No such file"

**Phase to address:** Dockerfile HEALTHCHECK authoring

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Single-stage Dockerfile | Simpler to write | Compiler + source + devDeps in prod image; 300+ MB; security surface | Never for production |
| `COPY . .` without `.dockerignore` | Fast initial setup | `.env` and `node_modules/` flood build context; credentials leak into image | Never |
| Running as root (no `USER` directive) | No file permission issues | Privilege escalation risk if container is compromised | Never for internet-facing service |
| `npm install` instead of `npm ci` | More forgiving of lock file drift | Non-deterministic; installs packages not in lock file | Local development only, never in Dockerfile |
| Publishing port 3200 to host (`ports:`) | Easy to curl directly for debugging | Exposes MCP endpoint directly, bypasses Caddy TLS and auth layer | Short-lived debugging only, not in production compose |
| Keeping `"sourceMap": true` without cleanup | Better debugging if needed | `.js.map` files in image expose source paths; minor bloat | Acceptable if `.map` files are deleted post-build (`find dist -name "*.map" -delete`) |
| Copying `node_modules` from builder stage | Faster runtime stage build | Includes devDeps; different OS compilation artifacts if builder/runtime OS differs | Never |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Caddy → MCP server | Caddyfile uses `localhost:3200` | Use Docker service name: `reverse_proxy wikijs-mcp:3200` |
| Caddy → MCP server | MCP service not on `caddy_net` | Add `caddy_net` to the MCP service's `networks:` list in compose |
| `caddy_net` external network | Network absent on fresh host | Document startup order: Caddy stack first; add check `docker network ls | grep caddy_net` |
| `dotenv` in container | `.env` file expected but not present → config.ts exits | In Docker, inject vars via `environment:` or `env_file:` in compose; dotenv silently skips absent file, then Zod validates `process.env` directly |
| `WIKIJS_BASE_URL` in container | Set to `http://localhost:3000` (dev default) | Must be a name resolvable from inside the container (e.g. `http://wikijs:3000` or a real hostname) |
| Azure AD JWKS at startup | Outbound internet blocked; JWKS fetch fails on first auth | Ensure container has outbound access to `login.microsoftonline.com`; `jose` fetches lazily (first authenticated request), not at startup |
| `npm ci` in runtime stage | Lock file absent in build context | `package-lock.json` must be in `.dockerignore` exclusion list of what is NOT excluded (i.e., include it in the image); lock file must be present in the `COPY` step |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| No Docker layer cache for `npm ci` | Every build reinstalls all packages even when only `src/` changed | Copy `package.json` + `package-lock.json` before `COPY src/`; `npm ci` layer is cached until lock file changes | On every source code commit to CI |
| JWKS `createRemoteJWKSet` re-created per request | Latency spike; possible Azure AD rate limiting | `src/config.ts` already creates `jwks` once at module scope — do not move this inside request handlers | At moderate load (>50 req/s) |
| Build context includes `node_modules/` | `docker build` uploads gigabytes to daemon; slow every build | Always list `node_modules/` in `.dockerignore` | From the very first build if forgotten |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| `.env` not in `.dockerignore` | `WIKIJS_TOKEN` and Azure credentials baked into image layers; visible via `docker history` | List `.env`, `*.env`, `.env.*` in `.dockerignore` |
| `ARG WIKIJS_TOKEN` or `ENV WIKIJS_TOKEN` in Dockerfile | Secret permanently persists in all image layers; survives `docker image prune` | Never pass secrets via ARG/ENV at build time; inject at runtime only |
| Container running as root | Compromise yields root; privilege escalation easier | Add `USER node` in runtime stage of Dockerfile |
| Port 3200 published to host | MCP endpoint accessible without Caddy TLS and auth layer | Use `expose:` not `ports:` for inter-container traffic |
| Secrets in `environment:` block in committed `docker-compose.yml` | Credentials in git history | Use `env_file: .env` (git-ignored) or reference shell env vars: `WIKIJS_TOKEN: ${WIKIJS_TOKEN}` |
| `src/` directory in runtime image | Source code readable inside container if container is compromised | Multi-stage build; never `COPY --from=builder /app/src` to runtime stage |

---

## "Looks Done But Isn't" Checklist

- [ ] **Multi-stage build:** `docker run --rm wikijs-mcp-server ls /app` shows only `dist/`, `node_modules/`, `package.json` (no `src/`, no `tsconfig.json`)
- [ ] **No secrets in image:** `docker history --no-trunc wikijs-mcp-server | grep -i token` returns no matches
- [ ] **No .env in image:** `docker run --rm wikijs-mcp-server ls -la /app/.env` returns "No such file"
- [ ] **No TypeScript source in image:** `docker run --rm wikijs-mcp-server ls /app/src` exits with error
- [ ] **No devDependencies in image:** `docker run --rm wikijs-mcp-server ls /app/node_modules | grep typescript` returns nothing
- [ ] **Non-root user:** `docker run --rm wikijs-mcp-server whoami` returns `node`
- [ ] **Health check passes:** `docker inspect <container> --format '{{.State.Health.Status}}'` returns `healthy` after startup period
- [ ] **Caddy can reach service:** `curl https://mcp.example.com/health` returns `{"status":"ok"}` — not 502
- [ ] **caddy_net exists:** `docker network ls | grep caddy_net` has output before MCP stack starts
- [ ] **Only prod deps:** `docker run --rm wikijs-mcp-server du -sh /app/node_modules` is less than 130 MB
- [ ] **Correct listen host:** `src/server.ts` listen call has `host: "0.0.0.0"` — not `"localhost"`
- [ ] **Build context is clean:** Build output shows small context size (< 5 MB); not uploading `node_modules/`

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| `.env` baked into published image | HIGH | Rotate all credentials immediately (WIKIJS_TOKEN, Azure client secret if used); rebuild clean image; audit Docker Hub pull history; notify security team |
| `ARG`/`ENV` secret in image history | HIGH | Same as above; image history cannot be cleared, must rotate credentials and push new image to different tag |
| `caddy_net` not found on new host | LOW | `docker network create caddy_net` then re-run `docker compose up` |
| Service unreachable from Caddy | LOW | Verify `host: "0.0.0.0"` in server.ts; verify service on `caddy_net`; check Caddyfile uses service name |
| Wrong port/address in Caddyfile | LOW | Update Caddyfile; `docker exec caddy caddy reload --config /etc/caddy/Caddyfile` |
| devDependencies in runtime image | MEDIUM | Fix Dockerfile runtime stage to use `npm ci --omit=dev`; rebuild; repush |
| WORKDIR mismatch / missing dist/ | MEDIUM | Fix `COPY --from=builder` to use absolute paths; rebuild; add CI validation smoke test |
| Container running as root | LOW | Add `USER node` and `--chown=node:node` to Dockerfile; rebuild |
| Health check perpetually unhealthy | LOW | Replace `curl` with Node.js inline health check command; rebuild |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Fastify bound to 127.0.0.1 | Dockerfile/docker-compose phase | `docker run --rm --network caddy_net curlimages/curl curl http://wikijs-mcp:3200/health` returns 200 |
| `.env` in image | `.dockerignore` creation | `docker history --no-trunc <image> \| grep -i token` returns nothing |
| `caddy_net` not pre-created | docker-compose authoring + deployment docs | `docker network ls \| grep caddy_net` pre-check step in runbook |
| TypeScript source in runtime image | Dockerfile multi-stage COPY | `docker run --rm <image> ls /app/src` exits non-zero |
| devDependencies in image | Dockerfile runtime stage | `docker run --rm <image> ls /app/node_modules \| grep typescript` returns nothing |
| Relative COPY --from paths | Dockerfile authoring | Container starts and health check passes; CI smoke test confirms |
| Caddy routing to host port | Caddyfile authoring | End-to-end `curl https://mcp.example.com/health` returns `{"status":"ok"}` |
| Secrets in ARG/ENV | Dockerfile review before first push | `docker history --no-trunc <image>` contains no secret values |
| Container runs as root | Dockerfile USER directive | `docker run --rm <image> whoami` returns `node` |
| Missing `curl` in HEALTHCHECK | Dockerfile HEALTHCHECK authoring | `docker inspect <container> --format '{{.State.Health.Status}}'` returns `healthy` |
| `WIKIJS_BASE_URL` pointing to localhost | docker-compose environment config | `/health` endpoint returns `"status":"ok"` (not `"error"`) in running container |
| Build context includes `node_modules/` | `.dockerignore` creation | Build output shows context < 5 MB |

---

## Sources

- [Fastify + Docker — must use 0.0.0.0, issue #935](https://github.com/fastify/fastify/issues/935)
- [Fastify + Docker issue #2775](https://github.com/fastify/fastify/issues/2775)
- [Node.js Docker Best Practices — nodejs/docker-node](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md)
- [Docker Docs: SecretsUsedInArgOrEnv build check](https://docs.docker.com/reference/build-checks/secrets-used-in-arg-or-env/)
- [Docker Docs: Build context and .dockerignore](https://docs.docker.com/build/concepts/context/)
- [Docker Docs: Set environment variables in Compose](https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/)
- [Docker Docs: Define and manage networks in Compose](https://docs.docker.com/reference/compose-file/networks/)
- [Caddy docs issue #453: Use internal container port, not host port](https://github.com/caddyserver/website/issues/453)
- [Docker multi-stage WORKDIR issue #36643 (moby/moby)](https://github.com/moby/moby/issues/36643)
- [Alpine: curl not found in HEALTHCHECK (chatwoot #13776)](https://github.com/chatwoot/chatwoot/issues/13776)
- [Don't leak your Docker image's build secrets — pythonspeed.com](https://pythonspeed.com/articles/docker-build-secrets/)
- [Choosing the best Node.js Docker image — Snyk](https://snyk.io/blog/choosing-the-best-node-js-docker-image/)
- [Non-root user for Node.js — goldbergyoni/nodebestpractices](https://github.com/goldbergyoni/nodebestpractices/blob/master/sections/security/non-root-user.md)
- [Docker HEALTHCHECK in distroless/minimal Node.js images — mattknight.io](https://www.mattknight.io/blog/docker-healthchecks-in-distroless-node-js)
- [npm/cli #8277: npm prune --omit dev does not remove dev deps](https://github.com/npm/cli/issues/8277)
- [Docker Docs: Build secrets — never use ARG for secrets](https://docs.docker.com/build/building/secrets/)

---
*Pitfalls research for: Dockerizing TypeScript/Fastify/Node.js ESM server (wikijs-mcp-server) behind Caddy reverse proxy*
*Researched: 2026-03-25*
