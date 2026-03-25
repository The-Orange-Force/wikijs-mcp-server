---
phase: 10
slug: scope-mapper-and-azure-endpoint-utils
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-25
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run src/oauth-proxy/__tests__/ --reporter=verbose` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~3 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/oauth-proxy/__tests__/ --reporter=verbose`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | SCOPE-01 | unit | `npx vitest run src/oauth-proxy/__tests__/scope-mapper.test.ts -x` | ❌ W0 | ⬜ pending |
| 10-01-02 | 01 | 1 | SCOPE-02 | unit | `npx vitest run src/oauth-proxy/__tests__/scope-mapper.test.ts -x` | ❌ W0 | ⬜ pending |
| 10-01-03 | 01 | 1 | N/A | unit | `npx vitest run src/oauth-proxy/__tests__/azure-endpoints.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/oauth-proxy/__tests__/scope-mapper.test.ts` — stubs for SCOPE-01, SCOPE-02
- [ ] `src/oauth-proxy/__tests__/azure-endpoints.test.ts` — stubs for endpoint URL construction
- [ ] `src/oauth-proxy/` directory — needs to be created

*Existing infrastructure covers framework install — Vitest already configured.*

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
