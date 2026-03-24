---
phase: 3
slug: discovery-metadata
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x |
| **Config file** | `vitest.config.ts` (created in Phase 2 or Wave 0) |
| **Quick run command** | `npx vitest run` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~2 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 0 | DISC-01 | integration | `npx vitest run tests/discovery.test.ts -t "returns 200 with valid RFC 9728 metadata"` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 0 | DISC-02 | integration | `npx vitest run tests/discovery.test.ts -t "includes all required metadata fields"` | ❌ W0 | ⬜ pending |
| 03-01-03 | 01 | 0 | DISC-03 | integration | `npx vitest run tests/discovery.test.ts -t "accessible without Authorization header"` | ❌ W0 | ⬜ pending |
| 03-01-04 | 01 | 0 | N/A | unit | `npx vitest run tests/scopes.test.ts` | ❌ W0 | ⬜ pending |
| 03-01-05 | 01 | 1 | DISC-02 | integration | `npx vitest run tests/discovery.test.ts -t "resource_documentation"` | ❌ W0 | ⬜ pending |
| 03-01-06 | 01 | 1 | DISC-02 | integration | `npx vitest run tests/discovery.test.ts -t "authorization_servers"` | ❌ W0 | ⬜ pending |
| 03-01-07 | 01 | 1 | DISC-02 | integration | `npx vitest run tests/discovery.test.ts -t "Cache-Control"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — Vitest configuration (if not from Phase 2)
- [ ] `tests/discovery.test.ts` — integration test stubs for DISC-01, DISC-02, DISC-03
- [ ] `tests/scopes.test.ts` — unit test stubs for scope-to-tool mapping
- [ ] `npm install -D vitest` — if not installed in Phase 2
- [ ] `buildApp(config)` factory in `src/server.ts` — if not done in Phase 2
- [ ] `package.json` test script: `"test": "vitest run"` — if not from Phase 2

*If none: "Existing infrastructure covers all phase requirements."*

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
