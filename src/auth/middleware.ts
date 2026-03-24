import fp from 'fastify-plugin';
import { jwtVerify } from 'jose';
import type {
  FastifyPluginAsync,
  FastifyRequest,
  FastifyReply,
  FastifyInstance,
} from 'fastify';
import type { JWTVerifyGetKey } from 'jose';
import type { AuthenticatedUser, AzureAdPayload } from './types.js';
import {
  mapJoseError,
  buildWwwAuthenticateNoToken,
  buildWwwAuthenticate401,
  buildWwwAuthenticate403,
} from './errors.js';
import { SUPPORTED_SCOPES } from '../scopes.js';

/**
 * Options for the auth plugin. Accepts injected JWKS for testability
 * (local JWKS in tests, remote JWKS in production).
 */
export interface AuthPluginOptions {
  /** JWKS key resolver function (createRemoteJWKSet or createLocalJWKSet) */
  jwks: JWTVerifyGetKey;
  /** Expected issuer (Azure AD v2.0 URL) */
  issuer: string;
  /** Expected audience (Azure AD client ID) */
  audience: string;
  /** RFC 9728 resource_metadata URL for WWW-Authenticate headers */
  resourceMetadataUrl: string;
}

// TypeScript declaration merging for request.user
declare module 'fastify' {
  interface FastifyRequest {
    user: AuthenticatedUser | null;
  }
}

const authPlugin: FastifyPluginAsync<AuthPluginOptions> = async (
  fastify: FastifyInstance,
  options: AuthPluginOptions,
) => {
  const { jwks, issuer, audience, resourceMetadataUrl } = options;

  // Decorate with null (NEVER a reference type -- Pitfall 6)
  fastify.decorateRequest('user', null);

  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Reset user for this request
    request.user = null;

    // Step 1: Extract Bearer token (AUTH-01)
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply
        .code(401)
        .header('WWW-Authenticate', buildWwwAuthenticateNoToken(resourceMetadataUrl))
        .send({ error: 'invalid_token', error_description: 'missing bearer token', correlation_id: request.id });
      return reply;
    }

    const token = authHeader.slice(7); // Remove "Bearer " prefix (7 chars)
    if (!token) {
      reply
        .code(401)
        .header('WWW-Authenticate', buildWwwAuthenticateNoToken(resourceMetadataUrl))
        .send({ error: 'invalid_token', error_description: 'missing bearer token', correlation_id: request.id });
      return reply;
    }

    // Step 2: Validate JWT (AUTH-02, AUTH-03, AUTH-04, AUTH-05)
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer,
        audience,
        algorithms: ['RS256'],
      });

      const adPayload = payload as AzureAdPayload;

      // Step 3: Validate scopes (AUTH-07)
      // Azure AD v2.0 delegated tokens use scp claim as space-delimited string
      const scopes = typeof adPayload.scp === 'string' ? adPayload.scp.split(' ') : [];
      const hasValidScope = scopes.some(s => SUPPORTED_SCOPES.includes(s));

      if (!hasValidScope) {
        reply
          .code(403)
          .header('WWW-Authenticate', buildWwwAuthenticate403(resourceMetadataUrl, [...SUPPORTED_SCOPES]))
          .send({
            error: 'insufficient_scope',
            error_description: 'token does not contain a required scope',
            required_scopes: [...SUPPORTED_SCOPES],
            correlation_id: request.id,
          });
        return reply;
      }

      // Step 4: Extract user identity claims
      // oid is required per user decision; others optional
      if (!adPayload.oid) {
        reply
          .code(401)
          .header('WWW-Authenticate', buildWwwAuthenticate401(resourceMetadataUrl, 'invalid_token', 'missing required claim: oid'))
          .send({ error: 'invalid_token', error_description: 'missing required claim: oid', correlation_id: request.id });
        return reply;
      }

      request.user = {
        oid: adPayload.oid,
        preferred_username: adPayload.preferred_username,
        name: adPayload.name,
        email: adPayload.email,
      };

      // Log auth success (basic logging -- structured correlation IDs in Phase 5)
      request.log.info({ oid: request.user.oid }, 'JWT validated');

    } catch (err) {
      const mapped = mapJoseError(err);

      if (mapped.status === 503) {
        // JWKS fetch failure -- distinguish from auth failure per user decision
        reply
          .code(503)
          .header('Retry-After', '5')
          .send({ error: mapped.error, error_description: mapped.description, correlation_id: request.id });
        return reply;
      }

      // Log auth rejection
      request.log.warn({ error: mapped.error, description: mapped.description }, 'JWT validation failed');

      reply
        .code(mapped.status)
        .header('WWW-Authenticate', buildWwwAuthenticate401(resourceMetadataUrl, mapped.error, mapped.description))
        .send({ error: mapped.error, error_description: mapped.description, correlation_id: request.id });
      return reply;
    }
  });
};

export default fp(authPlugin, {
  name: 'auth-jwt',
  fastify: '4.x',
});
