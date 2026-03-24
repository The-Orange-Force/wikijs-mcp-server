# Roadmap Archive: WikiJS MCP Server — OAuth 2.1 Extension (v2.0)

**Archived:** 2026-03-24
**Status:** Complete (8/8 phases, 13/13 plans)
**Core Value:** Only Azure AD-authenticated colleagues can invoke MCP tools against the company WikiJS instance

## Overview

This milestone added OAuth 2.1 resource server capabilities to the existing WikiJS MCP server. The journey started by porting the MCP transport into Fastify (prerequisite for auth hooks), then layered on OAuth configuration, RFC 9728 discovery, JWT validation middleware, and finally route protection with observability. When complete, only Azure AD-authenticated colleagues can invoke MCP tools, while health and discovery endpoints remain open.

## Accomplishments

1. **Ported MCP transport to Fastify** — All 17 WikiJS tools migrated from raw Node.js HTTP to Fastify TypeScript with MCP SDK stateless transport
2. **Azure AD OAuth configuration** — Zod-validated config module with fail-fast startup for missing env vars
3. **RFC 9728 discovery endpoint** — Protected Resource Metadata at `/.well-known/oauth-protected-resource`
4. **JWT authentication middleware** — Bearer token validation using jose with RFC 6750 error responses
5. **Route protection with observability** — Auth applied to MCP routes, correlation IDs, AsyncLocalStorage request context
6. **Full tool observability** — All 17 handlers wrapped with user identity and timing logging

## Stats

- **Commits:** 65
- **Files changed:** 81 (+8,583 / -5,272 lines)
- **Timeline:** 2025-05-22 → 2026-03-24
- **Tests:** 97 passing
- **TypeScript LOC:** 4,133

## Phases

### Phase 1: MCP Transport Port ✓
**Goal**: MCP tools accessible through Fastify-managed HTTP endpoints with full TypeScript type safety
**Requirements**: TRNS-01, TRNS-02, TRNS-03
**Plans:** 2/2 complete
- [x] 01-01-PLAN — Install MCP SDK + vitest, create mcp-tools.ts with all 17 tool registrations
- [x] 01-02-PLAN — Wire MCP into Fastify routes, remove REST routes, delete legacy files

### Phase 2: OAuth Configuration ✓
**Goal**: Server fully configured for Azure AD integration and fails fast if misconfigured
**Requirements**: CONF-01, CONF-02, CONF-03, CONF-04, CONF-05
**Plans:** 1/1 complete
- [x] 02-01-PLAN — Create config module with Zod validation, Azure AD env vars, JWKS init

### Phase 3: Discovery Metadata ✓
**Goal**: MCP clients can discover authorization requirements via RFC 9728 endpoint
**Requirements**: DISC-01, DISC-02, DISC-03
**Plans:** 1/1 complete
- [x] 03-01-PLAN — Create scope-to-tool mapping, add RFC 9728 metadata endpoint with buildApp factory

### Phase 4: JWT Authentication ✓
**Goal**: Server validates Azure AD Bearer tokens and rejects unauthorized requests
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07
**Plans:** 2/2 complete
- [x] 04-01-PLAN — Auth types, jose error-to-RFC 6750 mapper, WWW-Authenticate builders, test helpers
- [x] 04-02-PLAN — Fastify auth middleware plugin with onRequest hook, scope validation

### Phase 5: Route Protection and Observability ✓
**Goal**: Auth middleware applied to correct routes, every authenticated request traceable
**Requirements**: PROT-01, PROT-02, PROT-03, PROT-04, OBSV-01, OBSV-02, OBSV-03
**Plans:** 3/3 complete
- [x] 05-01-PLAN — RFC 6750 error mapping, correlation ID config, request context module
- [x] 05-02-PLAN — Wire auth to MCP routes via plugin encapsulation, restructure server.ts
- [x] 05-03-PLAN — Gap closure: add correlation_id to error response bodies

### Phase 6: Scope Format Alignment ✓
**Goal**: Discovery endpoint and auth middleware use same scope format
**Requirements**: DISC-02
**Plans:** 1/1 complete
- [x] 06-01-PLAN — Align scopes.ts to colon notation, unify single source of truth

### Phase 7: Wire Tool Observability ✓
**Goal**: Production MCP tool invocations log authenticated user identity and timing
**Requirements**: OBSV-01
**Plans:** 1/1 complete
- [x] 07-01-PLAN — Wrap all 17 tool handlers with wrapToolHandler, add debug logging

### Phase 8: Dead Code & Tech Debt Cleanup ✓
**Goal**: Remove orphaned code, fix stale references, delete unused exports
**Requirements**: None (tech debt)
**Plans:** 2/2 complete
- [x] 08-01-PLAN — Delete orphaned files, remove buildServer dead export
- [x] 08-02-PLAN — Fix stale /mcp/events references in code and docs

## Tech Debt Deferred

| Item | Location | Reason |
|------|----------|--------|
| SCOPE_TOOL_MAP / TOOL_SCOPE_MAP | src/scopes.ts | Preserved for future per-tool scope enforcement |
| WikiJsToolDefinition interface | src/types.ts | Legacy remnant; no active requirement |
| Nyquist validation | All phases | VALIDATION.md files exist in draft status |

---
*Archived: 2026-03-24*
