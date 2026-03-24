# Phase 2: OAuth Configuration - Research

**Researched:** 2026-03-24
**Domain:** Environment variable validation, Azure AD endpoint derivation, JWKS initialization, test framework setup
**Confidence:** HIGH

## Summary

This phase extracts configuration loading from inline code in `server.ts` into a dedicated `src/config.ts` module, adds three new Azure AD environment variables (`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `MCP_RESOURCE_URL`), validates all environment variables using Zod schemas with format checks, initializes a jose `createRemoteJWKSet` for later use in JWT validation, and establishes Vitest as the project's test framework.

The existing codebase has `zod ^3.25.17` already installed (Zod v3 API -- method chaining with `z.string().uuid()`, `z.string().url()`, `.transform()`). The project uses `dotenv` for `.env` file loading. The `jose` library (v6.x, current 6.2.2) provides `createRemoteJWKSet` which lazily fetches JWKS keys on first use -- no network call at init time. Vitest v4.1.1 (current) provides native ESM and TypeScript support, ideal for this `"type": "module"` project.

Azure AD v2.0 endpoints follow deterministic URL patterns derived from the tenant ID: the JWKS URI is `https://login.microsoftonline.com/{tenant}/discovery/v2.0/keys` and the issuer is `https://login.microsoftonline.com/{tenant}/v2.0`. These are computed values derivable from `AZURE_TENANT_ID` alone, making `.transform()` the correct Zod pattern for deriving them.

**Primary recommendation:** Create `src/config.ts` with a Zod object schema validating all env vars (including format checks for UUIDs and URLs), use `.transform()` to derive JWKS URI and issuer URL, export a typed config object and a `jwks` function from `createRemoteJWKSet`. Add Vitest with a minimal `vitest.config.ts` and write config validation smoke tests.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Extract config into separate `src/config.ts` module (not inline in server.ts)
- Use Zod schema for runtime validation of all environment variables (Zod already a dependency)
- Zod `.transform()` derives computed values (JWKS URI, issuer URL) from raw env vars -- single source of truth
- Validate ALL env vars (including existing WIKIJS_BASE_URL, WIKIJS_TOKEN), not just new OAuth vars
- OAuth is always required -- no dev mode bypass, no OAUTH_ENABLED flag
- AZURE_TENANT_ID: validate as UUID/GUID format (regex or Zod)
- AZURE_CLIENT_ID: validate as UUID/GUID format (same check)
- MCP_RESOURCE_URL: validate as proper URL format (Zod .url() or new URL())
- WIKIJS_BASE_URL: validate as URL format
- WIKIJS_TOKEN: validate as non-empty string
- Call jose `createRemoteJWKSet` at config load time (lazy internally -- no network call until first use)
- Export JWKS function from the config module so Phase 4 auth middleware can import it directly
- No startup pre-warming -- JWKS fetches keys on first auth request
- Grouped summary: collect all validation errors, print as categorized list (missing vars, invalid values), then exit
- Reference example.env in error message: "See example.env for required variables."
- Convert existing Russian-language console.log messages in server.ts to English
- On successful start, log masked config summary (partially redacted IDs and tokens)
- Add Vitest as test framework (native ESM, TypeScript out of the box)
- Include config smoke test: valid parse, missing var rejection, bad format rejection
- Establishes test pattern for subsequent phases

### Claude's Discretion
- Exact Zod schema structure and field naming
- Config type interface design
- Masking implementation details (how many chars to show)
- Test file organization

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CONF-01 | Server reads AZURE_TENANT_ID from environment variables | Zod v3 schema with `z.string().uuid()` validates UUID format; dotenv already loads .env; `.transform()` derives JWKS URI and issuer URL from tenant ID |
| CONF-02 | Server reads AZURE_CLIENT_ID from environment variables | Zod v3 schema with `z.string().uuid()` validates UUID format; value stored in config for Phase 4 audience claim validation |
| CONF-03 | Server reads MCP_RESOURCE_URL from environment variables | Zod v3 schema with `z.string().url()` validates URL format; value stored in config for Phase 3 discovery endpoint |
| CONF-04 | Server fails fast at startup with clear error if any OAuth env var is missing | Zod `.safeParse()` collects all errors at once; format/flatten errors into grouped output; `process.exit(1)` after printing |
| CONF-05 | example.env updated with all new environment variables | Add AZURE_TENANT_ID, AZURE_CLIENT_ID, MCP_RESOURCE_URL entries with descriptions to existing example.env |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | ^3.25.17 | Config schema validation with format checks and transforms | Already in project; v3 API provides `.uuid()`, `.url()`, `.transform()`, `.safeParse()` |
| jose | ^6.0.0 | JWKS key resolution for JWT validation | Standard library for JOSE/JWT in Node.js; zero dependencies; native ESM; `createRemoteJWKSet` provides lazy JWKS fetching |
| dotenv | ^16.5.0 | .env file loading | Already in project; loads env vars before Zod validation |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | ^4.1.0 | Test framework | Config validation tests; establishes test infrastructure for all subsequent phases |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Zod for env validation | @t3-oss/env-core | Adds dependency; Zod alone is sufficient and already installed |
| jose for JWKS | jsonwebtoken + jwks-rsa | Two packages vs one; jose is newer, ESM-native, zero dependencies |
| Vitest for tests | Jest | Jest has poor ESM support; Vitest is native ESM, zero-config for TypeScript |

**Installation:**
```bash
npm install jose@^6.0.0
npm install -D vitest@^4.1.0
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  config.ts          # NEW: Zod schema, validation, derived values, JWKS init
  server.ts          # MODIFIED: import config from config.ts, remove inline config loading
  api.ts             # UNCHANGED
  schemas.ts         # UNCHANGED
  types.ts           # MODIFIED: ServerConfig interface replaced by Zod-inferred type
tests/
  config.test.ts     # NEW: Config validation smoke tests
vitest.config.ts     # NEW: Minimal vitest configuration
example.env          # MODIFIED: Add Azure AD variables
```

### Pattern 1: Zod Environment Variable Schema with Transform

**What:** Define a single Zod schema that validates raw env vars and derives computed Azure AD endpoints.
**When to use:** At application startup, before any other initialization.

```typescript
// Source: Zod v3 API docs (https://zod.dev/api) + Azure AD OIDC docs
import { z } from "zod";

const envSchema = z.object({
  // Server
  PORT: z.string().default("8000").transform(Number),

  // WikiJS
  WIKIJS_BASE_URL: z.string().url(),
  WIKIJS_TOKEN: z.string().min(1, "WIKIJS_TOKEN must not be empty"),

  // Azure AD OAuth
  AZURE_TENANT_ID: z.string().uuid("AZURE_TENANT_ID must be a valid UUID"),
  AZURE_CLIENT_ID: z.string().uuid("AZURE_CLIENT_ID must be a valid UUID"),
  MCP_RESOURCE_URL: z.string().url("MCP_RESOURCE_URL must be a valid URL"),
}).transform((env) => ({
  port: env.PORT,
  wikijs: {
    baseUrl: env.WIKIJS_BASE_URL,
    token: env.WIKIJS_TOKEN,
  },
  azure: {
    tenantId: env.AZURE_TENANT_ID,
    clientId: env.AZURE_CLIENT_ID,
    resourceUrl: env.MCP_RESOURCE_URL,
    // Derived values -- single source of truth
    jwksUri: `https://login.microsoftonline.com/${env.AZURE_TENANT_ID}/discovery/v2.0/keys`,
    issuer: `https://login.microsoftonline.com/${env.AZURE_TENANT_ID}/v2.0`,
  },
}));
```

**Critical detail:** The `.transform()` runs AFTER validation passes. If any field fails, the transform never executes and Zod returns all validation errors.

### Pattern 2: Fail-Fast with Grouped Error Output

**What:** Use `safeParse()` to collect all errors, then print a categorized summary and exit.
**When to use:** During config loading, before server starts.

```typescript
// Source: Zod v3 safeParse + format API
import { config as dotenvConfig } from "dotenv";

