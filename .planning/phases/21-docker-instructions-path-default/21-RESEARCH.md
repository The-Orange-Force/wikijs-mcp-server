# Phase 21: Docker Instructions Path Default - Research

**Researched:** 2026-03-27
**Domain:** Zod schema defaults, TypeScript type propagation, Vitest test updates
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Add `.default('/app/instructions.txt')` to `MCP_INSTRUCTIONS_PATH` in the Zod envSchema in `config.ts`
- `config.instructionsPath` becomes `string` (non-optional) — consistent with how `PORT` is handled
- Pattern matches existing `PORT: z.string().default("8000")` in the schema
- Accept the warning on local dev — when running `npm run dev` without the file present, the existing `console.warn` fires and server falls back to hardcoded default
- No special-casing for the default path vs an explicit override
- Document suppression in `.env.example`: set `MCP_INSTRUCTIONS_PATH=` (empty string) to skip file loading entirely
- Tests that depend on `instructionsPath` being `undefined` must be updated
- Preferred approach: update tests to reflect correct behavior (attempt to load `/app/instructions.txt`, fall back to default)
- `buildApp()` already accepts an explicit `instructions` parameter — tests that want filesystem isolation can pass instructions directly
- `CLAUDE.md` env var table: update `MCP_INSTRUCTIONS_PATH` row — Required stays "No", update Description/Example to show default `/app/instructions.txt`
- `README.md` env var table: same update
- `.env.example`: add two commented lines — one showing the default path, one showing how to suppress the warning (empty value)

### Claude's Discretion
- Exact wording of the `.env.example` comments
- Exact column(s) updated in the env var tables (Description vs Example vs both)
- Internal test mock strategy (mock fs.readFile vs pass instructions directly to buildApp)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DOCK-01 | `docker-compose.yml` includes volume mount for instructions file | Volume mount already exists at `./instructions.txt:/app/instructions.txt:ro`; the gap is that `config.ts` has no default, so the mount is silently unused unless deployer sets the env var |
</phase_requirements>

---

## Summary

Phase 21 is a single-line gap closure. The `docker-compose.yml` already mounts `./instructions.txt` at `/app/instructions.txt:ro`, but `src/config.ts` declares `MCP_INSTRUCTIONS_PATH: z.string().optional()` — meaning a deployer who does `docker-compose up` with a customized file gets the generic `DEFAULT_INSTRUCTIONS` unless they also set `MCP_INSTRUCTIONS_PATH=/app/instructions.txt` in `.env`. Adding `.default('/app/instructions.txt')` to the Zod field closes the gap.

The change has three downstream effects: the TypeScript type of `config.instructionsPath` widens from `string | undefined` to `string`; two tests in `tests/config.test.ts` that assert `instructionsPath` is `undefined` will need to be updated to assert `/app/instructions.txt`; and the `if (!path)` guard at the top of `loadInstructions` becomes unreachable (dead code, harmless). Documentation updates to `CLAUDE.md`, `README.md`, and `.env.example` round out the change.

The existing test infrastructure (Vitest 4, `vi.mock('node:fs/promises')` in `tests/instructions.test.ts`, `buildTestApp(..., instructions?)` in `tests/helpers/build-test-app.ts`) handles all test isolation needs without new framework setup.

