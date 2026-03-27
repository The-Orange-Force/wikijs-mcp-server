# Phase 26: Redaction Wiring and URL Injection - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire the Phase 25 `redactContent()` function into the get_page tool handler and inject a clickable page URL into get_page responses. The wiki base URL is driven by server configuration. URL injection applies to get_page only (URL-03/URL-04 for list/search are deferred). isBlocked() path filtering remains active alongside redaction until Phase 27 removes it.

</domain>

<decisions>
## Implementation Decisions

### URL configuration
- Reuse existing `WIKIJS_BASE_URL` for both GraphQL API calls and page URL construction (no new base URL env var)
- Add `WIKIJS_LOCALE` env var with Zod default `'en'` — placed in `wikijs` config group alongside `baseUrl` and `token`
- Normalize trailing slash on `WIKIJS_BASE_URL` in the Zod `.transform()` step
- Pass `AppConfig` (or subset) as a third parameter to `createMcpServer(wikiJsApi, instructions, config)`
- Log `WIKIJS_LOCALE` in `logConfig()` startup diagnostics
- Update `example.env` with `WIKIJS_LOCALE=en` — no Docker file changes needed

### URL construction
- Dedicated `buildPageUrl(baseUrl, locale, path)` helper in `src/url.ts`
- URL format: `${baseUrl}/${locale}/${path}` — e.g. `https://wiki.company.com/en/Mendix/BestPractices`
- Normalize path: strip leading slash to avoid double slashes
- Encode each path segment with `encodeURIComponent` for special characters and non-ASCII
- No special handling for home page — `home` treated like any other path
- No trailing slash on URLs

### Response structure
- URL appears as a top-level `url` field in the page JSON object
- Explicit field construction with controlled ordering: `id, path, url, title, description, content, isPublished, createdAt, updatedAt`
- `WikiJsPage` TypeScript interface stays unchanged — url is computed and spread at handler level
- No URL on error responses or GDPR-blocked pages

### Handler pipeline
- Operation order: Fetch page → isBlocked() check → redactContent() → buildPageUrl() → Serialize
- Always call `redactContent()` on all content (no-op when no markers present)
- Pass page context to redactContent: `redactContent(content, { pageId, path })`

### Tool description and instructions
- Update get_page tool description to mention the `url` field in the returned fields list
- Do NOT mention redaction in the tool description (security measure, not for AI awareness)
- Update `instructions.txt` to guide Claude to cite page URLs when referencing wiki content

### Claude's Discretion
- Test file organization and naming for url.ts tests
- Exact wording of instructions.txt URL guidance
- Error handling edge cases in buildPageUrl()

</decisions>

<specifics>
## Specific Ideas

- URL field positioned right after `path` in the JSON for logical grouping — path and url are related
- instructions.txt guidance: "When referencing wiki page content, include the page URL from the 'url' field so the user can navigate directly to the source"

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/config.ts`: Zod `envSchema` with `.transform()` — add `WIKIJS_LOCALE` and trailing slash normalization here
- `src/mcp-tools.ts:87-113`: get_page handler — wire point for redaction and URL injection
- `src/gdpr.ts`: `isBlocked()` — stays active during Phase 26, removed in Phase 27
- `src/tool-wrapper.ts`: `wrapToolHandler()` — no changes needed, wraps around the handler

### Established Patterns
- Config validation: Zod schema with `.transform()` in `config.ts`, single `loadConfig()` call
- Tool handlers: `wrapToolHandler()` wrapping, error catch blocks returning `isError: true`
- Module structure: Single-purpose files (`gdpr.ts`, `types.ts`) — `url.ts` follows this convention
- Startup diagnostics: `logConfig()` logs all config values with masking for secrets

### Integration Points
- `createMcpServer()` signature needs third `config` parameter — callers in `server.ts` and test helpers must update
- `redactContent()` from Phase 25 (`src/redaction.ts` or similar) — must be imported
- `buildPageUrl()` from new `src/url.ts` — imported by mcp-tools.ts
- `instructions.txt` at repo root or `/app/instructions.txt` in Docker — add URL citation guidance

</code_context>

<deferred>
## Deferred Ideas

- URL-03: list_pages results include url field for each page — future phase
- URL-04: search_pages results include url field for each page — future phase

</deferred>

---

*Phase: 26-redaction-wiring-and-url-injection*
*Context gathered: 2026-03-27*
