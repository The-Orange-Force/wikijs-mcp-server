# Phase 4: JWT Authentication - Research

**Researched:** 2026-03-24
**Domain:** JWT validation middleware with jose + Fastify + Azure AD v2.0
**Confidence:** HIGH

## Summary

This phase builds a Fastify authentication middleware that validates Azure AD v2.0 Bearer tokens using the `jose` library. The middleware extracts tokens from the `Authorization` header, validates signatures against Azure AD's JWKS endpoint, checks standard JWT claims (audience, issuer, expiry, not-before), validates scope presence, and produces RFC 6750-compliant error responses with RFC 9728 `resource_metadata` parameter in the `WWW-Authenticate` header.

The jose library (v6.2.2, ESM-only) provides `createRemoteJWKSet` for JWKS fetching/caching and `jwtVerify` for signature verification + claims validation in a single call. Error handling maps jose's typed error classes (`JWTExpired`, `JWTClaimValidationFailed`, `JWSSignatureVerificationFailed`, `JWKSTimeout`, `JWKSNoMatchingKey`) to specific RFC 6750 error codes and human-readable descriptions. The middleware uses Fastify's `decorateRequest` + `onRequest` hook pattern to attach authenticated user identity to the request object.

**Primary recommendation:** Implement as a Fastify plugin using `fastify-plugin` (for encapsulation breaking) that decorates `request.user` with `AuthenticatedUser | null`, uses an `onRequest` hook for token extraction and validation, and maps jose errors to RFC 6750 + RFC 9728 compliant responses. Use jose `generateKeyPair` + `SignJWT` in tests to create real signed tokens against a local key pair rather than mocking the jose internals.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Define v2 scopes now: wikijs:read, wikijs:write, wikijs:admin -- hardcoded in code, not configurable via env
- v1 gate: require at least one of the three scopes in the token; any one suffices
- Check delegated user tokens only -- scopes in the `scp` claim (not `roles`)
- Per-tool scope enforcement deferred to v2 (ADVN-01, ADVN-02)
- Specific reasons in `error_description` -- "token expired", "invalid audience", "invalid signature" (corporate server, debuggability > obscurity)
- Both WWW-Authenticate header AND JSON body `{ error, error_description }` on 401/403
- 403 (insufficient_scope) includes required scopes in WWW-Authenticate `scope` parameter and JSON body
- Log auth rejections server-side using Fastify's built-in logger (basic logging now, structured correlation IDs in Phase 5)
- Extract four claims: oid, preferred_username, name, email
- Only `oid` is required -- others extracted if present, undefined if not
- Expose via `request.user` using Fastify's `decorateRequest` pattern
- Define and export a TypeScript `AuthenticatedUser` interface from the middleware module
- Single tenant only -- no `tid` extraction needed
- Clock skew: jose default (0 seconds tolerance) -- corporate network with NTP, 1-hour token lifetime
- Token version: v2.0 only -- issuer must match `https://login.microsoftonline.com/{tenant}/v2.0`
- Audience: validate `aud` matches AZURE_CLIENT_ID -- no additional `azp` check
- JWKS fetch failure: return HTTP 503 Service Unavailable (not 401) -- distinguishes infrastructure failure from auth failure

