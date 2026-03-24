# Phase 5: Route Protection and Observability - Research

**Researched:** 2026-03-24
**Domain:** Fastify route-scoped auth hooks, pino structured logging, RFC 6750 error responses, correlation IDs
**Confidence:** HIGH

## Summary

This phase wires the Phase 4 JWT authentication middleware to specific Fastify routes using plugin-scoped hooks, adds structured request logging via Fastify's built-in pino integration, generates correlation IDs for every request, and maps jose validation errors to RFC 6750 error responses. The technical foundation is well-established: Fastify's encapsulated plugin model provides a clean pattern for applying auth hooks to only the MCP routes while leaving health and discovery endpoints open. Pino's child logger mechanism and Fastify's `childLoggerFactory` option allow injecting correlation IDs and user identity into every log line without manual plumbing.

The key integration challenge is coordinating three concerns that all touch the request lifecycle: (1) correlation ID generation in an early `onRequest` hook, (2) auth validation via a scoped `preHandler` hook on protected routes, and (3) user identity enrichment of the logger after auth succeeds. The Fastify hook execution order (`onRequest` -> `preParsing` -> `preValidation` -> `preHandler` -> handler) makes this natural: correlation IDs attach at `onRequest` (before body parsing), auth runs at `preHandler` (after parsing, which is needed for POST /mcp), and user identity is added to the logger within the auth hook itself.

RFC 6750 defines three error codes (`invalid_request`, `invalid_token`, `insufficient_scope`) with specific HTTP status code mappings (400, 401, 403). The jose library throws typed errors (`JWTExpired`, `JWTClaimValidationFailed`, `JWSSignatureVerificationFailed`, `JWKSNoMatchingKey`, `JWKSTimeout`) that map cleanly to these RFC 6750 codes. The Phase 4 CONTEXT.md specifies that JWKS fetch failures should return 503, not 401 -- this is a critical distinction that the error mapping must handle.

**Primary recommendation:** Use Fastify plugin encapsulation to scope auth hooks to MCP routes, Fastify's `genReqId` option for correlation ID generation with X-Request-ID header acceptance, and `childLoggerFactory` for injecting correlation IDs and user identity into all pino log output.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Use Fastify's built-in pino logger for structured JSON output
- Add custom fields to pino log context: userId (oid), username (preferred_username), correlationId, toolName, duration
- Log all requests, not just MCP routes -- authenticated requests include user identity fields, unauthenticated ones omit them
- Log tool name and execution duration for each MCP tool invocation
- Generate UUID v4 correlation IDs (uuid package already in deps)
- Accept client-provided X-Request-ID header if present; validate format, otherwise generate server-side
- Return correlation ID as X-Request-ID response header on every response
- Include correlation ID on all responses including 404s -- use Fastify onRequest hook for global coverage
- Include correlation ID in SSE event streams (as SSE id field or initial comment)
- Descriptive error_description in RFC 6750 WWW-Authenticate responses: "Token expired", "Invalid audience", "Signature verification failed" -- specific reason without leaking raw jose internals
- Include correlation_id field in error response JSON bodies alongside RFC 6750 error and error_description fields
- Log auth failures (401/403) at warn level, not error level -- auth failures are expected operational events
- Log full raw jose validation error at debug level for operator diagnostics -- client never sees it
- POST /mcp: requires valid Bearer token (PROT-01)
- GET /mcp/events: requires valid Bearer token (PROT-02)
- GET /health: unauthenticated (PROT-03)
- GET /.well-known/oauth-protected-resource: unauthenticated (PROT-04)
- GET /: unauthenticated -- server info endpoint stays open for connectivity checks
- GET / response includes auth hint: auth_required field and link to protected_resource_metadata URL