dotenvConfig();

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const errors = result.error.flatten().fieldErrors;

  console.error("\n=== Configuration Error ===\n");

  // Group by category
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const [field, messages] of Object.entries(errors)) {
    if (messages?.some(m => m.includes("Required"))) {
      missing.push(field);
    } else {
      invalid.push(`  ${field}: ${messages?.join(", ")}`);
    }
  }

  if (missing.length > 0) {
    console.error("Missing required variables:");
    missing.forEach(f => console.error(`  - ${f}`));
  }

  if (invalid.length > 0) {
    console.error("\nInvalid variable values:");
    invalid.forEach(line => console.error(line));
  }

  console.error("\nSee example.env for required variables.\n");
  process.exit(1);
}

export const config = result.data;
```

**Key design:** `safeParse()` does NOT throw -- it returns `{ success: false, error }` with ALL validation failures. This allows grouping all errors before exiting instead of failing on the first one.

### Pattern 3: JWKS Initialization (Lazy)

**What:** Create JWKS key resolution function at config time; actual network call deferred to first use.
**When to use:** After config validation succeeds, export alongside config.

```typescript
// Source: jose docs (https://github.com/panva/jose/blob/main/docs/jwks/remote/functions/createRemoteJWKSet.md)
import { createRemoteJWKSet } from "jose";

