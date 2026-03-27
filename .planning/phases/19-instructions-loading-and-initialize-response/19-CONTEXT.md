# Phase 19: Instructions Loading and Initialize Response - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Load instructions from a configurable file path at startup and return them in the MCP initialize response. When an MCP client sends an initialize request, the response includes an `instructions` field with text that guides Claude to proactively search the wiki for relevant topics. File loading, fallback defaults, and warning logging are all in scope. Docker integration (volume mount, default file in repo) is Phase 20.

</domain>

<decisions>
## Implementation Decisions

### Default instructions content
- Imperative tone — direct commands: "When X is mentioned, search the wiki for X"
- Topics that trigger auto-search: Mendix, client names, AI, Java, career (exactly these 5)
- Claude should search and surface results proactively — report findings without being asked
- Generic phrasing: "search the wiki" — do NOT name specific tool names in the instructions text

### Instructions loading architecture
- Load once at startup (not per-request), pass the resulting string into createMcpServer()
- New standalone module: `src/instructions.ts` — single-responsibility, isolated from config.ts Zod logic
- createMcpServer() gets a new parameter: `createMcpServer(wikiJsApi: WikiJsApi, instructions: string)`
- McpServer version bumped to 2.4.0 in this phase

### File path and fallback behavior
- `MCP_INSTRUCTIONS_PATH` is optional with no default path — when unset, skip file loading entirely and use hardcoded default
- Add to Zod envSchema in config.ts as `.optional()` string (no .default()), surfaces in AppConfig type
- When path is configured but file is missing or unreadable: start successfully, fall back to hardcoded default, log a warning
- `loadInstructions(path?: string): Promise<string>` — async function

### Logging on fallback
- Log level: `warn` (matches requirements, consistent with Wiki.js connection warning pattern)
- Warning includes: configured path AND the actual error message (ENOENT, EACCES, etc.)
- Example: `"Could not load instructions from /path/to/file.txt: ENOENT. Using default instructions."`
- Warning logged inside `loadInstructions()` using `console.warn` (no Pino available at module load time)
- Also log `console.log` (info-level) on successful file load: `"Loaded instructions from /path/to/file.txt"`

### Claude's Discretion
- Exact wording of the default instructions text (within the imperative tone + 5 topic constraint)
- Internal error handling details in loadInstructions() (try/catch structure)
- Where in start() / buildApp() to await loadInstructions() and thread the result through

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/config.ts` envSchema: Add `MCP_INSTRUCTIONS_PATH: z.string().optional()` here — Zod pattern already established
- `createMcpServer(wikiJsApi)` in `src/mcp-tools.ts`: Add `instructions: string` second parameter, pass to `new McpServer(serverInfo, { instructions })`
- `McpServer` constructor `options.instructions?: string`: This is the exact SDK field to populate (confirmed in `@modelcontextprotocol/sdk` type definitions)

### Established Patterns
- Startup async operations: `wikiJsApi.checkConnection()` is awaited in `start()` — same pattern for `await loadInstructions(config.instructionsPath)`
- Fallback with warn: Wiki.js connection failure uses `server.log.warn(...)` then continues — instructions fallback follows same philosophy
- console.log at startup: `logConfig()` uses console.log directly — `loadInstructions()` can use console.warn/console.log similarly
- Stateless per-request `createMcpServer()`: called in POST /mcp handler with fresh McpServer each time — instructions string loaded once at startup, passed through protectedRoutes opts to the handler

### Integration Points
- `buildApp(appConfig, wikiJsApiOverride?)` in `src/server.ts`: Needs `instructions: string` threaded through to the POST /mcp handler
- `ProtectedRoutesOptions` interface in `src/routes/mcp-routes.ts`: Add `instructions: string` field so it reaches the per-request `createMcpServer()` call
- `start()` in `src/server.ts`: Await `loadInstructions()` before `buildApp()`, or inside `buildApp()` if made async

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches for default instructions wording.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 19-instructions-loading-and-initialize-response*
*Context gathered: 2026-03-27*