**Primary recommendation:** Change one line in `src/config.ts`, update two test assertions in `tests/config.test.ts`, and update three documentation files. No new files required.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Zod | (existing) | Schema validation + defaults | Already used for entire envSchema; `.default()` is the established pattern for optional env vars with defaults |
| TypeScript 5.3 | (existing) | Type inference from Zod output | `z.output<typeof envSchema>` auto-derives `instructionsPath: string` once `.optional()` is removed |
| Vitest | 4 (existing) | Test runner | Already configured; no new setup needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:fs/promises` readFile | Node.js built-in | Already used in `src/instructions.ts` | Test mocking already in place via `vi.mock` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `z.string().default('/app/instructions.txt')` | `z.string().optional()` + runtime fallback in `loadInstructions` | Runtime fallback already exists but it fires only on file-not-found, not on `path === undefined`; the Zod default is the correct fix level |

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended Project Structure
No structural changes. All edits are in-place modifications to existing files.

### Pattern 1: Zod Default for Optional Env Var

**What:** Change `z.string().optional()` to `z.string().default('/app/instructions.txt')` in the envSchema object definition.

**When to use:** When an env var has a sensible default that matches a well-known deployment path. Identical to how `PORT` is handled.

**Example:**
```typescript
// src/config.ts — before (line 21)
MCP_INSTRUCTIONS_PATH: z.string().optional(),

// src/config.ts — after
MCP_INSTRUCTIONS_PATH: z.string().default('/app/instructions.txt'),
```

The `.transform()` block on the schema object does not need to change — `env.MCP_INSTRUCTIONS_PATH` is always a `string` after applying the default, so the existing `instructionsPath: env.MCP_INSTRUCTIONS_PATH` line is correct as-is.

### Pattern 2: TypeScript Type Update from Zod Output

**What:** `AppConfig` is derived via `z.output<typeof envSchema>`. Once `MCP_INSTRUCTIONS_PATH` has a `.default()`, the inferred type of `instructionsPath` changes from `string | undefined` to `string`. No manual type annotation changes are needed.

**When to use:** Whenever Zod schema changes implicitly narrow or widen downstream TypeScript types.

**Impact on callers:**
- `src/server.ts` line 79: `loadInstructions(config.instructionsPath)` — no change; was already passing to a `path?: string` parameter; now passes a guaranteed `string`
- `src/instructions.ts` `loadInstructions(path?: string)`: signature stays compatible; `if (!path)` guard on line 41 becomes dead code (harmless; the guard never fires since `path` will always be a non-empty string from config)
- `tests/helpers/build-test-app.ts` `makeTestConfig()`: `instructionsPath` is not set in the test config object — this is fine because `makeTestConfig` bypasses `envSchema` and constructs `AppConfig` directly. The type annotation for `AppConfig` will now require `instructionsPath: string`, so `makeTestConfig` must include it. See Pitfall 1.

### Pattern 3: Test Isolation via buildTestApp instructions Parameter

**What:** Tests that exercise non-default instructions pass the `instructions` string directly to `buildTestApp(configOverrides?, wikiJsApiOverride?, loggerOptions?, instructions?)`. Tests that only care about the default content pass nothing.

**When to use:** Any test that previously relied on `instructionsPath: undefined` causing `loadInstructions` to short-circuit — those tests should now pass `DEFAULT_INSTRUCTIONS` explicitly or just let `buildTestApp` use its own default.

### Anti-Patterns to Avoid
- **Changing `loadInstructions` signature to `path: string` (non-optional):** The function is also callable from tests that set `path` explicitly; keeping `path?: string` means the `if (!path)` guard remains as a safety net even if it is currently unreachable from `start()`.
- **Adding an empty-string guard in `loadInstructions`:** The CONTEXT.md decision says "document suppression in `.env.example`" — the implementation does NOT need to handle empty-string specially in code. Zod's `z.string()` with no `.min(1)` will pass an empty string through as the `instructionsPath` value; `readFile('')` will throw ENOENT-like errors which are caught and warn+fallback already. This is the accepted behavior.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Default env var value | Runtime if/else in `start()` | `z.string().default(...)` in Zod schema | Schema is the source of truth; defaults in business logic diverge from documentation |
| Type narrowing after adding default | Manual `as string` casts | Let `z.output<typeof envSchema>` re-derive the type | Zod output types are auto-inferred; casts hide errors |

---

## Common Pitfalls

### Pitfall 1: makeTestConfig Missing instructionsPath
**What goes wrong:** After `AppConfig` type changes `instructionsPath` to `string`, `makeTestConfig()` in `tests/helpers/build-test-app.ts` omits the field — TypeScript compilation fails with a missing property error.
**Why it happens:** `makeTestConfig` constructs a plain `AppConfig` object literal without going through `envSchema.safeParse`. It must include all required fields.
**How to avoid:** Add `instructionsPath: '/app/instructions.txt'` to the object literal in `makeTestConfig`.
**Warning signs:** `TS2322: Type ... is not assignable to type 'AppConfig'` mentioning `instructionsPath`.

### Pitfall 2: Two Config Tests Assert `instructionsPath === undefined`
**What goes wrong:** `tests/config.test.ts` contains these two tests that will now fail:
- `"is undefined in parsed config when MCP_INSTRUCTIONS_PATH is not provided"` (line 144) — expects `toBeUndefined()`, will get `'/app/instructions.txt'`
- The first test `"is accepted as an optional env var and mapped to instructionsPath"` will still pass (expects the explicit value)
**Why it happens:** Tests were written when `MCP_INSTRUCTIONS_PATH` was optional.
**How to avoid:** Update the assertion on line 148 from `toBeUndefined()` to `toBe('/app/instructions.txt')`. Update the test description from `"is undefined ... when not provided"` to `"defaults to /app/instructions.txt when not provided"`.
**Warning signs:** `AssertionError: expected undefined to be '/app/instructions.txt'` in config.test.ts.

### Pitfall 3: vitest.config.ts Global Env Does Not Set MCP_INSTRUCTIONS_PATH
**What goes wrong:** The global env in `vitest.config.ts` does not set `MCP_INSTRUCTIONS_PATH`. After adding the Zod default, `envSchema.safeParse(process.env)` at module load time will produce `instructionsPath: '/app/instructions.txt'` — which is fine. The module-level `config` in `src/config.ts` will have the default value. No issue here.
**Why it happens:** `.default()` applies inside `safeParse`; missing env var → default fires → no error.
**How to avoid:** No action needed. Vitest global env can stay as-is.

### Pitfall 4: Instructions Test "no path provided" Cases Still Valid
**What goes wrong:** Tests in `tests/instructions.test.ts` test `loadInstructions()` (no argument) and `loadInstructions(undefined)`. These test the `loadInstructions` function in isolation, not the config-driven path. They remain valid because `loadInstructions` still accepts `path?: string`.
**Why it happens:** Confusion between testing config behavior vs function behavior.
**How to avoid:** Leave `tests/instructions.test.ts` untouched. Only `tests/config.test.ts` needs updating.

---

## Code Examples

Verified patterns from the existing codebase:

### Zod Default — Existing Pattern (config.ts line 11)
```typescript
// Source: src/config.ts
PORT: z.string().default("8000").transform(Number),
```

### Zod Default — New Pattern (config.ts line 21)
```typescript
// Change from:
MCP_INSTRUCTIONS_PATH: z.string().optional(),

