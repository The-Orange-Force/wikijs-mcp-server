---
phase: 24
slug: integration-tests-and-security-hygiene
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-27
---

# Phase 24 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/gdpr-filter.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/gdpr-filter.test.ts`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 24-01-01 | 01 | 0 | SEC-03, SC-1, SC-2, SC-3 | integration | `npx vitest run tests/gdpr-filter.test.ts` | ❌ W0 | ⬜ pending |
| 24-01-02 | 01 | 1 | SC-1 | integration | `npx vitest run tests/gdpr-filter.test.ts -t "get_page"` | ❌ W0 | ⬜ pending |
| 24-01-03 | 01 | 1 | SC-1 | integration | `npx vitest run tests/gdpr-filter.test.ts -t "list_pages"` | ❌ W0 | ⬜ pending |
| 24-01-04 | 01 | 1 | SC-1 | integration | `npx vitest run tests/gdpr-filter.test.ts -t "search_pages"` | ❌ W0 | ⬜ pending |
| 24-01-05 | 01 | 1 | SC-2 | integration | `npx vitest run tests/gdpr-filter.test.ts -t "byte-identical"` | ❌ W0 | ⬜ pending |
| 24-01-06 | 01 | 1 | SEC-03 | integration | `npx vitest run tests/gdpr-filter.test.ts -t "Instructions"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/gdpr-filter.test.ts` — new file with test scaffolding for all GDPR integration tests (SEC-03, SC-1, SC-2, SC-3)

*Existing infrastructure covers all other phase requirements (buildTestApp, createTestToken, Vitest config).*

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
