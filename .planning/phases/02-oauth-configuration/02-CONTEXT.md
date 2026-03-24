# Phase 2: OAuth Configuration - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Add Azure AD environment variables (AZURE_TENANT_ID, AZURE_CLIENT_ID, MCP_RESOURCE_URL), install jose dependency, and implement startup config validation with fail-fast behavior. This phase makes the server ready for JWT auth in Phase 4 but does not implement authentication itself.

</domain>

<decisions>
## Implementation Decisions

### Config architecture
- Extract config into separate `src/config.ts` module (not inline in server.ts)
- Use Zod schema for runtime validation of all environment variables (Zod already a dependency)
- Zod `.transform()` derives computed values (JWKS URI, issuer URL) from raw env vars — single source of truth
- Validate ALL env vars (including existing WIKIJS_BASE_URL, WIKIJS_TOKEN), not just new OAuth vars
- OAuth is always required — no dev mode bypass, no OAUTH_ENABLED flag

### Config format validation
- AZURE_TENANT_ID: validate as UUID/GUID format (regex or Zod)
- AZURE_CLIENT_ID: validate as UUID/GUID format (same check)
- MCP_RESOURCE_URL: validate as proper URL format (Zod .url() or new URL())
- WIKIJS_BASE_URL: validate as URL format
- WIKIJS_TOKEN: validate as non-empty string

### JWKS initialization
- Call jose `createRemoteJWKSet` at config load time (lazy internally — no network call until first use)
- Export JWKS function from the config module so Phase 4 auth middleware can import it directly
- No startup pre-warming — JWKS fetches keys on first auth request

### Error message style
- Grouped summary: collect all validation errors, print as categorized list (missing vars, invalid values), then exit
- Reference example.env in error message: "See example.env for required variables."
- Convert existing Russian-language console.log messages in server.ts to English
- On successful start, log masked config summary (partially redacted IDs and tokens)

### Testing
- Add Vitest as test framework (native ESM, TypeScript out of the box)
- Include config smoke test: valid parse, missing var rejection, bad format rejection
- Establishes test pattern for subsequent phases

### Claude's Discretion
- Exact Zod schema structure and field naming
- Config type interface design
- Masking implementation details (how many chars to show)
- Test file organization

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `zod` (package.json): Already installed, use for config schema validation
- `dotenv` (package.json): Already used for env var loading in server.ts
- `ServerConfig` (src/types.ts): Existing config interface — extend or replace with Zod-inferred type

### Established Patterns
- Fastify v4 with `{ logger: true }` — server-level logging enabled
- ESM modules (`"type": "module"`) — imports use `.js` extensions
- TypeScript with `ts-node` for dev, `tsc` for build
- Inline config loading at top of server.ts (to be replaced by config module)

### Integration Points
- `src/server.ts` line 10-17: Current config loading — will import from new config module
- `src/types.ts` line 57-63: `ServerConfig` interface — may be replaced by Zod-inferred type
- `example.env`: Needs new AZURE_TENANT_ID, AZURE_CLIENT_ID, MCP_RESOURCE_URL entries
- `package.json`: Needs `jose` dependency and `vitest` dev dependency

</code_context>

<specifics>
## Specific Ideas

- Startup config log should look like the preview: structured, one var per line, IDs partially masked
- Error output should group by category (missing vs invalid) and list all issues at once
- "See example.env for required variables." as final line of error output

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-oauth-configuration*
*Context gathered: 2026-03-24*