### Claude's Discretion
- Fastify hook strategy (onRequest vs preHandler vs plugin scoping) for applying auth middleware
- Exact pino serializer configuration for custom fields
- X-Request-ID validation rules for client-provided values
- SSE correlation ID delivery mechanism (id field vs comment)
- Error response JSON structure beyond the three required fields

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PROT-01 | POST /mcp requires valid Bearer token | Fastify plugin encapsulation scopes auth preHandler hook to MCP routes only; Phase 4 middleware called within the hook |
| PROT-02 | GET /mcp/events requires valid Bearer token | Same scoped plugin registers hook for both POST /mcp and GET /mcp/events routes |
| PROT-03 | GET /health remains unauthenticated | Defined outside the auth-scoped plugin; Fastify encapsulation ensures auth hook does not apply |
| PROT-04 | GET /.well-known/oauth-protected-resource remains unauthenticated | Defined outside the auth-scoped plugin; same encapsulation guarantee |
| OBSV-01 | Validated JWT user identity (oid/preferred_username) logged with each MCP tool invocation | Auth hook enriches request.log with user identity via child logger; tool handlers use request.log which inherits bindings |
| OBSV-02 | Unique correlation ID generated per request and included in logs and error responses | Fastify genReqId option generates UUID v4; requestIdHeader accepts client X-Request-ID; onRequest hook sets X-Request-ID response header; error responses include correlation_id field |
| OBSV-03 | jose validation errors mapped to structured RFC 6750 error responses (error, error_description) | jose error instanceof checks map to RFC 6750 error codes: JWTExpired->invalid_token, JWTClaimValidationFailed->invalid_token, JWSSignatureVerificationFailed->invalid_token, JWKSTimeout->503 |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastify | ^4.27.2 | HTTP framework with built-in pino logger and plugin encapsulation | Already in project; provides hooks, decorators, logger, and plugin scoping needed for all phase requirements |
| pino | (bundled with fastify) | Structured JSON logging | Fastify's built-in logger; no separate install needed; child logger bindings provide request-scoped context |
| uuid | ^9.0.1 | UUID v4 generation for correlation IDs | Already in project dependencies; user locked this decision |
| jose | (from Phase 4) | JWT validation error types for error mapping | Phase 4 dependency; error classes used for instanceof checks in error mapping |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | (from Phase 2/3) | Test framework | Integration tests for route protection and error responses using Fastify inject() |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| uuid for correlation IDs | crypto.randomUUID() | crypto.randomUUID() is built-in Node.js 19+, but uuid is already in deps and user locked this decision |
| Plugin scoping for auth | Route-level preHandler | Route-level hooks work but require repeating the hook on every protected route; plugin scoping is DRYer |
| genReqId for correlation IDs | onRequest hook with manual assignment | genReqId is the Fastify-native approach, integrates directly with pino reqId; onRequest would require manual log rebinding |

**Installation:**
```bash
# No new dependencies needed -- all libraries already in project from prior phases
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  server.ts              # Fastify instance creation, global hooks (correlation ID), plugin registration
  auth-middleware.ts      # Phase 4: JWT validation function, AuthenticatedUser type
  auth-errors.ts         # NEW: jose error -> RFC 6750 error mapping
  routes/
    mcp-routes.ts        # NEW: Protected MCP routes (POST /mcp, GET /mcp/events) in encapsulated plugin
    public-routes.ts     # NEW or inline: Unprotected routes (GET /, GET /health, GET /.well-known/...)
  logging.ts             # NEW: Pino configuration, childLoggerFactory, custom serializers
```

### Pattern 1: Plugin Encapsulation for Route Protection

**What:** Register protected routes inside a Fastify plugin with a scoped auth `preHandler` hook. Unprotected routes stay outside the plugin scope.
**When to use:** For PROT-01 through PROT-04 -- applying auth to MCP routes while keeping health/discovery open.

```typescript
// Source: Fastify Plugins Guide (https://fastify.dev/docs/latest/Guides/Plugins-Guide/)
import type { FastifyInstance } from "fastify";

// Protected routes plugin -- auth hook applies ONLY within this scope
async function protectedRoutes(fastify: FastifyInstance) {
  // This hook runs only for routes registered in THIS plugin
  fastify.addHook("preHandler", async (request, reply) => {
    await validateBearerToken(request, reply);
    // If validation fails, reply.send() is called and hook chain stops
  });

  fastify.post("/mcp", async (request, reply) => {
    // MCP JSON-RPC handler -- request.user is populated by auth hook
  });

  fastify.get("/mcp/events", async (request, reply) => {
    // SSE endpoint -- also protected by the scoped auth hook
  });
}

// Register protected routes -- encapsulated scope
server.register(protectedRoutes);

// Unprotected routes -- defined at root scope, auth hook does NOT apply
server.get("/health", async () => ({ status: "ok" }));
server.get("/.well-known/oauth-protected-resource", async () => ({ /* metadata */ }));
server.get("/", async () => ({ /* server info */ }));
```

