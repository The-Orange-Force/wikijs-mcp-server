import { describe, it, expect } from 'vitest';
import { errors } from 'jose';
import {
  mapJoseError,
  buildWwwAuthenticateNoToken,
  buildWwwAuthenticate401,
  buildWwwAuthenticate403,
} from '../errors.js';

describe('mapJoseError', () => {
  it('maps JWTExpired to 401 with "token expired"', () => {
    const err = new errors.JWTExpired('expired', {}, 'exp', 'check_failed');
    const result = mapJoseError(err);
    expect(result).toEqual({
      status: 401,
      error: 'invalid_token',
      description: 'token expired',
    });
  });

  it('maps JWTClaimValidationFailed with claim "aud" to 401 with "invalid audience"', () => {
    const err = new errors.JWTClaimValidationFailed('check', {}, 'aud', 'check_failed');
    const result = mapJoseError(err);
    expect(result).toEqual({
      status: 401,
      error: 'invalid_token',
      description: 'invalid audience',
    });
  });

  it('maps JWTClaimValidationFailed with claim "iss" to 401 with "invalid issuer"', () => {
    const err = new errors.JWTClaimValidationFailed('check', {}, 'iss', 'check_failed');
    const result = mapJoseError(err);
    expect(result).toEqual({
      status: 401,
      error: 'invalid_token',
      description: 'invalid issuer',
    });
  });

  it('maps JWTClaimValidationFailed with claim "nbf" to 401 with "token not yet valid"', () => {
    const err = new errors.JWTClaimValidationFailed('check', {}, 'nbf', 'check_failed');
    const result = mapJoseError(err);
    expect(result).toEqual({
      status: 401,
      error: 'invalid_token',
      description: 'token not yet valid',
    });
  });

  it('maps JWTClaimValidationFailed with unknown claim to 401 with generic description', () => {
    const err = new errors.JWTClaimValidationFailed('check', {}, 'azp', 'check_failed');
    const result = mapJoseError(err);
    expect(result).toEqual({
      status: 401,
      error: 'invalid_token',
      description: 'claim validation failed: azp',
    });
  });

  it('maps JWSSignatureVerificationFailed to 401 with "invalid signature"', () => {
    const err = new errors.JWSSignatureVerificationFailed('sig failed');
    const result = mapJoseError(err);
    expect(result).toEqual({
      status: 401,
      error: 'invalid_token',
      description: 'invalid signature',
    });
  });

  it('maps JWKSTimeout to 503 with "service_unavailable" (NOT 401)', () => {
    const err = new errors.JWKSTimeout();
    const result = mapJoseError(err);
    expect(result).toEqual({
      status: 503,
      error: 'service_unavailable',
      description: 'unable to validate token: key service unavailable',
    });
  });

  it('maps JWKSNoMatchingKey to 401 with "no matching key found"', () => {
    const err = new errors.JWKSNoMatchingKey();
    const result = mapJoseError(err);
    expect(result).toEqual({
      status: 401,
      error: 'invalid_token',
      description: 'no matching key found',
    });
  });

  it('maps generic Error to 401 with fallback description', () => {
    const err = new Error('something went wrong');
    const result = mapJoseError(err);
    expect(result).toEqual({
      status: 401,
      error: 'invalid_token',
      description: 'token validation failed',
    });
  });
});

describe('WWW-Authenticate header builders', () => {
  const resourceMetadataUrl =
    'https://example.com/.well-known/oauth-protected-resource';

  it('buildWwwAuthenticateNoToken returns Bearer with resource_metadata', () => {
    const result = buildWwwAuthenticateNoToken(resourceMetadataUrl);
    expect(result).toBe(
      'Bearer resource_metadata="https://example.com/.well-known/oauth-protected-resource"',
    );
  });

  it('buildWwwAuthenticate401 includes error and error_description parameters', () => {
    const result = buildWwwAuthenticate401(
      resourceMetadataUrl,
      'invalid_token',
      'token expired',
    );
    expect(result).toBe(
      'Bearer resource_metadata="https://example.com/.well-known/oauth-protected-resource", error="invalid_token", error_description="token expired"',
    );
  });

  it('buildWwwAuthenticate403 includes error="insufficient_scope" and scope parameter', () => {
    const result = buildWwwAuthenticate403(resourceMetadataUrl, [
      'wikijs:read',
      'wikijs:write',
      'wikijs:admin',
    ]);
    expect(result).toBe(
      'Bearer resource_metadata="https://example.com/.well-known/oauth-protected-resource", error="insufficient_scope", error_description="insufficient scope", scope="wikijs:read wikijs:write wikijs:admin"',
    );
  });
});
