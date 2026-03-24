# Codebase Concerns

**Analysis Date:** 2026-03-24

## Tech Debt

**GraphQL Query String Concatenation (High Priority):**
- Issue: GraphQL queries are constructed using template literals with direct string interpolation instead of parameterized queries, creating injection vulnerability. Examples: `search (query: "${query}"` in `src/api.ts:105`, `single (id: ${id})` in `src/api.ts:47`.
- Files: `src/api.ts` (lines 47, 85, 105), `src/tools.ts` (lines 900+)
- Impact: GraphQL injection attacks possible. Malicious input like `"); delete pages; query {` could manipulate API calls.
- Fix approach: Use GraphQL variables instead of string concatenation. Replace template strings with parameterized queries using graphql-request's variable support.

**Plaintext API Token in Console Output (High Priority):**
- Issue: API token is logged to console with only first 10 characters masked. Token appears in server startup logs and request handling.
- Files: `src/server.ts:23`, `src/tools.ts:517-519`, `lib/fixed_mcp_http_server.js:33-35`
- Impact: Sensitive token exposure in logs that could be captured in log aggregation systems, container registries, or build logs.
- Fix approach: Remove token from all console output. Use sentinel value like `[REDACTED]` for token logging only when absolutely necessary.

**Overly Permissive CORS Configuration (Medium Priority):**
- Issue: CORS is configured with `Access-Control-Allow-Origin: *` allowing any origin to access the API. Line 189 in `lib/fixed_mcp_http_server.js`.
- Files: `lib/fixed_mcp_http_server.js:189`
- Impact: Any website can call the MCP server endpoints if server is exposed on network. No origin restriction.
- Fix approach: Replace wildcard with specific allowed origins from environment variable. Implement origin whitelist validation.

**No HTTPS Enforcement (High Priority for Production):**
- Issue: Server defaults to HTTP with no forced HTTPS redirect or HTTPS-only mode. All examples and defaults use `http://` URLs.
- Files: `src/server.ts:14`, `env.example:8`, all shell scripts with `http://localhost` defaults
- Impact: API tokens transmitted in plaintext over HTTP. Man-in-the-middle attacks possible when server is remote.
- Fix approach: Add NODE_ENV check. In production (or when environment variable set), require HTTPS or error on startup. Add redirect middleware for HTTP->HTTPS.

**No Request Authentication/Authorization (Critical for OAuth2.1):**
- Issue: HTTP endpoints have no authentication. Any caller can invoke tools without credentials. No middleware to validate request origin or API key.
- Files: `src/server.ts` (all routes), `lib/fixed_mcp_http_server.js` (routes from line 208 onwards)
- Impact: Complete absence of access control. Anyone on network can read/modify Wiki.js content.
- Fix approach: Implement middleware to validate Bearer token or OAuth2.1 token on all endpoints. Check `Authorization` header.

**Default Localhost Binding with 0.0.0.0 Host (High Priority):**
- Issue: Server binds to `0.0.0.0` making it accessible from any network interface despite using localhost URLs.
- Files: `src/server.ts:303` - `server.listen({ port: config.port, host: "0.0.0.0" })`
- Impact: Server is accessible from entire network/internet if port is exposed, creating security perimeter issue.
- Fix approach: Change default to `localhost` or `127.0.0.1`. Add environment variable to opt into 0.0.0.0 binding only when explicitly set.

**Unvalidated Query String Parameters (Medium Priority):**
- Issue: Query parameters are cast to integers without validation in some endpoints. Example: `parseInt(id)` in `src/server.ts:60` without bounds checking.
- Files: `src/server.ts:60, 70, 101, 226, 235`
- Impact: Large integer values, negative numbers, or null values could cause unexpected behavior.
- Fix approach: Use Zod schemas to validate all query/path parameters before use. Already using schemas for body validation; apply same pattern to query parameters.

## Known Bugs

**Password Handling Mismatch (Medium Priority):**
- Symptoms: Schema defines `password` field with 8-character minimum (`src/schemas.ts:143`) but implementation uses `passwordRaw` parameter without validation. Tool accepts user-provided plaintext password which may not meet policy.
- Files: `src/schemas.ts:143`, `src/tools.ts:1769`, `src/server.ts:183-206`
- Trigger: Create user with password less than 8 characters or without complexity requirements.
- Workaround: None - requires schema/implementation alignment.