**Critical detail:** Fastify's `register` creates an encapsulated context. Hooks added inside `register` callbacks do NOT leak to the parent or sibling contexts. This is the foundation of route protection scoping.

### Pattern 2: Correlation ID via genReqId + X-Request-ID Header

**What:** Use Fastify's built-in `genReqId` option to generate UUID v4 correlation IDs, accepting client-provided X-Request-ID when valid.
**When to use:** For OBSV-02 -- correlation IDs in logs and responses.

```typescript
// Source: Fastify Server docs (https://fastify.dev/docs/latest/Reference/Server/)
import { v4 as uuidv4 } from "uuid";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const server = fastify({
  logger: true,
  // Accept client X-Request-ID or generate server-side UUID v4
  requestIdHeader: "x-request-id",
  requestIdLogLabel: "correlationId",
  genReqId: (req) => {
    // Fastify checks requestIdHeader first; if present, genReqId is NOT called
    // genReqId is only called when header is absent or empty
    return uuidv4();
  },
});

// Global onRequest hook to set response header and validate client-provided IDs
server.addHook("onRequest", async (request, reply) => {
  // Validate client-provided ID format (genReqId already ran or header was accepted)
  const id = request.id;
  // If client provided a non-UUID value, requestIdHeader accepted it raw.
  // We need to validate and regenerate if invalid.
  // See Pitfall 2 below for the validation approach.
  reply.header("x-request-id", id);
});
```

**Important note on requestIdHeader behavior:** When `requestIdHeader` is set and the header is present in the request, Fastify uses the header value directly and does NOT call `genReqId`. This means client-provided IDs are accepted without validation by default. Validation must be done separately (see Pitfall 2).

### Pattern 3: User Identity in Log Context via Child Logger

**What:** After auth validation succeeds, create a child logger with user identity bindings so all subsequent logs for this request include the user.
**When to use:** For OBSV-01 -- user identity in tool invocation logs.

```typescript
// Source: Fastify Server docs (childLoggerFactory) + pino child logger pattern
// In the auth preHandler hook, after successful validation:
async function validateBearerToken(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = await verifyToken(request); // Phase 4 middleware
    request.user = user;
    // Enrich request logger with user identity
    request.log = request.log.child({
      userId: user.oid,
      username: user.preferred_username,
    });
  } catch (error) {
    // Map to RFC 6750 and reply
    const rfc6750Error = mapJoseErrorToRfc6750(error);
    request.log.warn({ error: rfc6750Error.error }, "Auth rejected");
    request.log.debug({ rawError: String(error) }, "Auth rejection detail");
    reply
      .status(rfc6750Error.statusCode)
      .header("www-authenticate", rfc6750Error.wwwAuthenticate)
      .send({
        error: rfc6750Error.error,
        error_description: rfc6750Error.errorDescription,
        correlation_id: request.id,
      });
    return reply;
  }
}
```

### Pattern 4: jose Error to RFC 6750 Mapping

**What:** Map jose error types to RFC 6750 error codes, descriptions, and HTTP status codes.
**When to use:** For OBSV-03 -- structured error responses.

