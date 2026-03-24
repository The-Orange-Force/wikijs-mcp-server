---
phase: 1
slug: mcp-transport-port
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (ESM-native, TypeScript-friendly) |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `npm run test:smoke` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:smoke`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 0 | TRNS-01 | setup | `npx vitest run` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 1 | TRNS-01 | integration | `npm run test:smoke` | ❌ W0 | ⬜ pending |
| 01-02-02 | 02 | 1 | TRNS-02 | integration | `npm run test:smoke` | ❌ W0 | ⬜ pending |
| 01-02-03 | 02 | 1 | TRNS-03 | integration | `npm run test:smoke` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `npm install -D vitest` — install test framework
- [ ] `tests/smoke.test.ts` — smoke test stubs for TRNS-01, TRNS-02, TRNS-03
- [ ] `scripts/test_mcp_smoke.sh` — curl-based smoke test for POST /mcp with initialize, tools/list, tools/call
- [ ] `package.json` — add `test:smoke` script

*Note: Primary validation for this transport port phase is integration/smoke testing against a running server.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Claude Desktop connects to POST /mcp | TRNS-01 | Requires Claude Desktop app | 1. Update claude_desktop_config.json to point to Fastify server 2. Open Claude Desktop 3. Verify tools appear and can be invoked |
| SSE events received by Claude Desktop | TRNS-02 | Requires Claude Desktop app | 1. Invoke a tool via Claude Desktop 2. Verify streaming response works |
| All 17 WikiJS tools work identically | TRNS-03 | Requires running WikiJS instance | 1. Run smoke script against live WikiJS 2. Compare output with legacy server |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
