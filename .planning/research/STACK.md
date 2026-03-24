# Technology Stack

**Project:** WikiJS MCP Server -- OAuth 2.1 Resource Server Layer
**Researched:** 2026-03-24
**Overall Confidence:** HIGH

## Executive Summary

Adding OAuth 2.1 resource server capabilities to this existing Fastify/TypeScript MCP server requires surprisingly few new dependencies. The core stack is `jose` for JWT/JWKS operations and a Fastify `onRequest` hook for token validation -- no framework-level auth plugin needed. The MCP specification (2025-11-25) mandates RFC 9728 Protected Resource Metadata and Bearer token validation, both implementable with zero additional libraries beyond `jose`.

The project is already ESM (`"type": "module"`) and runs Node.js 25, so `jose` v6 (ESM-only) is fully compatible. The existing Fastify v4.27.2 is EOL (retired June 30, 2025), but upgrading to Fastify v5 is out of scope for this milestone -- it has 20+ breaking changes and is a separate concern.

## Recommended Stack

### JWT / JWKS Validation (Core Auth)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `jose` | ^6.2.2 | JWT signature verification, JWKS auto-fetching, claims validation | Zero native dependencies. Built-in `createRemoteJWKSet` with auto-caching and cooldown. 51M+ weekly npm downloads. Actively maintained (v6.2.2 released 2026-03-18). ESM-native. The MCP Auth library itself uses jose internally -- this is the ecosystem standard. | HIGH |

### Auth Middleware (Fastify Integration)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Custom Fastify `onRequest` hook | N/A (native Fastify) | Bearer token extraction and JWT validation on protected routes | Fastify's hook system is the idiomatic way to add auth. Using `onRequest` (not `preHandler`) avoids parsing request bodies for unauthorized requests -- critical for security and performance. A custom hook calling `jose.jwtVerify()` gives full control over Azure AD-specific validation (issuer templating, audience, `tid` claim) without wrapper library overhead. | HIGH |

### Protected Resource Metadata (RFC 9728)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Custom Fastify route handler | N/A (native Fastify) | Serve `GET /.well-known/oauth-protected-resource` endpoint | RFC 9728 metadata is a static JSON response. No library needed -- it is a single route returning a JSON object with `resource`, `authorization_servers`, `bearer_methods_supported`, and `scopes_supported` fields. Adding a dependency for this would be over-engineering. | HIGH |

### Supporting Libraries (Already Installed)

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `fastify` | ^4.27.2 (existing) | HTTP server framework | EOL but functional. Upgrade to v5 is a separate milestone. |
| `zod` | ^3.25.17 (existing) | Config validation for new env vars | Use for AZURE_TENANT_ID, AZURE_CLIENT_ID, MCP_RESOURCE_URL validation at startup. |
| `dotenv` | ^16.5.0 (existing) | Environment variable loading | Add new vars to example.env. |
| `typescript` | ^5.3.3 (existing) | Type system | No changes needed. |

### New Dev Dependencies

| Library | Version | Purpose | Why | Confidence |
|---------|---------|---------|-----|------------|
| `@types/node` | ^20.11.19 (existing) | Node.js type definitions | Already installed, no update required for this milestone. | HIGH |

## What NOT to Use (and Why)

### Rejected: `@fastify/jwt`
- **What:** Fastify's official JWT plugin, internally uses `fast-jwt` (not `jose`).
- **Why not:** Adds an unnecessary abstraction layer. `fast-jwt` is a different JWT library from `jose`, meaning two JWT implementations in the dependency tree. `@fastify/jwt` is designed for servers that both sign and verify tokens -- this server only verifies. The `jose` API (`jwtVerify` + `createRemoteJWKSet`) is cleaner for pure resource server use. Also, `@fastify/jwt` decorates the Fastify instance with methods we would not use (`.sign()`, `.decode()`).

### Rejected: `@fastify/bearer-auth`
- **What:** Fastify plugin for bearer token validation against static key sets.
- **Why not:** Designed for static API keys, not JWT validation. While it supports custom `auth` functions, using it just to extract Bearer tokens from headers is over-engineering. The token extraction is 3 lines of code in an `onRequest` hook.