```typescript
// Source: RFC 6750 (https://www.rfc-editor.org/rfc/rfc6750.html)
//         jose error docs (https://github.com/panva/jose/blob/main/docs/util/errors/README.md)
import * as jose from "jose";

interface Rfc6750Error {
  statusCode: number;
  error: string;
  errorDescription: string;
  wwwAuthenticate: string;
}

function mapJoseErrorToRfc6750(err: unknown, resourceMetadataUrl: string): Rfc6750Error {
  const realm = "mcp";

  if (err instanceof jose.errors.JWTExpired) {
    return {
      statusCode: 401,
      error: "invalid_token",
      errorDescription: "Token expired",
      wwwAuthenticate: `Bearer realm="${realm}", error="invalid_token", error_description="Token expired", resource_metadata="${resourceMetadataUrl}"`,
    };
  }

  if (err instanceof jose.errors.JWTClaimValidationFailed) {
    const desc = err.claim === "aud"
      ? "Invalid audience"
      : err.claim === "iss"
        ? "Invalid issuer"
        : `Claim validation failed: ${err.claim}`;
    return {
      statusCode: 401,
      error: "invalid_token",
      errorDescription: desc,
      wwwAuthenticate: `Bearer realm="${realm}", error="invalid_token", error_description="${desc}", resource_metadata="${resourceMetadataUrl}"`,
    };
  }

  if (err instanceof jose.errors.JWSSignatureVerificationFailed) {
    return {
      statusCode: 401,
      error: "invalid_token",
      errorDescription: "Signature verification failed",
      wwwAuthenticate: `Bearer realm="${realm}", error="invalid_token", error_description="Signature verification failed", resource_metadata="${resourceMetadataUrl}"`,
    };
  }

  if (err instanceof jose.errors.JWKSNoMatchingKey) {
    return {
      statusCode: 401,
      error: "invalid_token",
      errorDescription: "No matching signing key",
      wwwAuthenticate: `Bearer realm="${realm}", error="invalid_token", error_description="No matching signing key", resource_metadata="${resourceMetadataUrl}"`,
    };
  }

  if (err instanceof jose.errors.JWKSTimeout) {
    // Phase 4 CONTEXT.md: JWKS fetch failure -> 503, not 401
    return {
      statusCode: 503,
      error: "temporarily_unavailable",
      errorDescription: "Authorization server unreachable",
      wwwAuthenticate: `Bearer realm="${realm}", error="temporarily_unavailable", error_description="Authorization server unreachable"`,
    };
  }

  // Fallback: no token or unparseable token
  return {
    statusCode: 401,
    error: "invalid_token",
    errorDescription: "Invalid or malformed token",
    wwwAuthenticate: `Bearer realm="${realm}", error="invalid_token", error_description="Invalid or malformed token", resource_metadata="${resourceMetadataUrl}"`,
  };
}
```

### Pattern 5: Tool Invocation Logging with Duration

**What:** Log tool name and execution duration for each MCP tool invocation.
**When to use:** For OBSV-01 -- user-associated tool invocation tracing.

```typescript
// Wrap tool handler to add timing and tool-name logging
// Applied during tool registration in mcp-tools.ts
function wrapToolHandler(
  toolName: string,
  handler: (args: any, request: FastifyRequest) => Promise<any>
) {
  return async (args: any, request: FastifyRequest) => {
    const start = performance.now();
    try {
      const result = await handler(args, request);
      const duration = Math.round(performance.now() - start);
      request.log.info({ toolName, duration }, `Tool invocation: ${toolName}`);
      return result;
    } catch (error) {
      const duration = Math.round(performance.now() - start);
      request.log.error({ toolName, duration, error: String(error) }, `Tool error: ${toolName}`);
      throw error;
    }
  };
}
```

**Note:** The exact mechanism for passing the Fastify request context into MCP tool handlers depends on how Phase 1 wired the StreamableHTTPServerTransport. If tools don't have direct access to the Fastify request, the correlation ID and user identity may need to be injected via the MCP server context or a request-scoped store (e.g., AsyncLocalStorage). This is an integration point to resolve during planning.

### Anti-Patterns to Avoid
- **Global auth hook with route-level bypass:** Do NOT add auth as a global hook and then skip it for specific routes via `request.url` checks. This is fragile -- new routes default to protected, and the skip logic is easily broken. Use plugin scoping instead.
- **Logging user identity in serializers:** Do NOT try to inject user identity via pino serializers. Serializers transform existing log data; they cannot access request state. Use child logger bindings instead.
- **Correlation ID in onSend only:** Do NOT wait until `onSend` to set the X-Request-ID response header. If auth fails and the hook chain short-circuits via `reply.send()`, `onSend` may or may not fire depending on error handling. Set the header in `onRequest` to guarantee it appears on all responses.
- **Calling reply.send() without return reply:** In async Fastify hooks, calling `reply.send()` without `return reply` can cause the hook chain to continue executing. Always `return reply` after sending an error response from a hook.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Request ID generation | Custom counter or random string | Fastify `genReqId` + `requestIdHeader` | Integrates with pino reqId automatically; handles header acceptance |
| Structured logging | Custom JSON formatter | Fastify's built-in pino logger with child bindings | Pino handles serialization, child logger context, and output formatting |
| Auth hook scoping | Manual URL-checking guard | Fastify plugin encapsulation | Encapsulation is the framework's designed mechanism; URL checking is fragile |
| Error classification | String-matching jose error messages | jose `instanceof` checks on typed error classes | jose exports stable error classes with `code` properties; message text may change |
| Response header propagation | Manual header setting in each route | Fastify `onRequest` global hook | Single hook guarantees header on all responses including errors and 404s |

