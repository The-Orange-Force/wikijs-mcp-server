import fastify, { FastifyInstance } from "fastify";
import { WikiJsApi } from "./api.js";
import { type AppConfig, config, logConfig } from "./config.js";
import { buildLoggerConfig } from "./logging.js";
import { publicRoutes } from "./routes/public-routes.js";
import { protectedRoutes } from "./routes/mcp-routes.js";
import { jwks } from "./config.js";

/**
 * Creates and configures a Fastify server with public and protected routes.
 * Does NOT call listen() -- the caller is responsible for starting.
 *
 * Uses buildLoggerConfig() for structured pino logging with correlation IDs.
 * Registers public routes (no auth) and protected MCP routes (auth required)
 * as separate encapsulated plugins.
 *
 * @param appConfig - Validated application configuration
 * @param wikiJsApiOverride - Optional pre-built WikiJsApi (for test mocking)
 * @returns Configured Fastify instance
 */
export function buildApp(
  appConfig: AppConfig,
  wikiJsApiOverride?: WikiJsApi,
): FastifyInstance {
  const server = fastify({
    ...buildLoggerConfig(),
  });

  const wikiJsApi =
    wikiJsApiOverride ??
    new WikiJsApi(appConfig.wikijs.baseUrl, appConfig.wikijs.token);

  // Global onRequest hook: set X-Request-ID response header on EVERY response.
  // Runs before any other hooks, guaranteeing the correlation ID appears on
  // 401s, 404s, and all errors (Pitfall 4 from research).
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

// Keep legacy export for backward compatibility (Phase 1/2 consumers)
export function buildServer(wikiJsApi: WikiJsApi): FastifyInstance {
  return buildApp(config, wikiJsApi);
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function start() {
  logConfig(config);

  const server = buildApp(config);

  try {
    const wikiJsApi = new WikiJsApi(config.wikijs.baseUrl, config.wikijs.token);
    const isConnected = await wikiJsApi.checkConnection();
    if (!isConnected) {
      server.log.warn(
        "Could not connect to Wiki.js API. Server started but functionality may be limited.",
      );
    }

    await server.listen({ port: config.port, host: "0.0.0.0" });
    server.log.info(`WikiJS MCP server started on port ${config.port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

// Only start when executed directly (not when imported by tests)
// Check that we're not in a vitest/test environment
if (!process.env.VITEST) {
  start();
}