// Called after config validation passes
export const jwks = createRemoteJWKSet(
  new URL(config.azure.jwksUri)
);
```

**Critical detail:** `createRemoteJWKSet()` returns a function, NOT a promise. It does NOT make any HTTP request at creation time. The returned function fetches keys lazily on first invocation and caches them with a cooldown period. This means the server starts instantly without network dependency.

### Pattern 4: Masked Config Logging

**What:** Log config summary on successful start with sensitive values partially redacted.
**When to use:** After config validation succeeds, before server begins accepting connections.

```typescript
function maskValue(value: string, showChars: number = 4): string {
  if (value.length <= showChars) return "****";
  return value.substring(0, showChars) + "****";
}

function logConfig(config: AppConfig): void {
  console.log("\nServer configuration:");
  console.log(`  PORT:             ${config.port}`);
  console.log(`  WIKIJS_BASE_URL:  ${config.wikijs.baseUrl}`);
  console.log(`  WIKIJS_TOKEN:     ${maskValue(config.wikijs.token)}`);
  console.log(`  AZURE_TENANT_ID:  ${maskValue(config.azure.tenantId, 8)}`);
  console.log(`  AZURE_CLIENT_ID:  ${maskValue(config.azure.clientId, 8)}`);
  console.log(`  MCP_RESOURCE_URL: ${config.azure.resourceUrl}`);
  console.log(`  JWKS URI:         ${config.azure.jwksUri}`);
  console.log(`  Issuer:           ${config.azure.issuer}`);
  console.log("");
}
```

### Anti-Patterns to Avoid
- **Validating only new vars:** User explicitly decided to validate ALL env vars (including WIKIJS_BASE_URL, WIKIJS_TOKEN) through the same Zod schema. Don't leave the old vars with fallback defaults.
- **Failing on first error only:** Use `safeParse()` to collect ALL errors. Don't use `parse()` which throws on first failure.
- **Pre-warming JWKS at startup:** User decided against this. `createRemoteJWKSet` is lazy by design. Don't add `await jwks(...)` at startup.
- **Dev mode bypass / OAUTH_ENABLED flag:** User explicitly decided OAuth is always required. Don't add conditional config loading.
- **Keeping ServerConfig interface in types.ts:** The config type should be inferred from the Zod schema via `z.infer<>`. Don't maintain a separate hand-written interface.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| UUID format validation | Custom regex `/^[0-9a-f]{8}-...$/i` | `z.string().uuid()` | Zod v3's built-in UUID validator handles all standard UUID formats |
| URL format validation | Custom regex or manual `new URL()` try/catch | `z.string().url()` | Zod v3's URL validator uses proper URL parsing internally |
| Error collection and grouping | Manual try/catch per variable | `envSchema.safeParse()` + `.flatten()` | Zod collects all errors in a single pass; `.flatten()` groups by field |
| JWKS key fetching and caching | Manual HTTP fetch + key cache | `createRemoteJWKSet` from jose | Handles key rotation, cooldown, kid matching, key type selection |
| Type inference from schema | Manual TypeScript interface | `z.infer<typeof envSchema>` (or output type from transform) | Keeps type and validation in sync; no drift between interface and validation |

**Key insight:** The combination of Zod schema + `.transform()` + `z.infer<>` gives us validation, type safety, and computed values from a single source of truth. There's no separate config interface to keep in sync.

## Common Pitfalls

### Pitfall 1: Zod v3 vs v4 API Confusion
**What goes wrong:** Using Zod v4 top-level functions (`z.uuid()`, `z.url()`) instead of Zod v3 method chains (`z.string().uuid()`, `z.string().url()`).
**Why it happens:** The project's `package.json` has `"zod": "^3.25.17"` which resolves to the latest 3.x (NOT 4.x, since caret respects major version). But online documentation (zod.dev) defaults to showing v4 API.
**How to avoid:** Always use the Zod v3 method chaining syntax: `z.string().uuid()`, `z.string().url()`, `z.string().min(1)`. Do NOT use `z.uuid()`, `z.url()`, `z.httpUrl()`.
**Warning signs:** TypeScript errors like "Property 'uuid' does not exist on type 'typeof z'".

### Pitfall 2: process.env Values Are Always Strings
**What goes wrong:** Zod schema expects `z.number()` for PORT but `process.env.PORT` is a string.
**Why it happens:** All `process.env` values are `string | undefined`, even if they look like numbers.
**How to avoid:** Use `z.string().default("8000").transform(Number)` for PORT, or `z.coerce.number().default(8000)`. Do NOT use `z.number()` directly on process.env fields.
**Warning signs:** Validation error "Expected number, received string" for PORT.

### Pitfall 3: .transform() Output Type vs Input Type
**What goes wrong:** `z.infer<typeof envSchema>` gives the OUTPUT type (after transform), but code tries to use it as the INPUT type (raw env vars).
**Why it happens:** When a schema has `.transform()`, `z.infer` resolves to the transform's return type, not the input shape.
**How to avoid:** Use `z.infer<typeof envSchema>` for the final config type (what you actually want). If you need the input type, use `z.input<typeof envSchema>`. In this phase, only the output type matters.
**Warning signs:** TypeScript errors about missing fields that exist in process.env but not in the transformed output.

### Pitfall 4: dotenv Must Load Before Zod Validation
**What goes wrong:** Zod validation sees `undefined` for all env vars because `.env` file hasn't been loaded yet.
**Why it happens:** If `config.ts` runs its validation at module import time (top-level), the order of imports matters. If `dotenv.config()` hasn't been called yet, process.env won't have `.env` file values.
**How to avoid:** Call `dotenv.config()` at the top of `config.ts` before running `envSchema.safeParse(process.env)`. Or use a `loadConfig()` function that explicitly calls dotenv first.
**Warning signs:** All env vars show as "Required" even though they're in the `.env` file.

### Pitfall 5: Zod .url() Accepts Non-HTTP URLs
**What goes wrong:** `z.string().url()` accepts `ftp://`, `file://`, `data:` URLs -- not just `http://` and `https://`.
**Why it happens:** Zod v3's `.url()` validator uses `new URL()` internally, which accepts any valid URL scheme.
**How to avoid:** For `WIKIJS_BASE_URL` and `MCP_RESOURCE_URL`, add a `.refine()` check if HTTP/HTTPS is required: `z.string().url().refine(u => u.startsWith("http://") || u.startsWith("https://"), "Must be an HTTP(S) URL")`. Or accept this as sufficient since these are internal config values.
**Warning signs:** Server configured with non-HTTP URL scheme.

