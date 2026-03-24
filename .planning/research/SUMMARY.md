# Research Summary: WikiJS MCP Server -- OAuth 2.1 Resource Server

**Domain:** OAuth 2.1 Resource Server / MCP Server Authentication
**Researched:** 2026-03-24
**Overall confidence:** HIGH

## Executive Summary

Adding OAuth 2.1 resource server capabilities to this existing Fastify/TypeScript MCP server is a well-understood problem with a clear, minimal solution. The entire auth layer requires exactly one new dependency: `jose` v6 for JWT signature verification and JWKS key fetching from Azure AD (Microsoft Entra ID).

The MCP Authorization Specification (2025-11-25 revision) mandates RFC 9728 Protected Resource Metadata and Bearer token validation, both of which are implementable as simple Fastify route handlers and hooks without any framework-level auth plugins. The specification is thorough but the server-side (resource server) requirements are straightforward -- the complexity lives on the client side (Claude Desktop handles the OAuth flow) and the authorization server side (Azure AD handles token issuance).

The project's existing ESM module format and Node.js 25 runtime make `jose` v6 (ESM-only since Feb 2025) a natural fit. Azure AD's v2.0 token format uses RS256 signing with well-documented JWKS endpoints, and `jose`'s `createRemoteJWKSet` handles key rotation and caching automatically.

The only strategic concern is Fastify v4's EOL status (retired June 2025), but this does not block the OAuth milestone -- the auth patterns (onRequest hooks, route handlers) are identical across v4 and v5.

## Key Findings

**Stack:** `jose` v6.2.2 is the sole new dependency. Custom Fastify hooks for auth middleware. No auth framework plugins needed.
**Architecture:** Resource server pattern -- validate incoming Bearer JWTs against Azure AD JWKS, serve RFC 9728 metadata, return 401 with WWW-Authenticate headers for unauthorized requests.
**Critical pitfall:** Azure AD v2.0 issuer format (`https://login.microsoftonline.com/{tenant}/v2.0`) must exactly match the `iss` claim -- using the wrong endpoint version (v1.0 vs v2.0) is the #1 cause of token validation failures.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Foundation: Config and jose setup** - Add env vars (AZURE_TENANT_ID, AZURE_CLIENT_ID, MCP_RESOURCE_URL), install jose, create JWKS singleton, validate config at startup with Zod.
   - Addresses: Environment configuration, dependency setup
   - Avoids: Starting middleware work without verified config

2. **Metadata endpoint: RFC 9728** - Implement `GET /.well-known/oauth-protected-resource` as a simple JSON route.
   - Addresses: MCP spec compliance, authorization server discovery
   - Avoids: Building auth middleware without the metadata endpoint that 401 responses must reference

3. **Auth middleware: JWT validation** - Implement onRequest hook with jose jwtVerify, proper 401/WWW-Authenticate responses, and request decoration with user claims.
   - Addresses: Core security requirement, Bearer token validation
   - Avoids: The pitfall of validating tokens with wrong issuer/audience by building on verified config from Phase 1

4. **Route protection: Apply middleware** - Register auth hook on MCP routes (POST /mcp, GET /mcp/events) while keeping health/metadata routes unauthenticated.
   - Addresses: Selective route protection, MCP transport migration
   - Avoids: Accidentally protecting health check endpoints

**Phase ordering rationale:**
- Config validation must come first -- Azure AD endpoints are derived from tenant ID
- RFC 9728 metadata endpoint must exist before auth middleware, because 401 responses reference its URL
- Auth middleware must be testable before being applied to routes
- Route protection is the final integration step

**Research flags for phases:**
- Phase 1: Standard patterns, unlikely to need further research
- Phase 2: RFC 9728 metadata fields are well-documented, unlikely to need research
- Phase 3: May need phase-specific research for edge cases (token clock skew, key rotation timing)
- Phase 4: May need research on MCP transport migration (porting lib/fixed_mcp_http_server.js into Fastify)

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | jose v6 is the clear choice, verified with npm, GitHub, and changelog. Zero alternatives worth considering. |
| Features | HIGH | MCP spec (2025-11-25) is detailed and authoritative. Azure AD docs are comprehensive. |
| Architecture | HIGH | Resource server is a well-established OAuth pattern. No novel architecture needed. |
| Pitfalls | MEDIUM | Azure AD-specific gotchas (v1/v2 endpoints, issuer format) documented but hard to enumerate exhaustively. Key rotation edge cases may surface during implementation. |

## Gaps to Address

- **MCP transport unification**: The project currently runs MCP transport on raw Node.js HTTP (lib/fixed_mcp_http_server.js) separate from Fastify. Porting this into Fastify is prerequisite to applying Fastify auth hooks. This is a code architecture question, not a library research question.
- **Claude Desktop OAuth client behavior**: How exactly Claude Desktop sends the `resource` parameter and handles 401 responses may need testing. The MCP spec defines the protocol but client implementation details may vary.
- **Fastify v5 migration**: Not blocking but should be planned as a follow-up milestone.
