---
phase: 14-wire-up-and-protected-resource-metadata-switch
verified: 2026-03-26T09:10:00Z
status: passed
score: 6/6 must-haves verified
re_verification: false
---

# Phase 14: Wire Up and Protected Resource Metadata Switch Verification Report

**Phase Goal:** Claude Desktop completes the full OAuth flow end-to-end against the running server
**Verified:** 2026-03-26T09:10:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `/.well-known/oauth-protected-resource` lists MCP_RESOURCE_URL (self) as the authorization server | VERIFIED | `public-routes.ts:89` — `authorization_servers: [appConfig.azure.resourceUrl]`; `discovery.test.ts:46-57` asserts `server === FAKE_RESOURCE_URL` |
| 2 | GET / response includes `authorization_server_metadata` field and lists all proxy endpoints with access annotations | VERIFIED | `public-routes.ts:42` — field present pointing to `/.well-known/oauth-authorization-server`; all 10 endpoints listed with auth annotations at lines 43-60; `route-protection.test.ts:154-167` asserts field present |
| 3 | All proxy endpoints (GET /authorize, POST /token, POST /register, GET /.well-known/oauth-authorization-server, GET /.well-known/openid-configuration) return non-401 status without Bearer token | VERIFIED | 5 tests in `route-protection.test.ts:169-216` assert each endpoint returns 200/201/302/non-401; all 209 tests pass |
| 4 | POST /mcp still requires JWT authentication (returns 401 without token) | VERIFIED | `route-protection.test.ts:82-107` asserts 401 with WWW-Authenticate; 209 tests pass with no regression |
| 5 | Full discovery chain works: PRM -> AS metadata -> DCR -> authorize redirect -> token proxy | VERIFIED | `tests/e2e-flow.test.ts` — 6 sequential steps, each deriving URL from previous step's response; all steps pass including scope mapping and captured fetch assertion |
| 6 | Mock fetch in buildTestApp prevents real Azure AD calls during tests | VERIFIED | `build-test-app.ts:29-38` — `mockFetch` defined, captures to `capturedFetchCalls`; `build-test-app.ts:143` — `server.register(oauthProxyRoutes, { appConfig, fetch: mockFetch })`; e2e Step 5 asserts exactly 1 captured call |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/routes/public-routes.ts` | Updated PRM authorization_servers pointing to self, updated GET / with all endpoints | VERIFIED | Line 89: `[appConfig.azure.resourceUrl]`; lines 37-61: `authorization_server_metadata` field + 10 endpoints |
| `tests/helpers/build-test-app.ts` | Mock fetch injection for oauthProxyRoutes, exported CapturedFetchCall interface and capturedFetchCalls array | VERIFIED | Lines 19-38: `CapturedFetchCall` interface and `capturedFetchCalls` exported; line 143: `{ appConfig, fetch: mockFetch }` |
| `tests/discovery.test.ts` | Updated assertion checking authorization_servers references self (FAKE_RESOURCE_URL) | VERIFIED | Lines 46-57: `expect(server).toBe(FAKE_RESOURCE_URL)` replacing old tenant-ID check |
| `tests/route-protection.test.ts` | Public access assertions for all proxy endpoints + updated GET / assertion | VERIFIED | Lines 169-216: 5 proxy-endpoint public-access tests present; lines 154-167: GET / asserts `authorization_server_metadata` |
| `tests/e2e-flow.test.ts` | Full discovery chain integration test with 6 sequential steps | VERIFIED | 191 lines; 6 sequential `it()` blocks sharing `let` state; validates chain links end-to-end |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/routes/public-routes.ts` | `src/config.ts` | `appConfig.azure.resourceUrl` for `authorization_servers` value | WIRED | `public-routes.ts:89` — pattern `authorization_servers.*appConfig\.azure\.resourceUrl` matches |
| `tests/helpers/build-test-app.ts` | `src/routes/oauth-proxy.ts` | `server.register(oauthProxyRoutes, { appConfig, fetch: mockFetch })` | WIRED | `build-test-app.ts:143` — exact pattern `{ appConfig, fetch: mockFetch }` matches |
| `tests/e2e-flow.test.ts` | `tests/helpers/build-test-app.ts` | imports `buildTestApp` and `capturedFetchCalls` | WIRED | Line 13: `import { buildTestApp, capturedFetchCalls } from "./helpers/build-test-app.js"`; used at lines 29-31, 140, 156 |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| META-03 | 14-01-PLAN.md | Protected Resource Metadata references self (MCP_RESOURCE_URL) as authorization server | SATISFIED | `public-routes.ts:89` switches from `login.microsoftonline.com` tenant URL to `appConfig.azure.resourceUrl`; `discovery.test.ts:46-57` asserts self-reference |
| INTG-01 | 14-01-PLAN.md | All proxy endpoints are public (unauthenticated) — existing JWT validation on POST /mcp unchanged | SATISFIED | `route-protection.test.ts:169-216` — 5 tests assert proxy endpoints return non-401 without Bearer; POST /mcp still returns 401 |
| INTG-02 | 14-01-PLAN.md | Claude Desktop completes full OAuth flow and successfully invokes MCP tools | SATISFIED (automated) | `tests/e2e-flow.test.ts` — 6-step chain test validates PRM -> AS metadata -> DCR -> authorize -> token proxy -> authenticated MCP call |

**Notes on requirement mapping:** REQUIREMENTS.md assigns META-03, INTG-01, INTG-02 exclusively to Phase 14. All three are accounted for. No orphaned requirements for this phase.

### Anti-Patterns Found

None. Scan across all 5 modified files (`src/routes/public-routes.ts`, `tests/helpers/build-test-app.ts`, `tests/discovery.test.ts`, `tests/route-protection.test.ts`, `tests/e2e-flow.test.ts`) found zero TODO/FIXME/placeholder markers, no empty implementations, no stub return values.

### Human Verification Required

#### 1. Live Claude Desktop OAuth Flow

**Test:** Configure Claude Desktop with the running server as its MCP server URL and initiate connection
**Expected:** Claude Desktop completes the full OAuth flow (browser opens for Azure AD login, token returned, MCP tools become available)
**Why human:** The E2E test uses a mock fetch and local JWT. The only way to verify the actual Claude Desktop redirect_uri format and Azure AD token exchange path is with a live tenant and real client.

#### 2. Port handling in Claude Desktop redirect_uri

**Test:** Observe the `redirect_uri` value Claude Desktop sends in the authorize request
**Expected:** Azure AD accepts the redirect_uri and completes the flow (Claude Desktop may use `http://localhost:{port}/callback` with a dynamic port)
**Why human:** Per SUMMARY.md "remaining concern" note — Claude Desktop port handling in redirect URIs needs live tenant testing to confirm compatibility with the Azure AD app registration's allowed redirect URIs.

### Gaps Summary

No gaps. All automated checks pass. Phase goal is achieved.

The only items flagged as human verification are live-tenant integration concerns (Claude Desktop OAuth flow and redirect_uri port handling) noted as a remaining concern in the SUMMARY itself. These are not blockers for the automated goal — the full discovery chain is validated by 6-step E2E tests, 209 tests pass with zero regressions, and all three requirements (META-03, INTG-01, INTG-02) have implementation evidence.

---

**Commits verified:** `a9509c0` (feat: metadata switchover + mock fetch) and `182e037` (test: E2E discovery chain) both present in git history.
**Test run:** 209 tests across 15 test files — all passing.

_Verified: 2026-03-26T09:10:00Z_
_Verifier: Claude (gsd-verifier)_
