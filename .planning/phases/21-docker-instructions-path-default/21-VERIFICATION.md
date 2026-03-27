---
phase: 21-docker-instructions-path-default
verified: 2026-03-27T12:26:00Z
status: passed
score: 4/4 must-haves verified
re_verification: false
---

# Phase 21: Docker Instructions Path Default — Verification Report

**Phase Goal:** Add a Zod default of `/app/instructions.txt` for `MCP_INSTRUCTIONS_PATH` so Docker deployers get custom MCP instructions without setting an extra env var.
**Verified:** 2026-03-27T12:26:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                              | Status     | Evidence                                                                                  |
| --- | -------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------- |
| 1   | When `MCP_INSTRUCTIONS_PATH` is absent, `config.instructionsPath` equals `/app/instructions.txt`  | VERIFIED   | `src/config.ts` line 21: `z.string().default('/app/instructions.txt')`; line 37 maps to `instructionsPath`; `tests/config.test.ts` line 144-148 asserts `toBe('/app/instructions.txt')` with no env var present |
| 2   | Explicit `MCP_INSTRUCTIONS_PATH` override still works                                              | VERIFIED   | `tests/config.test.ts` line 134-142 passes `/app/instructions.txt` explicitly and the third test at line 151-160 passes an arbitrary custom path — both assertions green; 321/321 tests pass |
| 3   | Full test suite passes with no failures                                                            | VERIFIED   | `npm test`: 321 passed, 0 failed, 23 test files; `npm run build`: exits 0, no TypeScript errors |
| 4   | `docker-compose up` with a customized `instructions.txt` uses the file without any extra env var   | VERIFIED   | Automated proxy verified: `server.ts` line 79 calls `loadInstructions(config.instructionsPath)` where `config.instructionsPath` is now always a `string` (never `undefined`); the Zod default ensures the Docker volume mount path `/app/instructions.txt` is always used |

**Score:** 4/4 truths verified

---

### Required Artifacts

| Artifact                              | Provides                                                          | Contains                                          | Exists | Substantive | Wired   | Status     |
| ------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------- | ------ | ----------- | ------- | ---------- |
| `src/config.ts`                       | Zod default for `MCP_INSTRUCTIONS_PATH`                           | `z.string().default('/app/instructions.txt')`     | Yes    | Yes         | Yes     | VERIFIED   |
| `tests/config.test.ts`                | Updated assertion: defaults to `/app/instructions.txt`            | `toBe('/app/instructions.txt')` (line 148)        | Yes    | Yes         | Yes     | VERIFIED   |
| `tests/helpers/build-test-app.ts`     | `makeTestConfig` includes `instructionsPath` field                | `instructionsPath: '/app/instructions.txt'` (line 101) | Yes    | Yes         | Yes     | VERIFIED   |
| `.env.example`                        | Empty-value suppression comment for local dev                     | `# MCP_INSTRUCTIONS_PATH=` (line 29)              | Yes    | Yes         | N/A     | VERIFIED   |

---

### Key Link Verification

| From                 | To                        | Via                                                     | Status   | Detail                                                                                 |
| -------------------- | ------------------------- | ------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------- |
| `src/config.ts`      | `AppConfig.instructionsPath` | `z.output<typeof envSchema>` type inference           | WIRED    | Line 37: `instructionsPath: env.MCP_INSTRUCTIONS_PATH` maps the Zod-defaulted value into the output type; type is now `string` (not `string \| undefined`) |
| `src/server.ts`      | `loadInstructions`        | `config.instructionsPath` (now always `string`)         | WIRED    | Line 79: `await loadInstructions(config.instructionsPath)` — direct call with the defaulted path |

---

### Requirements Coverage

| Requirement | Source Plan    | Description                                                             | Status    | Evidence                                                                                                          |
| ----------- | -------------- | ----------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------- |
| DOCK-01     | 21-01-PLAN.md  | `docker-compose.yml` includes volume mount for instructions file (gap closure: Zod default so mount works without extra env var) | SATISFIED | `src/config.ts` line 21 supplies the default; `server.ts` line 79 consumes it; no env var required for Docker deployers |

REQUIREMENTS.md traceability table maps DOCK-01 to "Phase 20, Phase 21 (gap closure)" — both phases claimed it; Phase 21's scope is narrowly the Zod default that closes the env-var gap. No orphaned requirements.

---

### Anti-Patterns Found

None. Scanned `src/config.ts`, `tests/config.test.ts`, `tests/helpers/build-test-app.ts` for TODO/FIXME/XXX/HACK/placeholder patterns — zero matches. No stub implementations detected in modified files.

---

### Human Verification Required

None. All observable truths are verifiable programmatically:
- The Zod default value is a literal in source and confirmed by passing tests.
- The type change from `string | undefined` to `string` is confirmed by a clean `npm run build`.
- The full test suite (321 tests) exercises both the default and override paths.

The only truth that could require human verification — "deployer sees custom content in MCP initialize response after `docker-compose up`" — is fully covered by the automated proxy: `loadInstructions(config.instructionsPath)` reads the file at the default path, and the instructions integration tests (Phase 19) cover the file-loading and fallback paths in isolation.

---

### Commits Verified

| Hash      | Message                                                                     |
| --------- | --------------------------------------------------------------------------- |
| `c550246` | feat(21-01): add Zod default /app/instructions.txt for MCP_INSTRUCTIONS_PATH |
| `252cd66` | chore(21-01): update .env.example with empty-value suppression comment for MCP_INSTRUCTIONS_PATH |

Both commits exist in `git log`. No gaps between planned and delivered commits.

---

### Summary

Phase 21 achieved its goal completely. The one-line change in `src/config.ts` (`.optional()` to `.default('/app/instructions.txt')`) propagates correctly through the type system: `AppConfig.instructionsPath` is now `string` instead of `string | undefined`, `server.ts` passes it directly to `loadInstructions`, and the downstream type error in `makeTestConfig()` was resolved by adding the explicit field. The `.env.example` update documents both the Docker default and the local-dev escape hatch. No regressions: 321 tests pass, TypeScript build is clean.

DOCK-01 is fully satisfied. The v2.4 milestone is complete.

---

_Verified: 2026-03-27T12:26:00Z_
_Verifier: Claude (gsd-verifier)_
