# Requirements: WikiJS MCP Server

**Defined:** 2026-03-27
**Core Value:** Only Azure AD-authenticated colleagues can invoke MCP tools against the company WikiJS instance

## v2.7 Requirements

Requirements for v2.7 Metadata Search Fallback. Each maps to roadmap phases.

### Metadata Fallback

- [x] **META-01**: When GraphQL search returns fewer results than the requested limit, a metadata fallback supplements results by matching the query against page paths, titles, and descriptions
- [x] **META-02**: Metadata matching is case-insensitive substring matching (single string, no tokenization)
- [x] **META-03**: Fallback results are deduplicated against GraphQL results by page ID
- [x] **META-04**: Unpublished pages are excluded from metadata fallback results
- [x] **META-05**: Total results (GraphQL + metadata) never exceed the requested limit
- [x] **META-06**: `totalHits` is adjusted to reflect the actual merged result count when metadata adds results

### Integration

- [x] **INTG-01**: Metadata fallback shares the `pages.list` data with the existing `resolveViaPagesList` fallback (no duplicate GraphQL call)
- [x] **INTG-02**: The existing `searchPages()` early-return path for zero results is replaced to route through the metadata fallback

### Observability

- [x] **OBSV-01**: Metadata fallback logs at info level with query, hit count, and total resolved count

### Tool Description

- [x] **TOOL-01**: `search_pages` tool description is updated to mention path, title, and description matching capability

## Future Requirements

### Search Enhancements

- **SRCH-01**: Multi-token query splitting with AND-matching across tokens
- **SRCH-02**: Relevance-weighted ordering (title > path > description) for fallback results
- **SRCH-03**: Configurable fallback trigger threshold
- **SRCH-04**: Short-TTL metadata cache for `pages.list` responses

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full content search in fallback | Requires N `getPageById` calls per search -- impractical |
| Fuzzy/Levenshtein matching | False positives for structured token search; GraphQL handles fuzzy for content |
| Regex-based query syntax | ReDoS exposure from user-controlled pattern input |
| Separate `search_metadata` MCP tool | Increases AI tool selection complexity; fallback must be automatic and transparent |
| Pagination beyond 500 pages | `pages.list(500)` is the Wiki.js v2 practical limit; acceptable for current deployment |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| META-01 | Phase 28 | Complete |
| META-02 | Phase 28 | Complete |
| META-03 | Phase 28 | Complete |
| META-04 | Phase 28 | Complete |
| META-05 | Phase 28 | Complete |
| META-06 | Phase 28 | Complete |
| INTG-01 | Phase 28 | Complete |
| INTG-02 | Phase 28 | Complete |
| OBSV-01 | Phase 29 | Complete |
| TOOL-01 | Phase 29 | Complete |

**Coverage:**
- v2.7 requirements: 10 total
- Mapped to phases: 10
- Unmapped: 0

---
*Requirements defined: 2026-03-27*
*Last updated: 2026-03-27 after roadmap created*
