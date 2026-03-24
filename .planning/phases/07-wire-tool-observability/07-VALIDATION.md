---
phase: 7
slug: wire-tool-observability
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.1 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/observability.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/observability.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green (excluding pre-existing scopes.test.ts failures)
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 0 | OBSV-01 | unit | `npx vitest run tests/observability.test.ts -t "debug-level"` | ❌ W0 | ⬜ pending |
| 07-01-02 | 01 | 0 | OBSV-01 | integration | `npx vitest run tests/observability.test.ts -t "tools/call logs"` | ❌ W0 | ⬜ pending |
| 07-01-03 | 01 | 1 | OBSV-01 | unit | `npx vitest run tests/observability.test.ts -t "debug-level"` | ❌ W0 | ⬜ pending |
| 07-01-04 | 01 | 1 | OBSV-01 | integration | `npx vitest run tests/observability.test.ts -t "representative"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Integration test describe block in `tests/observability.test.ts` — covers OBSV-01 end-to-end through MCP stack
- [ ] Debug args unit test in `tests/observability.test.ts` — covers new debug log behavior
- No framework install or config needed — vitest already configured

*Existing infrastructure covers framework requirements.*

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
