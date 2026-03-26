---
phase: 16
slug: tool-registration-consolidation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-26
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 16-01-01 | 01 | 1 | TOOL-03 | integration | `npx vitest run tests/smoke.test.ts -t "returns exactly 3 tools" -x` | Will update existing | ⬜ pending |
| 16-01-02 | 01 | 1 | TOOL-04 | integration | `npx vitest run tests/smoke.test.ts -t "removed tools" -x` | Will add new | ⬜ pending |
| 16-01-03 | 01 | 1 | SRCH-03 | integration | `npx vitest run tests/smoke.test.ts -t "description" -x` | Will add new | ⬜ pending |
| 16-01-04 | 01 | 1 | TOOL-03, TOOL-04 | unit | `npx vitest run tests/scopes.test.ts -x` | Will update existing | ⬜ pending |
| 16-01-05 | 01 | 1 | TOOL-03, TOOL-04 | integration | `npx vitest run tests/observability.test.ts -x` | Will update existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Update `tests/smoke.test.ts` — change 17-tool count to 3, rewrite invocation tests
- [ ] Update `tests/scopes.test.ts` — change 17-tool count to 3, update per-scope tool lists
- [ ] Update `tests/observability.test.ts` — replace `list_users` integration test with `list_pages`
- [ ] Update `tests/helpers/build-test-app.ts` — trim mockWikiJsApi to 3 stubs + checkConnection
- [ ] Update `tests/smoke.test.ts` inline mockWikiJsApi — or migrate to use buildTestApp

*These test updates are embedded in the implementation tasks — no separate Wave 0 plan needed.*

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
