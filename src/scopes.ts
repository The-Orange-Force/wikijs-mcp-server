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
    "list_pages",
    "search_pages",
  ],
  [SCOPES.WRITE]: [],
  [SCOPES.ADMIN]: [],
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
