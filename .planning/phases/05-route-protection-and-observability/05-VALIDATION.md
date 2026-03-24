---
phase: 5
slug: route-protection-and-observability
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (established in Phase 2/3) |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 0 | PROT-01 | integration | `npx vitest run tests/route-protection.test.ts -t "POST /mcp requires auth"` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 0 | PROT-02 | integration | `npx vitest run tests/route-protection.test.ts -t "GET /mcp/events requires auth"` | ❌ W0 | ⬜ pending |
| 05-01-03 | 01 | 0 | PROT-03 | integration | `npx vitest run tests/route-protection.test.ts -t "GET /health no auth"` | ❌ W0 | ⬜ pending |
| 05-01-04 | 01 | 0 | PROT-04 | integration | `npx vitest run tests/route-protection.test.ts -t "discovery no auth"` | ❌ W0 | ⬜ pending |
| 05-01-05 | 01 | 0 | OBSV-02 | integration | `npx vitest run tests/observability.test.ts -t "correlation ID"` | ❌ W0 | ⬜ pending |
| 05-01-06 | 01 | 0 | OBSV-03 | unit | `npx vitest run tests/auth-errors.test.ts` | ❌ W0 | ⬜ pending |
| 05-02-01 | 02 | 0 | OBSV-01 | integration | `npx vitest run tests/observability.test.ts -t "tool logs user identity"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/route-protection.test.ts` — stubs for PROT-01, PROT-02, PROT-03, PROT-04 using Fastify inject() with mocked auth middleware
- [ ] `tests/observability.test.ts` — stubs for OBSV-01, OBSV-02 using Fastify inject() with pino destination capture
- [ ] `tests/auth-errors.test.ts` — stubs for OBSV-03 unit testing jose error → RFC 6750 mapping function
- [ ] Test helpers: mock JWT tokens, mock jose errors, pino log capture utilities

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SSE correlation ID delivery | OBSV-02 (SSE aspect) | SSE framing controlled by MCP SDK transport; comment injection depends on raw stream access | 1. Start server with auth enabled 2. Connect SSE client to /mcp/events with valid token 3. Verify correlation ID appears in SSE stream (as comment or id field) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
