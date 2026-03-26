---
phase: 13-token-proxy-endpoint
verified: 2026-03-25T22:38:30Z
status: passed
score: 12/12 must-haves verified
re_verification: false
---

# Phase 13: Token Proxy Endpoint Verification Report

**Phase Goal:** MCP clients can exchange authorization codes and refresh tokens through the proxy
**Verified:** 2026-03-25T22:38:30Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | POST /token with grant_type=authorization_code proxies to Azure AD and returns the token response | VERIFIED | Integration test: "returns 200 with access_token for authorization_code grant" passes; route calls `handleTokenRequest` with Azure AD token endpoint |
| 2  | POST /token with grant_type=refresh_token proxies to Azure AD and returns a refreshed token response | VERIFIED | Integration test: "returns 200 with access_token for refresh_token grant" passes; `refreshTokenSchema` validated via Zod |
| 3  | Scopes in Azure AD response are reverse-mapped from api://{clientId}/wikijs:read back to wikijs:read | VERIFIED | `unmapScopes()` implemented and called in token-proxy.ts line 256; 5 unit tests + integration test confirm mapping |
| 4  | Azure AD AADSTS error responses are normalized to standard OAuth 2.0 error format with generic descriptions | VERIFIED | `AADSTS_TO_OAUTH` lookup table + `normalizeAzureError()` implemented; 5 AADSTS tests all pass |
| 5  | Unknown AADSTS codes fall back to invalid_request | VERIFIED | `AADSTS_TO_OAUTH[aadstsCode] ?? "invalid_request"` in normalizeAzureError(); test "falls back to invalid_request for unknown AADSTS code" passes |
| 6  | Non-JSON Azure AD responses (HTML error pages, network failures) return server_error | VERIFIED | Content-Type check (line 219) + network error catch (line 208); both tests pass with 502/server_error |
| 7  | Unsupported grant types are rejected locally with unsupported_grant_type | VERIFIED | `SUPPORTED_GRANT_TYPES` check before fetch call; tests confirm fetch not called for client_credentials or missing grant_type |
| 8  | Missing required parameters per grant type return invalid_request | VERIFIED | Per-grant Zod schemas (`authCodeSchema`, `refreshTokenSchema`) with descriptive error messages; tests for missing code, redirect_uri, refresh_token pass |
| 9  | Mismatched client_id is rejected with invalid_client | VERIFIED | client_id comparison (line 185); test "returns invalid_client when client_id does not match" passes; fetch not called |
| 10 | Cache-Control: no-store and Pragma: no-cache headers set on all responses | VERIFIED | Route handler sets both headers unconditionally (lines 209-210); integration tests for each header pass |
| 11 | X-Upstream-Duration-Ms header present on proxied responses | VERIFIED | `Date.now()` timing + `reply.header("X-Upstream-Duration-Ms", String(duration))` at line 208; integration test confirms numeric string header |
| 12 | Tokens, authorization codes, and request bodies are never logged | VERIFIED | Log calls use only `{grantType, upstreamStatus}` and `{receivedClientId}`; no body/token/code fields logged anywhere in token-proxy.ts or oauth-proxy.ts route handler |

