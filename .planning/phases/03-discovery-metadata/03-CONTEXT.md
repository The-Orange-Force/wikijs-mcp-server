# Phase 3: Discovery Metadata - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement the RFC 9728 Protected Resource Metadata endpoint (GET /.well-known/oauth-protected-resource) so MCP clients can discover this server's authorization requirements. Also define the scope-to-tool mapping configuration that Phase 4/5 will use for enforcement. The endpoint remains unauthenticated.

</domain>

<decisions>
## Implementation Decisions

### Scopes to advertise
- Three per-category scopes using short names: `wikijs.read`, `wikijs.write`, `wikijs.admin`
- Read/Write/Admin split across existing tools:
  - `wikijs.read`: get_page, get_page_content, list_pages, list_all_pages, search_pages, search_unpublished_pages, get_page_status
  - `wikijs.write`: create_page, update_page, publish_page
  - `wikijs.admin`: delete_page, force_delete_page, list_users, search_users, list_groups, create_user, update_user
- Phase 3 defines both the metadata response AND the scope-to-tool mapping config (shared module for Phase 4/5 enforcement)
- Short scope names (not Azure AD `api://` prefix format)

### Metadata response fields
- Required: `resource` (from MCP_RESOURCE_URL), `authorization_servers` (derived from AZURE_TENANT_ID), `scopes_supported`, `bearer_methods_supported` (["header"])
- Optional included: `resource_signing_alg_values_supported` hardcoded to ["RS256"]
- Optional included: `resource_documentation` from new env var MCP_RESOURCE_DOCS_URL — omitted from response if env var is not set
- Response includes `Cache-Control: public, max-age=3600` header

### Testing strategy
- Test runner: Vitest (new dependency)
- Integration tests using Fastify's `.inject()` — no real server or Azure AD needed
- Explicit test that endpoint is accessible without Authorization header (DISC-03)
- Tests for missing required env vars (AZURE_TENANT_ID, AZURE_CLIENT_ID, MCP_RESOURCE_URL)
- Tests for resource_documentation present/absent based on MCP_RESOURCE_DOCS_URL
- URL format assertions are non-brittle (assert valid URL, not exact format)
- Test scope-to-tool mapping config: every tool assigned exactly one scope, all three scopes have at least one tool

### Claude's Discretion
- Exact file/module organization for the scope-to-tool mapping config
- Vitest configuration details
- Whether to use a Fastify plugin for the metadata route or inline it

</decisions>

<specifics>
## Specific Ideas

- "Just follow the spec" — no extras beyond what RFC 9728 and MCP spec require, plus the two optional fields decided above
- Scope enforcement is advertised AND the mapping config is defined in this phase, ready for Phase 4/5 middleware to consume

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- Fastify server instance in `src/server.ts` with existing route patterns (GET /health, GET /tools)
- `ServerConfig` type in `src/types.ts` — will be extended by Phase 2 with OAuth env vars (AZURE_TENANT_ID, AZURE_CLIENT_ID, MCP_RESOURCE_URL)
- Existing tool definitions in `src/tools.ts` (`wikiJsTools` array) — scope mapping can reference these

### Established Patterns
- Routes defined inline in `src/server.ts` with try-catch error handling
- Environment variables loaded via `dotenv` at startup
- Fastify logger enabled (`{ logger: true }`)

### Integration Points
- Phase 2 provides the OAuth env vars that this endpoint uses to construct the response
- Phase 4/5 will import the scope-to-tool mapping config defined here
- Route registered on the existing Fastify server instance

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-discovery-metadata*
*Context gathered: 2026-03-24*
