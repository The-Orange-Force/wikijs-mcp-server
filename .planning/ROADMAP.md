# Roadmap: WikiJS MCP Server -- OAuth 2.1 Extension

## Overview

This milestone adds OAuth 2.1 resource server capabilities to the existing WikiJS MCP server. The journey starts by porting the MCP transport into Fastify (prerequisite for auth hooks), then layers on OAuth configuration, RFC 9728 discovery, JWT validation middleware, and finally route protection with observability. When complete, only Azure AD-authenticated colleagues can invoke MCP tools, while health and discovery endpoints remain open.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: MCP Transport Port** - Port MCP JSON-RPC and SSE endpoints from raw Node.js HTTP into Fastify TypeScript server
- [ ] **Phase 2: OAuth Configuration** - Add Azure AD environment variables, jose dependency, and startup validation
- [x] **Phase 3: Discovery Metadata** - Implement RFC 9728 Protected Resource Metadata endpoint (completed 2026-03-24)
- [x] **Phase 4: JWT Authentication** - Build Bearer token validation middleware using jose and Azure AD JWKS (completed 2026-03-24)
- [ ] **Phase 5: Route Protection and Observability** - Apply auth middleware to MCP routes and add structured request logging
- [ ] **Phase 6: Scope Format Alignment** - Align scope notation between discovery endpoint and auth middleware
- [ ] **Phase 7: Wire Tool Observability** - Connect wrapToolHandler to all 17 MCP tool registrations
- [ ] **Phase 8: Dead Code & Tech Debt Cleanup** - Remove orphaned modules, fix stale references, delete unused exports

## Phase Details

### Phase 1: MCP Transport Port
**Goal**: MCP tools are accessible through Fastify-managed HTTP endpoints with full TypeScript type safety
**Depends on**: Nothing (first phase)
**Requirements**: TRNS-01, TRNS-02, TRNS-03
**Success Criteria** (what must be TRUE):
  1. Claude Desktop can connect to POST /mcp on the Fastify server and invoke MCP tools (initialize, tools/list, tools/call)
  2. Claude Desktop receives SSE events from GET /mcp/events on the Fastify server
  3. Existing WikiJS tools (page CRUD, search, user management) all work identically after the port
  4. The raw Node.js HTTP MCP server (lib/fixed_mcp_http_server.js) is no longer needed for HTTP transport
**Plans:** 2 plans

Plans:
- [x] 01-01-PLAN.md — Install MCP SDK + vitest, create mcp-tools.ts with all 17 tool registrations and test stubs
- [x] 01-02-PLAN.md — Wire MCP into Fastify routes (POST /mcp, GET /mcp), remove REST routes, delete legacy files

### Phase 2: OAuth Configuration
**Goal**: Server is fully configured for Azure AD integration and fails fast with clear errors if misconfigured
**Depends on**: Phase 1
**Requirements**: CONF-01, CONF-02, CONF-03, CONF-04, CONF-05
**Success Criteria** (what must be TRUE):
  1. Server reads AZURE_TENANT_ID, AZURE_CLIENT_ID, and MCP_RESOURCE_URL from environment and uses them to derive Azure AD endpoints
  2. Server refuses to start with a clear, actionable error message if any required OAuth environment variable is missing
  3. example.env documents all new environment variables with descriptions
  4. jose createRemoteJWKSet is initialized with the Azure AD JWKS URI derived from AZURE_TENANT_ID
**Plans:** 1 plan

Plans:
- [ ] 02-01-PLAN.md — Create config module with Zod validation, Azure AD env vars, JWKS init, config tests, wire into server.ts

### Phase 3: Discovery Metadata
**Goal**: MCP clients can discover the server's authorization requirements via a standard RFC 9728 endpoint
**Depends on**: Phase 2
**Requirements**: DISC-01, DISC-02, DISC-03
**Success Criteria** (what must be TRUE):
  1. GET /.well-known/oauth-protected-resource returns valid JSON containing resource, authorization_servers, scopes_supported, and bearer_methods_supported fields
  2. The authorization_servers array points to the correct Azure AD v2.0 authorization endpoint derived from AZURE_TENANT_ID
  3. The endpoint is accessible without any authentication (no Bearer token required)
**Plans:** 1/1 plans complete

Plans:
- [ ] 03-01-PLAN.md — Create scope-to-tool mapping, add RFC 9728 metadata endpoint with buildApp factory, integration tests

### Phase 4: JWT Authentication
**Goal**: Server can validate Azure AD Bearer tokens and reject unauthorized requests with spec-compliant error responses
**Depends on**: Phase 2, Phase 3
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07
**Success Criteria** (what must be TRUE):
  1. A request with a valid Azure AD Bearer token passes validation (signature, audience, issuer, expiry, not-before all verified)
  2. A request with no token, expired token, wrong audience, or invalid signature returns HTTP 401 with a WWW-Authenticate header containing the resource_metadata URL
  3. A request with a valid token but insufficient scopes returns HTTP 403 with WWW-Authenticate error="insufficient_scope"
  4. The middleware extracts and makes available the authenticated user's identity claims (oid, preferred_username) for downstream use
