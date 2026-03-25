# Feature Research: Docker Deployment of a Node.js/TypeScript MCP Server

**Domain:** Docker container packaging for a production Node.js/TypeScript HTTP service behind Caddy reverse proxy
**Researched:** 2026-03-25
**Confidence:** HIGH

## Context

The wikijs-mcp-server is an existing, fully functional Fastify/TypeScript MCP server with:
- Configurable PORT (default 3200), `/health` (unauthenticated), `/.well-known/oauth-protected-resource` (unauthenticated), `POST /mcp` (JWT-authenticated)
- All config via env vars, validated at startup by Zod
- The host already has Caddy running in Docker on an external network called `caddy_net`
- No existing Docker setup — this is a greenfield containerization

---

## Feature Landscape

### Table Stakes (Expected, Missing = Deployment is Broken)

These features are assumed by anyone operating Node.js services in Docker. Missing them means the container won't run correctly, will be insecure, or will be operationally unusable.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Multi-stage Dockerfile** | Single-stage builds include TypeScript compiler, devDependencies, and source files in the runtime image — massively bloated (1GB+ vs <200MB). Operators and CI pipelines expect slim runtime images. | LOW | Two meaningful stages: (1) `builder` — installs all deps, runs `tsc`; (2) `runtime` — copies `dist/` + production node_modules only. Use `node:20-alpine` as base. `npm ci --omit=dev` in runtime stage. |
| **Non-root user in container** | Running as root inside a container means a process escape gives host root access. The official `node:20-alpine` image ships a built-in `node` user (UID 1000). Every Node.js Docker guide treats non-root as table stakes, not a differentiator. | LOW | Add `USER node` in runtime stage. Use `--chown=node:node` on COPY instructions. The app already listens on port 3200 (non-privileged), so no `CAP_NET_BIND_SERVICE` needed. |
| **HEALTHCHECK wired to /health** | Docker Compose and container orchestrators use HEALTHCHECK to determine if a container is ready/alive. Without it, a crashed or stuck process is indistinguishable from a healthy one. The `/health` endpoint already exists and is unauthenticated. | LOW | `HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD wget -qO- http://localhost:3200/health \|\| exit 1`. Use `wget` (available in Alpine by default) not `curl` (not included in Alpine). Start period of 15s covers Fastify startup + JWKS fetch + Azure AD connectivity. |
| **.dockerignore** | Without it, the build context includes `node_modules/` (hundreds of MB), `.git/`, `dist/` (stale), `.env` (secrets), and test artifacts. This leaks secrets into the image and dramatically slows builds. | LOW | Exclude: `node_modules/`, `dist/`, `.git/`, `.env`, `.env.*`, `coverage/`, `*.tsbuildinfo`, `.planning/`, `tests/`, `**/__tests__/`, `.vscode/`, `*.md` (except necessary ones), `docker-compose*`, `Dockerfile*`. Keep: `src/`, `package*.json`, `tsconfig.json`. |
| **docker-compose.yml with external caddy_net** | The host already has a Caddy instance managing TLS and routing on `caddy_net`. Services must join this network to receive proxied traffic. Caddy resolves service names via Docker DNS (service name = hostname). | LOW | Declare `networks: caddy_net: external: true` at the top level. Attach the service to `caddy_net`. Do NOT expose port 3200 to the host (Caddy proxies on the internal network — port exposure to the host creates an auth bypass risk). |
| **restart policy** | A crashed server that stays down is an operational incident. `unless-stopped` is the standard policy for persistent services: auto-restarts on crash, but respects manual `docker stop` (unlike `always`, which restarts even after manual stops). | LOW | `restart: unless-stopped`. Note: there is a known Docker issue where Node.js processes that exit via uncaught errors may not trigger the restart policy correctly — the existing server's startup Zod validation already ensures proper exit codes. |
| **Environment variable pass-through** | All server config comes from env vars. The container must receive the same env vars the server already uses (`WIKIJS_BASE_URL`, `WIKIJS_TOKEN`, `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `MCP_RESOURCE_URL`, `PORT`). | LOW | Use `env_file: .env` in docker-compose.yml. Do NOT bake env vars into the image. The `.env` file is already in `.gitignore` and should be added to `.dockerignore`. |

### Differentiators (Not Required, But Meaningful for Production Operations)

Features that improve security, observability, or operational posture beyond a working baseline. Worth doing in this milestone if complexity is low.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **`no-new-privileges` security option** | Prevents container processes from gaining new privileges via setuid/setgid binaries. Standard Docker security hardening, adds zero friction. OWASP Docker Security Cheat Sheet recommends it. | LOW | Add `security_opt: [no-new-privileges:true]` to the service in docker-compose.yml. Zero code changes. |
| **`stop_grace_period`** | Docker's default SIGTERM-to-SIGKILL window is 10s. Fastify needs time to drain active connections, especially for any long-running MCP calls. Explicit grace period documents intent and prevents in-flight requests being killed. | LOW | `stop_grace_period: 30s` in docker-compose.yml. Fastify already has SIGTERM/SIGINT handlers via the SDK. Pairs with the server's existing graceful shutdown. |
| **Explicit CMD vs npm start** | `npm start` adds a layer of process indirection. Signals (SIGTERM for `docker stop`) hit npm, not Node.js directly, causing a ~10s hard-kill delay instead of graceful shutdown. Specifying the Node binary directly in CMD ensures signals reach the app. | LOW | `CMD ["node", "dist/server.js"]` in Dockerfile instead of `CMD ["npm", "start"]`. Verify the compiled entry point path from `tsconfig.json`. |
| **Layer caching optimization** | `COPY package*.json ./` then `RUN npm ci` before `COPY src/` exploits Docker layer cache. When only source changes (no dependency changes), the `npm ci` layer is reused — build time drops from ~60s to ~5s on iterative builds. | LOW | Standard pattern. COPY `package.json` and `package-lock.json` first, run `npm ci`, then COPY source. Already implied by multi-stage build but worth explicit attention. |
| **`NODE_ENV=production` in runtime stage** | Fastify and several npm packages branch on `NODE_ENV`. Production mode disables development-only features (Pino pretty-print, stack traces in errors). Setting it in the Dockerfile ENV bakes it into the image rather than relying on the operator to set it. | LOW | `ENV NODE_ENV=production` in the final Dockerfile stage. Can still be overridden via `docker-compose.yml` `environment` if needed. |
| **Named image tag in docker-compose.yml** | `image: wikijs-mcp-server:latest` on the service allows `docker images` to show a meaningful name, `docker pull` to work, and future CI/CD to push tagged versions. Without it, Compose auto-generates an opaque name like `wikijs-mcp-server_app`. | LOW | Add `image: wikijs-mcp-server:latest` (or versioned tag) to the service definition. Zero operational complexity. |

### Anti-Features (Commonly Done, Creates Problems)

Features that appear helpful but introduce meaningful problems for this specific deployment.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Exposing container port to host (`ports: - "3200:3200"`)** | "I want to test the service directly without going through Caddy." | Exposes the auth-required MCP endpoint directly to the host network, bypassing Caddy's TLS termination and any firewall rules. A misconfigured or compromised host could reach the server without HTTPS. Defeats the purpose of the reverse proxy. | Leave `ports` out entirely. Caddy reaches the service via the `caddy_net` Docker network using the service's internal DNS name and port. For local testing, use `docker exec` or temporarily add `ports` to a dev override file (`docker-compose.override.yml`) that is gitignored. |
| **`read_only: true` root filesystem** | Security hardening checklists include it. | Fastify's Pino logger writes to stdout (fine), but Node.js itself writes temporary files during module resolution and the `jose` JWKS cache may use fs. Breaks are non-obvious and hard to debug. The non-root user + `no-new-privileges` already provides strong isolation without this complexity. | Use `no-new-privileges` and non-root user instead. Add `read_only: true` only if a security audit specifically requires it, and pair with `tmpfs` mounts for `/tmp` and any runtime write paths. |
| **Bundling Caddy config into this repo** | "Let's manage the Caddyfile alongside the service." | Caddy is an external dependency already managed separately on the host. Putting Caddy config here couples the lifecycle of the MCP server to Caddy config management. Caddy serves multiple services — its config is not owned by this repo. | Document the Caddy configuration required (virtual host, upstream, TLS) in a `DEPLOYMENT.md` or equivalent. Keep the Caddyfile in the Caddy service's own repo/directory. |
| **Docker secrets instead of env_file** | "We should use Docker Swarm secrets for credentials." | This project does not use Docker Swarm or Kubernetes. Docker secrets in standalone Compose require Swarm mode. The overhead is not justified for a single-host deployment. | Use `env_file: .env` with a `.env` file that is gitignored, has restricted file permissions (`chmod 600 .env`), and is documented in `example.env`. |
| **Multi-service docker-compose.yml (including Wiki.js)** | "Package everything together for easy deployment." | Wiki.js is explicitly on a separate host per PROJECT.md. Including it in this Compose file creates the illusion that they are co-deployed, leads to drift, and makes each service's lifecycle harder to manage independently. | Single-service Compose file. Wiki.js is external, referenced only by `WIKIJS_BASE_URL`. |
| **Alpine custom user creation (adduser/addgroup)** | "Create a dedicated `mcpserver` user with a custom UID." | The official `node:20-alpine` image already ships a `node` user (UID 1000). Creating a custom user adds 2-3 Dockerfile lines and no meaningful security improvement for a single-purpose service. Custom UIDs only matter when you need to match host volume ownership. | Use the built-in `node` user: `USER node`. Simpler, well-understood, and sufficient. |

---

## Feature Dependencies

```
Multi-stage Dockerfile
    (required foundation — enables all other Dockerfile features)
    |
    +--enables--> Non-root user (USER node)
    |
    +--enables--> NODE_ENV=production
    |
    +--enables--> Explicit CMD (node dist/server.js)
    |
    +--enables--> HEALTHCHECK (health endpoint already exists)
    |
    +--requires--> Layer caching optimization (package.json COPY ordering)

.dockerignore
    (independent, improves build context for multi-stage build)

docker-compose.yml
    +--requires--> Multi-stage Dockerfile (or image already built)
    +--requires--> External caddy_net network (already exists on host)
    +--requires--> .env file (credentials, not in image)
    |
    +--adds--> restart policy (unless-stopped)
    +--adds--> stop_grace_period (30s)
    +--adds--> no-new-privileges security option
    +--adds--> env_file reference

External caddy_net network
    (pre-existing host dependency — Caddy owns this network)
    +--enables--> No ports exposed to host (security benefit)
    +--enables--> Service name DNS resolution by Caddy
```

### Dependency Notes

- **Multi-stage Dockerfile is the foundation:** All Dockerfile features (non-root user, HEALTHCHECK, CMD, layer caching) are configured inside the Dockerfile. The docker-compose.yml has no meaning without it.
- **caddy_net is a host precondition, not something we create:** `external: true` tells Compose to use the existing network. If it doesn't exist, `docker compose up` fails fast with a clear error. This is the correct behavior — it forces operators to set up Caddy first.
- **HEALTHCHECK depends on the `/health` endpoint:** The endpoint already exists and is unauthenticated. No application code changes needed.
- **No-port-exposure depends on external network:** Caddy can only reach the container by service name if they share the `caddy_net` network. If the network is not set up, exposing a port is a fallback — but the correct fix is to set up the network, not expose ports.

---

## MVP Definition

### Launch With (v2.1)

Minimum viable Docker deployment — what's needed for the server to run reliably in production behind Caddy.

- [ ] **Multi-stage Dockerfile** — without this, the image is 1GB+ and unsuitable for deployment
- [ ] **Non-root user (USER node)** — table stakes security; no justification to ship as root
- [ ] **HEALTHCHECK on /health** — container lifecycle management requires it; endpoint already exists
- [ ] **.dockerignore** — without it, `.env` leaks into build context and builds are slow
- [ ] **docker-compose.yml with caddy_net external network** — the actual deployment descriptor
- [ ] **restart: unless-stopped** — operational requirement; service must recover from crashes
- [ ] **env_file: .env** — credentials pass-through from host to container
- [ ] **stop_grace_period: 30s** — Fastify graceful shutdown requires a window beyond Docker's 10s default
- [ ] **Explicit CMD: node dist/server.js** — correct signal handling with no npm process indirection

### Add After Validation (v2.1.x)

After confirming the service starts, stays healthy, and Caddy successfully proxies to it:

- [ ] **`no-new-privileges` security option** — trivial to add, zero testing friction; add in same PR or immediately after
- [ ] **Named image tag** — add when setting up any CI/CD pipeline for image builds

### Future Consideration (v2.2+)

- [ ] **Multi-arch image builds (amd64/arm64)** — only relevant if deploying on ARM hosts (Raspberry Pi, AWS Graviton). Not needed for x86 server.
- [ ] **Distroless base image** — further attack surface reduction. Requires switching the HEALTHCHECK to a Node.js script (no `wget` in distroless). Add only if a security review requires it.
- [ ] **OCI image labels** — `LABEL org.opencontainers.image.*` metadata. Useful for container registries but not operational functionality.
- [ ] **`read_only: true` filesystem** — high-security hardening. Requires identifying all write paths and adding `tmpfs` mounts. Only if a security audit requires it.

---

## Feature Prioritization Matrix

| Feature | Operational Value | Implementation Cost | Priority |
|---------|------------------|---------------------|----------|
| Multi-stage Dockerfile | HIGH | LOW | P1 |
| Non-root user | HIGH | LOW | P1 |
| HEALTHCHECK | HIGH | LOW | P1 |
| .dockerignore | HIGH | LOW | P1 |
| docker-compose.yml (caddy_net) | HIGH | LOW | P1 |
| restart: unless-stopped | HIGH | LOW | P1 |
| env_file pass-through | HIGH | LOW | P1 |
| Explicit CMD (node binary) | MEDIUM | LOW | P1 |
| stop_grace_period: 30s | MEDIUM | LOW | P1 |
| NODE_ENV=production in image | MEDIUM | LOW | P1 |
| Layer caching optimization | MEDIUM | LOW | P1 |
| no-new-privileges security_opt | MEDIUM | LOW | P2 |
| Named image tag | LOW | LOW | P2 |
| Multi-arch builds | LOW | MEDIUM | P3 |
| Distroless base image | LOW | MEDIUM | P3 |
| read_only filesystem | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for a working, secure, production-ready deployment
- P2: Should have; low effort, add in same milestone or immediately after
- P3: Nice to have; defer until there is a concrete driver (CI/CD, security audit, new host platform)

---

## Caddy Network Integration Notes

The key behavior when joining `caddy_net`:

1. **No ports section in docker-compose.yml.** Caddy reaches the service at `http://wikijs-mcp-server:3200` (service name is the Docker DNS hostname). The container's port is internal to the Docker network only.
2. **Caddy Caddyfile entry** (documentation only — managed externally): `reverse_proxy wikijs-mcp-server:3200` under the relevant virtual host. Service name must match the `container_name` or Compose service name.
3. **External network declaration** in docker-compose.yml:
   ```yaml
   networks:
     caddy_net:
       external: true
   ```
   If `caddy_net` does not exist, `docker compose up` fails immediately with `network caddy_net declared as external, but could not be found`. This is the correct fail-fast behavior.
4. **TLS termination is Caddy's responsibility.** The container speaks plain HTTP to Caddy on the internal network. MCP_RESOURCE_URL should be the public HTTPS URL that Caddy exposes, not the internal Docker URL.

---

## Sources

### HIGH Confidence (Official Documentation)

- [Docker official guide: Containerize a Node.js application](https://docs.docker.com/guides/nodejs/containerize/) — Official multi-stage patterns
- [nodejs/docker-node Best Practices](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md) — Official Node.js Docker best practices (non-root user, signal handling, PID 1)
- [Docker Docs: Start containers automatically (restart policies)](https://docs.docker.com/engine/containers/start-containers-automatically/)
- [Docker Docs: Compose Networks — external networks](https://docs.docker.com/compose/compose-file/06-networks/)

### MEDIUM Confidence (Verified Community/Commercial Sources)

- [How to Containerize a Fastify Application with Docker (OneUptime, 2026)](https://oneuptime.com/blog/post/2026-02-08-how-to-containerize-a-fastify-application-with-docker/view) — Fastify-specific HEALTHCHECK, graceful shutdown, and non-root patterns
- [Docker Multi-Stage Builds Guide 2026 (DevToolbox)](https://devtoolbox.dedyn.io/blog/docker-multi-stage-builds-guide) — Size reduction patterns
- [Docker HEALTHCHECK Best Practices (OneUptime, 2026)](https://oneuptime.com/blog/post/2026-01-30-docker-health-check-best-practices/view) — Interval/timeout guidance, Alpine wget note
- [Caddy as a Docker-Compose Reverse Proxy (WirelessMoves, 2025)](https://blog.wirelessmoves.com/2025/06/caddy-as-a-docker-compose-reverse-proxy.html) — External network Caddy pattern
- [Docker Restart Policies (OneUptime, 2026)](https://oneuptime.com/blog/post/2026-01-16-docker-restart-policies/view) — unless-stopped vs always comparison
- [Node.js Docker Security: Non-Root User (Goldbergyoni Node Best Practices)](https://github.com/goldbergyoni/nodebestpractices/blob/master/sections/security/non-root-user.md) — Production security rationale
- [Docker Graceful Shutdown and Signal Handling (OneUptime, 2026)](https://oneuptime.com/blog/post/2026-01-16-docker-graceful-shutdown-signals/view) — SIGTERM/PID 1 problem explained
- [Docker Health Checks (Dash0 Guide)](https://www.dash0.com/guides/docker-health-check-a-practical-guide) — Practical healthcheck configuration

### LOW Confidence (Single Source / Community)

- Node.js Alpine wget availability: verified in multiple sources (Alpine ships wget, not curl), but the specific `node:20-alpine` image was not directly verified via `docker run` — **verify with `docker run node:20-alpine which wget`** before relying on it.

---

*Feature research for: Docker deployment of wikijs-mcp-server behind Caddy reverse proxy*
*Researched: 2026-03-25*
