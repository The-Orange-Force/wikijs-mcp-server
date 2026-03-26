---
phase: 11
slug: discovery-and-registration-endpoints
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-25
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.1 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/oauth-proxy-discovery.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~3 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/oauth-proxy-discovery.test.ts`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 0 | META-01, META-02, REGN-01 | integration | `npx vitest run tests/oauth-proxy-discovery.test.ts` | ❌ W0 | ⬜ pending |
| 11-01-02 | 01 | 1 | META-01, META-02 | integration | `npx vitest run tests/oauth-proxy-discovery.test.ts -t "oauth-authorization-server"` | ❌ W0 | ⬜ pending |
| 11-01-03 | 01 | 1 | META-01 | integration | `npx vitest run tests/oauth-proxy-discovery.test.ts -t "openid-configuration"` | ❌ W0 | ⬜ pending |
| 11-01-04 | 01 | 1 | REGN-01 | integration | `npx vitest run tests/oauth-proxy-discovery.test.ts -t "register"` | ❌ W0 | ⬜ pending |
| 11-01-05 | 01 | 1 | META-01 | integration | `npx vitest run tests/oauth-proxy-discovery.test.ts -t "without authorization"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/oauth-proxy-discovery.test.ts` — stubs for META-01, META-02, REGN-01
- [ ] `tests/helpers/build-test-app.ts` — register `oauthProxyRoutes` plugin
- No framework install needed — Vitest 4.1.1 already configured

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
