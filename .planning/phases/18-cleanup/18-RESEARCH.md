# Phase 18: Cleanup - Research

**Researched:** 2026-03-26
**Domain:** Dead code removal, dependency cleanup, documentation refresh
**Confidence:** HIGH

## Summary

Phase 18 is a pure removal and documentation update phase. No new features, no new code patterns -- just systematic deletion of dead code, unused dependencies, legacy transport, and stale documentation. The codebase currently has 17 tools registered, 3 scopes, and the STDIO transport -- all of which need to be cut down to 3 read-only tools, 1 scope, and HTTP-only transport.

The primary risk is cascading breakage: removing types, API methods, tools, and scopes in the wrong order will produce intermediate states where TypeScript cannot compile or tests fail. The research below maps every removal target, identifies the exact files and lines affected, and recommends an ordering that keeps the build green at each step.

**Primary recommendation:** Work in three waves -- (1) source code cleanup (types, API methods, tools, scopes), (2) infrastructure cleanup (dependency, lib/, scripts, Dockerfile), (3) documentation rewrite (README, CLAUDE.md, package.json metadata). Run `npm test && npm run build` after each wave.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Full README.md rewrite to reflect the 3-tool read-only server (remove STDIO sections, update architecture diagram, update tool list)
- Update CLAUDE.md to remove STDIO/lib references, update tool count, update project structure section
- Delete entire `lib/` directory (both `mcp_wikijs_stdin.js` and `lib/README.md`) -- nothing remains after STDIO removal
- Remove `lib/` from package.json `files` array
- Update package.json description to reflect read-only MCP server and bump version to 2.3.0
- Remove STDIO references from `scripts/stop_server.sh` (remove `pkill mcp_wikijs_stdin`, remove ps grep for it)
- Remove STDIO references from `scripts/setup.sh` (remove "To start the STDIO server" echo)
- Remove `pkill -f "mcp_wikijs_stdin.js"` from `scripts/start_http.sh`
- Remove `server:stdio` and `start:typescript` npm scripts from package.json
- Switch Docker base image from `node:20-slim` to `node:20-alpine` (all remaining deps are pure JS, no native modules)
- Remove `COPY lib/ ./lib/` from Dockerfile
- Review and update docker-compose.yml for any stale references
- Update .dockerignore (remove lib/ exceptions if present)
- Include `docker build` as a verification step to confirm Alpine works
- Remove dead stubs from mockWikiJsApi (createPage, updatePage, deletePage, getUsersList, searchUsers, getGroupsList, createUser, updateUser, forceDeletePage, publishPage)
- Consolidate two copies of mockWikiJsApi into a single shared mock to prevent future drift
- Rewrite scope tests for 1 scope (wikijs:read) mapping to 3 tools (get_page, list_pages, search_pages)
- Explicit final verification gate: `npm test && npm run build` must pass with zero failures

### Claude's Discretion
- Exact README structure and wording (as long as it accurately reflects 3-tool read-only server)
- Order of removal operations (whatever minimizes intermediate breakage)
- Whether to update .planning/codebase/ docs (STRUCTURE.md, ARCHITECTURE.md, etc.) -- these are planning artifacts, not user-facing
- How to handle `scripts/start_typescript.sh` if it is also dead code

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CLEN-01 | STDIO transport removed (lib/mcp_wikijs_stdin.js and references) | Full file inventory below: lib/ directory deletion, 6 script/config files with STDIO refs, Dockerfile COPY line, README sections, CLAUDE.md references |
| CLEN-02 | @azure/msal-node removed from package.json | Confirmed zero imports in src/; only in package.json line 53 and package-lock.json. Safe `npm uninstall` |
| CLEN-03 | Dead API methods, types (WikiJsUser, WikiJsGroup, ResponseResult), and unused code removed | 10 dead API methods in api.ts (lines 125-443), 4 dead types in types.ts, 14 dead tool registrations in mcp-tools.ts, dead scope entries in scopes.ts, dead mock stubs in 2 test files |
</phase_requirements>

