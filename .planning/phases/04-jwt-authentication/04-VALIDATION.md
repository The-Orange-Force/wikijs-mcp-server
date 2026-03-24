---
phase: 4
slug: jwt-authentication
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (from Phase 2 or Wave 0) |
| **Quick run command** | `npx vitest run src/auth/` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/auth/`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 0 | AUTH-01..07 | unit | `npx vitest run src/auth/__tests__/` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 1 | AUTH-01 | unit | `npx vitest run src/auth/__tests__/middleware.test.ts -t "extracts bearer token"` | ❌ W0 | ⬜ pending |
| 04-01-03 | 01 | 1 | AUTH-02 | unit | `npx vitest run src/auth/__tests__/middleware.test.ts -t "validates signature"` | ❌ W0 | ⬜ pending |
| 04-01-04 | 01 | 1 | AUTH-03 | unit | `npx vitest run src/auth/__tests__/middleware.test.ts -t "validates audience"` | ❌ W0 | ⬜ pending |
| 04-01-05 | 01 | 1 | AUTH-04 | unit | `npx vitest run src/auth/__tests__/middleware.test.ts -t "validates issuer"` | ❌ W0 | ⬜ pending |
| 04-01-06 | 01 | 1 | AUTH-05 | unit | `npx vitest run src/auth/__tests__/middleware.test.ts -t "expired token"` | ❌ W0 | ⬜ pending |
| 04-01-07 | 01 | 1 | AUTH-06 | unit | `npx vitest run src/auth/__tests__/middleware.test.ts -t "returns 401"` | ❌ W0 | ⬜ pending |
| 04-01-08 | 01 | 1 | AUTH-07 | unit | `npx vitest run src/auth/__tests__/middleware.test.ts -t "returns 403"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — if not created by Phase 2
- [ ] `src/auth/__tests__/helpers.ts` — shared test utilities (generateKeyPair, createTestToken, createLocalJWKSet)
- [ ] `src/auth/__tests__/middleware.test.ts` — test stubs for AUTH-01 through AUTH-07
- [ ] `src/auth/__tests__/errors.test.ts` — test stubs for jose error to RFC 6750 mapping

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| — | — | — | — |

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
