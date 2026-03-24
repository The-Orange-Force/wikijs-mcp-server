/**
 * Tool invocation timing wrapper.
 *
 * Wraps MCP tool handlers to measure and log execution duration.
 * Uses requestContext.getStore() to access the AsyncLocalStorage context
 * set by requestContext.run() in the POST /mcp handler, ensuring tool
 * invocation logs include correlationId, userId, and username.
 *
 * @example
 * const wrappedHandler = wrapToolHandler("search_pages", originalHandler);
 * // When invoked, logs: { toolName: "search_pages", duration: 42, userId: "oid", username: "user@example.com" }
 */

import { requestContext } from "./request-context.js";

/**
 * Wraps an MCP tool handler to measure and log execution duration.
 *
 * - Uses performance.now() for sub-millisecond timing precision
 * - Rounds duration to integer ms for log readability
 * - Logs at info level on success, error level on failure
 * - Includes userId and username explicitly in the log payload
 *
 * @param toolName - Name of the MCP tool (used in log messages)
 * @param handler - Original tool handler function
 * @returns Wrapped handler with timing and logging
 */
export function wrapToolHandler<TArgs, TResult>(
  toolName: string,
  handler: (args: TArgs) => Promise<TResult>,
): (args: TArgs) => Promise<TResult> {
  return async (args: TArgs): Promise<TResult> => {
    const ctx = requestContext.getStore();
    const start = performance.now();
    try {
      const result = await handler(args);
      const duration = Math.round(performance.now() - start);
      ctx?.log.info(
        { toolName, duration, userId: ctx.userId, username: ctx.username },
        `Tool invocation: ${toolName}`,
      );
      return result;
    } catch (error) {
      const duration = Math.round(performance.now() - start);
      ctx?.log.error(
        {
          toolName,
          duration,
          userId: ctx?.userId,
          username: ctx?.username,
          error: String(error),
        },
        `Tool error: ${toolName}`,
      );
      throw error;
    }
  };
}
