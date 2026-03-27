---
phase: 26
slug: redaction-wiring-and-url-injection
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-27
updated: 2026-03-27
---

# Phase 26 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.1 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run src/__tests__/url.test.ts src/__tests__/mcp-tools-phase26.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/__tests__/url.test.ts src/__tests__/mcp-tools-phase26.test.ts`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 26-01-01 | 01 | 0 | URL-01 | unit | `npx vitest run src/__tests__/url.test.ts` | ✅ | ✅ green |
| 26-01-02 | 01 | 0 | URL-01, URL-02 | unit | `npx vitest run src/__tests__/mcp-tools-phase26.test.ts -t "url"` | ✅ | ✅ green |
| 26-01-03 | 01 | 0 | URL-02 | unit | `npx vitest run tests/config.test.ts -t "WIKIJS_LOCALE"` | ✅ | ✅ green |
| 26-01-04 | 01 | 1 | URL-02 | unit | `npx vitest run tests/config.test.ts -t "trailing slash"` | ✅ | ✅ green |
| 26-01-05 | 01 | 1 | URL-01 | unit+integration | `npx vitest run src/__tests__/mcp-tools-phase26.test.ts -t "warn"` | ✅ | ✅ green |
| 26-01-06 | 01 | 1 | -- | E2E | `npx vitest run tests/e2e-redaction.test.ts` | ✅ | ✅ green |
| 26-01-07 | 01 | 1 | -- | unit | `npx vitest run src/__tests__/mcp-tools-phase26.test.ts -t "description"` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Note:** Original `src/__tests__/mcp-tools-gdpr.test.ts` was deleted in Phase 27 (commit `3b5a107`) when path-based filtering was removed. Gap-fill tests created in `src/__tests__/mcp-tools-phase26.test.ts` to restore coverage.

---

## Wave 0 Requirements

- [x] `src/__tests__/url.test.ts` — 8 buildPageUrl unit tests (URL-01)
- [x] `src/__tests__/mcp-tools-phase26.test.ts` — URL injection, error shape, tool description, warning logging (URL-01, URL-02)
- [x] `tests/config.test.ts` — WIKIJS_LOCALE (3 tests) and trailing slash normalization (3 tests) (URL-02)
- [x] `tests/e2e-redaction.test.ts` — E2E verification of redaction + URL in handler pipeline

*Existing test infrastructure (vitest.config.ts, build-test-app.ts) covers framework needs; only new test files/cases needed.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** complete

---

## Validation Audit 2026-03-27

| Metric | Count |
|--------|-------|
| Gaps found | 4 |
| Resolved | 4 |
| Escalated | 0 |

**Details:**
- Gap 1 (MISSING): Tool description tests — resolved with 2 tests in `mcp-tools-phase26.test.ts`
- Gap 2 (MISSING): Error response excludes url — resolved with 2 tests in `mcp-tools-phase26.test.ts`
- Gap 3 (PARTIAL): Config-driven URL values — resolved with 2 tests in `mcp-tools-phase26.test.ts`
- Gap 4 (PARTIAL): Redaction warning logging — resolved with 3 tests in `mcp-tools-phase26.test.ts`