**Type Assertion Without Validation (Low Priority):**
- Symptoms: Multiple places use `as { ... }` type assertions without validation. Example: `request.query as { id: string }` in `src/server.ts:58`.
- Files: `src/server.ts:58, 80, 97, 111, 127, 188`
- Trigger: Malformed request with missing required query parameters passes type check but will have undefined values at runtime.
- Workaround: Code handles gracefully (parseInt(undefined) = NaN), but no explicit validation error returned.

**GraphQL Orderby Parameter Not Validated (Low Priority):**
- Symptoms: `orderBy` parameter in `getPagesList()` accepts any string and passes it directly to GraphQL query without whitelist validation.
- Files: `src/api.ts:85`, `src/server.ts:236`
- Trigger: Pass invalid orderBy value like `"INVALID_FIELD"` - GraphQL returns error but without schema validation.
- Workaround: GraphQL API returns error, but better to validate on client side.

## Security Considerations

**Token Lifecycle Management Not Implemented (High Priority):**
- Risk: API token never rotates. If compromised, no way to revoke/rotate without manual server restart and code change.
- Files: `src/server.ts:11-16`, `src/api.ts:13-20`
- Current mitigation: Token stored in environment variable only.
- Recommendations:
  - Add token rotation endpoint that updates in-memory token without restart
  - Implement token expiration with refresh token flow (needed for OAuth2.1)
  - Add audit logging for token access

**Error Messages May Expose Internal Paths/Structure (Medium Priority):**
- Risk: GraphQL errors returned to client may contain server paths or internal implementation details.
- Files: `src/api.ts:36-39`, `lib/fixed_mcp_http_server.js:640-648`
- Current mitigation: Errors are caught and converted to strings.
- Recommendations:
  - Wrap all GraphQL errors in safe response format
  - Log full error server-side but return generic message to client
  - Never return stack traces in HTTP responses

**No Rate Limiting (Medium Priority):**
- Risk: MCP server endpoints have no rate limiting. Any caller can make unlimited requests causing DoS.
- Files: All route handlers in `src/server.ts` and `lib/fixed_mcp_http_server.js`
- Current mitigation: None.
- Recommendations:
  - Add rate limiting middleware (one-per-second per IP minimum)
  - Implement token bucket or sliding window algorithm
  - Return 429 Too Many Requests when limit exceeded

**Unencrypted Configuration Storage (Medium Priority):**
- Risk: `.env` file contains API token in plaintext. No encryption or masking.
- Files: `.env`, `env.example`
- Current mitigation: `.env` is in `.gitignore` so not committed, but still world-readable on disk.
- Recommendations:
  - Recommend using OS secret manager (AWS Secrets Manager, HashiCorp Vault, etc.) in production docs
  - Add warning in startup logs if running with plaintext token in production
  - Document encryption approach in QUICKSTART.md

**No Input Sanitization for Page Content (Medium Priority):**
- Risk: Page content (Markdown) is passed directly to GraphQL without XSS sanitization.
- Files: `src/api.ts:129, 161`, `src/tools.ts:1109`
- Current mitigation: Wiki.js backend sanitizes HTML, but content-level validation is missing.
- Recommendations:
  - Validate content is valid Markdown before sending to API
  - Add content-security-policy headers to HTTP responses
  - Document XSS risks in README

**Bearer Token Not Extracted from Authorization Header (Critical for OAuth2.1):**
- Risk: Currently no support for `Authorization: Bearer <token>` header validation. All endpoints are unauthenticated.
- Files: Entire `src/server.ts`, `lib/fixed_mcp_http_server.js`
- Current mitigation: None - no authentication implemented.
- Recommendations:
  - Add middleware to extract and validate Bearer token from Authorization header
  - Compare against configured OAuth2.1 token or JWT
  - Return 401 Unauthorized if missing/invalid
  - Add refresh token support for OAuth2.1 flow

**No HTTPS/TLS Configuration (Critical for Production):**
- Risk: Server does not support TLS/HTTPS. Credentials transmitted in plaintext.
- Files: `src/server.ts` (fastify), `lib/fixed_mcp_http_server.js` (http module)
- Current mitigation: Examples show `https://` URLs but code doesn't enforce or support them.
- Recommendations:
  - Add TLS support via fastify ssl options or Node.js https module
  - Load certificate from environment variables or files
  - Require HTTPS in production environment
  - Add strict HSTS headers

