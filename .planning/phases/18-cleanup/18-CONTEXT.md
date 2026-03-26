# Phase 18: Cleanup - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Remove all dead code, unused dependencies, and legacy transport after Phases 15-17 strip write/admin tools and simplify scopes. No new features — pure removal and documentation update.

</domain>

<decisions>
## Implementation Decisions

### Documentation updates
- Full README.md rewrite to reflect the 3-tool read-only server (remove STDIO sections, update architecture diagram, update tool list)
- Update CLAUDE.md to remove STDIO/lib references, update tool count, update project structure section
- Delete entire `lib/` directory (both `mcp_wikijs_stdin.js` and `lib/README.md`) — nothing remains after STDIO removal
- Remove `lib/` from package.json `files` array
- Update package.json description to reflect read-only MCP server and bump version to 2.3.0

### Shell script cleanup
- Remove STDIO references from `scripts/stop_server.sh` (remove `pkill mcp_wikijs_stdin`, remove ps grep for it)
- Remove STDIO references from `scripts/setup.sh` (remove "To start the STDIO server" echo)
- Remove `pkill -f "mcp_wikijs_stdin.js"` from `scripts/start_http.sh`
- Remove `server:stdio` and `start:typescript` npm scripts from package.json

### Docker image optimization
- Switch Docker base image from `node:20-slim` to `node:20-alpine` (all remaining deps are pure JS, no native modules)
- Remove `COPY lib/ ./lib/` from Dockerfile
- Review and update docker-compose.yml for any stale references
- Update .dockerignore (remove lib/ exceptions if present)
- Include `docker build` as a verification step to confirm Alpine works

### Test suite updates
- Remove dead stubs from mockWikiJsApi (createPage, updatePage, deletePage, getUsersList, searchUsers, getGroupsList, createUser, updateUser, forceDeletePage, publishPage)
- Consolidate two copies of mockWikiJsApi into a single shared mock to prevent future drift
- Rewrite scope tests for 1 scope (wikijs:read) mapping to 3 tools (get_page, list_pages, search_pages)
- Explicit final verification gate: `npm test && npm run build` must pass with zero failures

### Claude's Discretion
- Exact README structure and wording (as long as it accurately reflects 3-tool read-only server)
- Order of removal operations (whatever minimizes intermediate breakage)
- Whether to update .planning/codebase/ docs (STRUCTURE.md, ARCHITECTURE.md, etc.) — these are planning artifacts, not user-facing
- How to handle `scripts/start_typescript.sh` if it's also dead code

</decisions>

<code_context>
## Existing Code Insights

### Removal Targets (verified by codebase scan)
- `lib/mcp_wikijs_stdin.js` — 196-line STDIO transport with its own tool switch/case
- `lib/README.md` — documents the STDIO transport
- `@azure/msal-node` in package.json — zero imports in `src/`, dead dependency
- `WikiJsUser`, `WikiJsGroup`, `ResponseResult`, `WikiJsToolDefinition` in `src/types.ts` — dead after Phase 16
- 10 dead API methods in `src/api.ts`: createPage, updatePage, deletePage, forceDeletePage, publishPage, getUsersList, searchUsers, getGroupsList, createUser, updateUser

### STDIO References (20+ files to update)
- `package.json`: scripts.server:stdio, scripts.start:typescript, files array
- `Dockerfile`: COPY lib/ ./lib/
- `scripts/`: start_http.sh, stop_server.sh, setup.sh
- `README.md`: STDIO sections, Cursor config, architecture diagram
- `CLAUDE.md`: transport mention, lib/ in structure, tool count

### Test Infrastructure
- Two copies of mockWikiJsApi: `tests/helpers/build-test-app.ts` and likely another location
- `tests/scopes.test.ts`: assertions for 3 scopes and 17 tool mappings
- Hard-coded assertion counts will break — need coordinated update

### Integration Points
- Dockerfile base image change (node:20-slim → node:20-alpine) affects build pipeline
- package.json version bump (1.3.0 → 2.3.0) signals breaking change to consumers

</code_context>

<specifics>
## Specific Ideas

No specific requirements — straightforward removal and documentation refresh. Key constraint: everything must compile and pass tests after each removal step.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 18-cleanup*
*Context gathered: 2026-03-26*
