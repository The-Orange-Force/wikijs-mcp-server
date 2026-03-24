---
phase: 05-route-protection-and-observability
verified: 2026-03-24T21:58:00Z
status: gaps_found
score: 8/10 must-haves verified
re_verification: false
gaps:
  - truth: "Every request receives a unique correlation ID that appears in both server logs and error response bodies"
    status: partial
    reason: "Correlation ID appears in server logs and X-Request-ID response headers, but the auth middleware's error response JSON bodies do not include a correlation_id field. ROADMAP success criterion 4 and the plan spec both require it."
    artifacts:
      - path: "src/auth/middleware.ts"
        issue: "Error response bodies (lines 62, 71, 96, 108, 130, 140) send only {error, error_description}. No correlation_id field is included."
    missing:
      - "Add correlation_id: request.id to each .send() call in src/auth/middleware.ts error response paths"
      - "Update tests/route-protection.test.ts to assert body.correlation_id is present and matches X-Request-ID header"
  - truth: "JWT validation failures produce structured RFC 6750 error responses via src/auth-errors.ts mapJoseErrorToRfc6750"
    status: partial
    reason: "RFC 6750 error mapping for JWT failures IS implemented and works correctly, but it is performed by src/auth/errors.ts (mapJoseError, Phase 4), not by the Phase 5 artifact src/auth-errors.ts (mapJoseErrorToRfc6750). The Phase 5 functions are imported in mcp-routes.ts but never called. OBSV-03 is functionally satisfied but the key link from plan 05-01 (auth-errors.ts -> routes) is not exercised in production."
    artifacts:
      - path: "src/routes/mcp-routes.ts"
        issue: "mapJoseErrorToRfc6750 and mapMissingTokenError are imported (lines 18-19) but never called. Phase 4's authPlugin handles all auth errors via src/auth/errors.ts instead."
      - path: "src/auth-errors.ts"
        issue: "ORPHANED in production: used only in unit tests, not in any route handler or middleware."
    missing:
      - "Either remove the unused imports from mcp-routes.ts, OR wire mcp-routes.ts to call mapMissingTokenError/mapJoseErrorToRfc6750 directly before delegating to Phase 4 auth plugin (the latter is architecturally cleaner but requires restructuring auth flow)"
      - "Note: OBSV-03 is satisfied functionally via Phase 4's existing mapping — this gap is a wiring/dead-code concern"
---

# Phase 5: Route Protection and Observability Verification Report

**Phase Goal:** Auth middleware is applied to exactly the right routes, and every authenticated request is traceable in server logs
**Verified:** 2026-03-24T21:58:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

All truths derive from ROADMAP.md Phase 5 Success Criteria and plan frontmatter `must_haves`.

| #  | Truth                                                                                                                 | Status      | Evidence                                                                                                                                     |
|----|-----------------------------------------------------------------------------------------------------------------------|-------------|----------------------------------------------------------------------------------------------------------------------------------------------|
| 1  | POST /mcp rejects requests without a valid Bearer token with 401 and WWW-Authenticate header                          | VERIFIED    | src/routes/mcp-routes.ts registers authPlugin in encapsulated scope; route-protection.test.ts passes (13/13)                                |
| 2  | GET /mcp/events rejects requests without a valid Bearer token with 401 and WWW-Authenticate header                    | VERIFIED*   | Route is GET /mcp (Phase 1 decision per STATE.md); protected by authPlugin; test line 120-128 confirms 401 without token                   |
| 3  | GET /health returns 200 without any Authorization header                                                              | VERIFIED    | src/routes/public-routes.ts registers /health outside protected scope; test line 130-137 confirms 200                                      |
| 4  | GET /.well-known/oauth-protected-resource returns 200 without any Authorization header                                | VERIFIED    | src/routes/public-routes.ts registers discovery endpoint; test line 139-146 confirms 200                                                   |
| 5  | Each MCP tool invocation logs the authenticated user's identity (oid/preferred_username) from the validated JWT       | VERIFIED    | src/tool-wrapper.ts logs {toolName, duration, userId, username} via requestContext.getStore(); observability.test.ts passes (8/8)          |
| 6  | Every request receives a unique correlation ID that appears in both server logs and error response bodies             | PARTIAL     | Correlation ID in logs (correlationId field in pino) and X-Request-ID response header confirmed. Error response JSON bodies lack correlation_id field — auth middleware sends {error, error_description} only. |
| 7  | JWT validation failures produce structured RFC 6750 error responses with error and error_description fields           | VERIFIED    | src/auth/middleware.ts sends {error, error_description} + WWW-Authenticate on all auth failures; functionally correct per OBSV-03          |
| 8  | jose validation errors map to specific RFC 6750 error codes via mapJoseErrorToRfc6750                                 | PARTIAL     | mapJoseErrorToRfc6750 is correct and tested (13/13 tests pass). However it is ORPHANED — imported in mcp-routes.ts but never called. Phase 4's mapJoseError (src/auth/errors.ts) handles production auth errors. |
| 9  | AsyncLocalStorage propagates request context (correlationId, userId, log) through the MCP SDK boundary               | VERIFIED    | requestContext.run() wraps transport.handleRequest() in mcp-routes.ts line 76-90; observability tests confirm propagation                  |
| 10 | Client-provided X-Request-ID values are validated as UUID format before acceptance                                    | VERIFIED    | src/logging.ts genReqId validates against UUID_REGEX before accepting; route-protection test lines 190-199 confirm rejection of non-UUID   |

