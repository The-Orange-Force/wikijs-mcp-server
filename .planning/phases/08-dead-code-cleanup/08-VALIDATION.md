---
phase: 8
slug: dead-code-cleanup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.1 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run` + `npx tsc --noEmit`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | tech-debt | verification | `test -f src/auth-errors.ts && echo FAIL \|\| echo PASS` | ✅ | ⬜ pending |
| 08-01-02 | 01 | 1 | tech-debt | verification | `test -f src/tools.ts && echo FAIL \|\| echo PASS` | ✅ | ⬜ pending |
| 08-01-03 | 01 | 1 | tech-debt | verification | `grep -r 'mcp/events' src/ && echo FAIL \|\| echo PASS` | ✅ | ⬜ pending |
| 08-01-04 | 01 | 1 | tech-debt | unit/integration | `npx vitest run` | ✅ | ⬜ pending |
| 08-01-05 | 01 | 1 | tech-debt | compilation | `npx tsc --noEmit` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test files or fixtures needed — this is a deletion-only phase.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
