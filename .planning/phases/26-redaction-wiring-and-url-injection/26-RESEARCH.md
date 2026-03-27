# Phase 26: Redaction Wiring and URL Injection - Research

**Researched:** 2026-03-27
**Domain:** Integration wiring (handler pipeline modification, URL construction, config extension)
**Confidence:** HIGH

## Summary

Phase 26 is an integration phase that connects the Phase 25 `redactContent()` pure function into the `get_page` tool handler pipeline and adds a computed `url` field to responses. The URL is built from the existing `WIKIJS_BASE_URL` plus a new `WIKIJS_LOCALE` config value and the page's path. The phase also adds the `WIKIJS_LOCALE` env var to the Zod config schema, normalizes `WIKIJS_BASE_URL` trailing slashes, and passes config through to `createMcpServer()` as a third parameter.

The codebase is well-structured for this change. The `get_page` handler in `src/mcp-tools.ts` (lines 87-113) has a clear pipeline: fetch -> isBlocked check -> serialize. Phase 26 inserts two new steps: redactContent() after isBlocked, and buildPageUrl() for URL injection. The config extension follows the existing Zod `.transform()` pattern in `src/config.ts`. A new `src/url.ts` module holds the `buildPageUrl()` helper, following the project's single-purpose file convention.

**Critical dependency:** Phase 25 must be completed first. The `redactContent()` function, `REDACTION_PLACEHOLDER`, `RedactionResult`, and `RedactionWarning` exports do not yet exist in `src/gdpr.ts`. Phase 26 cannot be executed until Phase 25 adds them.

**Primary recommendation:** Implement as a single plan with 3 logical concerns: (1) config extension + `buildPageUrl()` helper, (2) handler pipeline modification with redaction + URL wiring, (3) tool description and instructions.txt updates. All changes are tightly coupled and should be in one wave.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Reuse existing `WIKIJS_BASE_URL` for both GraphQL API calls and page URL construction (no new base URL env var)
- Add `WIKIJS_LOCALE` env var with Zod default `'en'` -- placed in `wikijs` config group alongside `baseUrl` and `token`
- Normalize trailing slash on `WIKIJS_BASE_URL` in the Zod `.transform()` step
- Pass `AppConfig` (or subset) as a third parameter to `createMcpServer(wikiJsApi, instructions, config)`
- Log `WIKIJS_LOCALE` in `logConfig()` startup diagnostics
- Update `example.env` with `WIKIJS_LOCALE=en` -- no Docker file changes needed
- Dedicated `buildPageUrl(baseUrl, locale, path)` helper in `src/url.ts`
- URL format: `${baseUrl}/${locale}/${path}` -- e.g. `https://wiki.company.com/en/Mendix/BestPractices`
- Normalize path: strip leading slash to avoid double slashes
- Encode each path segment with `encodeURIComponent` for special characters and non-ASCII
- No special handling for home page -- `home` treated like any other path
- No trailing slash on URLs
- URL appears as a top-level `url` field in the page JSON object
- Explicit field construction with controlled ordering: `id, path, url, title, description, content, isPublished, createdAt, updatedAt`
- `WikiJsPage` TypeScript interface stays unchanged -- url is computed and spread at handler level
- No URL on error responses or GDPR-blocked pages
- Operation order: Fetch page -> isBlocked() check -> redactContent() -> buildPageUrl() -> Serialize
- Always call `redactContent()` on all content (no-op when no markers present)
- Pass page context to redactContent: `redactContent(content, { pageId, path })` [Note: Phase 25 plan defines signature as `redactContent(content, pageId, path)` with positional params]
- Update get_page tool description to mention the `url` field in the returned fields list
- Do NOT mention redaction in the tool description (security measure, not for AI awareness)
- Update `instructions.txt` to guide Claude to cite page URLs when referencing wiki content

### Claude's Discretion
- Test file organization and naming for url.ts tests
- Exact wording of instructions.txt URL guidance
- Error handling edge cases in buildPageUrl()