### Pitfall 6: ESM Module Import Extensions in Tests
**What goes wrong:** Test files importing `../src/config` fail with `MODULE_NOT_FOUND` because `.js` extension is missing.
**Why it happens:** The project uses `"moduleResolution": "NodeNext"` which requires explicit `.js` extensions in imports. Vitest uses Vite's resolver which can handle extensionless imports.
**How to avoid:** In test files, import using `.js` extension (matching the project convention): `import { config } from "../src/config.js"`. Vitest's Vite-based resolver will resolve `.js` to `.ts` at test time.
**Warning signs:** Module resolution errors when running tests.

## Code Examples

### Complete src/config.ts Module

```typescript
// Source: Zod v3 docs + jose docs + Azure AD OIDC docs
import { config as dotenvConfig } from "dotenv";
import { z } from "zod";
import { createRemoteJWKSet } from "jose";

dotenvConfig();

const envSchema = z.object({
  PORT: z.string().default("8000").transform(Number),
  WIKIJS_BASE_URL: z.string().url("WIKIJS_BASE_URL must be a valid URL"),
  WIKIJS_TOKEN: z.string().min(1, "WIKIJS_TOKEN must not be empty"),
  AZURE_TENANT_ID: z.string().uuid("AZURE_TENANT_ID must be a valid UUID"),
  AZURE_CLIENT_ID: z.string().uuid("AZURE_CLIENT_ID must be a valid UUID"),
  MCP_RESOURCE_URL: z.string().url("MCP_RESOURCE_URL must be a valid URL"),
}).transform((env) => ({
  port: env.PORT,
  wikijs: {
    baseUrl: env.WIKIJS_BASE_URL,
    token: env.WIKIJS_TOKEN,
  },
  azure: {
    tenantId: env.AZURE_TENANT_ID,
    clientId: env.AZURE_CLIENT_ID,
    resourceUrl: env.MCP_RESOURCE_URL,
    jwksUri: `https://login.microsoftonline.com/${env.AZURE_TENANT_ID}/discovery/v2.0/keys`,
    issuer: `https://login.microsoftonline.com/${env.AZURE_TENANT_ID}/v2.0`,
  },
}));