*Note on PROT-02: The REQUIREMENTS.md names the SSE endpoint `GET /mcp/events`. Phase 1 decided to implement it as `GET /mcp` per MCP 2025-03-26 spec (STATE.md line 76). The requirement is functionally satisfied — the SSE-capable endpoint that exists is protected. No `/mcp/events` route exists in the codebase.

**Score:** 8/10 truths verified (2 partial)

---

### Required Artifacts

#### Plan 05-01 Artifacts

| Artifact                       | Min Lines | Actual Lines | Status      | Details                                                                                                                           |
|-------------------------------|-----------|--------------|-------------|-----------------------------------------------------------------------------------------------------------------------------------|
| `src/auth-errors.ts`          | 50        | 183          | ORPHANED    | Exists, substantive, tested — but imports in mcp-routes.ts are dead code; functions not called in any production path            |
| `src/request-context.ts`      | 15        | 41           | VERIFIED    | Exports requestContext (AsyncLocalStorage) and RequestContext interface; used in mcp-routes.ts and tool-wrapper.ts                |
| `src/logging.ts`              | 25        | 55           | VERIFIED    | Exports buildLoggerConfig and UUID_REGEX; wired into server.ts and tests/helpers/build-test-app.ts                               |
| `tests/auth-errors.test.ts`   | 60        | 149          | VERIFIED    | 13 tests, all pass; covers all jose error types plus missing-token and insufficient-scope                                        |

#### Plan 05-02 Artifacts

| Artifact                          | Min Lines | Actual Lines | Status      | Details                                                                                                                         |
|----------------------------------|-----------|--------------|-------------|---------------------------------------------------------------------------------------------------------------------------------|
| `src/routes/mcp-routes.ts`       | 40        | 101          | VERIFIED    | Exports protectedRoutes; registers authPlugin in encapsulated scope; uses requestContext.run(); POST /mcp and GET /mcp protected |
| `src/routes/public-routes.ts`    | 20        | 96           | VERIFIED    | Exports publicRoutes; registers GET /, GET /health, GET /.well-known/... without auth; auth_required field present in GET /    |
| `src/tool-wrapper.ts`            | 20        | 58           | VERIFIED    | Exports wrapToolHandler; uses requestContext.getStore(); performance.now() timing; info/error level logging                     |
| `src/server.ts`                  | 40        | 98           | VERIFIED    | Uses buildLoggerConfig(); global onRequest sets x-request-id; registers publicRoutes + protectedRoutes; no console.log         |
| `tests/route-protection.test.ts` | 80        | 285          | VERIFIED    | 13 tests; covers POST/GET /mcp auth rejection, public route acceptance, correlation ID, UUID validation, warn logging          |
| `tests/observability.test.ts`    | 40        | 343          | VERIFIED    | 8 tests; covers correlationId in pino logs, X-Request-ID propagation, tool invocation logging with timing and identity         |

---

### Key Link Verification

| From                       | To                          | Via                                                    | Status      | Details                                                                                                         |
|----------------------------|-----------------------------|--------------------------------------------------------|-------------|-----------------------------------------------------------------------------------------------------------------|
| `src/auth-errors.ts`       | `jose`                      | instanceof checks on jose error classes                | VERIFIED    | Lines 57, 71, 97, 111, 126 use `jose.errors.JWTExpired` etc.                                                  |
| `src/logging.ts`           | `uuid`                      | UUID v4 generation in genReqId                         | VERIFIED    | `import { v4 as uuidv4 } from "uuid"` line 17; called in genReqId fallback                                    |
| `src/request-context.ts`   | `node:async_hooks`          | AsyncLocalStorage import                               | VERIFIED    | `import { AsyncLocalStorage } from "node:async_hooks"` line 20                                                 |
| `src/routes/mcp-routes.ts` | `src/auth-errors.ts`        | RFC 6750 error mapping in preHandler                   | NOT_WIRED   | Imported (lines 17-20) but never called. Phase 4's authPlugin uses its own error mapper instead.               |
| `src/routes/mcp-routes.ts` | `src/request-context.ts`    | requestContext.run() wrapping transport.handleRequest() | VERIFIED    | `requestContext.run(...)` at line 76 wraps transport.handleRequest()                                           |
| `src/tool-wrapper.ts`      | `src/request-context.ts`    | requestContext.getStore() to access logger              | VERIFIED    | `const ctx = requestContext.getStore()` line 33                                                                |
| `src/server.ts`            | `src/logging.ts`            | buildLoggerConfig() spread into Fastify constructor     | VERIFIED    | `fastify({ ...buildLoggerConfig() })` line 26                                                                  |
| `src/server.ts`            | `src/routes/mcp-routes.ts`  | server.register(protectedRoutes)                       | VERIFIED    | `server.register(protectedRoutes, {...})` line 50                                                              |
| `src/server.ts`            | `src/routes/public-routes.ts` | server.register(publicRoutes)                        | VERIFIED    | `server.register(publicRoutes, {...})` line 44                                                                 |