### Deferred Ideas (OUT OF SCOPE)
- URL-03: list_pages results include url field for each page -- future phase
- URL-04: search_pages results include url field for each page -- future phase
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| URL-01 | get_page response includes a `url` field with direct link to the wiki page | `buildPageUrl()` helper constructs URL from config baseUrl + locale + page path; injected into handler response object at position after `path` field |
| URL-02 | Wiki page base URL is a server configuration constant, not hardcoded inline | `WIKIJS_BASE_URL` is already a Zod-validated config value; `WIKIJS_LOCALE` added as new config value with default `'en'`; both passed to `createMcpServer()` via config parameter |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.3 | Language (strict, ESM) | Project standard per CLAUDE.md |
| Zod | ^3.25.17 | Config validation + transform | Already used in `src/config.ts` for env schema |
| Vitest | ^4.1.1 | Test runner | Project standard per package.json |

### Supporting
No additional libraries needed. URL construction uses built-in `encodeURIComponent`. All wiring uses existing project patterns and dependencies.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `encodeURIComponent` per segment | `new URL()` constructor | URL constructor would require full URL assembly first; per-segment encoding is more explicit and handles edge cases better |
| Explicit field construction | Spread operator with url injection | Spread does not guarantee field order; explicit construction gives controlled JSON output |

**Installation:**
```bash
# No new dependencies required
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  url.ts               # NEW: buildPageUrl() helper
  url.test.ts          # NEW: unit tests for buildPageUrl (or src/__tests__/url.test.ts)
  gdpr.ts              # EXISTING: isBlocked() + redactContent() (from Phase 25)
  config.ts            # MODIFIED: add WIKIJS_LOCALE, trailing slash normalization
  mcp-tools.ts         # MODIFIED: add config param, wire redaction + URL
  server.ts            # MODIFIED: pass config to protectedRoutes
  routes/
    mcp-routes.ts      # MODIFIED: accept + pass config to createMcpServer
```

### Pattern 1: Config Extension via Zod Transform
**What:** Add `WIKIJS_LOCALE` to the existing env schema and normalize `WIKIJS_BASE_URL` trailing slashes in the `.transform()` step.
**When to use:** When adding new environment-driven configuration values.
**Example:**
```typescript
// Source: Existing pattern in src/config.ts, extended
export const envSchema = z
  .object({
    // ... existing fields ...
    WIKIJS_BASE_URL: z.string().url("WIKIJS_BASE_URL must be a valid URL"),
    WIKIJS_LOCALE: z.string().default("en"),
    // ... other fields ...
  })
  .transform((env) => ({
    port: env.PORT,
    wikijs: {
      baseUrl: env.WIKIJS_BASE_URL.replace(/\/+$/, ""),  // trailing slash normalization
      token: env.WIKIJS_TOKEN,
      locale: env.WIKIJS_LOCALE,  // new field in wikijs group
    },
    // ... rest unchanged ...
  }));
```

### Pattern 2: Explicit Response Field Construction
**What:** Build the response object with explicitly ordered fields instead of spreading the WikiJsPage object.
**When to use:** When JSON field ordering matters for readability/consistency.
**Example:**
```typescript
// Source: CONTEXT.md locked decision on field ordering
const responseObj = {
  id: page.id,
  path: page.path,
  url: buildPageUrl(config.wikijs.baseUrl, config.wikijs.locale, page.path),
  title: page.title,
  description: page.description,
  content: redactedContent,  // after redactContent() processing
  isPublished: page.isPublished,
  createdAt: page.createdAt,
  updatedAt: page.updatedAt,
};
```

