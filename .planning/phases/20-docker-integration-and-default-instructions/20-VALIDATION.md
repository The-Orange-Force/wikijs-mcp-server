---
phase: 20
slug: docker-integration-and-default-instructions
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-27
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.x |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/docker-config.test.ts tests/config.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~2 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/docker-config.test.ts`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 2 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 20-01-01 | 01 | 1 | DOCK-01 | integration | `npx vitest run tests/docker-config.test.ts` | ✅ | ✅ green |
| 20-01-02 | 01 | 1 | DOCK-02 | integration | `npx vitest run tests/docker-config.test.ts` | ✅ | ✅ green |
| 20-01-03 | 01 | 1 | .dockerignore | integration | `npx vitest run tests/docker-config.test.ts` | ✅ | ✅ green |
| 20-01-04 | 01 | 1 | .env.example ref | integration | `npx vitest run tests/docker-config.test.ts` | ✅ | ✅ green |
| 20-01-05 | 01 | 1 | config parsing | unit | `npx vitest run tests/config.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end Docker deploy with instructions customization | DOCK-01 + DOCK-02 | Requires live Docker environment with running Wiki.js | Clone repo, edit instructions.txt with real topics, run `docker compose up -d`, connect MCP client, verify initialize response contains customized instructions |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 2s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-27

---

## Validation Audit 2026-03-27

| Metric | Count |
|--------|-------|
| Gaps found | 5 |
| Resolved | 5 |
| Escalated | 0 |
