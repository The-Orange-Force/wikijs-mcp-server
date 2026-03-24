/**
 * Shared test helper for building a Fastify app with local JWKS.
 *
 * Creates a properly configured Fastify instance using the same plugin
 * architecture as production (public + protected routes), but with a
 * local JWKS for test auth instead of remote Azure AD keys.
 */

import fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { WikiJsApi } from "../../src/api.js";
import type { AppConfig } from "../../src/config.js";
import { buildLoggerConfig } from "../../src/logging.js";
import { publicRoutes } from "../../src/routes/public-routes.js";
import { protectedRoutes } from "../../src/routes/mcp-routes.js";
import { getLocalJwks, TEST_CONFIG } from "../../src/auth/__tests__/helpers.js";

/** Mock WikiJsApi for tests that don't need real WikiJS */
export const mockWikiJsApi = {
  checkConnection: async () => true,
  getPageById: async (id: number) => ({
    id,
    path: "test/page",
    title: "Test Page",
    description: "A test page",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  }),
  getPageContent: async () => "# Test Content",
  getPagesList: async () => [{ id: 1, path: "test", title: "Test" }],
  searchPages: async () => [{ id: 1, path: "test", title: "Test" }],
  createPage: async () => ({ succeeded: true, message: "OK" }),
  updatePage: async () => ({ succeeded: true, message: "OK" }),
  deletePage: async () => ({ succeeded: true, message: "OK" }),
  getUsersList: async () => [
    { id: 1, name: "Admin", email: "admin@test.com" },
  ],
  searchUsers: async () => [
    { id: 1, name: "Admin", email: "admin@test.com" },
  ],
  getGroupsList: async () => [{ id: 1, name: "Admins", isSystem: true }],
  createUser: async () => ({ succeeded: true, message: "OK" }),
  updateUser: async () => ({ succeeded: true, message: "OK" }),
  getAllPagesList: async () => [
    { id: 1, path: "test", title: "Test", isPublished: true },
  ],
  searchUnpublishedPages: async () => [],
  forceDeletePage: async () => ({ succeeded: true, message: "OK" }),
  getPageStatus: async () => ({
    id: 1,
    path: "test",
    title: "Test",
    isPublished: true,
  }),
  publishPage: async () => ({ succeeded: true, message: "OK" }),
} as unknown as WikiJsApi;

/**
 * Creates an AppConfig for tests, matching the test auth helpers.
 */
export function makeTestConfig(
  overrides?: Partial<AppConfig["azure"]>,
): AppConfig {
  return {
    port: 0,
    wikijs: {
      baseUrl: "http://localhost:3000",
      token: "test-token",
    },
    azure: {
      tenantId: TEST_CONFIG.tenantId,
      clientId: TEST_CONFIG.clientId,
      resourceUrl: TEST_CONFIG.resourceUrl,
      jwksUri: `https://login.microsoftonline.com/${TEST_CONFIG.tenantId}/discovery/v2.0/keys`,
      issuer: TEST_CONFIG.issuer,
      ...overrides,
    },
  };
}

/**
 * Builds a test Fastify app with local JWKS and mock WikiJsApi.
 * Uses the same plugin architecture as production.
 *
 * @param configOverrides - Optional overrides for the azure config section
 * @param wikiJsApiOverride - Optional WikiJsApi override (defaults to mockWikiJsApi)
 * @param loggerOptions - Optional override for logger config (e.g., custom stream for log capture)
 */
export async function buildTestApp(
  configOverrides?: Partial<AppConfig["azure"]>,
  wikiJsApiOverride?: WikiJsApi,
  loggerOptions?: Record<string, unknown>,
): Promise<FastifyInstance> {
  const appConfig = makeTestConfig(configOverrides);
  const wikiJsApi = wikiJsApiOverride ?? mockWikiJsApi;
  const jwks = await getLocalJwks();

  const loggerConfig = buildLoggerConfig();

  // If custom logger options provided, merge them
  if (loggerOptions) {
    Object.assign(loggerConfig, loggerOptions);
  }

  const server = fastify(loggerConfig);

  // Global onRequest hook: set X-Request-ID response header on EVERY response
  server.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  // Public routes -- no auth required
  server.register(publicRoutes, {
    wikiJsApi,
    appConfig,
  });

  // Protected MCP routes -- auth enforced via scoped preHandler
  server.register(protectedRoutes, {
    wikiJsApi,
    auth: {
      jwks,
      issuer: appConfig.azure.issuer,
      audience: appConfig.azure.clientId,
      resourceMetadataUrl: `${appConfig.azure.resourceUrl}/.well-known/oauth-protected-resource`,
    },
  });

  return server;
}
