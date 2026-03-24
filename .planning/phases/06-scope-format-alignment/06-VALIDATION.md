---
phase: 6
slug: scope-format-alignment
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (via vitest.config.ts) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/scopes.test.ts tests/discovery.test.ts src/auth/__tests__/middleware.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/scopes.test.ts tests/discovery.test.ts src/auth/__tests__/middleware.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | DISC-02 | unit | `npx vitest run tests/scopes.test.ts -x` | ✅ (needs assertion update) | ⬜ pending |
| 06-01-02 | 01 | 1 | DISC-02 | integration | `npx vitest run src/auth/__tests__/middleware.test.ts -x` | ✅ (no changes needed) | ⬜ pending |
| 06-01-03 | 01 | 1 | DISC-02 | integration | `npx vitest run tests/discovery.test.ts -x` | ✅ (needs assertion update) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. Tests already exist for scope values (`tests/scopes.test.ts`), discovery response (`tests/discovery.test.ts`), and middleware scope validation (`src/auth/__tests__/middleware.test.ts`). Only assertion values need updating, not new test files.

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
