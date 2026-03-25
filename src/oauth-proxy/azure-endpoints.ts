// ---------------------------------------------------------------------------
// Azure AD v2.0 endpoint URL construction
// ---------------------------------------------------------------------------

/** Azure AD authorize and token endpoint URLs. */
export interface AzureEndpoints {
  authorize: string;
  token: string;
}

/**
 * Build Azure AD v2.0 authorize and token endpoint URLs from a tenant ID.
 *
 * Follows the same URL derivation pattern as src/config.ts (jwksUri, issuer)
 * but targets the /oauth2/v2.0/ path segment for OAuth 2.1 flows.
 */
export function buildAzureEndpoints(tenantId: string): AzureEndpoints {
  const base = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0`;
  return {
    authorize: `${base}/authorize`,
    token: `${base}/token`,
  };
}
