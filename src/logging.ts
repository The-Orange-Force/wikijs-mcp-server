/**
 * Fastify logger configuration with correlation ID support.
 *
 * Provides a buildLoggerConfig() function that returns Fastify server options
 * for structured pino logging with:
 * - UUID v4 correlation IDs generated via genReqId
 * - X-Request-ID header validation (UUID format required)
 * - "correlationId" as the pino log field name for request IDs
 * - requestIdHeader disabled to prevent log injection (Pitfall 2 from research)
 *
 * Usage: spread the returned config into the Fastify constructor options.
 *
 * @example
 * const server = fastify({ ...buildLoggerConfig() });
 */

import { v4 as uuidv4 } from "uuid";
import type { FastifyServerOptions, FastifyRequest } from "fastify";

/**
 * Regex for validating UUID v4 format (case-insensitive).
 * Used to validate client-provided X-Request-ID header values.
 */
export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Build Fastify server options for structured logging with correlation IDs.
 *
 * Key behaviors:
 * - requestIdHeader is set to false to disable automatic header acceptance,
 *   preventing log injection via unvalidated client-provided values.
 * - genReqId reads the X-Request-ID header manually, validates it as UUID
 *   format, and returns the client value if valid or generates a new UUID v4
 *   if invalid or missing.
 * - requestIdLogLabel is "correlationId" so pino logs show the field as
 *   correlationId instead of the default "reqId".
 *
 * @returns Partial Fastify server options to spread into the constructor
 */
export function buildLoggerConfig(): Partial<FastifyServerOptions> {
  return {
    logger: { level: "info" },
    requestIdHeader: false,
    requestIdLogLabel: "correlationId",
    genReqId: (req: FastifyRequest["raw"]) => {
      const clientId = req.headers["x-request-id"];
      // Accept only string values (not arrays) that match UUID format
      if (typeof clientId === "string" && UUID_REGEX.test(clientId)) {
        return clientId;
      }
      return uuidv4();
    },
  };
}
