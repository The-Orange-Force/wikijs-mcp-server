---
phase: 29
slug: test-coverage-observability-and-tool-description
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 29 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.1 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/metadata-fallback.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/metadata-fallback.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 29-01-01 | 01 | 1 | OBSV-01 | unit | `npx vitest run tests/metadata-fallback.test.ts -t "log"` | ❌ W0 | ⬜ pending |
| 29-01-02 | 01 | 1 | OBSV-01 | unit | `npx vitest run tests/metadata-fallback.test.ts -t "no metadata fallback"` | ❌ W0 | ⬜ pending |
| 29-01-03 | 01 | 1 | TOOL-01 | unit | `npx vitest run tests/metadata-fallback.test.ts -t "description"` | ❌ W0 | ⬜ pending |
| 29-01-04 | 01 | 1 | META-02 | unit | `npx vitest run tests/metadata-fallback.test.ts -t "case"` | ❌ W0 | ⬜ pending |
| 29-01-05 | 01 | 1 | META-03 | unit | `npx vitest run tests/metadata-fallback.test.ts -t "dedup"` | ❌ W0 | ⬜ pending |
| 29-01-06 | 01 | 1 | META-04 | unit | `npx vitest run tests/metadata-fallback.test.ts -t "unpublished"` | ❌ W0 | ⬜ pending |
| 29-01-07 | 01 | 1 | META-05 | unit | `npx vitest run tests/metadata-fallback.test.ts -t "limit"` | ❌ W0 | ⬜ pending |
| 29-01-08 | 01 | 1 | META-06 | unit | `npx vitest run tests/metadata-fallback.test.ts -t "totalHits"` | ❌ W0 | ⬜ pending |
| 29-01-09 | 01 | 1 | INTG-01 | unit | `npx vitest run tests/metadata-fallback.test.ts -t "data sharing"` | ❌ W0 | ⬜ pending |
| 29-01-10 | 01 | 1 | INTG-02 | unit | `npx vitest run tests/metadata-fallback.test.ts -t "zero"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/metadata-fallback.test.ts` — dedicated test file covering OBSV-01, TOOL-01, and full test matrix
- No framework install needed — Vitest 4.1.1 already configured
- No shared fixtures needed — test uses self-contained mock pattern from api.test.ts

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
