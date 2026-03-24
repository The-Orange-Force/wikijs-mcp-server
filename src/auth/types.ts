import type { JWTPayload } from 'jose';

/**
 * Authenticated user identity extracted from a validated Azure AD JWT.
 * Only `oid` is guaranteed present; other claims are extracted if available.
 */
export interface AuthenticatedUser {
  oid: string;                          // Required -- Azure AD object ID
  preferred_username: string | undefined; // Optional
  name: string | undefined;              // Optional
  email: string | undefined;             // Optional
}

/**
 * Azure AD v2.0 JWT payload with domain-specific claims.
 * Extends jose's JWTPayload for use with jwtVerify return type.
 */
export interface AzureAdPayload extends JWTPayload {
  oid?: string;
  preferred_username?: string;
  name?: string;
  email?: string;
  scp?: string; // Space-delimited scope string (delegated tokens)
}

/**
 * Structured error returned by mapJoseError.
 * Maps jose error classes to RFC 6750 error response fields.
 */
export interface AuthError {
  status: number;
  error: string;
  description: string;
}