// Type inferred from schema output (after transform)
export type AppConfig = z.output<typeof envSchema>;

// Validate and export
const result = envSchema.safeParse(process.env);

if (!result.success) {
  const errors = result.error.flatten().fieldErrors;
  console.error("\n=== Configuration Error ===\n");

  const missing: string[] = [];
  const invalid: string[] = [];

  for (const [field, messages] of Object.entries(errors)) {
    if (messages?.some((m) => m.includes("Required"))) {
      missing.push(field);
    } else {
      invalid.push(`  ${field}: ${messages?.join(", ")}`);
    }
  }

  if (missing.length > 0) {
    console.error("Missing required variables:");
    missing.forEach((f) => console.error(`  - ${f}`));
  }

  if (invalid.length > 0) {
    console.error("\nInvalid variable values:");
    invalid.forEach((line) => console.error(line));
  }

  console.error("\nSee example.env for required variables.\n");
  process.exit(1);
}

export const config = result.data;

// JWKS key resolver -- lazy, no network call until first auth request
export const jwks = createRemoteJWKSet(
  new URL(config.azure.jwksUri)
);
```

### Vitest Configuration (vitest.config.ts)

```typescript
// Source: Vitest v4 docs (https://vitest.dev/config/)
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Node environment (default, but explicit for clarity)
    environment: "node",
  },
});
```

### Config Test Pattern (tests/config.test.ts)

```typescript
// Source: Vitest API + Zod safeParse pattern
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The schema must be importable independently of the side-effecting config module.
// One approach: export the schema separately, or re-create it in tests.
// Better: extract schema into a testable function.