**Score:** 12/12 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/oauth-proxy/scope-mapper.ts` | unmapScopes() function for reverse scope mapping | VERIFIED | Exports mapScopes, stripResourceParam, unmapScopes; 57 lines, substantive |
| `src/oauth-proxy/token-proxy.ts` | handleTokenRequest() with AADSTS mapping, Zod validation, Azure AD proxying | VERIFIED | 261 lines; exports handleTokenRequest and AADSTS_TO_OAUTH; full implementation with AADSTS_TO_OAUTH table, Zod schemas, normalizeAzureError, buildAzureTokenBody |
| `src/routes/oauth-proxy.ts` | POST /token route handler wired to handleTokenRequest | VERIFIED | Contains `fastify.post.*token` at line 196; wired to handleTokenRequest at line 200 |
| `src/oauth-proxy/__tests__/token-proxy.test.ts` | Unit tests for token proxy logic (min 100 lines) | VERIFIED | 533 lines; 24 unit tests covering all grant types, AADSTS normalization, error handling |
| `tests/token-proxy-integration.test.ts` | Integration tests via Fastify inject for POST /token (min 80 lines) | VERIFIED | 250 lines; 9 integration tests covering success cases, headers, error cases |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/routes/oauth-proxy.ts` | `src/oauth-proxy/token-proxy.ts` | import handleTokenRequest | WIRED | Line 19: `import { handleTokenRequest } from "../oauth-proxy/token-proxy.js"`; used at line 200 |
| `src/oauth-proxy/token-proxy.ts` | `src/oauth-proxy/scope-mapper.ts` | import mapScopes, stripResourceParam, unmapScopes | WIRED | Line 6: `import { mapScopes, stripResourceParam, unmapScopes } from "./scope-mapper.js"`; all three used in buildAzureTokenBody and handleTokenRequest |
| `src/routes/oauth-proxy.ts` → `src/oauth-proxy/azure-endpoints.ts` | buildAzureEndpoints for token URL | WIRED | Plan specified token-proxy.ts → azure-endpoints.ts but actual design has oauth-proxy.ts call buildAzureEndpoints and pass tokenEndpoint via TokenProxyContext. Line 202: `buildAzureEndpoints(appConfig.azure.tenantId).token`. Architecturally equivalent — context injection is intentional for testability. |
| `tests/token-proxy-integration.test.ts` | `tests/helpers/build-test-app.ts` | buildTestApp for Fastify inject testing | WIRED | Line 5: `import { makeTestConfig } from "./helpers/build-test-app.js"`. Test uses makeTestConfig (not buildTestApp) to create a standalone Fastify app with injected mockFetch — a deliberate deviation noted in SUMMARY.md for test isolation. |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| TOKN-01 | 13-01 | POST /token proxies authorization_code grant to Azure AD token endpoint and returns the response | SATISFIED | handleTokenRequest routes authorization_code to Azure AD; integration test "returns 200 with access_token for authorization_code grant" passes |
| TOKN-02 | 13-01 | POST /token proxies refresh_token grant to Azure AD token endpoint and returns the response | SATISFIED | refreshTokenSchema validated; handleTokenRequest routes refresh_token to Azure AD; integration test "returns 200 with access_token for refresh_token grant" passes |
| TOKN-03 | 13-01 | Token endpoint normalizes Azure AD AADSTS* error responses to standard OAuth 2.0 error format | SATISFIED | AADSTS_TO_OAUTH table with 20 entries; normalizeAzureError() maps codes; 5 normalization unit tests all pass (AADSTS70008, AADSTS700082, AADSTS70011, AADSTS65001, unknown fallback) |

No orphaned requirements — all three TOKN requirements declared in the plan are accounted for.

---

### Anti-Patterns Found

None. No TODO/FIXME/placeholder comments, no stub implementations, no empty handlers, no console.log calls in any phase 13 files.

---

### Human Verification Required

None. All success criteria are verifiable programmatically. The test suite provides comprehensive coverage of all functional behaviors including edge cases.

---

## Test Results

| Test File | Tests | Status |
|-----------|-------|--------|
| `src/oauth-proxy/__tests__/scope-mapper.test.ts` (unmapScopes suite) | 5 | All pass |
| `src/oauth-proxy/__tests__/token-proxy.test.ts` | 24 | All pass |
| `tests/token-proxy-integration.test.ts` | 9 | All pass |
| Full suite regression | 198 | All pass — zero regressions |

---

## Summary

Phase 13 fully achieves its goal. MCP clients can exchange authorization codes and refresh tokens through the proxy endpoint. All twelve observable truths are verified by substantive implementations:

- `POST /token` at `src/routes/oauth-proxy.ts` line 196 is wired to `handleTokenRequest` from `token-proxy.ts`
- Bidirectional scope mapping works: `mapScopes` on outbound, `unmapScopes` on response (line 256 in token-proxy.ts)
- AADSTS normalization uses a 20-entry lookup table with AADSTS-specific description overrides for ambiguous codes (e.g., AADSTS700082 gets "The refresh token has expired." rather than the generic invalid_grant message)
- Security headers (Cache-Control, Pragma, X-Upstream-Duration-Ms) set unconditionally on every response
- Log safety confirmed: only grant_type, upstream status, and client_id (on mismatch) are logged — no tokens, codes, or request bodies

One architectural note: `buildAzureEndpoints` is called in the route handler (`oauth-proxy.ts`) and passed into `handleTokenRequest` via `TokenProxyContext.tokenEndpoint`, rather than being imported directly in `token-proxy.ts` as the PLAN key_link specified. This is the correct design for testability (allows injecting any token endpoint string in unit tests without mocking a module) and was confirmed working by all 198 tests passing.

---

_Verified: 2026-03-25T22:38:30Z_
_Verifier: Claude (gsd-verifier)_
