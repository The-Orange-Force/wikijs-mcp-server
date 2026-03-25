// ---------------------------------------------------------------------------
// Scope mapping and RFC 8707 resource parameter stripping utilities
// ---------------------------------------------------------------------------

import { SUPPORTED_SCOPES } from "../scopes.js";

/** OIDC scopes that pass through to Azure AD without prefixing. */
const OIDC_PASSTHROUGH = new Set(["openid", "offline_access"]);

/**
 * Map bare MCP scopes to Azure AD `api://{clientId}/` format.
 *
 * - OIDC scopes (openid, offline_access) pass through unchanged.
 * - Already-prefixed scopes (api://...) are not double-prefixed.
 * - Known MCP scopes (wikijs:read, wikijs:write, wikijs:admin) get prefixed.
 * - Unknown scopes pass through unchanged (proxy stays transparent).
 */
export function mapScopes(scopes: string[], clientId: string): string[] {
  return scopes.map((scope) => {
    if (OIDC_PASSTHROUGH.has(scope)) return scope;
    if (scope.startsWith("api://")) return scope;
    if (SUPPORTED_SCOPES.includes(scope)) return `api://${clientId}/${scope}`;
    return scope;
  });
}

/**
 * Remove the RFC 8707 `resource` parameter from a parameter set.
 *
 * Azure AD does not support the `resource` parameter on v2.0 endpoints
 * (AADSTS9010010). This strips it before proxying requests upstream.
 *
 * Returns a new object — never mutates the input.
 */
export function stripResourceParam(
  params: Record<string, string>,
): Record<string, string> {
  const { resource: _, ...rest } = params;
  return rest;
}

/**
 * Reverse-map Azure AD scopes back to bare MCP format.
 *
 * Strips the `api://{clientId}/` prefix from scopes in Azure AD's token
 * response so MCP clients see bare scope names (wikijs:read, not
 * api://clientId/wikijs:read). OIDC scopes (openid, offline_access) and
 * scopes with a different prefix pass through unchanged.
 */
export function unmapScopes(scopeString: string, clientId: string): string {
  if (!scopeString) return scopeString;
  const prefix = `api://${clientId}/`;
  return scopeString
    .split(" ")
    .map((scope) => scope.startsWith(prefix) ? scope.slice(prefix.length) : scope)
    .join(" ");
}
