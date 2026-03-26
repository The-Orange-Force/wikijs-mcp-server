---
phase: 18
slug: cleanup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-26
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.1 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run` |
| **Full suite command** | `npm test && npm run build` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run`
- **After every plan wave:** Run `npm test && npm run build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 18-01-01 | 01 | 1 | CLEN-03 | build + unit | `npm run build && npx vitest run` | ✅ | ⬜ pending |
| 18-01-02 | 01 | 1 | CLEN-03 | build + unit | `npm run build && npx vitest run` | ✅ | ⬜ pending |
| 18-01-03 | 01 | 1 | CLEN-03 | build + unit | `npm run build && npx vitest run` | ✅ | ⬜ pending |
| 18-02-01 | 02 | 2 | CLEN-01 | smoke | `test ! -f lib/mcp_wikijs_stdin.js && ! grep -r "mcp_wikijs_stdin" src/ scripts/ package.json Dockerfile` | ❌ W0 | ⬜ pending |
| 18-02-02 | 02 | 2 | CLEN-02 | smoke | `! grep "msal-node" package.json` | ❌ W0 | ⬜ pending |
| 18-02-03 | 02 | 2 | CLEN-01 | build | `npm run build && npm test` | ✅ | ⬜ pending |
| 18-03-01 | 03 | 3 | CLEN-03 | build | `npm run build && npm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements.
- Verification is primarily via `npm run build` (TypeScript catches dead references) and `npm test` (runtime assertions).
- Docker build verification: `docker build -t wikijs-mcp:test .` confirms Alpine image works.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Docker Alpine image builds and runs | CLEN-01 | Docker build not part of CI test suite | `docker build -t wikijs-mcp:test . && docker run --rm wikijs-mcp:test node -e "console.log('ok')"` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