### Claude's Discretion
- Middleware internal structure (Fastify plugin vs standalone function)
- jose options beyond what's specified (algorithms, etc.)
- Error message exact wording
- Unit test approach and mocking strategy

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-01 | Server extracts Bearer token from Authorization header on protected routes | Fastify `onRequest` hook extracts `Authorization: Bearer <token>` header; regex or string split to isolate token value |
| AUTH-02 | Server validates JWT signature against Azure AD JWKS using jose createRemoteJWKSet | `createRemoteJWKSet(new URL(jwksUri))` from config module + `jwtVerify(token, jwks, options)` validates signature automatically |
| AUTH-03 | Server validates audience claim (aud) matches AZURE_CLIENT_ID | `jwtVerify` `audience` option validates aud claim; throws `JWTClaimValidationFailed` with `claim: "aud"` on mismatch |
| AUTH-04 | Server validates issuer claim (iss) matches Azure AD v2.0 issuer format | `jwtVerify` `issuer` option validates iss claim; expected format `https://login.microsoftonline.com/{tenant}/v2.0` |
| AUTH-05 | Server validates token expiry (exp) and not-before (nbf) claims | `jwtVerify` validates exp and nbf automatically (always checked); throws `JWTExpired` for exp, `JWTClaimValidationFailed` for nbf |
| AUTH-06 | Missing or invalid token returns HTTP 401 with WWW-Authenticate header containing resource_metadata URL | RFC 6750 `error="invalid_token"` + RFC 9728 `resource_metadata="<url>"` parameter in WWW-Authenticate header |
| AUTH-07 | Valid token with insufficient scopes returns HTTP 403 with WWW-Authenticate error="insufficient_scope" | After successful jwtVerify, check `scp` claim for wikijs:read/wikijs:write/wikijs:admin; return 403 with `scope` parameter listing required scopes |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| jose | ^6.2.2 | JWT verification, JWKS fetching, test token creation | Zero-dependency, ESM-native, Web Crypto API based, maintained by panva (OpenID Foundation contributor). Standard for Node.js JWT validation. |
| fastify | ^4.27.2 | HTTP framework (already installed) | Existing project dependency |
| fastify-plugin | ^4.5.1 | Plugin encapsulation breaking for decorators/hooks | Required for `decorateRequest` to be visible across all routes. Official Fastify ecosystem package. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | (from Phase 2) | Test framework | Already planned for installation in Phase 2 |
| zod | ^3.25.17 | Schema validation (already installed) | Could validate extracted claims structure |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| jose | jsonwebtoken + jwks-rsa | jsonwebtoken is CJS-only, doesn't validate claims natively, requires separate JWKS library. jose is the modern standard. |
| fastify-plugin + custom hook | @fastify/auth | @fastify/auth adds unnecessary abstraction for single-strategy auth. Direct hook is simpler and more transparent. |
| jose generateKeyPair (for tests) | mock-jwks + msw | mock-jwks adds two dependencies. jose's own key generation is sufficient for creating real signed test tokens. |

**Installation:**
```bash
npm install jose fastify-plugin
```

Note: jose may already be installed by Phase 2. `fastify-plugin` is new for this phase.

### Version Compatibility Note
jose v6.x requires Node.js `^20.19.0 || ^22.12.0 || >= 23.0.0`. The project's `package.json` declares `"engines": { "node": ">=18.0.0" }`. The development machine runs Node.js 25.2.1 (compatible). If Node.js 18 support is required, use jose v5 (`^5.10.0`) instead. **Recommendation:** Use jose v6 since the project will be deployed on modern Node.js, but flag this engine discrepancy in Phase 2 planning.

## Architecture Patterns

### Recommended Project Structure
```
src/
  auth/
    middleware.ts        # Fastify plugin: decorateRequest + onRequest hook
    errors.ts            # jose error -> RFC 6750 error mapping
    types.ts             # AuthenticatedUser interface, JWT payload type
  config.ts              # (Phase 2) exports JWKS function, issuer, audience, resource URL
  server.ts              # registers auth plugin
```

### Pattern 1: Fastify Auth Plugin with decorateRequest
**What:** A Fastify plugin that decorates requests with user identity and validates tokens via an onRequest hook.
**When to use:** For JWT authentication middleware in Fastify applications.
**Example:**
```typescript
// Source: Fastify official docs (decorators + hooks)
import fp from 'fastify-plugin';
import { jwtVerify, errors } from 'jose';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import type { AuthenticatedUser } from './types.js';

// TypeScript declaration merging for request.user
declare module 'fastify' {
  interface FastifyRequest {
    user: AuthenticatedUser | null;
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  // Decorate with null initial value (CRITICAL: never use reference types)
  fastify.decorateRequest('user', null);

  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Token extraction and validation logic here
    // On failure: reply.code(401).header('WWW-Authenticate', '...').send({...}); return reply;
    // On success: request.user = { oid, preferred_username, name, email };
  });
};

export default fp(authPlugin, {
  name: 'auth-jwt',
  fastify: '4.x',
});
```

