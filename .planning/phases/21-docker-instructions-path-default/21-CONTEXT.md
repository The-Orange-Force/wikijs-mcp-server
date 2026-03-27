# Phase 21: Docker Instructions Path Default - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the Docker volume-mounted `instructions.txt` work out-of-the-box without deployers needing to set `MCP_INSTRUCTIONS_PATH`. When the env var is unset, the server defaults to `/app/instructions.txt` — the path where `docker-compose.yml` mounts the file. No new user-facing features; this is a gap closure for the Docker deployment flow.

</domain>

<decisions>
## Implementation Decisions

### Default path location
- Add `.default('/app/instructions.txt')` to `MCP_INSTRUCTIONS_PATH` in the Zod envSchema in `config.ts`
- `config.instructionsPath` becomes `string` (non-optional) — consistent with how `PORT` is handled
- Pattern matches existing `PORT: z.string().default("8000")` in the schema

### Local dev warning noise
- Accept the warning — when running `npm run dev` without the file present, the existing `console.warn` fires and server falls back to hardcoded default
- No special-casing for the default path vs an explicit override
- Document suppression in `example.env`: set `MCP_INSTRUCTIONS_PATH=` (empty string) to skip file loading entirely

### Test updates
- Tests that depend on `instructionsPath` being `undefined` must be updated
- Preferred approach: update tests to reflect correct behavior (attempt to load `/app/instructions.txt`, fall back to default)
- `buildApp()` already accepts an explicit `instructions` parameter — tests that want filesystem isolation can pass instructions directly

### Documentation updates
- `CLAUDE.md` env var table: update `MCP_INSTRUCTIONS_PATH` row — Required stays "No", update Description/Example to show default `/app/instructions.txt`
- `README.md` env var table: same update
- `example.env`: add two commented lines — one showing the default path, one showing how to suppress the warning (empty value)

### Claude's Discretion
- Exact wording of the example.env comments
- Exact column(s) updated in the env var tables (Description vs Example vs both)
- Internal test mock strategy (mock fs.readFile vs pass instructions directly to buildApp)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/config.ts` envSchema: Change `MCP_INSTRUCTIONS_PATH: z.string().optional()` to `z.string().default('/app/instructions.txt')`
- `src/instructions.ts` `loadInstructions(path?)`: Signature stays the same — Zod default means it now always receives a string; the `if (!path)` guard becomes dead code but harmless

### Established Patterns
- `PORT: z.string().default("8000")` in envSchema — same pattern for the new default
- `console.warn` on file-not-found already implemented in Phase 19 — no change needed
- `buildApp(appConfig, wikiJsApiOverride?, instructions?)` — test isolation already available via the third parameter

### Integration Points
- `src/server.ts` `start()`: `loadInstructions(config.instructionsPath)` — no change; now always passes a string
- `src/config.ts` `AppConfig` type: `instructionsPath: string` instead of `string | undefined` — downstream callers may need type updates

</code_context>

<specifics>
## Specific Ideas

- `example.env` pattern:
  ```
  # MCP_INSTRUCTIONS_PATH=/app/instructions.txt  # default path (Docker volume mount)
  # MCP_INSTRUCTIONS_PATH=                       # set empty to skip file loading (local dev)
  ```

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 21-docker-instructions-path-default*
*Context gathered: 2026-03-27*