### Rejected: `fastify-jwt-jwks` (nearform)
- **What:** JWKS verification plugin for Fastify, wraps `@fastify/jwt`.
- **Why not:** Adds two layers of abstraction (`fastify-jwt-jwks` -> `@fastify/jwt` -> `fast-jwt`). Does not use `jose`. The v3.0.0 release is recent (Dec 2025) but still depends on `fast-jwt` underneath. For Azure AD's specific issuer format requirements (tenant-specific issuer URLs with `{tenantid}` templating), we need direct control over validation logic that wrapper plugins obscure.

### Rejected: `mcp-auth` (mcp-auth.dev)
- **What:** OAuth 2.1 auth SDK for MCP servers (v0.2.0, Jan 2026).
- **Why not:** Express-only -- no Fastify support documented or implemented. Only 45 GitHub stars, 4 contributors. v0.2.0 signals pre-1.0 instability. While it uses `jose` internally and handles RFC 9728 metadata, adopting it would mean either switching to Express (unacceptable) or writing an adapter (more work than implementing directly). The library's value proposition -- handling RFC 9728 metadata and bearer auth middleware -- is straightforward to implement directly in Fastify.

### Rejected: `jsonwebtoken` + `jwks-rsa`
- **What:** Legacy JWT ecosystem (the original Node.js JWT libraries).
- **Why not:** `jsonwebtoken` has native C++ dependencies (unlike `jose`). `jwks-rsa` is a separate package for JWKS fetching that `jose` handles natively. The `jose` library was explicitly designed as the modern replacement. PROJECT.md already lists `jose` as a constraint.

### Rejected: `passport` / `passport-azure-ad`
- **What:** Express-focused authentication middleware.
- **Why not:** Express-oriented, poor Fastify integration. `passport-azure-ad` is Microsoft's official strategy but depends on Express middleware patterns. Overly complex for pure JWT validation.

## Azure AD / Entra ID Specifics

### Endpoints (for configuration reference)

| Endpoint | URL Pattern | Purpose |
|----------|-------------|---------|
| OpenID Configuration | `https://login.microsoftonline.com/{tenant_id}/v2.0/.well-known/openid-configuration` | Discovery document (contains jwks_uri, issuer) |
| JWKS URI (v2.0) | `https://login.microsoftonline.com/{tenant_id}/discovery/v2.0/keys` | Public signing keys |
| Issuer (v2.0) | `https://login.microsoftonline.com/{tenant_id}/v2.0` | Expected `iss` claim value |

### Token Validation Requirements

| Claim | Validation | Notes |
|-------|-----------|-------|
| `aud` | Must match `AZURE_CLIENT_ID` | The app registration's Application (client) ID |
| `iss` | Must match `https://login.microsoftonline.com/{AZURE_TENANT_ID}/v2.0` | Single-tenant validation (company Azure AD) |
| `exp` | Must not be expired | `jose` handles this automatically |
| `nbf` | Must be in the past | `jose` handles this automatically |
| Algorithm | RS256 | Azure AD's standard signing algorithm |

### Key Rotation

Microsoft Entra ID rotates signing keys periodically. `jose`'s `createRemoteJWKSet` handles this automatically with its built-in caching and cooldown mechanism -- when a token presents a `kid` not in the cached keyset, it re-fetches the JWKS (but no more frequently than the cooldown allows, preventing abuse).

## Implementation Pattern

### Core Auth Flow (jose v6 API)

```typescript
import { createRemoteJWKSet, jwtVerify } from 'jose';

// Initialize once at server startup
const JWKS = createRemoteJWKSet(
  new URL(`https://login.microsoftonline.com/${AZURE_TENANT_ID}/discovery/v2.0/keys`)
);

