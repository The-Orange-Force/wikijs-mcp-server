---
phase: 21
slug: docker-instructions-path-default
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-27
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- tests/config.test.ts tests/docker-config.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- tests/config.test.ts tests/docker-config.test.ts`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 21-01-01 | 01 | 1 | DOCK-01 | unit | `npm test -- tests/config.test.ts` | ✅ (needs update) | ⬜ pending |
| 21-01-02 | 01 | 1 | DOCK-01 | unit | `npm test -- tests/config.test.ts` | ✅ (needs update) | ⬜ pending |
| 21-01-03 | 01 | 1 | DOCK-01 | unit | `npm test -- tests/config.test.ts` | ✅ | ⬜ pending |
| 21-01-04 | 01 | 1 | DOCK-01 | manual | `npm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Docker deployer sees custom instructions without setting env var | DOCK-01 | Requires Docker environment with volume mount | `docker-compose up -d`, mount custom `instructions.txt`, send MCP initialize request, verify custom content in response |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
