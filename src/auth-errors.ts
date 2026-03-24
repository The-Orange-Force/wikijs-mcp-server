/**
 * RFC 6750 error mapping for jose JWT validation errors.
 *
 * Maps jose error classes to structured RFC 6750 Bearer token error responses
 * with proper HTTP status codes, error codes, descriptions, and
 * WWW-Authenticate header values.
 *
 * @see https://www.rfc-editor.org/rfc/rfc6750.html
 */

import * as jose from "jose";

/**
 * Structured RFC 6750 error response.
 */
export interface Rfc6750Error {
  /** HTTP status code (401, 403, or 503) */
  statusCode: number;
  /** RFC 6750 error code (invalid_token, invalid_request, insufficient_scope, temporarily_unavailable) */
  error: string;
  /** Human-readable error description (no jose internals leaked) */
  errorDescription: string;
  /** Complete WWW-Authenticate header value */
  wwwAuthenticate: string;
}

/**
 * Build a WWW-Authenticate header value for a 401 Bearer error response.
 * Includes resource_metadata URL per RFC 9728.
 */
function buildWwwAuthenticate401(
  error: string,
  errorDescription: string,
  resourceMetadataUrl: string,
): string {
  return `Bearer realm="mcp", error="${error}", error_description="${errorDescription}", resource_metadata="${resourceMetadataUrl}"`;
}

/**
 * Map a jose validation error to an RFC 6750 error response.
 *
 * Uses instanceof checks against jose error classes to determine the
 * appropriate HTTP status code, error code, and description. The
 * resource_metadata URL is included in the WWW-Authenticate header
 * for 401 responses (but NOT for 503, since 503 indicates a server
 * issue, not a token issue).
 *
 * @param err - The error thrown by jose during JWT validation
 * @param resourceMetadataUrl - URL to the RFC 9728 protected resource metadata endpoint
 * @returns Structured RFC 6750 error response
 */
export function mapJoseErrorToRfc6750(
  err: unknown,
  resourceMetadataUrl: string,
): Rfc6750Error {
  // JWTExpired: token exp claim is in the past
  if (err instanceof jose.errors.JWTExpired) {
    return {
      statusCode: 401,
      error: "invalid_token",
      errorDescription: "Token expired",
      wwwAuthenticate: buildWwwAuthenticate401(
        "invalid_token",
        "Token expired",
        resourceMetadataUrl,
      ),
    };
  }

  // JWTClaimValidationFailed: aud, iss, nbf, or other claim failed
  if (err instanceof jose.errors.JWTClaimValidationFailed) {
    let description: string;
    switch (err.claim) {
      case "aud":
        description = "Invalid audience";
        break;
      case "iss":
        description = "Invalid issuer";
        break;
      default:
        description = `Claim validation failed: ${err.claim}`;
        break;
    }
    return {
      statusCode: 401,
      error: "invalid_token",
      errorDescription: description,
      wwwAuthenticate: buildWwwAuthenticate401(
        "invalid_token",
        description,
        resourceMetadataUrl,
      ),
    };
  }

  // JWSSignatureVerificationFailed: signature does not match
  if (err instanceof jose.errors.JWSSignatureVerificationFailed) {
    return {
      statusCode: 401,
      error: "invalid_token",
      errorDescription: "Signature verification failed",
      wwwAuthenticate: buildWwwAuthenticate401(
        "invalid_token",
        "Signature verification failed",
        resourceMetadataUrl,
      ),
    };
  }

  // JWKSNoMatchingKey: no key in JWKS matches token kid
  if (err instanceof jose.errors.JWKSNoMatchingKey) {
    return {
      statusCode: 401,
      error: "invalid_token",
      errorDescription: "No matching signing key",
      wwwAuthenticate: buildWwwAuthenticate401(
        "invalid_token",
        "No matching signing key",
        resourceMetadataUrl,
      ),
    };
  }

  // JWKSTimeout: JWKS endpoint did not respond in time
  // Per Phase 4 CONTEXT decision: JWKS fetch failure = 503, not 401
  if (err instanceof jose.errors.JWKSTimeout) {
    return {
      statusCode: 503,
      error: "temporarily_unavailable",
      errorDescription: "Authorization server unreachable",
      wwwAuthenticate: `Bearer realm="mcp", error="temporarily_unavailable", error_description="Authorization server unreachable"`,
    };
  }

  // Fallback: unknown error type
  return {
    statusCode: 401,
    error: "invalid_token",
    errorDescription: "Invalid or malformed token",
    wwwAuthenticate: buildWwwAuthenticate401(
      "invalid_token",
      "Invalid or malformed token",
      resourceMetadataUrl,
    ),
  };
}

/**
 * Create an RFC 6750 error for a missing Bearer token.
 *
 * @param resourceMetadataUrl - URL to the RFC 9728 protected resource metadata endpoint
 * @returns Structured RFC 6750 error response with error="invalid_request"
 */
export function mapMissingTokenError(
  resourceMetadataUrl: string,
): Rfc6750Error {
  return {
    statusCode: 401,
    error: "invalid_request",
    errorDescription: "No access token provided",
    wwwAuthenticate: `Bearer realm="mcp", error="invalid_request", error_description="No access token provided", resource_metadata="${resourceMetadataUrl}"`,
  };
}

/**
 * Create an RFC 6750 error for insufficient token scope.
 *
 * @param resourceMetadataUrl - URL to the RFC 9728 protected resource metadata endpoint
 * @param requiredScopes - The scopes that the token must have
 * @returns Structured RFC 6750 error response with error="insufficient_scope"
 */
export function mapInsufficientScopeError(
  resourceMetadataUrl: string,
  requiredScopes: string[],
): Rfc6750Error {
  const scopeList = requiredScopes.join(" ");
  return {
    statusCode: 403,
    error: "insufficient_scope",
    errorDescription: `Insufficient scope. Required: ${scopeList}`,
    wwwAuthenticate: `Bearer realm="mcp", error="insufficient_scope", scope="${scopeList}", resource_metadata="${resourceMetadataUrl}"`,
  };
}
