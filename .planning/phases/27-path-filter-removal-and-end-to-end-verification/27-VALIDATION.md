---
phase: 27
slug: path-filter-removal-and-end-to-end-verification
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-27
---

# Phase 27 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4 |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run tests/e2e-redaction.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/e2e-redaction.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 27-01-01 | 01 | 1 | FILTER-01 | smoke (grep) | `grep -r "isBlocked\|gdpr\.js" src/ && exit 1 \|\| echo PASS` | ✅ | ⬜ pending |
| 27-01-02 | 01 | 1 | FILTER-01 | unit | `npx vitest run tests/e2e-redaction.test.ts` | ❌ W0 | ⬜ pending |
| 27-01-03 | 01 | 2 | FILTER-02 | integration (E2E) | `npx vitest run tests/e2e-redaction.test.ts` | ❌ W0 | ⬜ pending |
| 27-01-04 | 01 | 2 | FILTER-02 | integration (E2E) | `npx vitest run tests/e2e-redaction.test.ts` | ❌ W0 | ⬜ pending |
| 27-01-05 | 01 | 3 | FILTER-01 | manual | Version + docs check | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/e2e-redaction.test.ts` — E2E test file covering FILTER-01, FILTER-02, and all 4 verification scenarios (SC-1 through SC-4)
- No framework install needed — Vitest already configured
- No shared fixtures needed — test is self-contained with inline mock data

*Existing infrastructure covers framework requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| PROJECT.md references updated | FILTER-01 | Documentation accuracy | Verify no remaining "path filtering" or "isBlocked" references in PROJECT.md |
| Version bumped to 2.6.0 | FILTER-01 | Simple value check | Confirm `version: "2.6.0"` in src/mcp-tools.ts createMcpServer() |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