### Pattern 2: jose jwtVerify with createRemoteJWKSet
**What:** Single-call JWT validation that checks signature + all claims.
**When to use:** For validating Azure AD v2.0 tokens.
**Example:**
```typescript
// Source: jose official docs (jwtVerify + createRemoteJWKSet)
import { jwtVerify, createRemoteJWKSet } from 'jose';

// JWKS function created once (Phase 2 config module exports this)
const jwks = createRemoteJWKSet(
  new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`)
);

// Validate token
const { payload } = await jwtVerify(token, jwks, {
  issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
  audience: clientId,
  algorithms: ['RS256'],  // Azure AD uses RS256
});

// payload.oid, payload.preferred_username, payload.name, payload.email
// payload.scp contains space-delimited scopes string
```

### Pattern 3: jose Error to RFC 6750 Error Mapping
**What:** Map jose typed errors to spec-compliant HTTP error responses.
**When to use:** In the catch block of token validation.
**Example:**
```typescript
// Source: jose error docs + RFC 6750 Section 3.1
import { errors } from 'jose';

function mapJoseError(err: unknown): { status: number; error: string; description: string } {
  if (err instanceof errors.JWTExpired) {
    return { status: 401, error: 'invalid_token', description: 'token expired' };
  }
  if (err instanceof errors.JWTClaimValidationFailed) {
    // err.claim tells which claim failed: "aud", "iss", "nbf", etc.
    if (err.claim === 'aud') {
      return { status: 401, error: 'invalid_token', description: 'invalid audience' };
    }
    if (err.claim === 'iss') {
      return { status: 401, error: 'invalid_token', description: 'invalid issuer' };
    }
    if (err.claim === 'nbf') {
      return { status: 401, error: 'invalid_token', description: 'token not yet valid' };
    }
    return { status: 401, error: 'invalid_token', description: `claim validation failed: ${err.claim}` };
  }
  if (err instanceof errors.JWSSignatureVerificationFailed) {
    return { status: 401, error: 'invalid_token', description: 'invalid signature' };
  }
  if (err instanceof errors.JWKSTimeout) {
    // JWKS fetch failure -> 503 per user decision
    return { status: 503, error: 'service_unavailable', description: 'unable to validate token: key service unavailable' };
  }
  if (err instanceof errors.JWKSNoMatchingKey) {
    return { status: 401, error: 'invalid_token', description: 'no matching key found' };
  }
  // Generic jose error
  return { status: 401, error: 'invalid_token', description: 'token validation failed' };
}
```

### Pattern 4: WWW-Authenticate Header Construction
**What:** RFC 6750 + RFC 9728 compliant WWW-Authenticate header.
**When to use:** For all 401 and 403 responses.
**Example:**
```typescript
// Source: RFC 6750 Section 3.1 + RFC 9728 Section 5.1

// 401 - Missing or invalid token
function buildWwwAuthenticate401(
  resourceMetadataUrl: string,
  error?: string,
  errorDescription?: string,
): string {
  let header = `Bearer resource_metadata="${resourceMetadataUrl}"`;
  if (error) {
    header += `, error="${error}", error_description="${errorDescription}"`;
  }
  return header;
}

// 403 - Insufficient scope
function buildWwwAuthenticate403(
  resourceMetadataUrl: string,
  requiredScopes: string[],
): string {
  return `Bearer resource_metadata="${resourceMetadataUrl}", error="insufficient_scope", error_description="insufficient scope", scope="${requiredScopes.join(' ')}"`;
}

// No token at all (just indicate Bearer is required)
// WWW-Authenticate: Bearer resource_metadata="https://..."
```

### Pattern 5: Scope Validation from scp Claim
**What:** Extract and validate space-delimited scopes from Azure AD v2.0 `scp` claim.
**When to use:** After successful token verification, before route handler execution.
**Example:**
```typescript
// Azure AD v2.0 delegated tokens use the "scp" claim (space-delimited string)
const VALID_SCOPES = ['wikijs:read', 'wikijs:write', 'wikijs:admin'] as const;

