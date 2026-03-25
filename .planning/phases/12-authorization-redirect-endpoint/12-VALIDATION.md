---
phase: 12
slug: authorization-redirect-endpoint
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-25
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/authorize.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/authorize.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | AUTHZ-01 | integration | `npx vitest run tests/authorize.test.ts -t "redirects to Azure AD"` | ❌ W0 | ⬜ pending |
| 12-01-02 | 01 | 1 | AUTHZ-01 | integration | `npx vitest run tests/authorize.test.ts -t "maps scopes"` | ❌ W0 | ⬜ pending |
| 12-01-03 | 01 | 1 | AUTHZ-01 | integration | `npx vitest run tests/authorize.test.ts -t "appends openid"` | ❌ W0 | ⬜ pending |
| 12-01-04 | 01 | 1 | AUTHZ-01 | integration | `npx vitest run tests/authorize.test.ts -t "strips resource"` | ❌ W0 | ⬜ pending |
| 12-01-05 | 01 | 1 | AUTHZ-02 | integration | `npx vitest run tests/authorize.test.ts -t "passes through"` | ❌ W0 | ⬜ pending |
| 12-01-06 | 01 | 1 | AUTHZ-02 | integration | `npx vitest run tests/authorize.test.ts -t "drops unknown"` | ❌ W0 | ⬜ pending |
| 12-01-07 | 01 | 1 | (validation) | integration | `npx vitest run tests/authorize.test.ts -t "missing client_id"` | ❌ W0 | ⬜ pending |
| 12-01-08 | 01 | 1 | (validation) | integration | `npx vitest run tests/authorize.test.ts -t "wrong client_id"` | ❌ W0 | ⬜ pending |
| 12-01-09 | 01 | 1 | (validation) | integration | `npx vitest run tests/authorize.test.ts -t "missing redirect_uri"` | ❌ W0 | ⬜ pending |
| 12-01-10 | 01 | 1 | (validation) | integration | `npx vitest run tests/authorize.test.ts -t "invalid response_type"` | ❌ W0 | ⬜ pending |
| 12-01-11 | 01 | 1 | (validation) | integration | `npx vitest run tests/authorize.test.ts -t "no scope"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/authorize.test.ts` — integration tests covering AUTHZ-01, AUTHZ-02, and all validation edge cases
- [ ] `tests/helpers/build-test-app.ts` — must register oauth-proxy plugin (may already be done by Phase 11)

*If `src/routes/oauth-proxy.ts` already exists from Phase 11, no additional Wave 0 setup needed for that file.*

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
