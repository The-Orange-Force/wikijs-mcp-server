/**
 * Request context propagation via AsyncLocalStorage.
 *
 * Provides a bridge between Fastify request context and MCP SDK tool handlers.
 * The POST /mcp route handler calls requestContext.run() to establish context,
 * and tool handlers call requestContext.getStore() to access correlation ID,
 * user identity, and the enriched pino logger.
 *
 * @example
 * // In route handler (Plan 02):
 * requestContext.run({ correlationId, userId, username, log }, async () => {
 *   await transport.handleRequest(request.raw, reply.raw, request.body);
 * });
 *
 * // In MCP tool handler:
 * const ctx = requestContext.getStore();
 * ctx?.log.info({ toolName: "search_pages" }, "Tool invoked");
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { FastifyBaseLogger } from "fastify";

/**
 * Request-scoped context carried through AsyncLocalStorage.
 */
export interface RequestContext {
  /** UUID v4 correlation ID for the current request */
  correlationId: string;
  /** Azure AD object ID (oid claim) of the authenticated user */
  userId?: string;
  /** User principal name (preferred_username claim) */
  username?: string;
  /** Pino-compatible logger with request-scoped bindings (correlationId, userId) */
  log: FastifyBaseLogger;
}

/**
 * AsyncLocalStorage instance for propagating request context
 * through the MCP SDK boundary into tool handlers.
 */
export const requestContext = new AsyncLocalStorage<RequestContext>();
