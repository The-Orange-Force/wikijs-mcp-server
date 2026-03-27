---
phase: 25
slug: core-redaction-function
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-27
---

# Phase 25 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.1 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run src/__tests__/gdpr.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/__tests__/gdpr.test.ts`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 25-01-01 | 01 | 1 | REDACT-01 | unit | `npx vitest run src/__tests__/gdpr.test.ts -t "single marker pair"` | ✅ | ⬜ pending |
| 25-01-02 | 01 | 1 | REDACT-02 | unit | `npx vitest run src/__tests__/gdpr.test.ts -t "multiple marker pairs"` | ✅ | ⬜ pending |
| 25-01-03 | 01 | 1 | REDACT-03 | unit | `npx vitest run src/__tests__/gdpr.test.ts -t "placeholder"` | ✅ | ⬜ pending |
| 25-01-04 | 01 | 1 | REDACT-04 | unit | `npx vitest run src/__tests__/gdpr.test.ts -t "unclosed"` | ✅ | ⬜ pending |
| 25-01-05 | 01 | 1 | REDACT-05 | unit | `npx vitest run src/__tests__/gdpr.test.ts -t "warnings"` | ✅ | ⬜ pending |
| 25-01-06 | 01 | 1 | REDACT-06 | unit | `npx vitest run src/__tests__/gdpr.test.ts -t "case"` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements:
- `src/__tests__/gdpr.test.ts` already exists with `isBlocked()` tests
- `vitest.config.ts` is configured with required environment variables
- No additional fixtures or helpers needed (pure function with string inputs/outputs)

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