---

### Requirements Coverage

| Requirement | Source Plan | Description                                              | Status      | Evidence                                                                                                                              |
|-------------|-------------|----------------------------------------------------------|-------------|---------------------------------------------------------------------------------------------------------------------------------------|
| PROT-01     | 05-02       | POST /mcp requires valid Bearer token                   | SATISFIED   | authPlugin registered in protectedRoutes encapsulated scope; 401 on missing/invalid token verified by test                          |
| PROT-02     | 05-02       | GET /mcp/events requires valid Bearer token             | SATISFIED*  | Implemented as GET /mcp (Phase 1 spec decision); protected by authPlugin; test confirms 401 without token. No /mcp/events route exists. |
| PROT-03     | 05-02       | GET /health remains unauthenticated                     | SATISFIED   | Registered in publicRoutes outside auth scope; test confirms 200 without token                                                       |
| PROT-04     | 05-02       | GET /.well-known/oauth-protected-resource unauthenticated | SATISFIED | Registered in publicRoutes outside auth scope; test confirms 200 without token; discovery tests (9/9) passing                       |
| OBSV-01     | 05-02       | Validated JWT user identity logged with each MCP tool   | SATISFIED   | wrapToolHandler logs userId + username via requestContext; observability tests verify user identity in tool logs                     |
| OBSV-02     | 05-01       | Unique correlation ID in logs and error responses        | PARTIAL     | In logs: verified (correlationId pino field). In X-Request-ID header: verified. In error response body JSON: NOT present (auth middleware sends only {error, error_description}) |
| OBSV-03     | 05-01       | jose errors mapped to RFC 6750 structured responses      | SATISFIED   | Phase 4 authPlugin (src/auth/errors.ts mapJoseError) produces RFC 6750 {error, error_description, WWW-Authenticate}; functionally correct. Phase 5's mapJoseErrorToRfc6750 is unused in production. |

*PROT-02 routing note: REQUIREMENTS.md says "GET /mcp/events" but the implementation is "GET /mcp" per Phase 1 architectural decision. The functional intent (SSE endpoint requires token) is satisfied.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/routes/mcp-routes.ts` | 17-20 | Dead import: `mapJoseErrorToRfc6750`, `mapMissingTokenError` imported but never called | Warning | Misleads maintainers into thinking Phase 5 error mapping is active; OBSV-02 gap (correlation_id in bodies) arises partly from not using these functions |

No TODO/FIXME/placeholder comments found in any phase 5 source files. TypeScript compiles with zero errors.

---

### Human Verification Required

None identified — all route behaviors are covered by inject() integration tests.

---

### Gaps Summary

Two gaps block full goal achievement:

**Gap 1 — correlation_id missing from error response bodies (OBSV-02, partial)**

The ROADMAP success criterion states "every request receives a unique correlation ID that appears in both server logs and error response bodies." The server logs correctly include `correlationId` in all pino output, and the `X-Request-ID` response header carries the value on every response. However, the auth middleware (`src/auth/middleware.ts`) sends error response JSON bodies as `{ error, error_description }` only — no `correlation_id` field. This is a concrete, testable gap against the stated success criterion.

Fix: Add `correlation_id: request.id` to each `.send()` call in `src/auth/middleware.ts` (lines 62, 71, 96, 108, 130, 140). Then add an assertion in `tests/route-protection.test.ts` that `body.correlation_id` matches the `x-request-id` header.

**Gap 2 — Phase 5 auth-errors.ts is production-orphaned (OBSV-03, wiring gap)**

`src/auth-errors.ts` exports `mapJoseErrorToRfc6750`, `mapMissingTokenError`, and `mapInsufficientScopeError` — the Phase 5 plan's primary artifact. These are imported in `src/routes/mcp-routes.ts` but never called. The actual production auth error handling flows through Phase 4's `src/auth/errors.ts` (`mapJoseError`). OBSV-03 is satisfied functionally, but the Phase 5 key artifact is dead code in production. The orphaned import is misleading and creates a maintenance risk if someone assumes the Phase 5 mapping is active.

Fix options: (a) Remove the unused imports from `mcp-routes.ts` to keep the codebase honest, or (b) restructure the auth flow to use `mapJoseErrorToRfc6750` for the route-level error response, which would also allow injecting `correlation_id` into the response body (addressing Gap 1 simultaneously).

These two gaps share a root cause: the Phase 4 auth plugin was registered as a black box within the encapsulated plugin scope, with Phase 5 having no insertion point to augment error responses with correlation IDs.

---

_Verified: 2026-03-24T21:58:00Z_
_Verifier: Claude (gsd-verifier)_
