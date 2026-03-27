# Requirements: WikiJS MCP Server

**Defined:** 2026-03-27
**Core Value:** Only Azure AD-authenticated colleagues can invoke MCP tools against the company WikiJS instance — without exposing the WikiJS API token to clients

## v2.4 Requirements

Requirements for MCP Instructions Field milestone. Each maps to roadmap phases.

### Initialize Response

- [x] **INIT-01**: MCP server returns `instructions` field in initialize response
- [x] **INIT-02**: Instructions content guides Claude to auto-search wiki for Mendix, client, AI, Java, and career topics

### File Loading

- [x] **FILE-01**: Server reads instructions from file path specified by `MCP_INSTRUCTIONS_PATH` env var
- [x] **FILE-02**: Server falls back to hardcoded default when file is missing or unreadable
- [x] **FILE-03**: Server logs a warning when falling back to default instructions

### Docker Integration

- [ ] **DOCK-01**: `docker-compose.yml` includes volume mount for instructions file
- [ ] **DOCK-02**: Default `instructions.txt` file shipped in the repository

## Future Requirements

### Dynamic Instructions

- **DYN-01**: Server generates client list from wiki pages at startup (Option B from spec)
- **DYN-02**: Instructions refresh on configurable interval for long-running servers

## Out of Scope

| Feature | Reason |
|---------|--------|
| Dynamic client list generation (Option B) | Deferred — static file sufficient for v2.4 |
| Hot-reload of instructions without restart | Startup-time loading is simpler and sufficient |
| Write operations (create/update/delete pages) | Read-only use case per v2.3 decision |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INIT-01 | Phase 19 | Complete |
| INIT-02 | Phase 19 | Complete |
| FILE-01 | Phase 19 | Complete |
| FILE-02 | Phase 19 | Complete |
| FILE-03 | Phase 19 | Complete |
| DOCK-01 | Phase 20 | Pending |
| DOCK-02 | Phase 20 | Pending |

**Coverage:**
- v2.4 requirements: 7 total
- Mapped to phases: 7
- Unmapped: 0

---
*Requirements defined: 2026-03-27*
*Last updated: 2026-03-27 after roadmap creation*
