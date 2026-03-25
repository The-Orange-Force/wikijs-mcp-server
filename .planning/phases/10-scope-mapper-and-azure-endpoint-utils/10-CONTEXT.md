# Phase 10: Scope Mapper and Azure Endpoint Utils - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Pure-function utilities for transforming bare MCP scopes to Azure AD format and constructing Azure AD endpoint URLs. No routes, no Fastify plugins — just tested functions that Phases 11-14 will import.

Requirements covered: SCOPE-01 (scope mapping), SCOPE-02 (resource parameter stripping).

</domain>

<decisions>
## Implementation Decisions

### Unknown scope handling
- Unrecognized scopes (not `wikijs:*`, not OIDC) pass through unchanged to Azure AD
- Azure AD will reject what it doesn't recognize — proxy stays dumb and transparent
- No scope allowlist maintenance needed in the proxy layer

### Module placement
- Create new `src/oauth-proxy/` directory for all proxy utilities
- `src/oauth-proxy/scope-mapper.ts` — scope transformation and resource parameter stripping
- `src/oauth-proxy/azure-endpoints.ts` — Azure AD URL construction from tenant ID
- Keeps proxy code separate from existing auth enforcement in `src/scopes.ts`
- Phases 11-14 add route files to the same `src/oauth-proxy/` directory

### OIDC passthrough list
- Only `openid` and `offline_access` are explicitly recognized as passthrough (no `api://` prefix)
- Matches AUTHZ-01 requirement exactly (these two are appended to authorization requests)
- Other unknown scopes pass through anyway per the unknown-scope decision above

### Claude's Discretion
- Function signatures and return types
- Internal implementation of scope detection (regex, set lookup, etc.)
- Test organization within the oauth-proxy directory
- Whether to export a single `mapScopes()` or composable helpers

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/scopes.ts`: `SCOPES` constants (`wikijs:read`, `wikijs:write`, `wikijs:admin`) and `SUPPORTED_SCOPES` array — can import for the known-MCP-scope list
- `src/config.ts`: Already constructs `azure.jwksUri` and `azure.issuer` from tenant ID — similar pattern for auth/token endpoint URLs

### Established Patterns
- Zod for validation, but these are pure functions — Zod not needed here
- ESM with `.js` extensions on all imports
- TypeScript strict mode, no `any`
- `config.ts` derives URLs via Zod `.transform()` — endpoint utils follow similar derivation pattern

### Integration Points
- `src/config.ts` line 33-34: Already builds `jwksUri` and `issuer` from tenant ID — new endpoint utils build `authorize` and `token` URLs similarly
- `src/scopes.ts`: `SCOPES` constants importable for mapping logic
- Phase 12 (`/authorize`) and Phase 13 (`/token`) will import these utils
- Phase 11 will import endpoint URLs for discovery metadata

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The success criteria are prescriptive: map `wikijs:read` → `api://{client_id}/wikijs:read`, strip `resource` parameter, construct authorize/token URLs from tenant ID.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-scope-mapper-and-azure-endpoint-utils*
*Context gathered: 2026-03-25*