### Pattern 3: Handler Pipeline Modification
**What:** Insert redaction and URL construction into the existing get_page handler flow.
**When to use:** When modifying the tool handler pipeline with new processing steps.
**Example:**
```typescript
// Source: Existing handler in src/mcp-tools.ts:87-113, modified
wrapToolHandler(TOOL_GET_PAGE, async ({ id }) => {
  try {
    const page = await wikiJsApi.getPageById(id);

    // GDPR: check after API call completes (SEC-01 timing safety)
    if (page?.path && isBlocked(page.path)) {
      logBlockedAccess(TOOL_GET_PAGE);
      throw new Error("Page not found");
    }

    // Redact content (no-op when no markers present)
    const redactionResult = redactContent(page.content ?? "", page.id, page.path);

    // Log redaction warnings if any
    if (redactionResult.warnings.length > 0) {
      const ctx = requestContext.getStore();
      ctx?.log.warn(
        { pageId: page.id, path: page.path, warnings: redactionResult.warnings },
        "GDPR redaction warnings"
      );
    }

    // Build response with URL and redacted content
    const responseObj = {
      id: page.id,
      path: page.path,
      url: buildPageUrl(config.wikijs.baseUrl, config.wikijs.locale, page.path),
      title: page.title,
      description: page.description,
      content: redactionResult.content,
      isPublished: page.isPublished,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
    };

    return {
      content: [
        { type: "text" as const, text: JSON.stringify(responseObj, null, 2) },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: `Error in get_page: ${String(error)}. Verify the page ID using search_pages or list_pages.`,
        },
      ],
    };
  }
})
```

### Pattern 4: Function Signature Extension with Config Pass-Through
**What:** Add config as third parameter to `createMcpServer()` and thread it through the call chain.
**When to use:** When tool handlers need access to application configuration.
**Example:**
```typescript
// src/mcp-tools.ts
import type { AppConfig } from "./config.js";

export function createMcpServer(
  wikiJsApi: WikiJsApi,
  instructions: string,
  config: AppConfig,
): McpServer {
  // config.wikijs.baseUrl and config.wikijs.locale available to handlers
}

// src/routes/mcp-routes.ts -- caller must pass config
export interface ProtectedRoutesOptions {
  wikiJsApi: WikiJsApi;
  auth: AuthPluginOptions;
  instructions: string;
  config: AppConfig;  // NEW
}

// In protectedRoutes plugin:
const mcpServer = createMcpServer(wikiJsApi, instructions, config);
```

### Anti-Patterns to Avoid
- **Encoding the full path as one string:** `encodeURIComponent("Mendix/BestPractices")` encodes the `/` separator, producing `Mendix%2FBestPractices`. Must encode each segment individually.
- **Mutating WikiJsPage interface:** The `url` field is computed at handler level, not added to the data model type. The interface stays unchanged.
- **Mentioning redaction in tool descriptions:** CONTEXT.md explicitly forbids this as a security measure. Redaction must be invisible to the AI client.
- **Putting buildPageUrl inside mcp-tools.ts:** Follows project convention of single-purpose files (`gdpr.ts`, `types.ts`). URL construction belongs in `src/url.ts`.
- **Forgetting `.js` extensions in new imports:** All imports must include `.js` extensions for NodeNext module resolution.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| URL encoding | Manual percent-encoding | `encodeURIComponent()` per segment | Built-in, handles all Unicode edge cases correctly |
| Trailing slash removal | Character-by-character check | `str.replace(/\/+$/, "")` | Simple regex, handles multiple trailing slashes |
| Leading slash removal | Index-based substring | `str.replace(/^\/+/, "")` | Same pattern, consistent with trailing slash approach |
| Config validation | Manual env var parsing | Zod schema with `.transform()` | Already the project pattern, type-safe, fail-fast |

**Key insight:** This phase is pure wiring -- connecting existing pieces (config, redaction function, URL helper) into the handler pipeline. There is no algorithmic complexity; the risk is in getting the integration points right across multiple files.

## Common Pitfalls

### Pitfall 1: encodeURIComponent on Full Path String
**What goes wrong:** `encodeURIComponent("Mendix/BestPractices")` produces `"Mendix%2FBestPractices"` -- the `/` separator is encoded, breaking the URL.
**Why it happens:** `encodeURIComponent` encodes all non-unreserved characters including `/`.
**How to avoid:** Split path on `/`, encode each segment individually, rejoin with `/`: `path.split("/").filter(Boolean).map(s => encodeURIComponent(s)).join("/")`.
**Warning signs:** URLs with `%2F` instead of `/` in the path portion.

