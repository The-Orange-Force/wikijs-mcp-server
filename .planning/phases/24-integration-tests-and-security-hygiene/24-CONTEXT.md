# Phase 24: Integration Tests and Security Hygiene - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

End-to-end verification that GDPR filtering works correctly from the MCP client perspective across all 3 tools, and no information about the filter leaks through side channels (response shape, headers, instructions). Depends on Phase 22 (isBlocked predicate) and Phase 23 (tool handler integration).

</domain>

<decisions>
## Implementation Decisions

### Mock WikiJsApi design
- Extend the existing `mockWikiJsApi` in `tests/helpers/build-test-app.ts` — single source of truth for test data
- Include canonical blocked path (`Clients/AcmeCorp`) plus 1-2 normalization variants (e.g., `clients/acmecorp`, `/Clients/AcmeCorp/`)
- Use fictional company names (AcmeCorp, TestClient) — no risk of real client names in test output or CI logs
- Include "safe" Clients paths that should NOT be blocked: 1-segment `Clients` (listing page) and 3-segment `Clients/AcmeCorp/Contacts` (sub-page) to verify no over-filtering

### Response identity verification
- Byte-identical JSON string comparison for `get_page` blocked vs genuine not-found responses — strictest possible, matches SC wording
- Produce genuine not-found baseline by requesting a non-existent page ID (e.g., 99999) from the mock — mock should throw/error for unknown IDs
- For `search_pages` and `list_pages`: verify blocked paths are completely absent from results (not as errors, not as entries, not as anything)
- Check response headers for side-channel leaks — assert no custom headers hint at GDPR filtering (no `X-GDPR-Blocked` or similar)

### Instructions file audit
- Scan both `DEFAULT_INSTRUCTIONS` (hardcoded in `src/instructions.ts`) and `instructions.txt.example` for GDPR-revealing content
- Broad keyword set: `Clients` (case-sensitive, capital C plural), `blocked`, `GDPR`, `filter`, `isBlocked`, `restricted`, `hidden`
- Generic lowercase "client" is a false positive — only flag exact path segment `Clients` (capital C, plural)
- Also verify at runtime via Fastify `inject()` — check the actual instructions string returned in the MCP initialize response

### Test file organization
- New dedicated file: `tests/gdpr-filter.test.ts` for all GDPR integration tests
- Use Fastify `inject()` (not real HTTP listener) — faster, no port allocation, matches SC wording
- Group by tool: `describe('get_page GDPR filtering')`, `describe('list_pages GDPR filtering')`, `describe('search_pages GDPR filtering')`, `describe('Instructions security audit')`
- Tag test cases with SC/requirement numbers following existing pattern (e.g., `SC-1:`, `SC-2:`, `SEC-03:`)

### Claude's Discretion
- Exact mock data structure and additional test page entries
- Helper function design for MCP JSON-RPC calls within the test file
- Specific header assertions beyond the custom-header leak check
- Whether to add a shared helper for the byte-identical comparison

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `buildTestApp()` in `tests/helpers/build-test-app.ts`: Creates Fastify app with local JWKS, mock WikiJsApi, and mock fetch. Supports `wikiJsApiOverride` parameter for custom mocks
- `mockWikiJsApi` in same file: Current mock with `getPageById`, `listPages`, `searchPages`, `checkConnection` — to be extended with blocked path data
- `createTestToken()` and `getLocalJwks()` from `src/auth/__tests__/helpers.js`: JWT generation for authenticated test requests
- `capturedFetchCalls` in build-test-app.ts: Array for inspecting outbound fetch calls
- `DEFAULT_INSTRUCTIONS` exported from `src/instructions.ts`: Hardcoded fallback instructions string

### Established Patterns
- Fastify `inject()` for integration tests: used in `e2e-flow.test.ts` — no port allocation needed
- Real HTTP listener with `server.listen({port: 0})` in `smoke.test.ts` — alternative pattern, not used here
- JSON-RPC MCP protocol: `{jsonrpc: "2.0", id: N, method: "tools/call", params: {name: "tool", arguments: {...}}}`
- Requirement-tagged test names: `TRNS-01:`, `INIT-01:`, etc. in existing tests
- Vitest with `describe/it/expect/beforeAll/afterAll`

### Integration Points
- `mcp-tools.ts`: Where GDPR filter will be applied (Phase 23) — integration tests verify the end result
- `instructions.ts`: `DEFAULT_INSTRUCTIONS` constant and `loadInstructions()` function — audit target
- `instructions.txt.example`: Template file shipped with the project — audit target

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches following existing test patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 24-integration-tests-and-security-hygiene*
*Context gathered: 2026-03-27*
