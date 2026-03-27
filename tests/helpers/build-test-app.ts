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
import { oauthProxyRoutes } from "../../src/routes/oauth-proxy.js";
import { getLocalJwks, TEST_CONFIG } from "../../src/auth/__tests__/helpers.js";
import { DEFAULT_INSTRUCTIONS } from "../../src/instructions.js";

/** Captured fetch call for test assertions. */
export interface CapturedFetchCall {
  url: string;
  init?: RequestInit;
}

/** Global captures for test inspection. Tests should clear in beforeEach. */
export const capturedFetchCalls: CapturedFetchCall[] = [];

/** Mock fetch that captures calls and returns generic 400. Prevents accidental real Azure AD calls. */
async function mockFetch(url: string | URL | Request, init?: RequestInit): Promise<Response> {
  capturedFetchCalls.push({
    url: typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url,
    init,
  });
  return new Response(
    JSON.stringify({ error: "mock_error", error_description: "Mock fetch -- no real Azure AD calls in tests" }),
    { status: 400, headers: { "content-type": "application/json" } },
  );
}

/** Mock WikiJsApi for tests -- only the 3 read-only tool API methods + checkConnection */
export const mockWikiJsApi = {
  checkConnection: async () => true,
  getPageById: async (id: number) => ({
    id,
    path: "test/page",
    title: "Test Page",
    description: "A test page",
    content: "# Test Content\n\nThis is test content.",
    isPublished: true,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  }),
  listPages: async () => [
    {
      id: 1,
      path: "test",
      title: "Test",
      description: "Test page",
      isPublished: true,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    },
  ],
  searchPages: async () => ({
    results: [
      {
        id: 1,
        path: "test",
        title: "Test",
        description: "Test page",
        isPublished: true,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      },
    ],
    totalHits: 1,
  }),
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
      locale: "en",
    },
    azure: {
      tenantId: TEST_CONFIG.tenantId,
      clientId: TEST_CONFIG.clientId,
      resourceUrl: TEST_CONFIG.resourceUrl,
      jwksUri: `https://login.microsoftonline.com/${TEST_CONFIG.tenantId}/discovery/v2.0/keys`,
      issuer: TEST_CONFIG.issuer,
      ...overrides,
    },
    instructionsPath: '/app/instructions.txt',
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
  instructions?: string,
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
    // Also set on raw response for routes that write directly to reply.raw
    reply.raw.setHeader("x-request-id", request.id as string);
  });

  // Public routes -- no auth required
  server.register(publicRoutes, {
    wikiJsApi,
    appConfig,
  });

  // OAuth authorization proxy routes -- no auth required (mock fetch prevents real Azure AD calls)
  server.register(oauthProxyRoutes, { appConfig, fetch: mockFetch });

  // Protected MCP routes -- auth enforced via scoped preHandler
  server.register(protectedRoutes, {
    wikiJsApi,
    instructions: instructions ?? DEFAULT_INSTRUCTIONS,
    config: appConfig,
    auth: {
      jwks,
      issuer: appConfig.azure.issuer,
      audience: appConfig.azure.clientId,
      resourceMetadataUrl: `${appConfig.azure.resourceUrl}/.well-known/oauth-protected-resource`,
    },
  });

  return server;
}