### Pitfall 2: Double Slashes in Constructed URL
**What goes wrong:** If `baseUrl` has a trailing slash and locale/path have leading slashes, the URL gets `//` segments like `https://wiki.com//en//path`.
**Why it happens:** String concatenation without normalization.
**How to avoid:** Normalize `baseUrl` by stripping trailing slashes in the Zod transform (done once at startup). Strip leading slashes from path input in `buildPageUrl()`.
**Warning signs:** URLs that look right for clean inputs but break with edge-case inputs (trailing slashes in config, leading slashes in page paths).

### Pitfall 3: createMcpServer Call Site Updates
**What goes wrong:** Adding a third `config` parameter to `createMcpServer()` breaks all existing callers.
**Callers that must be updated:**
1. `src/routes/mcp-routes.ts:59` -- production call site
2. `src/__tests__/mcp-tools-gdpr.test.ts` -- 18 test call sites
3. `ProtectedRoutesOptions` interface in `src/routes/mcp-routes.ts:24` -- needs `config` field
4. `protectedRoutes` plugin call in `src/server.ts:58` -- needs to pass `appConfig`
5. `buildTestApp()` in `tests/helpers/build-test-app.ts:149` -- needs to pass test config
**How to avoid:** Start with the function signature change and use TypeScript compilation errors (`npx tsc --noEmit`) to find ALL broken call sites before running tests.
**Warning signs:** TypeScript compilation errors about missing arguments; tests failing with "config is undefined".

### Pitfall 4: redactContent Signature Mismatch
**What goes wrong:** CONTEXT.md says `redactContent(content, { pageId, path })` (object param), but Phase 25 plan defines `redactContent(content, pageId, path)` (positional params).
**Why it happens:** CONTEXT.md used shorthand notation; the actual Phase 25 implementation uses positional parameters.
**How to avoid:** Follow the Phase 25 plan's actual signature: `redactContent(content: string, pageId: number, path: string)`. Verify by checking Phase 25's implementation after it executes.
**Warning signs:** TypeScript error at the call site if the wrong signature is used.

### Pitfall 5: Null Content in redactContent Call
**What goes wrong:** `page.content` can be `undefined` (it's optional on `WikiJsPage`). Passing `undefined` to `redactContent()` when it expects `string`.
**Why it happens:** The `content` field on `WikiJsPage` is typed as `content?: string`.
**How to avoid:** Use `page.content ?? ""` when calling redactContent. The function itself handles empty/null content gracefully, but TypeScript will flag the type mismatch.
**Warning signs:** TypeScript error about `string | undefined` not assignable to `string`.

### Pitfall 6: Vitest Config Missing WIKIJS_LOCALE
**What goes wrong:** Adding `WIKIJS_LOCALE` to the Zod schema might cause the module-level `loadConfig()` to behave differently in tests if `WIKIJS_LOCALE` isn't in `vitest.config.ts` env.
**Why it happens:** The Zod schema parses `process.env` at module load time.
**How to avoid:** `WIKIJS_LOCALE` has a Zod `.default("en")`, so it will succeed even without being in `vitest.config.ts`. However, for explicitness, consider adding it to `vitest.config.ts` env block.
**Warning signs:** Unlikely to cause issues due to the default, but worth noting.

### Pitfall 7: Test Config Object Shape Change
**What goes wrong:** `makeTestConfig()` in `tests/helpers/build-test-app.ts` returns an `AppConfig` object. After adding `locale` to `wikijs` group, this function must be updated to include `locale`.
**Why it happens:** The test config constructor was written before the `locale` field existed.
**How to avoid:** Update `makeTestConfig()` to include `locale: "en"` in the `wikijs` section.
**Warning signs:** Tests fail with missing property errors; TypeScript catches this if types are checked.

## Code Examples

### buildPageUrl Helper (src/url.ts)
```typescript
// Source: Verified via Node.js REPL testing (2026-03-27)

/**
 * Constructs a direct URL to a Wiki.js page.
 *
 * @param baseUrl - Wiki.js base URL (trailing slashes already stripped by config)
 * @param locale - Wiki.js locale code (e.g., "en")
 * @param path - Page path from Wiki.js API (e.g., "Mendix/BestPractices")
 * @returns Full page URL, e.g., "https://wiki.company.com/en/Mendix/BestPractices"
 */
export function buildPageUrl(baseUrl: string, locale: string, path: string): string {
  // Strip leading slashes from path to avoid double slashes
  const normalizedPath = path.replace(/^\/+/, "");

  // Encode each path segment individually (preserves / separators)
  const encodedPath = normalizedPath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${baseUrl}/${locale}/${encodedPath}`;
}
```

### Config Extension (src/config.ts changes)
```typescript
// Source: Existing config.ts pattern, extended per CONTEXT.md decisions