function validateScopes(payload: { scp?: string }): boolean {
  if (!payload.scp || typeof payload.scp !== 'string') {
    return false;
  }
  const tokenScopes = payload.scp.split(' ');
  return tokenScopes.some(scope => VALID_SCOPES.includes(scope as any));
}
```

### Anti-Patterns to Avoid
- **Mocking jose internals in tests:** Don't `vi.mock('jose')`. Instead, use `generateKeyPair` + `SignJWT` to create real signed tokens and validate them with a local JWKS. This tests the actual validation pipeline.
- **Reference type in decorateRequest:** Never do `fastify.decorateRequest('user', {})` -- this shares the object across all requests. Always use `null` and assign in the hook.
- **Catching generic Error:** Don't catch `Error` and assume it's a token validation failure. Always check jose error types first, then fall through to a generic handler.
- **Parsing JWT manually:** Don't split the JWT string to read claims. Always use `jwtVerify` which validates signature first, preventing confused deputy attacks.
- **Hardcoding JWKS keys:** Don't embed Azure AD public keys. Use `createRemoteJWKSet` which handles key rotation automatically.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT signature verification | Manual RSA/ECDSA verification | `jose.jwtVerify()` | Subtle crypto bugs, timing attacks, algorithm confusion attacks |
| JWKS key fetching + caching | Custom HTTP fetch + key cache | `jose.createRemoteJWKSet()` | Handles cooldown, kid matching, key rotation, timeout, caching |
| JWT claims validation | Manual exp/nbf/aud/iss checks | `jose.jwtVerify()` options | Clock handling, NumericDate parsing, array audiences |
| Test token generation | Manual JWT string construction | `jose.SignJWT` + `generateKeyPair` | Produces cryptographically valid tokens for realistic testing |
| WWW-Authenticate header parsing | Custom string formatting | Utility function (simple enough) | This one IS simple enough to hand-roll -- just string concatenation with proper quoting |

**Key insight:** jose's `jwtVerify` does signature verification AND claims validation in one call. Don't separate these concerns -- the library is designed to do both atomically, and splitting them creates security gaps (e.g., reading claims from an unsigned token).

## Common Pitfalls

### Pitfall 1: onRequest vs preHandler Hook Choice
**What goes wrong:** Using `preHandler` for JWT auth wastes resources parsing the request body before rejecting unauthorized requests.
**Why it happens:** `preHandler` seems natural for "pre-processing" but runs after body parsing.
**How to avoid:** Use `onRequest` hook for JWT Bearer token validation. The token is in headers, which are available in `onRequest`. Body parsing is skipped entirely for rejected requests.
**Warning signs:** Unauthorized requests consuming memory for body parsing.

### Pitfall 2: Azure AD v2.0 scp Claim is a Space-Delimited String
**What goes wrong:** Treating `scp` as an array (like the `roles` claim) causes scope validation to fail silently.
**Why it happens:** Azure AD v2.0 delegated tokens encode scopes as a single space-delimited string in the `scp` claim (e.g., `"wikijs:read wikijs:write"`), not as an array.
**How to avoid:** Always `payload.scp.split(' ')` before checking individual scopes.
**Warning signs:** Scope validation always fails despite correct token.

### Pitfall 3: JWKS Fetch Failure Masquerading as Auth Failure
**What goes wrong:** `JWKSTimeout` or network errors from `createRemoteJWKSet` are caught and returned as 401 Unauthorized, misleading clients.
**Why it happens:** All errors in the catch block get mapped to 401 by default.
**How to avoid:** Check for `JWKSTimeout` and `JWKSNoMatchingKey` (when JWKS hasn't been fetched yet) separately. Return 503 Service Unavailable per user decision.
**Warning signs:** Intermittent 401s that correlate with network issues.

### Pitfall 4: Missing return reply After reply.send() in Async Hook
**What goes wrong:** After calling `reply.code(401).send(...)` in an async `onRequest` hook, the request continues to the route handler.
**Why it happens:** In async Fastify hooks, you must `return reply` after `reply.send()` to short-circuit the lifecycle.
**How to avoid:** Always `return reply` immediately after `reply.send()` in async hooks. The pattern is: `reply.code(401).header(...).send({...}); return reply;`
**Warning signs:** Route handlers executing for unauthorized requests; duplicate response errors.

### Pitfall 5: jose v6 ESM-Only and Test Runner Compatibility
**What goes wrong:** Vitest works fine (native ESM), but if anyone tries to use Jest or other CJS test runners, imports fail with `SyntaxError: Unexpected token 'export'`.
**Why it happens:** jose v6 ships ESM only. CJS `require('jose')` fails unless Node.js supports `require(esm)`.
**How to avoid:** Use Vitest (ESM-native, already chosen in Phase 2). Ensure `"type": "module"` in package.json (already present).
**Warning signs:** `SyntaxError: Unexpected token 'export'` in test output.

### Pitfall 6: Shared Mutable State in decorateRequest
**What goes wrong:** All requests share the same user object, causing data leaks between concurrent requests.
**Why it happens:** `decorateRequest('user', { oid: '' })` initializes with a reference type that is shared.
**How to avoid:** `decorateRequest('user', null)` then assign a new object per-request in the hook.
**Warning signs:** Race conditions where one request sees another user's identity.

## Code Examples

Verified patterns from official sources:

### Creating Test Tokens with jose (for Vitest tests)
```typescript
// Source: jose official docs (SignJWT + generateKeyPair)
import { SignJWT, generateKeyPair, exportJWK } from 'jose';

