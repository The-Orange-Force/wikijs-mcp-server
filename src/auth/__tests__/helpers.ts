import {
  generateKeyPair,
  SignJWT,
  exportJWK,
  createLocalJWKSet,
} from 'jose';

/**
 * Test configuration matching the vitest.config.ts env vars
 * and Azure AD v2.0 URL conventions.
 */
export const TEST_CONFIG = {
  tenantId: '550e8400-e29b-41d4-a716-446655440000',
  clientId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  resourceUrl: 'https://mcp.example.com',
  issuer:
    'https://login.microsoftonline.com/550e8400-e29b-41d4-a716-446655440000/v2.0',
  audience: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  resourceMetadataUrl:
    'https://mcp.example.com/.well-known/oauth-protected-resource',
} as const;

// Lazily generated and cached RS256 key pair (one per test suite)
let _keyPair: { publicKey: CryptoKey; privateKey: CryptoKey } | null = null;
let _localJwks: ReturnType<typeof createLocalJWKSet> | null = null;

async function getKeyPair() {
  if (!_keyPair) {
    _keyPair = await generateKeyPair('RS256');
  }
  return _keyPair;
}

/**
 * Returns a local JWKS function with the same interface as createRemoteJWKSet.
 * Uses the lazily-generated test key pair. Safe to call multiple times --
 * the key pair and JWKS are cached.
 */
export async function getLocalJwks() {
  if (!_localJwks) {
    const { publicKey } = await getKeyPair();
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = 'test-key-1';
    publicJwk.alg = 'RS256';
    publicJwk.use = 'sig';
    _localJwks = createLocalJWKSet({ keys: [publicJwk] });
  }
  return _localJwks;
}

/**
 * Creates a valid test token with standard Azure AD claims.
 * Override any claim by passing it in the claims object.
 */
export async function createTestToken(
  claims: Record<string, unknown> = {},
): Promise<string> {
  const { privateKey } = await getKeyPair();
  return new SignJWT({
    oid: '00000000-0000-0000-0000-000000000001',
    preferred_username: 'testuser@contoso.com',
    name: 'Test User',
    email: 'testuser@contoso.com',
    scp: 'wikijs:read wikijs:write',
    ...claims,
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: 'test-key-1' })
    .setIssuer(TEST_CONFIG.issuer)
    .setAudience(TEST_CONFIG.audience)
    .setExpirationTime('1h')
    .setIssuedAt()
    .setNotBefore('0s')
    .sign(privateKey);
}

/**
 * Creates a token that is already expired (exp 1 hour in the past).
 * Useful for testing JWTExpired error handling.
 */
export async function createExpiredToken(): Promise<string> {
  const { privateKey } = await getKeyPair();
  return new SignJWT({
    oid: '00000000-0000-0000-0000-000000000001',
    scp: 'wikijs:read',
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: 'test-key-1' })
    .setIssuer(TEST_CONFIG.issuer)
    .setAudience(TEST_CONFIG.audience)
    .setExpirationTime('-1h')
    .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
    .sign(privateKey);
}

/**
 * Low-level helper for creating tokens with arbitrary claims and signer options.
 * Useful for edge case tests: wrong audience, wrong issuer, missing scopes, etc.
 */
export async function createTokenWithClaims(
  claims: Record<string, unknown>,
  options: {
    issuer?: string;
    audience?: string;
    expirationTime?: string;
  } = {},
): Promise<string> {
  const { privateKey } = await getKeyPair();
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: 'test-key-1' })
    .setIssuer(options.issuer ?? TEST_CONFIG.issuer)
    .setAudience(options.audience ?? TEST_CONFIG.audience)
    .setExpirationTime(options.expirationTime ?? '1h')
    .setIssuedAt()
    .setNotBefore('0s')
    .sign(privateKey);
}