// In the .object() section:
WIKIJS_LOCALE: z.string().default("en"),

// In the .transform() section:
wikijs: {
  baseUrl: env.WIKIJS_BASE_URL.replace(/\/+$/, ""),  // normalize trailing slash
  token: env.WIKIJS_TOKEN,
  locale: env.WIKIJS_LOCALE,
},

// In logConfig():
console.log(`  WikiJS Locale:    ${cfg.wikijs.locale}`);
```

### createMcpServer Signature Change
```typescript
// Source: src/mcp-tools.ts modification

import type { AppConfig } from "./config.js";
import { redactContent } from "./gdpr.js";
import { buildPageUrl } from "./url.js";

export function createMcpServer(
  wikiJsApi: WikiJsApi,
  instructions: string,
  config: AppConfig,
): McpServer {
  // config available in closure for all tool handlers
}
```

### ProtectedRoutesOptions Extension
```typescript
// Source: src/routes/mcp-routes.ts modification

export interface ProtectedRoutesOptions {
  wikiJsApi: WikiJsApi;
  auth: AuthPluginOptions;
  instructions: string;
  config: AppConfig;  // NEW -- passed to createMcpServer
}

// In protectedRoutes plugin:
const { wikiJsApi, auth, instructions, config } = opts;
// ...
const mcpServer = createMcpServer(wikiJsApi, instructions, config);
```

### Test Helper Update
```typescript
// Source: tests/helpers/build-test-app.ts modification

export function makeTestConfig(
  overrides?: Partial<AppConfig["azure"]>,
): AppConfig {
  return {
    port: 0,
    wikijs: {
      baseUrl: "http://localhost:3000",  // no trailing slash
      token: "test-token",
      locale: "en",  // NEW
    },
    // ... rest unchanged ...
  };
}

