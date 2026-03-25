---
phase: 09-docker-packaging
plan: 01
subsystem: infra
tags: [docker, dockerfile, docker-compose, caddy, node, typescript]

# Dependency graph
requires:
  - phase: none
    provides: "No prior phase dependency — packaging is applied to the final built application"
provides:
  - ".dockerignore excluding node_modules, .env, dist, .git, .planning, tests, scripts, OS artifacts"
  - "Two-stage Dockerfile (node:20-slim) producing a minimal runtime image with no sources, no .map/.d.ts, no devDependencies"
  - "docker-compose.yml joining caddy_net external network with no host port exposure, restart policy, and env_file"
affects: [deployment, caddy-config, operations]

# Tech tracking
tech-stack:
  added: [Docker, docker-compose v3]
  patterns:
    - "Two-stage Docker build: builder compiles, runtime installs prod deps only"
    - "node -e healthcheck (curl/wget absent in node:20-slim)"
    - "External Docker network for Caddy co-location (no host port publishing)"

key-files:
  created:
    - .dockerignore
    - Dockerfile
    - docker-compose.yml
  modified: []

key-decisions:
  - "node:20-slim over node:20-alpine — @azure/msal-node has documented musl libc compatibility issues with Alpine; slim is Debian-based with glibc"
  - "CMD [\"node\", \"dist/server.js\"] not npm start — npm adds shell/process indirection; SIGTERM from docker stop reaches npm, causing hard kill instead of graceful shutdown"
  - "No ports: mapping in docker-compose.yml — caddy_net network access only; publishing a port exposes JWT-protected MCP endpoint over plain HTTP, bypassing Caddy TLS termination"
  - "node -e healthcheck instead of curl/wget — both are purged from node:20-slim during installation; Node built-in http module is always available"
  - "HEALTHCHECK PORT fallback is 8000 — matches src/config.ts z.string().default(\"8000\") exactly"
  - "Strip .map and .d.ts inside builder stage (not via .dockerignore) — .dockerignore only filters host build context, not generated files inside builder"

patterns-established:
  - "Docker build context: strip all non-runtime artifacts (.dockerignore + builder-stage RUN find)"
  - "Non-root user: USER node drops to uid 1000 before CMD; node:20-slim pre-creates this user"

requirements-completed: [DOCK-01, DOCK-02, DOCK-03, DOCK-04, DOCK-05, DOCK-06, DOCK-07]

# Metrics
duration: 2min
completed: 2026-03-25
---

# Phase 9 Plan 01: Docker Packaging Summary

**Two-stage node:20-slim Dockerfile with source stripping, non-root USER, node -e healthcheck, and caddy_net docker-compose service with no host port exposure**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-25T13:07:01Z
- **Completed:** 2026-03-25T13:08:19Z
- **Tasks:** 2 of 3 complete (Task 3 is a human-verify checkpoint — awaiting operator sign-off)
- **Files modified:** 3 created

## Accomplishments

- Two-stage Dockerfile compiles TypeScript in builder stage, produces clean production image with no sources, .map files, .d.ts declarations, or devDependencies
- docker-compose.yml joins pre-existing caddy_net external network without publishing any host port — Caddy reaches the container by service name over the shared network
- All runtime secrets supplied via operator-provided `.env` file at `docker compose up` time — no secrets baked into any image layer

## Task Commits

Each task was committed atomically:

1. **Task 1: Create .dockerignore and Dockerfile (two-stage)** - `51c18c0` (chore)
2. **Task 2: Create docker-compose.yml** - `9d95d10` (chore)
3. **Task 3: Verify Docker build and runtime behavior** - pending human checkpoint

## Files Created/Modified

- `.dockerignore` — Excludes node_modules, .env/.env.*, dist/, .git/, .planning/, *.md (except README.md), tests/, scripts/, OS artifacts
- `Dockerfile` — Two-stage build: builder (node:20-slim, npm ci, tsc, strip maps/dts) + runtime (node:20-slim, npm ci --omit=dev, COPY from builder, USER node, node -e HEALTHCHECK, CMD ["node", "dist/server.js"])
- `docker-compose.yml` — Service wikijs-mcp-server: build/image/container_name/restart/env_file/networks; caddy_net as external network; no ports mapping; comment block with Caddyfile snippet and operator pre-requisites

## Decisions Made

All decisions follow the plan's established rationale:

- **node:20-slim not Alpine** — @azure/msal-node musl libc incompatibility with Alpine is documented; Debian-based slim avoids this class of failure entirely
- **CMD ["node", ...]** — Direct node invocation allows Docker to send SIGTERM directly to the Node.js process, enabling graceful shutdown via Fastify's close hooks
- **No ports: mapping** — Security boundary: the MCP endpoint is protected by JWT validation, but publishing the port would allow plain HTTP access from the host, bypassing Caddy's TLS
- **node -e healthcheck** — node:20-slim removes curl and wget during the Node.js image build process to minimize attack surface; Node's built-in http module provides a reliable alternative
- **PORT || 8000 fallback** — Matches the default in src/config.ts exactly, so the healthcheck works even when PORT is not explicitly set

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Operator Setup Required

Before running `docker compose up`, the operator must:

1. **Create the caddy_net network** if it does not already exist:
   ```
   docker network create caddy_net
   ```
   (or start the Caddy compose stack first — it typically creates caddy_net)

2. **Configure `.env`** from `example.env`. Critical note: `WIKIJS_BASE_URL` must use the actual host IP or hostname, **not `localhost`**. Inside a container, `localhost` resolves to the container's own loopback, not the Docker host where Wiki.js runs. Example: `WIKIJS_BASE_URL=http://192.168.1.10:3000`

3. **Wire Caddy** to proxy to this container by service name:
   ```
   your-domain.example.com {
     reverse_proxy wikijs-mcp-server:8000
   }
   ```

## Human Verification Required (Task 3 Checkpoint)

Task 3 is a blocking human-verify checkpoint. The operator must run these steps and report results:

1. `npm test` — 97 tests pass (no application regressions)
2. `docker compose build` — exits 0, image tagged wikijs-mcp:latest
3. `docker run --rm wikijs-mcp:latest ls /app/src 2>&1` — must fail "No such file or directory"
4. `docker run --rm wikijs-mcp:latest ls /app/dist` — only .js files (no .map or .d.ts)
5. `docker compose up -d && sleep 35 && docker exec wikijs-mcp-server node -e "..."` — /health returns status: 200
6. `docker inspect wikijs-mcp-server --format '{{.State.Health.Status}}'` — reports `healthy`
7. `docker inspect wikijs-mcp-server --format '{{json .NetworkSettings.Ports}}'` — returns `{}` (no host ports)
8. `docker compose down`

## Next Phase Readiness

- Docker packaging files are complete and committed
- Human verification (Task 3) is the final gate before this plan is fully complete
- No blocker for operator deployment once caddy_net exists and .env is populated

---
*Phase: 09-docker-packaging*
*Completed: 2026-03-25 (Tasks 1-2; Task 3 pending human-verify)*

## Self-Check: PASSED

Files verified:
- FOUND: /Users/magnetrong/git/wikijs-mcp-server/.dockerignore
- FOUND: /Users/magnetrong/git/wikijs-mcp-server/Dockerfile
- FOUND: /Users/magnetrong/git/wikijs-mcp-server/docker-compose.yml

Commits verified:
- FOUND: 51c18c0 (chore(09-01): add .dockerignore and two-stage Dockerfile)
- FOUND: 9d95d10 (chore(09-01): add docker-compose.yml with caddy_net external network)