// Change to:
MCP_INSTRUCTIONS_PATH: z.string().default('/app/instructions.txt'),
```

### Test Update — config.test.ts
```typescript
// Change test at line 144 from:
it("is undefined in parsed config when MCP_INSTRUCTIONS_PATH is not provided", () => {
  const result = envSchema.safeParse(validEnv);
  expect(result.success).toBe(true);
  if (!result.success) return;
  expect(result.data.instructionsPath).toBeUndefined();
});

// Change to:
it("defaults to /app/instructions.txt when MCP_INSTRUCTIONS_PATH is not provided", () => {
  const result = envSchema.safeParse(validEnv);
  expect(result.success).toBe(true);
  if (!result.success) return;
  expect(result.data.instructionsPath).toBe('/app/instructions.txt');
});
```

### makeTestConfig — Add instructionsPath
```typescript
// tests/helpers/build-test-app.ts — makeTestConfig()
export function makeTestConfig(overrides?: Partial<AppConfig["azure"]>): AppConfig {
  return {
    port: 0,
    wikijs: { baseUrl: "http://localhost:3000", token: "test-token" },
    azure: { ... },
    instructionsPath: '/app/instructions.txt',  // ADD THIS LINE
  };
}
```

### .env.example — Documentation Pattern
```bash
# (Optional) Path to custom MCP instructions file
# Default: /app/instructions.txt (matches docker-compose volume mount)
# MCP_INSTRUCTIONS_PATH=/app/instructions.txt  # default path (Docker volume mount)
# MCP_INSTRUCTIONS_PATH=                       # set empty to skip file loading (local dev)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `MCP_INSTRUCTIONS_PATH: z.string().optional()` | `MCP_INSTRUCTIONS_PATH: z.string().default('/app/instructions.txt')` | Phase 21 | Docker volume mount works out-of-the-box |
| `instructionsPath: string \| undefined` in AppConfig | `instructionsPath: string` in AppConfig | Phase 21 (type derived from schema) | Downstream callers no longer need to handle undefined |

