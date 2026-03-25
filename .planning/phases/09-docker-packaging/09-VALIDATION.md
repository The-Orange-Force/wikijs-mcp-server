---
phase: 9
slug: docker-packaging
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-25
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x (existing) + manual Docker commands |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds (Vitest); + ~2 min (docker compose build) |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test` + `docker compose build`
- **Before `/gsd:verify-work`:** Full suite must be green + all DOCK-01–07 manual checks complete
- **Max feedback latency:** 10 seconds (Vitest) / 120 seconds (docker build)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 09-01-01 | 01 | 1 | DOCK-01 | manual | `docker compose build` | ❌ Wave 0 | ⬜ pending |
| 09-01-02 | 01 | 1 | DOCK-02 | manual | `docker history wikijs-mcp:latest` | ❌ Wave 0 | ⬜ pending |
| 09-01-03 | 01 | 1 | DOCK-03 | manual | `docker compose up -d && docker exec wikijs-mcp-server curl http://localhost:8000/health` | ❌ Wave 0 | ⬜ pending |
| 09-01-04 | 01 | 1 | DOCK-04 | manual | `docker inspect wikijs-mcp-server --format '{{.State.Health.Status}}'` | ❌ Wave 0 | ⬜ pending |
| 09-01-05 | 01 | 1 | DOCK-05 | manual | `docker run --rm --network caddy_net curlimages/curl http://wikijs-mcp-server:8000/health` | ❌ Wave 0 | ⬜ pending |
| 09-01-06 | 01 | 1 | DOCK-06 | automated | `grep "restart: unless-stopped" docker-compose.yml` | ❌ Wave 0 | ⬜ pending |
| 09-01-07 | 01 | 1 | DOCK-07 | automated | `grep "env_file" docker-compose.yml` | ❌ Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `Dockerfile` — multi-stage build; must exist before docker build validation
- [ ] `.dockerignore` — must exist before any validation
- [ ] `docker-compose.yml` — service definition; must exist before network/healthcheck validation

*All three files are created in plan 09-01. No new Vitest test files needed — existing `npm test` (97 tests) confirms no application regressions.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `docker compose build` succeeds | DOCK-01 | Requires Docker daemon and build execution | `docker compose build` — must exit 0; `docker images wikijs-mcp` must show tagged image |
| Image contains no src/dev-deps/secrets | DOCK-02 | Requires image inspection post-build | `docker history wikijs-mcp:latest` — no .env values; `docker run --rm wikijs-mcp:latest ls /app/src 2>&1 \| grep "No such file"` |
| HTTP server binds 0.0.0.0:PORT | DOCK-03 | Requires running container | `docker compose up -d && sleep 5 && docker exec wikijs-mcp-server node -e "require('http').get('http://localhost:8000/health', r => console.log(r.statusCode)).on('error', e => console.error(e))"` |
| Container reports healthy | DOCK-04 | Requires running container + health start period | `docker inspect wikijs-mcp-server --format '{{.State.Health.Status}}'` returns `healthy` after 30s |
| Caddy reaches container via service name on caddy_net | DOCK-05 | Requires caddy_net network pre-existing | `docker run --rm --network caddy_net curlimages/curl http://wikijs-mcp-server:8000/health` returns 200 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