## Removal Inventory

This section is the core research output. It maps every file that needs changes, what to remove, and what to keep.

### Wave 1: Source Code (types, API, tools, scopes)

#### `src/types.ts` -- Remove dead types

| Type | Status | Action |
|------|--------|--------|
| `WikiJsToolDefinition` | Dead -- not imported anywhere in src/ | DELETE |
| `WikiJsPage` | KEEP -- used by getPageById, getPagesList, searchPages | KEEP |
| `WikiJsUser` | Dead after Phase 16 | DELETE |
| `WikiJsGroup` | Dead after Phase 16 | DELETE |
| `ResponseResult` | Dead -- no mutation methods remain | DELETE |

**After cleanup:** types.ts exports only `WikiJsPage`.

#### `src/api.ts` -- Remove dead methods

| Method | Lines | Status | Action |
|--------|-------|--------|--------|
| `checkConnection()` | 23-40 | KEEP -- used by health check | KEEP |
| `getPageById(id)` | 43-60 | KEEP -- used by get_page | KEEP |
| `getPageContent(id)` | 63-76 | KEEP -- used by get_page_content | KEEP |
| `getPagesList(limit, orderBy)` | 78-98 | KEEP -- used by list_pages | KEEP |
| `searchPages(query, limit)` | 101-122 | KEEP -- used by search_pages | KEEP |
| `createPage(...)` | 125-162 | Dead | DELETE |
| `updatePage(id, content)` | 165-185 | Dead | DELETE |
| `deletePage(id)` | 188-207 | Dead | DELETE |
| `getUsersList()` | 210-229 | Dead | DELETE |
| `searchUsers(query)` | 232-251 | Dead | DELETE |
| `getGroupsList()` | 254-268 | Dead | DELETE |
| `createUser(...)` | 271-306 | Dead | DELETE |
| `updateUser(id, name)` | 309-329 | Dead | DELETE |
| `getAllPagesList(...)` | 332-361 | Dead (list_all_pages removed) | DELETE |
| `searchUnpublishedPages(...)` | 364-385 | Dead | DELETE |
| `forceDeletePage(id)` | 388-391 | Dead | DELETE |
| `getPageStatus(id)` | 394-414 | Dead | DELETE |
| `publishPage(id)` | 417-443 | Dead | DELETE |

**Also:** Remove dead imports from the top of api.ts: `WikiJsUser`, `WikiJsGroup`, `ResponseResult`. Keep only `WikiJsPage`.

**After cleanup:** api.ts has 5 methods: `checkConnection`, `getPageById`, `getPageContent`, `getPagesList`, `searchPages`.

#### `src/mcp-tools.ts` -- Remove dead tool registrations

| Tool | Lines (approx) | Action |
|------|----------------|--------|
| `get_page` | 50-71 | KEEP |
| `get_page_content` | 73-94 | KEEP |
| `list_pages` | 96-121 | KEEP |
| `search_pages` | 123-145 | KEEP |
| `create_page` | 147-171 | DELETE |
| `update_page` | 173-195 | DELETE |
| `delete_page` | 197-218 | DELETE |
| `list_all_pages` | 220-253 | DELETE |
| `search_unpublished_pages` | 255-277 | DELETE |
| `force_delete_page` | 279-300 | DELETE |
| `get_page_status` | 306-327 | DELETE |
| `publish_page` | 329-350 | DELETE |
| `list_users` | 356-375 | DELETE |
| `search_users` | 377-398 | DELETE |
| `create_user` | 400-452 | DELETE |
| `list_groups` | 458-477 | DELETE |
| `update_user` | 483-505 | DELETE |

**Also:** Remove dead tool name constants (lines 34-44). Update module docstring from "17 WikiJS tools" to "3 WikiJS tools" (appears on line 4 and line 17). Update `version` from `"1.3.0"` to `"2.3.0"` (line 24).

