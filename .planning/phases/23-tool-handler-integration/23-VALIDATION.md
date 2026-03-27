---
phase: 23
slug: tool-handler-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-27
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run src/__tests__/mcp-tools-gdpr.test.ts -x` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/__tests__/mcp-tools-gdpr.test.ts -x`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 23-01-01 | 01 | 0 | FILT-03, FILT-04, FILT-05, SEC-01, SEC-02 | unit | `npx vitest run src/__tests__/mcp-tools-gdpr.test.ts -x` | ❌ W0 | ⬜ pending |
| 23-01-02 | 01 | 1 | FILT-03, SEC-01 | unit | `npx vitest run src/__tests__/mcp-tools-gdpr.test.ts -t "get_page.*blocked" -x` | ❌ W0 | ⬜ pending |
| 23-01-03 | 01 | 1 | FILT-03 | unit | `npx vitest run src/__tests__/mcp-tools-gdpr.test.ts -t "indistinguishable" -x` | ❌ W0 | ⬜ pending |
| 23-01-04 | 01 | 1 | FILT-04 | unit | `npx vitest run src/__tests__/mcp-tools-gdpr.test.ts -t "search_pages.*blocked" -x` | ❌ W0 | ⬜ pending |
| 23-01-05 | 01 | 1 | FILT-05 | unit | `npx vitest run src/__tests__/mcp-tools-gdpr.test.ts -t "list_pages.*blocked" -x` | ❌ W0 | ⬜ pending |
| 23-01-06 | 01 | 1 | SEC-02 | unit | `npx vitest run src/__tests__/mcp-tools-gdpr.test.ts -t "audit log" -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/mcp-tools-gdpr.test.ts` — test stubs for FILT-03, FILT-04, FILT-05, SEC-01, SEC-02
- [ ] Phase 22 `src/gdpr.ts` must exist (dependency — Phase 22 must be implemented first)

*Existing infrastructure covers test framework and fixtures.*

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