// Generate a key pair for testing (once per test suite)
const { publicKey, privateKey } = await generateKeyPair('RS256');

// Create a valid test token
async function createTestToken(claims: Record<string, unknown> = {}): Promise<string> {
  return new SignJWT({
    oid: '00000000-0000-0000-0000-000000000001',
    preferred_username: 'testuser@contoso.com',
    name: 'Test User',
    email: 'testuser@contoso.com',
    scp: 'wikijs:read wikijs:write',
    ...claims,
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: 'test-key-1' })
    .setIssuer('https://login.microsoftonline.com/test-tenant-id/v2.0')
    .setAudience('test-client-id')
    .setExpirationTime('1h')
    .setIssuedAt()
    .setNotBefore('0s')
    .sign(privateKey);
}

// Create an expired token for testing
async function createExpiredToken(): Promise<string> {
  return new SignJWT({ oid: 'test-oid', scp: 'wikijs:read' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: 'test-key-1' })
    .setIssuer('https://login.microsoftonline.com/test-tenant-id/v2.0')
    .setAudience('test-client-id')
    .setExpirationTime('-1h')  // Already expired
    .setIssuedAt(Math.floor(Date.now() / 1000) - 7200) // 2 hours ago
    .sign(privateKey);
}
```

### Creating a Local JWKS for Testing (instead of mocking createRemoteJWKSet)
```typescript
// Source: jose official docs (createLocalJWKSet + exportJWK)
import { createLocalJWKSet, exportJWK } from 'jose';

// Export the public key as JWK for local JWKS
const publicJwk = await exportJWK(publicKey);
publicJwk.kid = 'test-key-1';
publicJwk.alg = 'RS256';
publicJwk.use = 'sig';

// Create a local JWKS function (same interface as createRemoteJWKSet)
const localJwks = createLocalJWKSet({
  keys: [publicJwk],
});

// Use localJwks in place of the remote JWKS in tests
// This avoids network calls and enables deterministic testing
```

### Fastify Plugin Registration
```typescript
// Source: Fastify official docs
import Fastify from 'fastify';
import authPlugin from './auth/middleware.js';

const app = Fastify({ logger: true });

