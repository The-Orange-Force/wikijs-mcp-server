import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import authPlugin from '../middleware.js';
import {
  createTestToken,
  createExpiredToken,
  createTokenWithClaims,
  getLocalJwks,
  TEST_CONFIG,
} from './helpers.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify({ logger: false });

  const localJwks = await getLocalJwks();

  await app.register(authPlugin, {
    jwks: localJwks,
    issuer: TEST_CONFIG.issuer,
    audience: TEST_CONFIG.audience,
    resourceMetadataUrl: TEST_CONFIG.resourceMetadataUrl,
  });

  app.get('/test', async (request) => {
    return { user: request.user };
  });

  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('token extraction and validation (AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05)', () => {
  it('returns 200 with user identity for a valid token', async () => {
    const token = await createTestToken();
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user).toBeDefined();
    expect(body.user.oid).toBe('00000000-0000-0000-0000-000000000001');
    expect(body.user.preferred_username).toBe('testuser@contoso.com');
    expect(body.user.name).toBe('Test User');
    expect(body.user.email).toBe('testuser@contoso.com');
  });

  it('returns 200 with only oid when other claims are absent', async () => {
    const token = await createTokenWithClaims({ oid: 'test-oid', scp: 'wikijs:read' });
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.oid).toBe('test-oid');
    expect(body.user.preferred_username).toBeUndefined();
    expect(body.user.name).toBeUndefined();
    expect(body.user.email).toBeUndefined();
  });

  it('returns 401 when no Authorization header is present', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test',
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for malformed Authorization header (not Bearer)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for empty Bearer token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: 'Bearer ' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 401 with "token expired" for an expired token', async () => {
    const token = await createExpiredToken();
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.error_description).toBe('token expired');
  });

  it('returns 401 with "invalid audience" for wrong audience', async () => {
    const token = await createTokenWithClaims(
      { oid: 'x', scp: 'wikijs:read' },
      { audience: 'wrong-client-id' },
    );
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.error_description).toBe('invalid audience');
  });

  it('returns 401 with "invalid issuer" for wrong issuer', async () => {
    const token = await createTokenWithClaims(
      { oid: 'x', scp: 'wikijs:read' },
      { issuer: 'https://evil.example.com/v2.0' },
    );
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.error_description).toBe('invalid issuer');
  });
});

describe('scope validation (AUTH-07)', () => {
  it('returns 403 with insufficient_scope when no scp claim present', async () => {
    const token = await createTokenWithClaims({ oid: 'x' });
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.error).toBe('insufficient_scope');
  });

  it('returns 403 when scp contains only unrecognized scopes', async () => {
    const token = await createTokenWithClaims({ oid: 'x', scp: 'unrelated:scope' });
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 200 for a single valid scope (wikijs:read)', async () => {
    const token = await createTokenWithClaims({ oid: 'x', scp: 'wikijs:read' });
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
  });

  it('returns 200 for a single valid scope (wikijs:admin)', async () => {
    const token = await createTokenWithClaims({ oid: 'x', scp: 'wikijs:admin' });
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
  });

  it('returns 200 for multiple valid scopes (default test token)', async () => {
    const token = await createTestToken();
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
  });

  it('includes required_scopes array in 403 response body', async () => {
    const token = await createTokenWithClaims({ oid: 'x' });
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.required_scopes).toEqual(['wikijs:read', 'wikijs:write', 'wikijs:admin']);
  });
});

describe('error response format (AUTH-06)', () => {
  it('401 response has WWW-Authenticate header starting with "Bearer"', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test',
    });

    expect(res.statusCode).toBe(401);
    const wwwAuth = res.headers['www-authenticate'] as string;
    expect(wwwAuth).toBeDefined();
    expect(wwwAuth).toMatch(/^Bearer /);
  });

  it('401 response has WWW-Authenticate containing resource_metadata URL', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test',
    });

    expect(res.statusCode).toBe(401);
    const wwwAuth = res.headers['www-authenticate'] as string;
    expect(wwwAuth).toContain(`resource_metadata="${TEST_CONFIG.resourceMetadataUrl}"`);
  });

  it('401 response body has error and error_description keys', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test',
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body).toHaveProperty('error');
    expect(body).toHaveProperty('error_description');
  });

  it('403 response has WWW-Authenticate containing error="insufficient_scope"', async () => {
    const token = await createTokenWithClaims({ oid: 'x' });
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(403);
    const wwwAuth = res.headers['www-authenticate'] as string;
    expect(wwwAuth).toContain('error="insufficient_scope"');
  });

  it('403 response has WWW-Authenticate containing scope parameter with all scopes', async () => {
    const token = await createTokenWithClaims({ oid: 'x' });
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(403);
    const wwwAuth = res.headers['www-authenticate'] as string;
    expect(wwwAuth).toContain('scope="wikijs:read wikijs:write wikijs:admin"');
  });

  it('403 response body has error, error_description, and required_scopes keys', async () => {
    const token = await createTokenWithClaims({ oid: 'x' });
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body).toHaveProperty('error');
    expect(body).toHaveProperty('error_description');
    expect(body).toHaveProperty('required_scopes');
  });

  it('resource_metadata URL appears in all WWW-Authenticate headers', async () => {
    // Test 401 (no token)
    const res401 = await app.inject({ method: 'GET', url: '/test' });
    expect(res401.headers['www-authenticate']).toContain(
      `resource_metadata="${TEST_CONFIG.resourceMetadataUrl}"`,
    );

    // Test 401 (expired token)
    const expiredToken = await createExpiredToken();
    const res401Expired = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${expiredToken}` },
    });
    expect(res401Expired.headers['www-authenticate']).toContain(
      `resource_metadata="${TEST_CONFIG.resourceMetadataUrl}"`,
    );

    // Test 403 (no scopes)
    const noScopeToken = await createTokenWithClaims({ oid: 'x' });
    const res403 = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${noScopeToken}` },
    });
    expect(res403.headers['www-authenticate']).toContain(
      `resource_metadata="${TEST_CONFIG.resourceMetadataUrl}"`,
    );
  });
});
