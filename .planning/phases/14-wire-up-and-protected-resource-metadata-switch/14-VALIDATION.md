---
phase: 14
slug: wire-up-and-protected-resource-metadata-switch
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-25
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.1 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/e2e-flow.test.ts tests/discovery.test.ts tests/route-protection.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/e2e-flow.test.ts tests/discovery.test.ts tests/route-protection.test.ts`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 0 | INTG-02 | integration | `npx vitest run tests/e2e-flow.test.ts` | No - W0 | pending |
| 14-01-02 | 01 | 1 | META-03 | integration | `npx vitest run tests/discovery.test.ts -t "authorization_servers"` | Yes - update | pending |
| 14-01-03 | 01 | 1 | INTG-01 | integration | `npx vitest run tests/route-protection.test.ts -t "oauth-authorization-server"` | Yes - update | pending |
| 14-01-04 | 01 | 1 | INTG-01 | integration | `npx vitest run tests/route-protection.test.ts -t "register"` | Yes - add | pending |
| 14-01-05 | 01 | 2 | INTG-02 | integration | `npx vitest run tests/e2e-flow.test.ts -t "discovery chain"` | No - W0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `tests/e2e-flow.test.ts` — stubs for INTG-02 (full discovery chain)
- [ ] `tests/helpers/build-test-app.ts` — must register `oauthProxyRoutes` with mock fetch (update existing)
- [ ] `tests/discovery.test.ts` — update `authorization_servers` assertion for META-03
- [ ] `tests/route-protection.test.ts` — add proxy endpoint public access assertions for INTG-01

*Existing infrastructure covers framework needs — Vitest 4.1.1 already configured.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Claude Desktop full OAuth flow | INTG-02 | Requires real Claude Desktop client + running server | Start server, configure Claude Desktop with MCP server URL, verify tool invocation succeeds |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
