---
phase: 25
slug: core-redaction-function
status: audited
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-27
audited: 2026-03-27
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
| 25-01-01 | 01 | 1 | REDACT-01 | unit | `npx vitest run src/__tests__/gdpr.test.ts -t "single marker pair"` | ✅ | ✅ green |
| 25-01-02 | 01 | 1 | REDACT-02 | unit | `npx vitest run src/__tests__/gdpr.test.ts -t "multiple marker pairs"` | ✅ | ✅ green |
| 25-01-03 | 01 | 1 | REDACT-03 | unit | `npx vitest run src/__tests__/gdpr.test.ts -t "placeholder"` | ✅ | ✅ green |
| 25-01-04 | 01 | 1 | REDACT-04 | unit | `npx vitest run src/__tests__/gdpr.test.ts -t "unclosed"` | ✅ | ✅ green |
| 25-01-05 | 01 | 1 | REDACT-05 | unit | `npx vitest run src/__tests__/gdpr.test.ts -t "warnings"` | ✅ | ✅ green |
| 25-01-06 | 01 | 1 | REDACT-06 | unit | `npx vitest run src/__tests__/gdpr.test.ts -t "case"` | ✅ | ✅ green |

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

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved (2026-03-27)

---

## Validation Audit 2026-03-27

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

All 6 requirements (REDACT-01 through REDACT-06) have comprehensive automated tests. 26 tests pass in 5ms. No manual-only verifications needed.