## Performance Bottlenecks

**Multi-Stage Search Algorithm (Medium Priority):**
- Problem: `searchPages()` implements 4-stage fallback search including HTTP fetching. Each stage adds latency.
- Files: `src/api.ts:101-116`, `src/tools.ts` (search_unpublished_pages fallback logic)
- Cause: GraphQL search limitations requiring fallback to HTTP scraping for full-text search.
- Improvement path:
  - Implement caching layer for search results
  - Use Elasticsearch or similar if Wiki.js installation supports it
  - Limit fallback stages to 2 (API + HTTP only)
  - Add search result caching with 5-minute TTL

**No Connection Pooling to Wiki.js (Low Priority):**
- Problem: Each GraphQL request creates new client connection potentially.
- Files: `src/api.ts:15` creates new GraphQLClient per instance
- Cause: GraphQLClient created per WikiJsApi instance, no pooling.
- Improvement path:
  - Reuse single GraphQL client instance
  - Implement connection pool if graphql-request doesn't handle it
  - Monitor connection usage with persistent connections

**Unbounded Query Results (Low Priority):**
- Problem: `getPagesList()` has default limit of 50, but no maximum enforced. Caller could request 10000+ results.
- Files: `src/api.ts:78-98`, `src/server.ts:80-92`
- Cause: No upper bound validation on limit parameter.
- Improvement path:
  - Add maximum limit of 500 regardless of request
  - Return paginated results with cursor for large datasets
  - Document pagination approach in API docs

## Fragile Areas

**GraphQL Query Construction (High Fragility):**
- Files: `src/api.ts` (entire file), `src/tools.ts:1100-1300`
- Why fragile: String concatenation is brittle. Changing GraphQL schema requires manual string updates in multiple places. Type safety lost through dynamic query building.
- Safe modification:
  - Use graphql-tag or graphql gql syntax with static queries
  - Define all queries as constants at module level
  - Test that every query/mutation has corresponding test case
- Test coverage: No test files found. GraphQL queries untested.

**Environment Variable Initialization (Medium Fragility):**
- Files: `src/server.ts:8-17`, `src/tools.ts:1653-1656`, `lib/fixed_mcp_http_server.js:32-35`
- Why fragile: Multiple locations initialize from environment variables. No validation if variables missing. Defaults to localhost making production misconfiguration easy.
- Safe modification:
  - Create single configuration module that validates all required env vars at startup
  - Fail fast if required vars missing
  - Provide clear error messages showing what's missing
- Test coverage: No validation tests for missing configuration.

**Manual HTTP Request Handling (Medium Fragility):**
- Files: `lib/fixed_mcp_http_server.js:187-923`
- Why fragile: Inline HTTP request/response handling. Error handling spread throughout. No request validation framework.
- Safe modification:
  - Use Express or Fastify middleware instead of raw http module
  - Extract request parsing into reusable functions
  - Create middleware for authentication, validation, error handling
- Test coverage: No tests for HTTP layer.

## Scaling Limits

**Single GraphQL Client Instance (Low Priority):**
- Current capacity: One client per WikiJsApi instance. If server handles 100+ concurrent requests, client may become bottleneck.
- Limit: GraphQL client connection limit depends on underlying transport. Likely hits 100-1000 concurrent connections.
- Scaling path:
  - Implement GraphQL request batching to combine multiple queries
  - Add request queuing to prevent overwhelming Wiki.js
  - Monitor request latency and adjust batching window

**No Caching Layer (Medium Priority):**
- Current capacity: Every request hits Wiki.js API. No local cache.
- Limit: Hits Wiki.js rate limits after ~50 requests/second depending on server capacity.
- Scaling path:
  - Add in-memory cache (Redis preferred) with 5-10 minute TTL
  - Cache list_pages, get_page results
  - Invalidate cache on create/update operations
  - Implement cache warming for frequently accessed pages

**Memory Unbounded for File Operations (Low Priority):**
- Current capacity: When fetching large page content, entire content loaded in memory.
- Limit: Pages >10MB could cause memory issues with 100+ concurrent requests.
- Scaling path:
  - Stream large content responses instead of loading entirely
  - Implement chunked pagination for large content

