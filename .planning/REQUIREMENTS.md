# Requirements: WikiJS MCP Server

**Defined:** 2026-03-26
**Core Value:** Only Azure AD-authenticated colleagues can invoke MCP tools against the company WikiJS instance

## v2.3 Requirements

Requirements for Tool Consolidation milestone. Consolidates 17 tools to 3 read-only page tools.

### Tool Consolidation

- [ ] **TOOL-01**: get_page returns metadata, content, and isPublished in a single call
- [ ] **TOOL-02**: list_pages supports optional includeUnpublished flag
- [ ] **TOOL-03**: All write tools removed (create_page, update_page, delete_page, force_delete_page, publish_page)
- [ ] **TOOL-04**: All user/group tools removed (list_users, search_users, create_user, update_user, list_groups)

### Search

- [ ] **SRCH-01**: search_pages resolves search index IDs to database page IDs via singleByPath
- [ ] **SRCH-02**: search_pages falls back to pages.list cross-reference if singleByPath fails
- [ ] **SRCH-03**: All 3 tools have verbose LLM-optimized descriptions

### Scope

- [ ] **SCOP-01**: Scope model simplified to wikijs:read only (remove wikijs:write and wikijs:admin)
- [ ] **SCOP-02**: SCOPE_TOOL_MAP maps all 3 tools to wikijs:read

### Cleanup

- [ ] **CLEN-01**: STDIO transport removed (lib/mcp_wikijs_stdin.js and references)
- [ ] **CLEN-02**: @azure/msal-node removed from package.json
- [ ] **CLEN-03**: Dead API methods, types (WikiJsUser, WikiJsGroup, ResponseResult), and unused code removed

## Future Requirements

### Observability

- **OBS-01**: Token validation metrics (latency, error rate)
- **OBS-02**: JWKS pre-warming at startup

### Security

- **SEC-01**: Consent interstitial for shared client_id token theft (CONSENT-01)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Write operations (create/update/delete pages) | AI use case is reading wiki, not authoring; write tools had bugs |
| User/group management tools | Not needed for read-only wiki access |
| search_unpublished_pages | Wiki.js doesn't index unpublished pages for search; unreliable |
| Per-user WikiJS permissions | Everyone has equal access via shared API token |
| STDIO transport | Removing in v2.3; HTTP-only simplifies codebase |
| Multi-locale search | Single-locale wiki; defer if needed later |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TOOL-01 | — | Pending |
| TOOL-02 | — | Pending |
| TOOL-03 | — | Pending |
| TOOL-04 | — | Pending |
| SRCH-01 | — | Pending |
| SRCH-02 | — | Pending |
| SRCH-03 | — | Pending |
| SCOP-01 | — | Pending |
| SCOP-02 | — | Pending |
| CLEN-01 | — | Pending |
| CLEN-02 | — | Pending |
| CLEN-03 | — | Pending |

**Coverage:**
- v2.3 requirements: 12 total
- Mapped to phases: 0
- Unmapped: 12 (pending roadmap creation)

---
*Requirements defined: 2026-03-26*
*Last updated: 2026-03-26 after initial definition*
