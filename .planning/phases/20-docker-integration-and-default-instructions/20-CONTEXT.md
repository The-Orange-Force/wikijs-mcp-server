# Phase 20: Docker Integration and Default Instructions - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship a default `instructions.txt` file in the repository and add a volume mount to `docker-compose.yml` so deployers can customize Claude's instructions without rebuilding the Docker image. No application code changes — Phase 19 handles the server-side loading logic.

</domain>

<decisions>
## Implementation Decisions

### Instructions content
- Proactive search behavior: directive tone — "When the user asks about X, search the wiki first"
- Topics to call out: Mendix, clients/projects, AI/tech topics, Java/career
- Format: short and directive, 2-4 sentences — easy to read and customize
- Content: **generic template with placeholder topic names** — deployers replace placeholders with their org's actual topics (makes the file shareable/open-source friendly)

### File placement
- Repo root: `./instructions.txt` alongside `docker-compose.yml` and `.env` — discoverable, easy to edit on the host
- Container path: `/app/instructions.txt` (matches `WORKDIR /app`; Phase 19 defaults `MCP_INSTRUCTIONS_PATH` to this path)
- Volume mount in docker-compose.yml: `./instructions.txt:/app/instructions.txt:ro` (read-only — server never writes to it)
- Add `instructions.txt` to `.dockerignore` — file is mounted at runtime, not baked into the image

### Documentation updates
- Add `MCP_INSTRUCTIONS_PATH` to `example.env` as a commented-out line with the default path and a brief description
- Update `CLAUDE.md` env var table: add `MCP_INSTRUCTIONS_PATH` with "No", description, and example value
- Update `README.md` env var table: same addition

### Claude's Discretion
- Exact placeholder text/wording in instructions.txt (as long as it's clearly a template to fill in)
- Exact comment wording in example.env
- Where in the env var tables to insert the new row (logical grouping)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `docker-compose.yml`: existing service definition with `env_file: .env`, `networks: caddy_net`, `restart: unless-stopped` — volume mount added under the service
- `.dockerignore`: already excludes `.env`, `node_modules`, `.git`, etc. — add `instructions.txt` to the same block
- `example.env`: existing env var file — add `MCP_INSTRUCTIONS_PATH` as a commented line in the optional vars section

### Established Patterns
- All config via environment variables with Zod validation (Phase 19 handles `MCP_INSTRUCTIONS_PATH` validation)
- No host port exposure — Caddy reverse proxy via `caddy_net`
- `WORKDIR /app` in Dockerfile — `/app/instructions.txt` is a natural default path

### Integration Points
- Phase 19 will set the default value of `MCP_INSTRUCTIONS_PATH` to `/app/instructions.txt` — Phase 20 must use exactly that path in the volume mount
- No Dockerfile changes needed — the file is mounted at runtime, not built into the image

</code_context>

<specifics>
## Specific Ideas

- Volume mount line in docker-compose.yml:
  ```yaml
  volumes:
    - ./instructions.txt:/app/instructions.txt:ro
  ```
- instructions.txt should use `[TOPIC]` style placeholders so deployers know exactly what to replace

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 20-docker-integration-and-default-instructions*
*Context gathered: 2026-03-27*