// Register auth plugin -- decorateRequest('user') and onRequest hook
// become available to all routes registered AFTER this
await app.register(authPlugin, {
  // Plugin options if needed (e.g., config injection for testing)
});
```

### Complete onRequest Hook with Error Handling
```typescript
// Composite pattern from jose docs + RFC 6750 + Fastify docs
fastify.addHook('onRequest', async (request, reply) => {
  const authHeader = request.headers.authorization;

  // No token at all
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply
      .code(401)
      .header('WWW-Authenticate', `Bearer resource_metadata="${resourceMetadataUrl}"`)
      .send({ error: 'invalid_token', error_description: 'missing bearer token' });
    return reply;
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: expectedIssuer,
      audience: expectedAudience,
      algorithms: ['RS256'],
    });

    // Scope validation (v1: any one of the three scopes suffices)
    const scopes = typeof payload.scp === 'string' ? payload.scp.split(' ') : [];
    const hasValidScope = scopes.some(s =>
      ['wikijs:read', 'wikijs:write', 'wikijs:admin'].includes(s)
    );

    if (!hasValidScope) {
      reply
        .code(403)
        .header(
          'WWW-Authenticate',
          `Bearer resource_metadata="${resourceMetadataUrl}", error="insufficient_scope", error_description="insufficient scope", scope="wikijs:read wikijs:write wikijs:admin"`
        )
        .send({
          error: 'insufficient_scope',
          error_description: 'token does not contain a required scope',
          required_scopes: ['wikijs:read', 'wikijs:write', 'wikijs:admin'],
        });
      return reply;
    }

    // Attach user identity to request
    request.user = {
      oid: payload.oid as string,
      preferred_username: payload.preferred_username as string | undefined,
      name: payload.name as string | undefined,
      email: payload.email as string | undefined,
    };
  } catch (err) {
    const mapped = mapJoseError(err);

    if (mapped.status === 503) {
      reply
        .code(503)
        .header('Retry-After', '5')
        .send({ error: mapped.error, error_description: mapped.description });
      return reply;
    }

    reply
      .code(mapped.status)
      .header(
        'WWW-Authenticate',
        `Bearer resource_metadata="${resourceMetadataUrl}", error="${mapped.error}", error_description="${mapped.description}"`
      )
      .send({ error: mapped.error, error_description: mapped.description });
    return reply;
  }
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| jsonwebtoken + jwks-rsa (CJS) | jose v6 (ESM, Web Crypto) | jose v5 (2023), v6 (2025) | Single dependency, native ESM, better performance, platform-agnostic |
| Manual JWKS fetch + cache | createRemoteJWKSet with built-in caching | jose v2+ | Automatic cooldown, key rotation, kid matching |
| Separate signature verify + claims check | jwtVerify does both atomically | jose design | Prevents confused deputy, simpler API |
| @fastify/jwt plugin | Direct jose integration | N/A | @fastify/jwt wraps jsonwebtoken (CJS); direct jose is more modern and flexible |
| jest for testing | vitest (native ESM) | 2023+ | No ESM transpilation issues, faster, compatible with jose v6 |

**Deprecated/outdated:**
- `jsonwebtoken` npm package: CJS-only, doesn't validate claims natively, requires `jwks-rsa` for JWKS. Still widely used but not recommended for new ESM projects.
- `@fastify/jwt`: Wraps jsonwebtoken internally. For Azure AD with jose, direct integration is cleaner.
- jose v4/v5: v4 is EOL. v5 still works but v6 is current for Node.js >= 20.19.

## Open Questions

1. **Phase 2 jose version**
   - What we know: Phase 2 context says "install jose dependency" without specifying version. jose v6 requires Node.js ^20.19.0, but package.json says >=18.0.0.
   - What's unclear: Whether Phase 2 will install v5 or v6.
   - Recommendation: Phase 4 should work with either. The API surface is identical. Recommend v6 and note the engine discrepancy.

2. **Phase 3 scope naming: dots vs colons**
   - What we know: Phase 4 CONTEXT.md says scopes are `wikijs:read`, `wikijs:write`, `wikijs:admin` (colons). Phase 3 CONTEXT.md says `wikijs.read`, `wikijs.write`, `wikijs.admin` (dots).
   - What's unclear: Which convention will Phase 3 actually implement.
   - Recommendation: The planner should ensure consistency. Colons are more standard for OAuth scope naming. The auth middleware should reference the same scope constants that Phase 3 defines.

3. **Config module interface**
   - What we know: Phase 2 will create `src/config.ts` with a Zod schema that exports validated config including JWKS function, issuer URL, and client ID.
   - What's unclear: Exact export names and types from the config module.
   - Recommendation: Auth middleware should import from config module. If config module doesn't exist yet when Phase 4 is implemented, define the expected interface and adapt during integration.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (planned in Phase 2) |
