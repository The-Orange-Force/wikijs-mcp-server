// ---------------------------------------------------------------------------
// Scope-to-tool mapping -- single source of truth for Phase 4/5 enforcement
// ---------------------------------------------------------------------------

export const SCOPES = {
  READ: "wikijs:read",
  WRITE: "wikijs:write",
  ADMIN: "wikijs:admin",
} as const;

export type Scope = (typeof SCOPES)[keyof typeof SCOPES];

/**
 * Forward mapping: scope -> tools that require that scope.
 * This is the authoritative definition consumed by auth middleware.
 */
export const SCOPE_TOOL_MAP: Record<Scope, readonly string[]> = {
  [SCOPES.READ]: [
    "get_page",
    "get_page_content",
    "list_pages",
    "list_all_pages",
    "search_pages",
    "search_unpublished_pages",
    "get_page_status",
  ],
  [SCOPES.WRITE]: [
    "create_page",
    "update_page",
    "publish_page",
  ],
  [SCOPES.ADMIN]: [
    "delete_page",
    "force_delete_page",
    "list_users",
    "search_users",
    "list_groups",
    "create_user",
    "update_user",
  ],
} as const;

/** Flat array of all supported scope strings. */
export const SUPPORTED_SCOPES: string[] = Object.values(SCOPES);

/**
 * Reverse mapping: tool name -> required scope.
 * Derived from SCOPE_TOOL_MAP to guarantee consistency.
 */
export const TOOL_SCOPE_MAP: Record<string, Scope> = Object.entries(
  SCOPE_TOOL_MAP,
).reduce<Record<string, Scope>>((map, [scope, tools]) => {
  for (const tool of tools) {
    map[tool] = scope as Scope;
  }
  return map;
}, {});