## Dependencies at Risk

**GraphQL-Request Usage (Low Risk):**
- Risk: graphql-request is lightweight but may not be actively maintained. No built-in variable parameterization by default.
- Impact: If package becomes unmaintained, would need to migrate to apollo-client or other alternatives.
- Migration plan: Switch to apollo-client (requires rewrite of client usage) or graphql (lower level but more control).

**Node 18+ Required (Medium Risk):**
- Risk: Minimum Node 18 requirement may limit deployment options in older environments.
- Impact: Containers/systems with Node 16 EOL cannot use this code.
- Migration plan: Add `engines` check in package.json (already present). Document Node 18+ requirement prominently.

**No Authorization Library (High Risk):**
- Risk: No JWT/OAuth2 library included. Planned OAuth2.1 implementation will require additional dependencies.
- Impact: Currently no authentication available.
- Migration plan: Add `@types/node-oauth2-server` or similar. Recommend `oidc-client-ts` for client-side or `jsonwebtoken` for server-side.

## Missing Critical Features

**OAuth2.1 Authentication Not Implemented (Critical Blocker for Production):**
- Problem: Zero authentication/authorization. Cannot securely expose to network. OAuth2.1 support critical for multi-user, multi-client deployments.
- Blocks: Secure cloud deployment, user access control, token management.
- Implementation approach:
  1. Add authentication middleware checking Authorization header
  2. Implement OAuth2.1 authorization code flow for obtaining tokens
  3. Add JWT token validation on all endpoints
  4. Implement refresh token rotation
  5. Add client ID/secret validation

**HTTPS/TLS Support Not Available (Critical for Production):**
- Problem: All traffic unencrypted. Cannot securely deploy in production.
- Blocks: Any external deployment. Fails security compliance audits.
- Implementation approach:
  1. Add TLS option to fastify configuration
  2. Load cert/key from environment or files
  3. Add HSTS headers
  4. Validate certificate in client connections

**Request Authentication Middleware Absent (Critical for Production):**
- Problem: No way to prevent unauthorized API calls.
- Blocks: Multi-user deployments. API security.
- Implementation approach:
  1. Add middleware to all routes
  2. Extract Bearer token from Authorization header
  3. Validate against configured token or JWT issuer
  4. Return 401 if invalid

**Access Control Lists (ACLs) Not Implemented (Medium Priority):**
- Problem: All authenticated users have same permissions. No per-endpoint access control.
- Blocks: Fine-grained permission management.
- Implementation approach:
  1. Define permission groups in configuration
  2. Check user claims/scopes in middleware
  3. Return 403 if insufficient permissions

## Test Coverage Gaps

**No Unit Tests (Critical Gap):**
- What's not tested: GraphQL API methods, parameter validation, error handling, OAuth flows.
- Files: `src/api.ts`, `src/tools.ts`, `src/schemas.ts` - no corresponding `.test.ts` files found.
- Risk: Breaking changes introduced without detection. Query injection vulnerabilities undetected.
- Priority: High - establish test suite before adding OAuth2.1.

**No Integration Tests (Critical Gap):**
- What's not tested: End-to-end flows with real Wiki.js instance, authentication flows, token refresh.
- Files: No test files in project.
- Risk: Cannot verify OAuth2.1 flow works correctly. Cannot test token expiration/refresh.
- Priority: High - required for OAuth2.1 verification.

**No Security Tests (Critical Gap):**
- What's not tested: GraphQL injection attacks, XSS in page content, CORS enforcement, rate limiting.
- Files: None.
- Risk: Security vulnerabilities discovered in production only.
- Priority: Critical - add before public deployment.

**HTTP Layer Not Tested (Medium Gap):**
- What's not tested: HTTP request parsing, query parameter validation, error responses, CORS headers.
- Files: `lib/fixed_mcp_http_server.js` (923 lines, no tests).
- Risk: HTTP implementation bugs discovered late.
- Priority: Medium - needed before expanding HTTP surface.

**Configuration Validation Not Tested (Medium Gap):**
- What's not tested: Missing environment variables, invalid values, defaults behavior.
- Files: `src/server.ts:11-17`, no config validation module.
- Risk: Misconfiguration in production not caught at startup.
- Priority: Medium - add config validation tests early.

---

*Concerns audit: 2026-03-24*
