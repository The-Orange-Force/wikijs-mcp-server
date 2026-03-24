---
phase: 2
slug: oauth-configuration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.x |
| **Config file** | `vitest.config.ts` (Wave 0 creates) |
| **Quick run command** | `npx vitest run tests/config.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~2 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/config.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 0 | — | infra | `npx vitest run` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | CONF-01 | unit | `npx vitest run tests/config.test.ts -t "tenant"` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | CONF-02 | unit | `npx vitest run tests/config.test.ts -t "client"` | ❌ W0 | ⬜ pending |
| 02-01-04 | 01 | 1 | CONF-03 | unit | `npx vitest run tests/config.test.ts -t "resource"` | ❌ W0 | ⬜ pending |
| 02-01-05 | 01 | 1 | CONF-04 | unit | `npx vitest run tests/config.test.ts -t "missing"` | ❌ W0 | ⬜ pending |
| 02-01-06 | 01 | 1 | CONF-05 | manual-only | Visual inspection of example.env | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest` dev dependency — `npm install -D vitest@^4.1.0`
- [ ] `vitest.config.ts` — minimal Vitest configuration
- [ ] `tests/config.test.ts` — config validation smoke test stubs
- [ ] `package.json` — update `"test"` script to `"vitest run"`

*Wave 0 installs the test framework and creates test file stubs for all CONF requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| example.env contains all new variables with descriptions | CONF-05 | File content verification is simpler via visual inspection | Open `example.env`, confirm AZURE_TENANT_ID, AZURE_CLIENT_ID, MCP_RESOURCE_URL present with descriptions |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
