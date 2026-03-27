---
phase: 28
slug: metadata-fallback-implementation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 28 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/api.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/api.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 28-01-01 | 01 | 1 | META-01 | unit | `npx vitest run tests/api.test.ts -t "metadata fallback"` | ❌ W0 | ⬜ pending |
| 28-01-02 | 01 | 1 | META-02 | unit | `npx vitest run tests/api.test.ts -t "case-insensitive"` | ❌ W0 | ⬜ pending |
| 28-01-03 | 01 | 1 | META-03 | unit | `npx vitest run tests/api.test.ts -t "dedup"` | ❌ W0 | ⬜ pending |
| 28-01-04 | 01 | 1 | META-04 | unit | `npx vitest run tests/api.test.ts -t "unpublished"` | ❌ W0 | ⬜ pending |
| 28-01-05 | 01 | 1 | META-05 | unit | `npx vitest run tests/api.test.ts -t "limit"` | ❌ W0 | ⬜ pending |
| 28-01-06 | 01 | 1 | META-06 | unit | `npx vitest run tests/api.test.ts -t "totalHits"` | ❌ W0 | ⬜ pending |
| 28-01-07 | 01 | 1 | INTG-01 | unit | `npx vitest run tests/api.test.ts -t "shares pages.list"` | ❌ W0 | ⬜ pending |
| 28-01-08 | 01 | 1 | INTG-02 | unit | `npx vitest run tests/api.test.ts -t "zero results"` | ✅ (needs update) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] New test cases in `tests/api.test.ts` — stubs for META-01 through META-06, INTG-01
- [ ] Update existing test "returns empty results for empty search" (line 347) — currently expects 1 GraphQL call and empty results; must account for metadata fallback (INTG-02)

*Existing infrastructure covers framework needs. No new test files or framework changes needed.*

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
