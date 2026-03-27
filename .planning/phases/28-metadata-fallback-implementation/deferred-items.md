# Deferred Items - Phase 28

## Pre-existing Test Failure

**File:** `tests/docker-config.test.ts`
**Test:** "exists at repo root with [TOPIC placeholder content"
**Error:** `ENOENT: no such file or directory, open 'instructions.txt'`
**Reason:** Missing `instructions.txt` file at repo root. Pre-existing issue, not caused by Phase 28 changes.