**Dead code after change:**
- `loadInstructions` `if (!path)` guard (line 41 of `src/instructions.ts`): becomes unreachable from `start()` since `config.instructionsPath` is always a string. Harmless — keep it as a defensive safety net.

---

## Open Questions

None. The CONTEXT.md decisions are fully specified and the codebase analysis confirms all affected files and their exact line numbers.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test -- tests/config.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DOCK-01 | When `MCP_INSTRUCTIONS_PATH` is absent, `config.instructionsPath` equals `/app/instructions.txt` | unit | `npm test -- tests/config.test.ts` | ✅ (needs update) |
| DOCK-01 | Explicit `MCP_INSTRUCTIONS_PATH` override still works | unit | `npm test -- tests/config.test.ts` | ✅ (no change needed) |
| DOCK-01 | `docker-compose.yml` mounts at `/app/instructions.txt` | unit | `npm test -- tests/docker-config.test.ts` | ✅ (no change needed) |

### Sampling Rate
- **Per task commit:** `npm test -- tests/config.test.ts tests/docker-config.test.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green (321+ tests) before `/gsd:verify-work`

### Wave 0 Gaps
None — existing test infrastructure covers all phase requirements. Two test assertions in `tests/config.test.ts` need updating, but the file and test structure already exist.

---

## Sources

### Primary (HIGH confidence)
- Direct read of `src/config.ts` — confirmed current `MCP_INSTRUCTIONS_PATH: z.string().optional()` at line 21
- Direct read of `src/instructions.ts` — confirmed `if (!path)` guard at line 41 and `loadInstructions(path?: string)` signature
- Direct read of `src/server.ts` — confirmed `loadInstructions(config.instructionsPath)` call at line 79
- Direct read of `tests/config.test.ts` — confirmed two assertions that will break at lines 144-149
- Direct read of `tests/helpers/build-test-app.ts` — confirmed `makeTestConfig()` lacks `instructionsPath` field
- Direct read of `vitest.config.ts` — confirmed `MCP_INSTRUCTIONS_PATH` not in global env (irrelevant after change)
- Direct read of `docker-compose.yml` — confirmed volume mount `./instructions.txt:/app/instructions.txt:ro`
- Direct read of `.env.example` — confirmed current state of `MCP_INSTRUCTIONS_PATH` documentation
- Direct read of `.planning/v2.4-MILESTONE-AUDIT.md` — confirmed gap description and evidence

### Secondary (MEDIUM confidence)
- `tests/instructions.test.ts` analyzed — confirmed these tests use `loadInstructions` directly and are unaffected by config change

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries are existing dependencies; no new packages
- Architecture: HIGH — change scope is a single Zod field + downstream type propagation, fully traced through codebase
- Pitfalls: HIGH — identified by direct code analysis of affected test files; confirmed by running full test suite (321 passing)

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (stable codebase; only invalidated by changes to config.ts or instructions.ts)
