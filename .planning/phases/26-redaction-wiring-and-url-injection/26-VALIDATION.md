---
phase: 26
slug: redaction-wiring-and-url-injection
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-27
---

# Phase 26 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.1 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run src/__tests__/url.test.ts src/__tests__/mcp-tools-gdpr.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/__tests__/url.test.ts src/__tests__/mcp-tools-gdpr.test.ts`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 26-01-01 | 01 | 0 | URL-01 | unit | `npx vitest run src/__tests__/url.test.ts` | ❌ W0 | ⬜ pending |
| 26-01-02 | 01 | 0 | URL-01, URL-02 | unit | `npx vitest run src/__tests__/mcp-tools-gdpr.test.ts -t "url"` | ❌ W0 | ⬜ pending |
| 26-01-03 | 01 | 0 | URL-02 | unit | `npx vitest run tests/config.test.ts -t "WIKIJS_LOCALE"` | ❌ W0 | ⬜ pending |
| 26-01-04 | 01 | 1 | URL-02 | unit | `npx vitest run tests/config.test.ts -t "trailing slash"` | ✅ | ⬜ pending |
| 26-01-05 | 01 | 1 | URL-01 | unit+integration | `npx vitest run src/__tests__/mcp-tools-gdpr.test.ts -t "redact"` | ❌ W0 | ⬜ pending |
| 26-01-06 | 01 | 1 | -- | unit | `npx vitest run src/__tests__/mcp-tools-gdpr.test.ts -t "blocked"` | ✅ | ⬜ pending |
| 26-01-07 | 01 | 1 | -- | unit | `npx vitest run src/__tests__/mcp-tools-gdpr.test.ts -t "description"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/url.test.ts` — stubs for URL-01 (buildPageUrl unit tests)
- [ ] New test cases in `src/__tests__/mcp-tools-gdpr.test.ts` — covers URL-01 handler integration, redaction wiring
- [ ] New test cases in `tests/config.test.ts` — covers URL-02 (WIKIJS_LOCALE, trailing slash normalization)

*Existing test infrastructure (vitest.config.ts, build-test-app.ts) covers framework needs; only new test files/cases needed.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