**After cleanup:** mcp-tools.ts registers 4 tools: `get_page`, `get_page_content`, `list_pages`, `search_pages`.

**NOTE:** The CONTEXT.md says 3 tools (get_page, list_pages, search_pages) but the current codebase has `get_page_content` as a separate tool. The research reflects what Phase 15/16 are supposed to produce -- the planner should verify whether Phase 15 merges `get_page_content` into `get_page` (TOOL-01 says "get_page returns metadata, content, and isPublished in a single call"). If it does, then Phase 18 should have 3 tools; if `get_page_content` survives Phase 15, then 4 tools. **The planner must check Phase 15/16 output before finalizing counts.**

#### `src/scopes.ts` -- Simplify to single scope

Current state: 3 scopes, 17 tools.
Target state: 1 scope (`wikijs:read`), 3 tools.

Changes:
- Remove `WRITE` and `ADMIN` from `SCOPES` constant
- Remove their entries from `SCOPE_TOOL_MAP`
- Update `wikijs:read` entry to only contain the surviving tools
- `SUPPORTED_SCOPES`, `TOOL_SCOPE_MAP` will auto-update since they are derived

#### `src/routes/public-routes.ts` -- Update version

Line 39: `version: "2.0.0"` needs updating to `"2.3.0"` to match package.json.

### Wave 2: Infrastructure (dependency, lib/, scripts, Docker)

#### `@azure/msal-node` removal

- **Confirmed zero imports** in `src/` directory (grep returned no matches)
- Present in `package.json` line 53: `"@azure/msal-node": "^5.1.1"`
- Command: `npm uninstall @azure/msal-node`
- This also removes it from `package-lock.json` automatically

**Impact on Docker:** The Dockerfile comment on line 6 says "node:20-slim (Debian-based, glibc) is used instead of Alpine -- @azure/msal-node has documented musl libc compatibility issues with Alpine." Removing msal-node removes the blocker for Alpine. This aligns with the user decision to switch to Alpine.

#### `lib/` directory deletion

- Delete entire `lib/` directory: `rm -rf lib/`
- Contains: `mcp_wikijs_stdin.js` (196 lines), `README.md` (documents STDIO transport)
- Remove `"lib/"` from package.json `files` array (line 46)

#### `scripts/` cleanup

| File | Change |
|------|--------|
| `scripts/start_http.sh` line 15 | Remove `pkill -f "mcp_wikijs_stdin.js" \|\| true` |
| `scripts/stop_server.sh` line 35 | Remove `pkill -f "mcp_wikijs_stdin.js"` line |
| `scripts/stop_server.sh` line 41 | Remove `mcp_wikijs_stdin` from grep pattern |
| `scripts/stop_server.sh` line 47 | Remove `mcp_wikijs_stdin` from grep pattern |
| `scripts/setup.sh` line 48 | Remove `echo -e "${YELLOW}To start the STDIO server:${NC} npm run server:stdio"` |
| `scripts/start_typescript.sh` | **This is dead code** -- it is functionally identical to `start_http.sh` (same `node dist/server.js` command). The npm script `start:typescript` points to it. Both the script and the npm script should be deleted. |

#### `package.json` cleanup