**Plans:** 2/2 plans complete

Plans:
- [x] 04-01-PLAN.md — Auth types, jose error-to-RFC 6750 mapper, WWW-Authenticate header builders, test helpers
- [ ] 04-02-PLAN.md — Fastify auth middleware plugin with onRequest hook, scope validation, integration tests

### Phase 5: Route Protection and Observability
**Goal**: Auth middleware is applied to exactly the right routes, and every authenticated request is traceable in server logs
**Depends on**: Phase 4
**Requirements**: PROT-01, PROT-02, PROT-03, PROT-04, OBSV-01, OBSV-02, OBSV-03
**Success Criteria** (what must be TRUE):
  1. POST /mcp and GET /mcp/events reject requests without a valid Bearer token (401 response)
  2. GET /health and GET /.well-known/oauth-protected-resource remain accessible without any token
  3. Each MCP tool invocation logs the authenticated user's identity (oid/preferred_username) from the validated JWT
  4. Every request receives a unique correlation ID that appears in both server logs and error response bodies
  5. JWT validation failures produce structured RFC 6750 error responses with error and error_description fields
**Plans:** 3 plans

Plans:
- [x] 05-01-PLAN.md — RFC 6750 error mapping, correlation ID config, request context module, and unit tests
- [x] 05-02-PLAN.md — Wire auth to MCP routes via plugin encapsulation, restructure server.ts, integration tests
- [ ] 05-03-PLAN.md — Gap closure: add correlation_id to error response bodies, remove orphaned imports

### Phase 6: Scope Format Alignment
**Goal**: Discovery endpoint and auth middleware use the same scope format so clients can successfully acquire and use tokens
**Depends on**: Phase 3, Phase 4
**Requirements**: DISC-02
**Gap Closure:** Closes gaps from audit
**Success Criteria** (what must be TRUE):
  1. `src/scopes.ts` uses colon notation (`wikijs:read`, `wikijs:write`, `wikijs:admin`)
  2. `src/auth/middleware.ts` imports scopes from `src/scopes.ts` (single source of truth)
  3. Discovery endpoint returns colon-notation scopes matching what auth middleware enforces
**Plans:** 1 plan

Plans:
- [ ] 06-01-PLAN.md — Align scopes.ts to colon notation, replace middleware VALID_SCOPES with imported SUPPORTED_SCOPES, update test assertions

### Phase 7: Wire Tool Observability
**Goal**: Production MCP tool invocations log authenticated user identity and timing through wrapToolHandler
**Depends on**: Phase 5
**Requirements**: OBSV-01
**Gap Closure:** Closes gaps from audit
**Success Criteria** (what must be TRUE):
  1. All 17 tool handlers in `src/mcp-tools.ts` are wrapped with `wrapToolHandler()`
  2. Production tool invocations log `toolName`, `duration`, `userId`, and `username` from requestContext
  3. `requestContext` AsyncLocalStorage established in `mcp-routes.ts` is read by wrapped tool handlers
**Plans:** 1 plan

Plans:
- [ ] 07-01-PLAN.md — Add debug args log to wrapper, wrap all 17 tool handlers, integration + unit tests

### Phase 8: Dead Code & Tech Debt Cleanup
**Goal**: Remove orphaned code, fix stale references, and delete unused exports identified by milestone audit
**Depends on**: Phase 6, Phase 7
**Requirements**: None (tech debt)
**Gap Closure:** Closes integration gaps and tech debt from audit
**Success Criteria** (what must be TRUE):
  1. `src/auth-errors.ts` and `tests/auth-errors.test.ts` are deleted
  2. Stale `GET /mcp/events` references in `public-routes.ts` and `mcp-routes.ts` are corrected
  3. `SCOPE_TOOL_MAP` and `TOOL_SCOPE_MAP` are preserved in `src/scopes.ts` for v2 per-tool scope enforcement (ADVN-01)
  4. Legacy files `src/tools.ts` and `src/schemas.ts` are deleted
  5. Dead `buildServer` export is removed from `src/server.ts`
  6. All tests pass after cleanup
**Plans:** 2 plans

Plans:
- [ ] 08-01-PLAN.md — Delete orphaned files (auth-errors, tools, schemas), remove buildServer dead export, verify test suite
- [ ] 08-02-PLAN.md — Fix stale /mcp/events references in code and docs, update ROADMAP success criteria

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. MCP Transport Port | 2/2 | Complete | 2026-03-24 |
| 2. OAuth Configuration | 0/1 | Planning complete | - |
| 3. Discovery Metadata | 1/1 | Complete   | 2026-03-24 |
| 4. JWT Authentication | 2/2 | Complete   | 2026-03-24 |
| 5. Route Protection and Observability | 2/3 | Gap closure pending | - |
| 6. Scope Format Alignment | 0/1 | Planning complete | - |
| 7. Wire Tool Observability | 0/1 | Planning complete | - |
| 8. Dead Code & Tech Debt Cleanup | 0/2 | Planning complete | - |