| Config file | None yet -- needs creation in Phase 2 or Wave 0 |
| Quick run command | `npx vitest run src/auth/` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | Extract Bearer token from Authorization header | unit | `npx vitest run src/auth/__tests__/middleware.test.ts -t "extracts bearer token"` | No -- Wave 0 |
| AUTH-02 | Validate JWT signature against JWKS | unit | `npx vitest run src/auth/__tests__/middleware.test.ts -t "validates signature"` | No -- Wave 0 |
| AUTH-03 | Validate audience claim matches AZURE_CLIENT_ID | unit | `npx vitest run src/auth/__tests__/middleware.test.ts -t "validates audience"` | No -- Wave 0 |
| AUTH-04 | Validate issuer claim matches Azure AD v2.0 format | unit | `npx vitest run src/auth/__tests__/middleware.test.ts -t "validates issuer"` | No -- Wave 0 |
| AUTH-05 | Validate exp and nbf claims | unit | `npx vitest run src/auth/__tests__/middleware.test.ts -t "expired token"` | No -- Wave 0 |
| AUTH-06 | 401 with WWW-Authenticate + resource_metadata for invalid tokens | unit | `npx vitest run src/auth/__tests__/middleware.test.ts -t "returns 401"` | No -- Wave 0 |
| AUTH-07 | 403 with insufficient_scope for missing scopes | unit | `npx vitest run src/auth/__tests__/middleware.test.ts -t "returns 403"` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/auth/`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `vitest.config.ts` -- if not created by Phase 2
- [ ] `src/auth/__tests__/middleware.test.ts` -- covers AUTH-01 through AUTH-07
- [ ] `src/auth/__tests__/helpers.ts` -- shared test utilities (generateKeyPair, createTestToken, createLocalJWKSet)
- [ ] `src/auth/__tests__/errors.test.ts` -- covers jose error to RFC 6750 mapping

## Sources

### Primary (HIGH confidence)
- [jose official docs - jwtVerify](https://github.com/panva/jose/blob/main/docs/jwt/verify/functions/jwtVerify.md) - function signature, options, return type
- [jose official docs - createRemoteJWKSet](https://github.com/panva/jose/blob/main/docs/jwks/remote/functions/createRemoteJWKSet.md) - JWKS fetching, caching, options
- [jose official docs - SignJWT](https://github.com/panva/jose/blob/main/docs/jwt/sign/classes/SignJWT.md) - test token creation API
- [jose official docs - error classes](https://github.com/panva/jose/blob/main/docs/util/errors/classes/JOSEError.md) - JWTExpired, JWTClaimValidationFailed, JWSSignatureVerificationFailed, JWKSTimeout, JWKSNoMatchingKey
- [jose GitHub repository](https://github.com/panva/jose) - v6.2.2, ESM-only, Node.js ^20.19.0 || ^22.12.0 || >= 23.0.0
- [Fastify Decorators docs](https://fastify.dev/docs/latest/Reference/Decorators/) - decorateRequest null pattern, reference type warning
- [Fastify Hooks docs](https://fastify.dev/docs/latest/Reference/Hooks/) - onRequest lifecycle, async reply.send pattern
- [Fastify TypeScript docs](https://fastify.dev/docs/latest/Reference/TypeScript/) - declaration merging for request augmentation
- [RFC 6750](https://www.rfc-editor.org/rfc/rfc6750.html) - Bearer token error response format, WWW-Authenticate parameters
- [RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728) - resource_metadata parameter in WWW-Authenticate

### Secondary (MEDIUM confidence)
- [Azure AD OIDC metadata](https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc) - JWKS URI format: `https://login.microsoftonline.com/{tenant}/discovery/v2.0/keys`
- [Azure AD issuer format](https://learn.microsoft.com/en-us/answers/questions/1163810/where-can-i-find-the-jwks-uri-for-azure-ad) - v2.0 issuer: `https://login.microsoftonline.com/{tenant}/v2.0`
- [fastify-plugin npm](https://www.npmjs.com/package/fastify-plugin) - encapsulation breaking, plugin metadata

### Tertiary (LOW confidence)
- None -- all findings verified with primary or secondary sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - jose v6 API verified from official GitHub docs; Fastify patterns verified from official docs
- Architecture: HIGH - Fastify plugin + hook pattern is well-documented official pattern; jose error types verified from source
- Pitfalls: HIGH - onRequest vs preHandler documented in Fastify lifecycle; scp claim format documented by Microsoft; decorateRequest reference type warning from official Fastify docs

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable libraries, well-established patterns)
