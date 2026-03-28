# Deferred Items - Phase 29

## Pre-existing Test Failure

- **File:** `tests/docker-config.test.ts`
- **Test:** "exists at repo root with [TOPIC placeholder content"
- **Issue:** Missing `instructions.txt` file at repo root. Test expects `instructions.txt` with `[TOPIC` placeholder content.
- **Error:** `ENOENT: no such file or directory, open '/Users/magnetrong/git/wikijs-mcp-server/instructions.txt'`
- **Impact:** 1 test failure out of 442 total tests. Not caused by Phase 29 changes.