// In buildTestApp:
server.register(protectedRoutes, {
  wikiJsApi,
  instructions: instructions ?? DEFAULT_INSTRUCTIONS,
  config: appConfig,  // NEW -- pass config
  auth: { /* unchanged */ },
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw page JSON with `JSON.stringify(page)` | Explicit field construction with URL + redacted content | Phase 26 (this phase) | Controlled JSON output, URL injection, content redaction |
| 2-param `createMcpServer(api, instructions)` | 3-param `createMcpServer(api, instructions, config)` | Phase 26 (this phase) | Tool handlers gain access to app configuration |
| No trailing slash normalization on WIKIJS_BASE_URL | Zod `.transform()` strips trailing slashes | Phase 26 (this phase) | Prevents double-slash bugs in URL construction |

**Deprecated/outdated:**
- `isBlocked()` path filtering: Still active in Phase 26 (running alongside redaction). Will be removed in Phase 27.
- Raw `JSON.stringify(page)` in get_page handler: Replaced by explicit field construction with URL injection.

## Open Questions

1. **redactContent() parameter signature**
   - What we know: Phase 25 plan defines `redactContent(content: string, pageId: number, path: string)` with positional parameters. CONTEXT.md uses shorthand `redactContent(content, { pageId, path })`.
   - What's unclear: Exact signature depends on Phase 25 execution. The Phase 25 plan is authoritative.
   - Recommendation: Use positional parameters per Phase 25 plan: `redactContent(page.content ?? "", page.id, page.path)`. Verify after Phase 25 completes.

2. **Warning logging pattern for redaction warnings**
   - What we know: Phase 25 decided the caller logs warnings as a single batched entry. Only log when warnings exist.
   - What's unclear: The exact log format (structured fields vs. message string).
   - Recommendation: Use the project's existing structured logging pattern via `requestContext.getStore()?.log.warn()`. Include `pageId`, `path`, `warningCount`, and the warnings array.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.1 |
| Config file | `vitest.config.ts` (exists, globals enabled, node environment) |
| Quick run command | `npx vitest run src/__tests__/url.test.ts src/__tests__/mcp-tools-gdpr.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| URL-01 | get_page response includes `url` field with direct link | unit + integration | `npx vitest run src/__tests__/mcp-tools-gdpr.test.ts -t "url"` | Needs new tests |
| URL-01 | buildPageUrl constructs correct URL format | unit | `npx vitest run src/__tests__/url.test.ts` | Needs new file (Wave 0) |
| URL-02 | Base URL from server config, not hardcoded | unit | `npx vitest run tests/config.test.ts -t "WIKIJS_LOCALE"` | Needs new tests |
| URL-02 | Trailing slash normalization on WIKIJS_BASE_URL | unit | `npx vitest run tests/config.test.ts -t "trailing slash"` | Needs new tests |
| -- | redactContent wired into get_page handler | unit | `npx vitest run src/__tests__/mcp-tools-gdpr.test.ts -t "redact"` | Needs new tests |
| -- | No URL on error/blocked responses | unit | `npx vitest run src/__tests__/mcp-tools-gdpr.test.ts -t "blocked"` | Existing tests, needs assertion update |
| -- | get_page tool description mentions url field | unit | `npx vitest run src/__tests__/mcp-tools-gdpr.test.ts -t "description"` | Needs new test |

### Sampling Rate
- **Per task commit:** `npx vitest run src/__tests__/url.test.ts src/__tests__/mcp-tools-gdpr.test.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/__tests__/url.test.ts` -- covers URL-01 (buildPageUrl unit tests)
- [ ] New test cases in `src/__tests__/mcp-tools-gdpr.test.ts` -- covers URL-01 handler integration, redaction wiring
- [ ] New test cases in `tests/config.test.ts` -- covers URL-02 (WIKIJS_LOCALE, trailing slash normalization)

*(Existing test infrastructure -- vitest.config.ts, build-test-app.ts -- covers framework needs; only new test files/cases needed)*

## Sources

### Primary (HIGH confidence)
- **Project codebase** -- Direct file reads of all source files involved:
  - `src/config.ts` -- Zod schema, transform, logConfig
  - `src/mcp-tools.ts` -- createMcpServer, get_page handler (lines 87-113)
  - `src/types.ts` -- WikiJsPage interface
  - `src/server.ts` -- buildApp, protectedRoutes registration
  - `src/routes/mcp-routes.ts` -- ProtectedRoutesOptions, protectedRoutes plugin
  - `src/gdpr.ts` -- isBlocked (confirmed redactContent NOT yet implemented)
  - `src/__tests__/mcp-tools-gdpr.test.ts` -- existing tool handler tests, createMcpServer call patterns
  - `tests/helpers/build-test-app.ts` -- makeTestConfig, buildTestApp patterns
  - `vitest.config.ts` -- test env configuration
- **Node.js REPL verification** -- URL construction patterns (encodeURIComponent per-segment, trailing slash normalization) verified interactively
- **Phase 25 plan and research** -- `redactContent()` signature, return type, module placement confirmed

### Secondary (MEDIUM confidence)
- **CONTEXT.md** -- User decisions on all implementation details (authoritative for this phase)

### Tertiary (LOW confidence)
None -- this phase uses only core JavaScript/TypeScript features with no external libraries or evolving APIs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, uses only existing project libraries
- Architecture: HIGH -- all integration points identified and verified via direct code inspection; URL construction patterns verified via REPL
- Pitfalls: HIGH -- all 7 pitfalls identified from actual code analysis (call sites counted, type mismatches identified, config shape changes mapped)

**Research date:** 2026-03-27
**Valid until:** Indefinite -- pure integration wiring using stable JavaScript/TypeScript patterns
