# Requirements: WikiJS MCP Server

**Defined:** 2026-03-27
**Core Value:** Only Azure AD-authenticated colleagues can invoke MCP tools against the company WikiJS instance — without exposing the WikiJS API token to clients

## v2.5 Requirements

Requirements for GDPR Path Filter milestone. Each maps to roadmap phases.

### Path Filtering

- [ ] **FILT-01**: `isBlocked()` utility blocks paths with exactly 2 segments where first is "Clients" (case-insensitive)
- [ ] **FILT-02**: `isBlocked()` normalizes paths (leading/trailing slashes, double slashes, case folding) before checking
- [ ] **FILT-03**: `get_page` returns generic "Page not found" error for blocked pages (indistinguishable from absent page)
- [ ] **FILT-04**: `search_pages` silently excludes blocked pages from results
- [ ] **FILT-05**: `list_pages` silently excludes blocked pages from results

### Security

- [ ] **SEC-01**: `get_page` always completes upstream WikiJS API call before path check (prevents timing oracle)
- [ ] **SEC-02**: Blocked access attempts are logged with tool name, user identity, and correlation ID (no company name in logs)
- [ ] **SEC-03**: MCP instructions file does not reveal filter structure or blocked path patterns

## Future Requirements

### Path Filtering

- **FILT-06**: Configurable block rules via pattern-based configuration (not needed — code change with tests is safer)
- **FILT-07**: Block check before WikiJS fetch for `get_page` (impossible with current ID-based API)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Write operation filtering (create/update/delete) | Write tools don't exist — read-only MCP server |
| Per-user path permissions | Shared WikiJS API token model — no per-user mapping |
| WikiJS page rules management | WikiJS permissions are defense-in-depth, not primary control |
| Dynamic block rule configuration | Code change with tests is safer than runtime config for compliance |
| Client-side filtering hints | Would reveal which paths are blocked — GDPR information leak |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FILT-01 | — | Pending |
| FILT-02 | — | Pending |
| FILT-03 | — | Pending |
| FILT-04 | — | Pending |
| FILT-05 | — | Pending |
| SEC-01 | — | Pending |
| SEC-02 | — | Pending |
| SEC-03 | — | Pending |

**Coverage:**
- v2.5 requirements: 8 total
- Mapped to phases: 0
- Unmapped: 8 ⚠️

---
*Requirements defined: 2026-03-27*
*Last updated: 2026-03-27 after initial definition*