| Field | Current | Target |
|-------|---------|--------|
| `version` | `"1.3.0"` | `"2.3.0"` |
| `description` | `"MCP Server for Wiki.js integration with unpublished pages management"` | Update to reflect read-only (Claude's discretion on exact wording) |
| `scripts.server:stdio` | `"node lib/mcp_wikijs_stdin.js"` | DELETE |
| `scripts.start:typescript` | `"./scripts/start_typescript.sh"` | DELETE |
| `files` array | Includes `"lib/"` | Remove `"lib/"` |
| `dependencies.@azure/msal-node` | `"^5.1.1"` | DELETE (via `npm uninstall`) |

#### Dockerfile changes

| Line | Current | Target |
|------|---------|--------|
| 7 (builder base) | `FROM node:20-slim AS builder` | `FROM node:20-alpine AS builder` |
| 6 (comment) | References msal-node/Alpine issue | Remove or update comment |
| 35 (runtime base) | `FROM node:20-slim AS runtime` | `FROM node:20-alpine AS runtime` |
| 49-50 | `# Copy STDIO transport stub` + `COPY lib/ ./lib/` | DELETE both lines |
| 53 (USER) | References `node:20-slim` | Update comment to reference `node:20-alpine` |
| 58-59 (HEALTHCHECK) | References `node:20-slim` | Update comment |

**Alpine-specific considerations:**
- `node:20-alpine` uses musl libc instead of glibc
- All remaining dependencies (`graphql-request`, `jose`, `zod`, `fastify`, `@modelcontextprotocol/sdk`) are pure JavaScript -- no native modules
- The `node` user exists in both slim and Alpine images (uid 1000 in Alpine)
- `curl` is NOT present in Alpine either (same as slim), so the HEALTHCHECK using `node -e` is fine

#### docker-compose.yml

- No changes needed -- it references `build: .` (the Dockerfile) and has no STDIO/lib references
- The `image: wikijs-mcp:latest` tag is fine

#### .dockerignore

- Current .dockerignore does NOT have any lib/ exceptions (the `*.md` exclusion with `!README.md` only applies to markdown files)
- No changes needed

### Wave 3: Test Suite

#### mockWikiJsApi consolidation

**Two copies exist:**
1. `tests/helpers/build-test-app.ts` lines 41-78 (shared helper)
2. `tests/smoke.test.ts` lines 16-53 (local copy)

**Strategy:** Keep the shared copy in `build-test-app.ts`, update smoke.test.ts to import from the shared helper. Then remove dead stubs from the shared mock.

**Stubs to remove from mockWikiJsApi:**

| Stub | Action |
|------|--------|
| `createPage` | DELETE |
| `updatePage` | DELETE |
| `deletePage` | DELETE |
| `getUsersList` | DELETE |
| `searchUsers` | DELETE |
| `getGroupsList` | DELETE |
| `createUser` | DELETE |
| `updateUser` | DELETE |
| `getAllPagesList` | DELETE |
| `searchUnpublishedPages` | DELETE |
| `forceDeletePage` | DELETE |
| `getPageStatus` | DELETE |
| `publishPage` | DELETE |

**Stubs to KEEP:**
- `checkConnection` -- used by health check
- `getPageById` -- used by get_page
- `getPageContent` -- used by get_page_content
- `getPagesList` -- used by list_pages
- `searchPages` -- used by search_pages

#### `tests/scopes.test.ts` -- Full rewrite

Current assertions that will break:
- Line 12-16: Expects 3 scopes -- change to 1 (`wikijs:read`)
- Line 24-27: Expects 17 tools -- change to 3 (or 4, see note above)
- Line 43-53: Expects 7 read tools -- change to 3
- Line 55-60: Expects 3 write tools -- DELETE this test
- Line 62-73: Expects 7 admin tools -- DELETE this test
- Line 75-79: Checks specific tools (`create_page`, `delete_page`) -- rewrite for surviving tools
- Line 81-85: Checks SCOPES.WRITE and SCOPES.ADMIN -- DELETE

#### `tests/smoke.test.ts` -- Update counts and tool list

- Line 16-53: Replace local `mockWikiJsApi` with import from shared helper
- Line 62-77: `makeTestConfig()` is duplicated from build-test-app.ts -- import from shared helper
- Line 181: `"POST /mcp with tools/list returns all 17 tools"` -- update description
- Line 197: `expect(data.result.tools.length).toBe(17)` -- update to 3 (or 4)
- Lines 210-228: `expectedTools` array -- update to surviving tools only
- Lines 234-261: `"tools/call invokes list_users tool"` -- **this entire test must be rewritten** to test a surviving tool (e.g., `get_page` or `list_pages`)

#### Other test files -- verify no breakage

| Test File | Impact |
|-----------|--------|
| `tests/config.test.ts` | No impact -- tests env var validation, not tools |
| `tests/discovery.test.ts` | May need update if scopes_supported changes (check for `wikijs:write`, `wikijs:admin` assertions) |
| `tests/route-protection.test.ts` | May invoke tools that no longer exist -- must verify |
| `tests/observability.test.ts` | References `list_users` tool at line -- must update to use surviving tool |
| `tests/e2e-flow.test.ts` | Must verify which tool it invokes |
| `tests/authorize.test.ts` | OAuth flow -- likely no tool references |
| `tests/oauth-proxy-discovery.test.ts` | OAuth flow -- likely no tool references |
| `tests/token-proxy-integration.test.ts` | OAuth flow -- likely no tool references |

### Wave 4: Documentation

#### README.md -- Full rewrite

The entire README needs rewriting. Key changes:
- Remove "create, update, and delete wiki pages" from overview
- Remove "Manage users and groups"
- Remove "Work with both published and unpublished pages"
- Remove STDIO transport section
- Remove User Management, Group Management sections
- Remove Cursor STDIO config, VS Code STDIO config
- Update Available Tools table to 3 (or 4) tools only
- Remove create_page and list_users API examples
- Update Supported Scopes to wikijs:read only
- Update scopes_supported in Protected Resource Metadata example
- Remove STDIO from project structure tree
- Remove `npm run server:stdio` from Available Scripts
- Remove `lib/` from project structure

#### CLAUDE.md -- Update

- Line 11: Remove "and STDIO" from Transport
- Line 14: Update tool count from 17
- Line 59: Remove `lib/` from Project Structure
- Update tool count references throughout
- Update Security Notes section (3 scopes to 1)
- Update "Current State" section

## Architecture Patterns

### Safe Removal Ordering

The key pattern for this phase is **dependency-ordered deletion**. Remove consumers before producers:

1. **Tool registrations** (mcp-tools.ts) -- these consume API methods
2. **API methods** (api.ts) -- these consume types
3. **Types** (types.ts) -- leaf nodes
4. **Scopes** (scopes.ts) -- can be done in parallel with above
5. **Dependency** (`npm uninstall @azure/msal-node`) -- independent
6. **Files** (lib/ directory) -- independent
7. **Tests** -- update after source changes
8. **Documentation** -- update last

### Version String Synchronization

Three places need `"2.3.0"`:
1. `package.json` version field
2. `src/mcp-tools.ts` line 24: `version: "1.3.0"` in McpServer config
3. `src/routes/public-routes.ts` line 39: `version: "2.0.0"` in GET / response

All three must be updated together.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dependency removal | Manual package.json editing | `npm uninstall @azure/msal-node` | Correctly updates both package.json and package-lock.json |
| Alpine compatibility check | Guessing | `docker build .` as verification step | Only way to confirm no native module issues |

## Common Pitfalls

### Pitfall 1: Intermediate TypeScript compilation failure
**What goes wrong:** Removing types from types.ts before removing methods from api.ts that reference those types. TypeScript refuses to compile.
**Why it happens:** api.ts imports WikiJsUser, WikiJsGroup, ResponseResult. If you delete the types first, api.ts has broken imports.
**How to avoid:** Delete in consumer-first order: mcp-tools.ts tool registrations, then api.ts methods, then api.ts imports, then types.ts.
**Warning signs:** `npm run build` fails with "Cannot find name 'WikiJsUser'" errors.

### Pitfall 2: Test files referencing deleted tools
**What goes wrong:** smoke.test.ts invokes `list_users` tool, observability.test.ts logs `list_users`. After removing the tool registration, these tests fail with "unknown tool" errors rather than compilation errors.
**Why it happens:** Tool names are strings, not type-checked. Runtime failures only.
**How to avoid:** grep all test files for dead tool names before running tests. Update test files in the same commit as source changes.
**Warning signs:** `npm test` passes compilation but tests fail at runtime.

### Pitfall 3: Scope test hard-coded counts
**What goes wrong:** scopes.test.ts asserts `.toHaveLength(17)` (line 26), `.toHaveLength(3)` for SUPPORTED_SCOPES (line 15), `.toHaveLength(7)` for read tools (line 52). All will fail.
**Why it happens:** Tests were written for the 17-tool, 3-scope architecture.
**How to avoid:** Rewrite scopes.test.ts entirely rather than patching individual assertions.
**Warning signs:** Multiple test failures in scopes.test.ts.

### Pitfall 4: Stale version strings
**What goes wrong:** Package.json says 2.3.0 but McpServer says 1.3.0 and GET / says 2.0.0.
**Why it happens:** Version is duplicated in 3 places (package.json, mcp-tools.ts, public-routes.ts).
**How to avoid:** Update all three in the same commit. Consider a constant or import from package.json in future.
**Warning signs:** Inconsistent version reporting across endpoints.

### Pitfall 5: Docker HEALTHCHECK port mismatch
**What goes wrong:** Dockerfile HEALTHCHECK uses `PORT || 8000` but the default port in config.ts might differ.
**Why it happens:** Port default was changed at some point.
**How to avoid:** Verify the default port in `src/config.ts` matches the HEALTHCHECK fallback. (Currently HEALTHCHECK says 8000, which matches the config default.)
**Warning signs:** Docker health check fails after build.

### Pitfall 6: smoke.test.ts duplicated setup
**What goes wrong:** smoke.test.ts manually sets up Fastify (lines 88-116) instead of using `buildTestApp()`. After consolidating mockWikiJsApi, smoke.test.ts still has its own server setup that does not register `oauthProxyRoutes`.
**Why it happens:** smoke.test.ts was written before the shared buildTestApp helper existed.
**How to avoid:** Optionally migrate smoke.test.ts to use buildTestApp(). At minimum, replace its local mockWikiJsApi with the shared import.
**Warning signs:** smoke.test.ts setup diverges from buildTestApp setup.

## Code Examples

### After cleanup: src/types.ts
```typescript
// Types for Wiki.js GraphQL API

export interface WikiJsPage {
  id: number;
  path: string;
  title: string;
  description?: string;
  content?: string;
  createdAt?: string;
  updatedAt?: string;
  url?: string;
}
```

### After cleanup: src/scopes.ts (single scope)
```typescript
export const SCOPES = {
  READ: "wikijs:read",
} as const;

export type Scope = (typeof SCOPES)[keyof typeof SCOPES];

export const SCOPE_TOOL_MAP: Record<Scope, readonly string[]> = {
  [SCOPES.READ]: [
    "get_page",
    "list_pages",
    "search_pages",
  ],
} as const;

export const SUPPORTED_SCOPES: string[] = Object.values(SCOPES);

export const TOOL_SCOPE_MAP: Record<string, Scope> = Object.entries(
  SCOPE_TOOL_MAP,
).reduce<Record<string, Scope>>((map, [scope, tools]) => {
  for (const tool of tools) {
    map[tool] = scope as Scope;
  }
  return map;
}, {});
```

### After cleanup: shared mockWikiJsApi
```typescript
export const mockWikiJsApi = {
  checkConnection: async () => true,
  getPageById: async (id: number) => ({
    id,
    path: "test/page",
    title: "Test Page",
    description: "A test page",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  }),
  getPageContent: async () => "# Test Content",
  getPagesList: async () => [{ id: 1, path: "test", title: "Test" }],
  searchPages: async () => [{ id: 1, path: "test", title: "Test" }],
} as unknown as WikiJsApi;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 17 tools, 3 scopes | 3 tools, 1 scope | v2.3 (this milestone) | Drastically simpler codebase |
| STDIO + HTTP transport | HTTP only | v2.3 (this milestone) | Remove lib/ entirely |
| node:20-slim (for msal-node) | node:20-alpine (pure JS deps) | v2.3 (this milestone) | Smaller Docker image (~50MB vs ~180MB) |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.1 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run` |
| Full suite command | `npm test && npm run build` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLEN-01 | lib/mcp_wikijs_stdin.js does not exist, no STDIO refs | smoke | `test ! -f lib/mcp_wikijs_stdin.js && ! grep -r "mcp_wikijs_stdin" src/ scripts/ package.json Dockerfile` | No -- Wave 0 |
| CLEN-02 | @azure/msal-node not in package.json | smoke | `! grep "msal-node" package.json` | No -- Wave 0 |
| CLEN-03 | Dead types/methods gone, build clean | unit + build | `npm run build && npm test` | Partially (existing tests verify build) |

### Sampling Rate
- **Per task commit:** `npm run build && npx vitest run`
- **Per wave merge:** `npm test && npm run build && docker build -t wikijs-mcp:test .`
- **Phase gate:** Full suite green + docker build success before `/gsd:verify-work`

### Wave 0 Gaps
- No new test files needed -- existing tests must be updated to match new tool/scope counts
- Verification is primarily via `npm run build` (TypeScript catches dead references) and `npm test` (runtime assertions)
- Docker build verification: `docker build -t wikijs-mcp:test .` confirms Alpine image works

## Open Questions

1. **How many tools survive Phase 15?**
   - What we know: TOOL-01 says "get_page returns metadata, content, and isPublished in a single call" which suggests get_page_content may be merged into get_page
   - What is unclear: Whether Phase 15 deletes get_page_content or keeps it as a separate tool
   - Recommendation: Planner should check Phase 15 plan output. If get_page_content is merged, Phase 18 targets 3 tools. If it remains, 4 tools. The CONTEXT.md says "3-tool read-only server" suggesting the merge happens.

2. **Should `scripts/start_typescript.sh` be deleted?**
   - What we know: It is functionally identical to start_http.sh (both run `node dist/server.js`). The npm script `start:typescript` points to it and is marked for removal.
   - What is unclear: Nothing -- it is clearly dead code after removing the npm script.
   - Recommendation: Delete both the script file and the npm script. This falls under Claude's discretion per CONTEXT.md.

3. **Should `.planning/codebase/` docs be updated?**
   - What we know: STRUCTURE.md, ARCHITECTURE.md, STACK.md, INTEGRATIONS.md all reference STDIO, lib/, 17 tools, etc.
   - What is unclear: Whether these planning artifacts are worth updating.
   - Recommendation: Skip -- these are planning artifacts that will be regenerated for the next milestone. Falls under Claude's discretion per CONTEXT.md.

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection via Read tool -- all file contents verified
- `npm test` output: 209 tests passing across 15 test files (verified 2026-03-26)
- `grep` searches for STDIO references, type usage, dependency imports

### Secondary (MEDIUM confidence)
- Alpine vs slim Docker image comparison: node:20-alpine image is standard for pure-JS Node.js apps; musl libc issue only affects native modules

## Metadata

**Confidence breakdown:**
- Removal inventory: HIGH -- every file and line number verified by reading source
- Test updates: HIGH -- exact assertions and line numbers identified
- Docker Alpine switch: HIGH -- no native modules in remaining dependencies (verified by examining package.json)
- Tool count: MEDIUM -- depends on Phase 15 output (get_page_content merge question)

**Research date:** 2026-03-26
**Valid until:** 2026-04-26 (stable -- pure removal phase, no external dependencies changing)
