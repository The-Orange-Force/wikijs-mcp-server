---
phase: 15
slug: api-layer-consolidation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-26
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.1 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/api.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/api.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 0 | TOOL-01, TOOL-02, SRCH-01, SRCH-02 | unit (stubs) | `npx vitest run tests/api.test.ts` | ❌ W0 | ⬜ pending |
| 15-01-02 | 01 | 1 | TOOL-01 | unit | `npx vitest run tests/api.test.ts -t "getPageById"` | ❌ W0 | ⬜ pending |
| 15-01-03 | 01 | 1 | TOOL-02 | unit | `npx vitest run tests/api.test.ts -t "listPages"` | ❌ W0 | ⬜ pending |
| 15-01-04 | 01 | 2 | SRCH-01 | unit | `npx vitest run tests/api.test.ts -t "searchPages.*resolve"` | ❌ W0 | ⬜ pending |
| 15-01-05 | 01 | 2 | SRCH-02 | unit | `npx vitest run tests/api.test.ts -t "searchPages.*fallback"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/api.test.ts` — NEW unit test file with stubs for TOOL-01, TOOL-02, SRCH-01, SRCH-02
- [ ] Update `tests/helpers/build-test-app.ts` — mockWikiJsApi updated method signatures (getPageById returns content + isPublished, searchPages returns { results, totalHits }, remove old methods)
- [ ] Update `tests/smoke.test.ts` — duplicate mockWikiJsApi needs same updates

*Existing Vitest infrastructure covers framework setup — no new test framework installation needed.*

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
