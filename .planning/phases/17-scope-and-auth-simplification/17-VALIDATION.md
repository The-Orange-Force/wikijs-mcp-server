---
phase: 17
slug: scope-and-auth-simplification
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-26
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4 |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run tests/scopes.test.ts src/auth/__tests__/middleware.test.ts tests/discovery.test.ts -x` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/scopes.test.ts src/auth/__tests__/middleware.test.ts tests/discovery.test.ts src/oauth-proxy/__tests__/scope-mapper.test.ts -x`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 1 | SCOP-01 | unit | `npx vitest run tests/scopes.test.ts -x` | ❌ W0 (rewrite) | ⬜ pending |
| 17-01-02 | 01 | 1 | SCOP-01 | unit | `npx vitest run src/auth/__tests__/middleware.test.ts -x` | ✅ (update) | ⬜ pending |
| 17-01-03 | 01 | 1 | SCOP-01 | integration | `npx vitest run tests/discovery.test.ts -x` | ✅ (update) | ⬜ pending |
| 17-01-04 | 01 | 1 | SCOP-02 | unit | `npx vitest run tests/scopes.test.ts -x` | ❌ W0 (rewrite) | ⬜ pending |
| 17-01-05 | 01 | 1 | SCOP-02 | unit | `npx vitest run tests/scopes.test.ts -x` | ❌ W0 (rewrite) | ⬜ pending |
| 17-01-06 | 01 | 1 | SCOP-01 | unit | `npx vitest run src/oauth-proxy/__tests__/scope-mapper.test.ts -x` | ✅ (update) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.* No new test files or framework config needed. All changes are modifications to existing test files (scopes.test.ts is a full rewrite, others are assertion updates).

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