**Key insight:** Fastify provides first-class primitives for every concern in this phase. The implementation should compose framework features (plugin encapsulation, hook lifecycle, genReqId, child loggers) rather than building custom infrastructure.

## Common Pitfalls

### Pitfall 1: Auth Hook in Wrong Lifecycle Position
**What goes wrong:** Auth hook runs before body parsing in `onRequest`, so `request.body` is undefined. The auth function tries to read the body or downstream handlers fail because parsing hasn't happened.
**Why it happens:** `onRequest` fires before body parsing. `preHandler` fires after parsing.
**How to avoid:** Use `preHandler` for auth validation, not `onRequest`. The correlation ID hook should use `onRequest` (it doesn't need the body), but auth must be `preHandler`.
**Warning signs:** `request.body` is undefined in auth logic; validation errors about missing body.

### Pitfall 2: Client X-Request-ID Accepted Without Validation
**What goes wrong:** A malicious or buggy client sends `X-Request-ID: '; DROP TABLE logs; --` and it appears in logs, enabling log injection attacks.
**Why it happens:** Fastify's `requestIdHeader` option accepts the header value verbatim without any validation. The security warning in Fastify docs states: "Enabling this allows callers to set request IDs arbitrarily without validation."
**How to avoid:** Validate the client-provided ID in the `genReqId` function or an early hook. If the raw request header doesn't match UUID format (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`), discard it and generate a new UUID v4. The validation must happen in `genReqId` because `requestIdHeader` bypasses it. The solution is to NOT use `requestIdHeader` and instead manually check the header inside `genReqId`:

```typescript
genReqId: (req) => {
  const clientId = req.headers["x-request-id"];
  if (typeof clientId === "string" && UUID_REGEX.test(clientId)) {
    return clientId;
  }
  return uuidv4();
},
```

Set `requestIdHeader: false` to prevent Fastify from accepting the header automatically, and handle it entirely in `genReqId`.
**Warning signs:** Non-UUID values appearing in log correlationId fields; log entries containing unexpected characters.

### Pitfall 3: reply.send() in Async Hook Without Return
**What goes wrong:** Auth hook sends a 401 response, but the handler still executes and tries to send another response. Fastify throws "Reply was already sent."
**Why it happens:** In async Fastify hooks, `reply.send()` does NOT stop the hook chain by itself. You must `return reply` to signal Fastify that the response is complete.
**How to avoid:** Always `return reply` after `reply.send()` in async hooks:

```typescript
fastify.addHook("preHandler", async (request, reply) => {
  if (!isValid) {
    reply.status(401).send({ error: "invalid_token" });
    return reply; // CRITICAL: stops hook chain and handler execution
  }
});
```

**Warning signs:** "Reply was already sent" errors in logs; double response headers.

### Pitfall 4: Missing Correlation ID on Error Responses
**What goes wrong:** Auth failures or 404s return responses without the X-Request-ID header, making them untraceable.
**Why it happens:** If the correlation ID header is set inside the route handler or a late hook, error responses that short-circuit before reaching the handler will miss it.
**How to avoid:** Set the X-Request-ID response header in a global `onRequest` hook, which runs before any other hooks. This guarantees the header is present even if auth fails, the route doesn't exist (404), or an unhandled error occurs.
**Warning signs:** Client receives responses without X-Request-ID; 401/404 responses untraceable.

### Pitfall 5: RFC 6750 WWW-Authenticate Quoting Errors
**What goes wrong:** The WWW-Authenticate header value has incorrect quoting, causing MCP clients to fail to parse it.
**Why it happens:** RFC 6750 requires specific quoting rules for auth-param values. The `error_description` value must be a quoted-string and must not contain characters outside `%x20-21 / %x23-5B / %x5D-7E` (notably, no backslash or double-quote characters).
**How to avoid:** Use simple, short error descriptions without special characters. Keep descriptions like "Token expired", "Invalid audience", "Signature verification failed" -- these are all safe ASCII strings. Never include raw error messages from jose in the WWW-Authenticate header.
**Warning signs:** MCP clients failing to parse 401 responses; malformed WWW-Authenticate header in browser devtools.

### Pitfall 6: Tool Invocation Logging Without Request Context
**What goes wrong:** Tool invocation logs don't include user identity or correlation ID because the MCP SDK tool handler doesn't have access to the Fastify request object.
**Why it happens:** In the Phase 1 pattern, `StreamableHTTPServerTransport` dispatches tool calls internally. The MCP SDK tool handlers receive the tool arguments but not the Fastify request. The request context is lost when crossing the SDK boundary.
**How to avoid:** Two approaches: (a) Use Node.js `AsyncLocalStorage` to propagate request context through the async call chain, or (b) set up the logger in the Fastify route handler before calling `transport.handleRequest()` and pass it through. AsyncLocalStorage is the cleaner approach since it doesn't require modifying the SDK's internal dispatch. Create the AsyncLocalStorage store in the Fastify `preHandler` hook with correlation ID and user identity, then read it in tool handlers.
**Warning signs:** Tool invocation logs missing userId, username, or correlationId fields.

## Code Examples

### Complete Correlation ID Setup

```typescript
// Source: Fastify Server docs genReqId + onRequest hook pattern
import { v4 as uuidv4 } from "uuid";
import fastify from "fastify";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const server = fastify({
  logger: {
    level: "info",
    // requestIdLogLabel controls the key name in log output
  },
  requestIdHeader: false, // We handle X-Request-ID manually in genReqId
  requestIdLogLabel: "correlationId",
  genReqId: (req) => {
    const clientId = req.headers["x-request-id"];
    if (typeof clientId === "string" && UUID_REGEX.test(clientId)) {
      return clientId;
    }
    return uuidv4();
  },
});

// Global hook: set response header on EVERY request (including 404s, auth failures)
server.addHook("onRequest", async (request, reply) => {
  reply.header("x-request-id", request.id);
});
```

### RFC 6750 Error Response (Missing Token)

```typescript
// Source: RFC 6750 Section 3 (https://www.rfc-editor.org/rfc/rfc6750.html#section-3)
// When no Authorization header is present at all:
reply
  .status(401)
  .header(
    "www-authenticate",
    `Bearer realm="mcp", resource_metadata="${resourceMetadataUrl}"`
  )
  .send({
    error: "invalid_request",
    error_description: "No access token provided",
    correlation_id: request.id,
  });
```

### RFC 6750 Error Response (Insufficient Scope)

```typescript
// Source: RFC 6750 Section 3.1 + Phase 4 CONTEXT.md decision
// When token is valid but lacks required scopes:
reply
  .status(403)
  .header(
    "www-authenticate",
    `Bearer realm="mcp", error="insufficient_scope", error_description="Required scope: wikijs.read wikijs.write wikijs.admin", scope="wikijs.read wikijs.write wikijs.admin", resource_metadata="${resourceMetadataUrl}"`
  )
  .send({
    error: "insufficient_scope",
    error_description: "Required scope: wikijs.read wikijs.write wikijs.admin",
    correlation_id: request.id,
  });
```

### Server Info Endpoint with Auth Hint

```typescript
// Per CONTEXT.md: GET / includes auth_required and protected_resource_metadata URL
server.get("/", async (request) => {
  return {
    name: "wikijs-mcp",
    version: "2.0.0",
    auth_required: true,
    protected_resource_metadata: `${config.mcpResourceUrl}/.well-known/oauth-protected-resource`,
    endpoints: {
      "GET /": "Server info",
      "GET /health": "Health check (unauthenticated)",
      "POST /mcp": "MCP JSON-RPC endpoint (requires Bearer token)",
      "GET /mcp/events": "MCP SSE events (requires Bearer token)",
      "GET /.well-known/oauth-protected-resource": "RFC 9728 discovery (unauthenticated)",
    },
  };
});
```

### AsyncLocalStorage for Request Context in Tool Handlers

```typescript
// Pattern for propagating request context through MCP SDK boundary
import { AsyncLocalStorage } from "node:async_hooks";

interface RequestContext {
  correlationId: string;
  userId?: string;
  username?: string;
  log: pino.Logger;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

// In the Fastify route handler (POST /mcp), before calling transport.handleRequest():
fastify.post("/mcp", async (request, reply) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  const ctx: RequestContext = {
    correlationId: request.id,
    userId: request.user?.oid,
    username: request.user?.preferred_username,
    log: request.log,
  };

  // Run the entire transport handling within the context
  await requestContext.run(ctx, async () => {
    reply.raw.on("close", async () => { await transport.close(); });
    await mcpServer.connect(transport);
    await transport.handleRequest(request.raw, reply.raw, request.body);
  });
});

// In tool handlers, access the context:
mcpServer.registerTool("search_pages", { /* schema */ }, async ({ query }) => {
  const ctx = requestContext.getStore();
  const start = performance.now();
  try {
    const result = await wikiJsApi.searchPages(query);
    const duration = Math.round(performance.now() - start);
    ctx?.log.info({ toolName: "search_pages", duration }, "Tool invocation");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    const duration = Math.round(performance.now() - start);
    ctx?.log.error({ toolName: "search_pages", duration }, "Tool error");
    return { content: [{ type: "text", text: `Error: ${String(error)}` }], isError: true };
  }
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual route-level auth checks | Fastify plugin encapsulation with scoped hooks | Fastify 3+ (2020) | Auth logic defined once, applies to all routes in scope |
| Custom request IDs | Fastify genReqId + requestIdLogLabel | Fastify 3+ | Built-in pino integration, no manual plumbing |
| console.log for logging | Pino structured JSON via Fastify logger | Fastify 1+ | Machine-parseable logs, child logger context propagation |
| Global middleware with URL excludes | Plugin-scoped hooks | Fastify encapsulation model | Type-safe, framework-native, impossible to miss new routes |

**Deprecated/outdated:**
- `requestIdHeader: "request-id"` with automatic acceptance: Insecure by default (no validation); use `requestIdHeader: false` + manual validation in `genReqId`
- Express-style `app.use()` middleware: Fastify uses hooks, not middleware. The `@fastify/middie` adapter exists but should not be used for auth

## Open Questions

1. **MCP SDK tool handler request context propagation**
   - What we know: The StreamableHTTPServerTransport dispatches tool calls internally. Tool handlers registered with `mcpServer.registerTool()` receive tool arguments but NOT the Fastify request object.
   - What's unclear: Whether AsyncLocalStorage context survives through the SDK's internal async dispatch chain. The SDK uses async/await internally which should preserve AsyncLocalStorage context, but this needs runtime verification.
   - Recommendation: Implement AsyncLocalStorage as the primary approach. If context is lost (e.g., due to SDK-internal setTimeout or detached promises), fall back to a module-level "current request" store set before `transport.handleRequest()` and cleared after. **This is the highest-risk integration point and should be validated early in Wave 1.**

2. **SSE correlation ID delivery mechanism**
   - What we know: CONTEXT.md says to include correlation ID in SSE event streams. SSE spec supports `id:` field and `:<comment>` lines.
   - What's unclear: Whether MCP clients parse SSE `id` fields for their own purposes (reconnection). Overwriting the SSE id with the correlation ID could break reconnection.
   - Recommendation: Use an SSE comment line (`:<correlationId>`) as the delivery mechanism. SSE comments are ignored by standard EventSource parsers but visible in raw logs. This avoids interfering with SSE reconnection semantics. If the MCP SDK manages SSE framing (which it does via StreamableHTTPServerTransport), injecting a comment may require writing to `reply.raw` before the transport takes over.

3. **Existing console.log/console.error cleanup**
   - What we know: server.ts currently uses both `console.log()` (Russian-language messages) and `server.log.error()`. Phase 2 CONTEXT.md decided to convert Russian console.log messages to English. Phase 5 should consolidate all logging to pino.
   - What's unclear: Whether console.log cleanup is Phase 2's responsibility or Phase 5's.
   - Recommendation: Phase 5 should ensure no `console.log` or `console.error` calls remain in any modified files. If Phase 2 hasn't cleaned them up yet, Phase 5 addresses them as part of the observability consolidation.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (established in Phase 2/3) |
| Config file | vitest.config.ts (created in Phase 2/3) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROT-01 | POST /mcp rejects requests without valid Bearer token (401) | integration | `npx vitest run tests/route-protection.test.ts -t "POST /mcp requires auth"` | No -- Wave 0 |
| PROT-02 | GET /mcp/events rejects requests without valid Bearer token (401) | integration | `npx vitest run tests/route-protection.test.ts -t "GET /mcp/events requires auth"` | No -- Wave 0 |
| PROT-03 | GET /health accessible without token | integration | `npx vitest run tests/route-protection.test.ts -t "GET /health no auth"` | No -- Wave 0 |
| PROT-04 | GET /.well-known/oauth-protected-resource accessible without token | integration | `npx vitest run tests/route-protection.test.ts -t "discovery no auth"` | No -- Wave 0 |
| OBSV-01 | Tool invocation logs include user identity (oid/preferred_username) | integration | `npx vitest run tests/observability.test.ts -t "tool logs user identity"` | No -- Wave 0 |
| OBSV-02 | Unique correlation ID in logs and error response bodies | integration | `npx vitest run tests/observability.test.ts -t "correlation ID"` | No -- Wave 0 |
| OBSV-03 | jose errors produce RFC 6750 error responses | unit | `npx vitest run tests/auth-errors.test.ts` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose` (quick run, all tests)
- **Per wave merge:** `npx vitest run` (full suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/route-protection.test.ts` -- covers PROT-01, PROT-02, PROT-03, PROT-04 using Fastify inject() with mocked auth middleware
- [ ] `tests/observability.test.ts` -- covers OBSV-01, OBSV-02 using Fastify inject() with pino destination capture
- [ ] `tests/auth-errors.test.ts` -- covers OBSV-03 unit testing jose error -> RFC 6750 mapping function
- [ ] Test helpers: mock JWT tokens, mock jose errors, pino log capture utilities

## Sources

### Primary (HIGH confidence)
- [Fastify Hooks documentation](https://fastify.dev/docs/latest/Reference/Hooks/) -- hook lifecycle order, scoping, early abort via reply.send()
- [Fastify Server documentation](https://fastify.dev/docs/latest/Reference/Server/) -- genReqId, requestIdHeader, requestIdLogLabel, childLoggerFactory options
- [Fastify Plugins Guide](https://fastify.dev/docs/latest/Guides/Plugins-Guide/) -- plugin encapsulation for route-scoped hooks
- [Fastify Logging documentation](https://fastify.dev/docs/latest/Reference/Logging/) -- pino integration, serializers, request.log vs fastify.log
- [Fastify Decorators documentation](https://fastify.dev/docs/latest/Reference/Decorators/) -- decorateRequest for request.user
- [RFC 6750: Bearer Token Usage](https://www.rfc-editor.org/rfc/rfc6750.html) -- WWW-Authenticate header format, error codes (invalid_request, invalid_token, insufficient_scope), HTTP status mappings
- [jose error classes documentation](https://github.com/panva/jose/blob/main/docs/util/errors/README.md) -- JWTExpired, JWTClaimValidationFailed, JWSSignatureVerificationFailed, JWKSTimeout error types and codes
- [jose error type checking pattern](https://github.com/panva/jose/discussions/519) -- instanceof-based error handling

### Secondary (MEDIUM confidence)
- [X-Request-ID header best practices](https://http.dev/x-request-id) -- UUID v4 format, validation regex, propagation patterns
- [Fastify preHandler vs onRequest discussion](https://github.com/fastify/fastify/discussions/3772) -- when to use each hook type
- [Vitest Fastify testing patterns](https://dev.to/robertoumbelino/testing-your-api-with-fastify-and-vitest-a-step-by-step-guide-2840) -- inject() based integration testing

### Tertiary (LOW confidence)
- AsyncLocalStorage propagation through MCP SDK internal dispatch -- not verified with the specific SDK version; needs runtime testing

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in project from prior phases; no new dependencies
- Architecture (route protection): HIGH -- Fastify plugin encapsulation is the documented, canonical pattern; verified via official docs
- Architecture (correlation IDs): HIGH -- genReqId + requestIdLogLabel are first-class Fastify features
- Architecture (tool logging with context): MEDIUM -- AsyncLocalStorage approach is standard Node.js but not verified through MCP SDK async dispatch chain
- Pitfalls: HIGH -- identified from official Fastify docs warnings and jose error class documentation
- RFC 6750 mapping: HIGH -- verified against RFC 6750 spec text and jose error class properties

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (Fastify v4 is stable; RFC 6750 is a final standard; jose error types are stable)