describe("config validation", () => {
  const validEnv = {
    PORT: "8000",
    WIKIJS_BASE_URL: "http://localhost:3000",
    WIKIJS_TOKEN: "test-token-value",
    AZURE_TENANT_ID: "550e8400-e29b-41d4-a716-446655440000",
    AZURE_CLIENT_ID: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    MCP_RESOURCE_URL: "https://mcp.example.com",
  };

  it("parses valid environment variables", () => {
    // Test that valid env parses successfully and produces expected shape
  });

  it("rejects missing required variables", () => {
    // Test that omitting AZURE_TENANT_ID etc. produces errors
  });

  it("rejects invalid UUID format", () => {
    // Test that "not-a-uuid" for AZURE_TENANT_ID fails
  });

  it("rejects invalid URL format", () => {
    // Test that "not-a-url" for MCP_RESOURCE_URL fails
  });

  it("derives JWKS URI from tenant ID", () => {
    // Verify transform produces correct Azure AD URL
  });

  it("derives issuer URL from tenant ID", () => {
    // Verify transform produces correct issuer
  });
});
```

**Design note for testability:** The config module has a side effect (it calls `process.exit(1)` on failure). For testing, export the schema separately so tests can call `safeParse()` directly without triggering the exit. Consider a pattern like:

```typescript
// In config.ts:
export const envSchema = z.object({ ... }).transform(...);

// The module-level validation uses it:
const result = envSchema.safeParse(process.env);
// ...

// In tests:
import { envSchema } from "../src/config.js";
const result = envSchema.safeParse(testEnv);
expect(result.success).toBe(true);
```

### Updated example.env

```env
# Server port for HTTP MCP server
PORT=3200

# Wiki.js base URL (without /graphql)
WIKIJS_BASE_URL=http://localhost:3000

# Wiki.js API token
WIKIJS_TOKEN=your_wikijs_api_token_here

# Azure AD tenant ID (UUID format)
# Find at: Azure Portal > Microsoft Entra ID > Overview > Tenant ID
AZURE_TENANT_ID=your_azure_tenant_id_here

# Azure AD application (client) ID (UUID format)
# Find at: Azure Portal > App registrations > Your App > Application (client) ID
AZURE_CLIENT_ID=your_azure_client_id_here

# MCP server resource URL (used in OAuth Protected Resource Metadata)
# This is the public URL where this MCP server is accessible
MCP_RESOURCE_URL=https://your-mcp-server.example.com
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual env var reading with fallback defaults | Zod schema validation with format checks | Best practice since Zod v3 (2022+) | Type-safe config, all errors caught at startup |
| jsonwebtoken + jwks-rsa for JWKS | jose `createRemoteJWKSet` | jose v4+ (2022), now v6 | Single zero-dep library, native ESM, lazy JWKS fetching |
| Jest for testing | Vitest | Vitest v1 (2024), now v4 | Native ESM, zero-config TypeScript, faster execution |
| Hand-written TypeScript interfaces for config | `z.infer<>` / `z.output<>` from Zod schema | Zod v3 (2022+) | Single source of truth for types + validation |
| Azure AD v1.0 endpoints | Azure AD v2.0 endpoints | Microsoft identity platform v2.0 | Tenant-scoped JWKS URI, standard OIDC discovery |

**Deprecated/outdated:**
- `ServerConfig` interface in `src/types.ts`: Will be replaced by Zod-inferred type from config module
- Russian-language console.log messages in `server.ts`: Will be converted to English
- Inline config loading with fallback defaults in `server.ts` lines 10-17: Will be replaced by validated config import

## Open Questions

1. **Config module side effects and testability**
   - What we know: The config module calls `dotenv.config()` and `process.exit(1)` at the module level. Importing the module in tests would trigger env loading and potentially exit.
   - What's unclear: Best pattern for making the schema testable while keeping the module-level validation for production use.
   - Recommendation: Export the `envSchema` as a named export alongside `config` and `jwks`. Tests import and call `envSchema.safeParse(testEnv)` directly. The module-level `process.exit(1)` only fires when the module is loaded in production (server startup). Alternatively, wrap config loading in a `loadConfig()` function called explicitly.

2. **Vitest Node.js version requirement**
   - What we know: Vitest v4.1.1 requires Node >=v20.0.0. The project has `"engines": { "node": ">=18.0.0" }` in package.json. Current runtime is Node v25.2.1.
   - What's unclear: Whether to update the engines field.
   - Recommendation: Vitest v4 works fine on Node v25.2.1 (the actual runtime). The engines field in package.json is a separate concern -- it could be updated to `>=20.0.0` to reflect the new minimum, but this is a minor detail for the planner to decide.

