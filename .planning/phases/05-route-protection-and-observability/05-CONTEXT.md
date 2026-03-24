# Phase 5: Route Protection and Observability - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Apply auth middleware to MCP routes (POST /mcp, GET /mcp/events) so they reject requests without a valid Bearer token. Keep health, discovery, and server info endpoints unauthenticated. Add structured request logging with user identity, correlation IDs, and tool invocation details. Map jose validation errors to RFC 6750 error responses.

</domain>

<decisions>
## Implementation Decisions

### Log structure
- Use Fastify's built-in pino logger for structured JSON output
- Add custom fields to pino log context: userId (oid), username (preferred_username), correlationId, toolName, duration
- Log all requests, not just MCP routes — authenticated requests include user identity fields, unauthenticated ones omit them
- Log tool name and execution duration for each MCP tool invocation

### Correlation ID
- Generate UUID v4 correlation IDs (uuid package already in deps)
- Accept client-provided X-Request-ID header if present; validate format, otherwise generate server-side
- Return correlation ID as X-Request-ID response header on every response
- Include correlation ID on all responses including 404s — use Fastify onRequest hook for global coverage
- Include correlation ID in SSE event streams (as SSE id field or initial comment)

### Error responses
- Descriptive error_description in RFC 6750 WWW-Authenticate responses: "Token expired", "Invalid audience", "Signature verification failed" — specific reason without leaking raw jose internals
- Include correlation_id field in error response JSON bodies alongside RFC 6750 error and error_description fields
- Log auth failures (401/403) at warn level, not error level — auth failures are expected operational events
- Log full raw jose validation error at debug level for operator diagnostics — client never sees it

### Route protection
- POST /mcp: requires valid Bearer token (PROT-01)
- GET /mcp/events: requires valid Bearer token (PROT-02)
- GET /health: unauthenticated (PROT-03)
- GET /.well-known/oauth-protected-resource: unauthenticated (PROT-04)
- GET /: unauthenticated — server info endpoint stays open for connectivity checks
- GET / response includes auth hint: auth_required field and link to protected_resource_metadata URL

### Claude's Discretion
- Fastify hook strategy (onRequest vs preHandler vs plugin scoping) for applying auth middleware
- Exact pino serializer configuration for custom fields
- X-Request-ID validation rules for client-provided values
- SSE correlation ID delivery mechanism (id field vs comment)
- Error response JSON structure beyond the three required fields

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. User consistently chose recommended/spec-compliant options, indicating preference for clean, standard-conforming implementation with good debuggability.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `uuid` package: Already in dependencies, use for correlation ID generation
- Fastify built-in pino logger: Already configured in src/server.ts, extend with custom fields
- Phase 4 JWT middleware: Auth validation middleware from Phase 4, to be applied as route-level or scoped hook

### Established Patterns
- Fastify server with dotenv config loading (src/server.ts)
- Error responses as `{ error: String(error) }` — will be upgraded to RFC 6750 format for auth errors
- `console.log`/`console.error` used alongside Fastify logger — Phase 5 should consolidate to pino
- ESM modules throughout

### Integration Points
- Route definitions in src/server.ts — auth middleware hooks attach here
- Phase 4 JWT middleware — consumed by Phase 5 route protection
- Phase 3 discovery endpoint — must remain unauthenticated
- Phase 1 MCP routes (POST /mcp, GET /mcp/events) — protected by auth
- GET / server info endpoint — add auth_required and protected_resource_metadata fields

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-route-protection-and-observability*
*Context gathered: 2026-03-24*
