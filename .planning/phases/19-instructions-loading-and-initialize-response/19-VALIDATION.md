---
phase: 19
slug: instructions-loading-and-initialize-response
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-27
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1 |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run tests/instructions.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~1 second |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/instructions.test.ts tests/config.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 1 second

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 19-01-01 | 01 | 1 | FILE-01, FILE-02, FILE-03 | unit | `npx vitest run tests/instructions.test.ts` | ✅ | ✅ green |
| 19-01-02 | 01 | 1 | FILE-01 | unit | `npx vitest run tests/config.test.ts` | ✅ | ✅ green |
| 19-02-01 | 02 | 2 | INIT-01, INIT-02 | integration | `npx vitest run tests/config.test.ts tests/instructions.test.ts` | ✅ | ✅ green |
| 19-02-02 | 02 | 2 | INIT-01, INIT-02 | integration | `npx vitest run tests/smoke.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Requirement-to-Test Cross-Reference

| Requirement | Description | Test File(s) | Key Assertions |
|-------------|-------------|--------------|----------------|
| FILE-01 | Server reads instructions from file path | `tests/instructions.test.ts:43` | readFile called with path, content returned trimmed |
| FILE-02 | Fallback to hardcoded default on missing/unreadable file | `tests/instructions.test.ts:53,68` | ENOENT → DEFAULT_INSTRUCTIONS; EACCES → DEFAULT_INSTRUCTIONS |
| FILE-03 | Warning logged when falling back to defaults | `tests/instructions.test.ts:60,75` | console.warn called with path and error message |
| INIT-01 | MCP initialize response includes instructions field | `tests/smoke.test.ts:74` | data.result.instructions defined, string, non-empty |
| INIT-02 | Instructions cover 5 topics without tool names | `tests/smoke.test.ts:236-245`, `tests/instructions.test.ts:93-112` | Mendix, client, AI, Java, career present; search_pages/get_page/list_pages absent |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 1s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-27

---

## Validation Audit 2026-03-27

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