// Fastify onRequest hook
async function verifyAccessToken(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    reply.code(401).header('WWW-Authenticate',
      `Bearer resource_metadata="${MCP_RESOURCE_URL}/.well-known/oauth-protected-resource"`
    ).send({ error: 'unauthorized' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://login.microsoftonline.com/${AZURE_TENANT_ID}/v2.0`,
      audience: AZURE_CLIENT_ID,
      algorithms: ['RS256'],
    });
    // Attach decoded claims to request for downstream use
    request.user = payload;
  } catch (err) {
    reply.code(401).header('WWW-Authenticate',
      `Bearer resource_metadata="${MCP_RESOURCE_URL}/.well-known/oauth-protected-resource", error="invalid_token"`
    ).send({ error: 'invalid_token' });
  }
}
```

### Protected Resource Metadata (RFC 9728)

```typescript
// Static JSON response -- no library needed
fastify.get('/.well-known/oauth-protected-resource', async () => ({
  resource: MCP_RESOURCE_URL,
  authorization_servers: [
    `https://login.microsoftonline.com/${AZURE_TENANT_ID}/v2.0`
  ],
  bearer_methods_supported: ['header'],
  scopes_supported: [],
  resource_documentation: undefined,
}));
```

## Installation

```bash
# New dependency (only one!)
npm install jose@^6.2.2
```

No new dev dependencies required.

## New Environment Variables

| Variable | Example | Purpose | Required |
|----------|---------|---------|----------|
| `AZURE_TENANT_ID` | `aaaabbbb-0000-cccc-1111-dddd2222eeee` | Microsoft Entra ID tenant for JWKS/issuer URLs | Yes |
| `AZURE_CLIENT_ID` | `6e74172b-be56-4843-9ff4-e66a39bb12e3` | App registration client ID (audience claim) | Yes |
| `MCP_RESOURCE_URL` | `https://mcp.example.com` | Canonical resource URI for RFC 9728 metadata and WWW-Authenticate headers | Yes |

## Fastify v4 EOL Note

Fastify v4 was retired June 30, 2025. The project currently uses v4.27.2. This does NOT block the OAuth milestone -- the auth layer uses standard Fastify hooks that work identically in v4 and v5. However, a separate Fastify v5 upgrade milestone should be planned. Key v5 migration impacts:

- Requires Node.js v20+ (already satisfied with Node.js 25)
- Plugin API changes (minor, mostly `fastify-plugin` updates)
- JSON schema validation changes (full schema required, no shorthand)
- `@fastify/bearer-auth` v10.x requires Fastify v5; v8.x/v9.x works with v4 (but we are not using this plugin)

## MCP Specification Compliance

Per the [MCP Authorization Specification (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization):

| Requirement | Implementation | Status |
|-------------|---------------|--------|
| MUST implement RFC 9728 Protected Resource Metadata | Custom Fastify route at `/.well-known/oauth-protected-resource` | Planned |
| MUST validate access tokens per OAuth 2.1 Section 5.2 | `jose.jwtVerify()` with audience, issuer, algorithm checks | Planned |
| MUST validate audience (token issued for this server) | `audience: AZURE_CLIENT_ID` in jwtVerify options | Planned |
| MUST return 401 with WWW-Authenticate for invalid tokens | Custom onRequest hook with proper headers | Planned |
| MUST include `resource_metadata` in WWW-Authenticate | URL pointing to `/.well-known/oauth-protected-resource` | Planned |
| Authorization is OPTIONAL but SHOULD conform when supported | Full conformance planned | Planned |

## Sources

- [jose npm package](https://www.npmjs.com/package/jose) -- 51M+ weekly downloads, v6.2.2
- [jose GitHub (panva/jose)](https://github.com/panva/jose) -- API docs, changelog
- [jose v6 CHANGELOG](https://github.com/panva/jose/blob/main/CHANGELOG.md) -- Breaking changes, ESM-only in v6
- [jose createRemoteJWKSet docs](https://github.com/panva/jose/blob/main/docs/jwks/remote/functions/createRemoteJWKSet.md)
- [jose jwtVerify docs](https://github.com/panva/jose/blob/main/docs/jwt/verify/functions/jwtVerify.md)
- [MCP Authorization Specification (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [RFC 9728 -- OAuth 2.0 Protected Resource Metadata](https://datatracker.ietf.org/doc/rfc9728/)
- [Microsoft Entra ID Access Tokens](https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens) -- v2.0 token format, issuer, JWKS, validation
- [Microsoft Entra ID OpenID Connect](https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc) -- Discovery endpoints
- [Fastify LTS/EOL schedule](https://fastify.dev/docs/latest/Reference/LTS/) -- v4 retired June 2025
- [mcp-auth.dev](https://mcp-auth.dev/docs) -- Evaluated and rejected (Express-only, pre-1.0)
- [nearform/fastify-jwt-jwks](https://github.com/nearform/fastify-jwt-jwks) -- Evaluated and rejected
