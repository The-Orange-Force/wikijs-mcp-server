import { errors } from 'jose';
import type { AuthError } from './types.js';

/**
 * Maps jose error classes to RFC 6750 structured error responses.
 *
 * JWTExpired check precedes JWTClaimValidationFailed even though jose v6
 * does not use class inheritance between them -- kept for defensive correctness
 * in case future jose versions change the relationship.
 *
 * JWKSTimeout maps to 503 (not 401) per user decision: distinguishes
 * infrastructure failure from authentication failure.
 */
export function mapJoseError(err: unknown): AuthError {
  if (err instanceof errors.JWTExpired) {
    return { status: 401, error: 'invalid_token', description: 'token expired' };
  }

  if (err instanceof errors.JWTClaimValidationFailed) {
    if (err.claim === 'aud') {
      return { status: 401, error: 'invalid_token', description: 'invalid audience' };
    }
    if (err.claim === 'iss') {
      return { status: 401, error: 'invalid_token', description: 'invalid issuer' };
    }
    if (err.claim === 'nbf') {
      return { status: 401, error: 'invalid_token', description: 'token not yet valid' };
    }
    return {
      status: 401,
      error: 'invalid_token',
      description: `claim validation failed: ${err.claim}`,
    };
  }

  if (err instanceof errors.JWSSignatureVerificationFailed) {
    return { status: 401, error: 'invalid_token', description: 'invalid signature' };
  }

  if (err instanceof errors.JWKSTimeout) {
    return {
      status: 503,
      error: 'service_unavailable',
      description: 'unable to validate token: key service unavailable',
    };
  }

  if (err instanceof errors.JWKSNoMatchingKey) {
    return { status: 401, error: 'invalid_token', description: 'no matching key found' };
  }

  // Generic fallback for unknown errors
  return { status: 401, error: 'invalid_token', description: 'token validation failed' };
}

/**
 * Builds WWW-Authenticate header for requests with no Bearer token.
 * RFC 9728: includes resource_metadata parameter.
 */
export function buildWwwAuthenticateNoToken(resourceMetadataUrl: string): string {
  return `Bearer resource_metadata="${resourceMetadataUrl}"`;
}

/**
 * Builds WWW-Authenticate header for 401 responses (invalid token).
 * RFC 6750 Section 3.1 + RFC 9728 resource_metadata parameter.
 */
export function buildWwwAuthenticate401(
  resourceMetadataUrl: string,
  error: string,
  errorDescription: string,
): string {
  return `Bearer resource_metadata="${resourceMetadataUrl}", error="${error}", error_description="${errorDescription}"`;
}

/**
 * Builds WWW-Authenticate header for 403 responses (insufficient scope).
 * RFC 6750 Section 3.1 + RFC 9728 resource_metadata parameter.
 * Scopes are space-joined per RFC 6750.
 */
export function buildWwwAuthenticate403(
  resourceMetadataUrl: string,
  requiredScopes: string[],
): string {
  return `Bearer resource_metadata="${resourceMetadataUrl}", error="insufficient_scope", error_description="insufficient scope", scope="${requiredScopes.join(' ')}"`;
}
