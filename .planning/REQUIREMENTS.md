# Requirements: WikiJS MCP Server

**Defined:** 2026-03-27
**Core Value:** Only Azure AD-authenticated colleagues can invoke MCP tools against the company WikiJS instance — without exposing the WikiJS API token to clients

## v2.6 Requirements

Requirements for GDPR Content Redaction milestone. Each maps to roadmap phases.

### Content Redaction

- [x] **REDACT-01**: get_page redacts content between `<!-- gdpr-start -->` and `<!-- gdpr-end -->` markers before returning
- [x] **REDACT-02**: Multiple marker pairs per page are each independently redacted
- [x] **REDACT-03**: Each redacted block is replaced with `[🔒 PII redacted — consult the wiki directly for contact details]`
- [x] **REDACT-04**: Unclosed `<!-- gdpr-start -->` without matching end redacts from marker to end of content (fail-safe)
- [x] **REDACT-05**: Malformed markers generate a warning log with page ID and path
- [x] **REDACT-06**: Markers are matched case-insensitively and with whitespace tolerance around tag names

### Path Filter Removal

- [x] **FILTER-01**: isBlocked() path-based filtering is removed from all MCP tool handlers
- [x] **FILTER-02**: All published wiki pages are accessible via get_page, list_pages, and search_pages without path restrictions

### URL Injection

- [x] **URL-01**: get_page response includes a `url` field with direct link to the wiki page
- [x] **URL-02**: Wiki page base URL is a server configuration constant, not hardcoded inline

## Future Requirements

Deferred to future release. Tracked but not in current roadmap.

### URL Injection Expansion

- **URL-03**: list_pages results include url field for each page
- **URL-04**: search_pages results include url field for each page

### Advanced Redaction

- **REDACT-07**: Fenced code block awareness (skip markers inside code blocks)
- **REDACT-08**: Redaction count included in response metadata

## Out of Scope

| Feature | Reason |
|---------|--------|
| WikiJS authentication / human user access control | MCP server only; WikiJS auth is separate |
| Redaction of page title, description, or metadata | Templates don't put PII in metadata fields |
| Audit logging of page access | Not needed for content redaction milestone |
| Dynamic GDPR block rules via runtime config | Code change with tests is safer for compliance |
| Write operations (create/update/delete pages) | Read-only use case unchanged |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| REDACT-01 | Phase 25 | Complete |
| REDACT-02 | Phase 25 | Complete |
| REDACT-03 | Phase 25 | Complete |
| REDACT-04 | Phase 25 | Complete |
| REDACT-05 | Phase 25 | Complete |
| REDACT-06 | Phase 25 | Complete |
| URL-01 | Phase 26 | Complete |
| URL-02 | Phase 26 | Complete |
| FILTER-01 | Phase 27 | Complete |
| FILTER-02 | Phase 27 | Complete |

**Coverage:**
- v2.6 requirements: 10 total
- Mapped to phases: 10
- Unmapped: 0

---
*Requirements defined: 2026-03-27*
*Last updated: 2026-03-27 after roadmap creation*