3. **PORT validation edge cases**
   - What we know: PORT must be a valid port number (1-65535), not just any parseable number.
   - What's unclear: Whether to add `.refine()` for port range or keep it simple with just string-to-number transform.
   - Recommendation: Add a `.pipe(z.number().int().min(1).max(65535))` after the transform, or use `.refine()`. This prevents accidental invalid port values.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.x (to be installed in this phase) |
| Config file | `vitest.config.ts` (to be created in Wave 0) |
| Quick run command | `npx vitest run tests/config.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONF-01 | AZURE_TENANT_ID read and validated as UUID | unit | `npx vitest run tests/config.test.ts -t "tenant"` | No -- Wave 0 |
| CONF-02 | AZURE_CLIENT_ID read and validated as UUID | unit | `npx vitest run tests/config.test.ts -t "client"` | No -- Wave 0 |
| CONF-03 | MCP_RESOURCE_URL read and validated as URL | unit | `npx vitest run tests/config.test.ts -t "resource"` | No -- Wave 0 |
| CONF-04 | Fail fast with grouped error on missing vars | unit | `npx vitest run tests/config.test.ts -t "missing"` | No -- Wave 0 |
| CONF-05 | example.env contains all new variables | manual-only | Visual inspection of example.env | N/A |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/config.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full test suite green + manual verification of example.env contents

### Wave 0 Gaps
- [ ] `vitest` dev dependency -- install: `npm install -D vitest@^4.1.0`
- [ ] `vitest.config.ts` -- minimal Vitest configuration file
- [ ] `tests/config.test.ts` -- config validation smoke tests
- [ ] `package.json` test script -- update `"test"` script to `"vitest run"`

## Sources

### Primary (HIGH confidence)
- [Zod v3 API docs](https://zod.dev/api) - `.string().uuid()`, `.string().url()`, `.transform()`, `.safeParse()`, `.flatten()` API
- [jose createRemoteJWKSet docs](https://github.com/panva/jose/blob/main/docs/jwks/remote/functions/createRemoteJWKSet.md) - Function signature, lazy behavior, options
- [jose jwtVerify docs](https://github.com/panva/jose/blob/main/docs/jwt/verify/functions/jwtVerify.md) - jwtVerify API for Phase 4 context
- [Azure AD OIDC discovery](https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc) - JWKS URI format `https://login.microsoftonline.com/{tenant}/discovery/v2.0/keys`, issuer format `https://login.microsoftonline.com/{tenant}/v2.0`
- [Vitest v4 configuration guide](https://vitest.dev/config/) - defineConfig, test file patterns, TypeScript support
- [Vitest v4 getting started](https://vitest.dev/guide/) - Installation, Node >=v20.0.0 requirement, ESM support

### Secondary (MEDIUM confidence)
- [Zod v4 migration guide](https://zod.dev/v4/changelog) - Confirmed v3 vs v4 API differences (`.string().uuid()` vs `z.uuid()`)
- [Vitest ESM + NodeNext resolution](https://techresolve.blog/2025/12/11/how-to-not-require-js-extension-when-writing-vi/) - `.js` extension handling in Vitest with NodeNext moduleResolution
- [Azure AD JWKS URI Q&A](https://learn.microsoft.com/en-us/answers/questions/1163810/where-can-i-find-the-jwks-uri-for-azure-ad) - Confirms tenant-specific JWKS URI format

### Tertiary (LOW confidence)
- jose npm package page (version 6.2.2 current) - could not fetch directly due to 403, version confirmed via search results

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries verified (Zod v3 in package.json, jose v6 on npm, Vitest v4 on vitest.dev)
- Architecture: HIGH - Zod env validation is well-documented pattern; Azure AD endpoints confirmed from Microsoft official docs
- Pitfalls: HIGH - Zod v3/v4 API difference verified; process.env string types are well-known; ESM extension issues documented
- JWKS initialization: HIGH - jose createRemoteJWKSet lazy behavior confirmed from official docs

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (Zod v3 API is stable; jose v6 API is stable; Azure AD v2.0 endpoints are stable)
