/**
 * MCP SDK tool registration module.
 *
 * Exports a factory function that creates a configured McpServer with 3
 * read-only page tools registered via the SDK's registerTool() API. Tool
 * handlers delegate to the WikiJsApi class from src/api.ts.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { WikiJsApi } from "./api.js";
import type { AppConfig } from "./config.js";
import { redactContent } from "./gdpr.js";
import { requestContext } from "./request-context.js";
import { wrapToolHandler } from "./tool-wrapper.js";
import { buildPageUrl } from "./url.js";

/**
 * Creates and returns a fully configured McpServer instance with 3
 * read-only page tools registered.
 *
 * @param wikiJsApi - WikiJsApi instance used by tool handlers
 * @param instructions - MCP instructions text for the initialize response
 * @param config - Application configuration for URL construction
 * @returns Configured McpServer ready for transport connection
 */
export function createMcpServer(wikiJsApi: WikiJsApi, instructions: string, config: AppConfig): McpServer {
  const mcpServer = new McpServer({
    name: "wikijs-mcp",
    version: "2.6.0",
  }, {
    instructions,
  });

  // Tool name constants (used in both registerTool and wrapToolHandler)
  const TOOL_GET_PAGE = "get_page";
  const TOOL_LIST_PAGES = "list_pages";
  const TOOL_SEARCH_PAGES = "search_pages";

  // Shared annotations for all read-only tools
  const readOnlyAnnotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  };

  // ---------------------------------------------------------------------------
  // get_page — Retrieve a single page by ID with full content
  // ---------------------------------------------------------------------------

  mcpServer.registerTool(
    TOOL_GET_PAGE,
    {
      description:
        "Retrieve a Wiki.js page by its database ID. Returns the full page object including title, path, url (direct link to the wiki page), description, markdown content, publication status (isPublished), and timestamps (createdAt, updatedAt). Use this tool when you need the actual content of a specific page. Get page IDs from search_pages or list_pages results.",
      inputSchema: {
        id: z
          .number()
          .int()
          .positive()
          .describe(
            "Page database ID (get this from search_pages or list_pages results)",
          ),
      },
      annotations: readOnlyAnnotations,
    },
    wrapToolHandler(TOOL_GET_PAGE, async ({ id }) => {
      try {
        const page = await wikiJsApi.getPageById(id);

        // Redact GDPR-marked content (no-op when no markers present)
        const redactionResult = redactContent(page.content ?? "", page.id, page.path);

        // Log redaction warnings if any
        if (redactionResult.warnings.length > 0) {
          const ctx = requestContext.getStore();
          ctx?.log.warn(
            { pageId: page.id, path: page.path, warnings: redactionResult.warnings },
            "GDPR redaction warnings",
          );
        }

        // Build response with explicit field ordering and URL
        const responseObj = {
          id: page.id,
          path: page.path,
          url: buildPageUrl(config.wikijs.baseUrl, config.wikijs.locale, page.path),
          title: page.title,
          description: page.description,
          content: redactionResult.content,
          isPublished: page.isPublished,
          createdAt: page.createdAt,
          updatedAt: page.updatedAt,
        };

        return {
          content: [
            { type: "text" as const, text: JSON.stringify(responseObj, null, 2) },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Error in get_page: ${String(error)}. Verify the page ID using search_pages or list_pages.`,
            },
          ],
        };
      }
    }),
  );

  // ---------------------------------------------------------------------------
  // list_pages — Browse pages with optional filtering and sorting
  // ---------------------------------------------------------------------------

  mcpServer.registerTool(
    TOOL_LIST_PAGES,
    {
      description:
        "List Wiki.js pages with optional filtering and sorting. Returns page metadata (id, title, path, description, isPublished, createdAt, updatedAt) without content. Use this tool to browse available pages or find a specific page by title. For full page content, use get_page with the page ID from these results.",
      inputSchema: {
        limit: z
          .number()
          .int()
          .positive()
          .max(100)
          .optional()
          .describe(
            "Maximum number of pages to return (default: 50, max: 100)",
          ),
        orderBy: z
          .enum(["TITLE", "CREATED", "UPDATED"])
          .optional()
          .describe(
            "Sort order: TITLE (alphabetical), CREATED (newest first), or UPDATED (recently modified first)",
          ),
        includeUnpublished: z
          .boolean()
          .optional()
          .describe(
            "Include unpublished draft pages in results (default: false, published pages only)",
          ),
      },
      annotations: readOnlyAnnotations,
    },
    wrapToolHandler(
      TOOL_LIST_PAGES,
      async ({ limit, orderBy, includeUnpublished }) => {
        try {
          const pages = await wikiJsApi.listPages(
            limit,
            orderBy,
            includeUnpublished,
          );
          return {
            content: [
              { type: "text" as const, text: JSON.stringify(pages, null, 2) },
            ],
          };
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `Error in list_pages: ${String(error)}. Try reducing the limit or changing the sort order.`,
              },
            ],
          };
        }
      },
    ),
  );

  // ---------------------------------------------------------------------------
  // search_pages — Keyword search across published pages
  // ---------------------------------------------------------------------------

  mcpServer.registerTool(
    TOOL_SEARCH_PAGES,
    {
      description:
        "Search Wiki.js pages by keyword query. Returns matching pages with metadata and content excerpts. Only searches published pages (unpublished pages are not indexed). Note: recently published pages may take a moment to appear in search results due to indexing delay. Use get_page with a result's ID to retrieve the full page content.",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe(
            "Search query string (searches page titles, content, and descriptions)",
          ),
        limit: z
          .number()
          .int()
          .positive()
          .max(50)
          .optional()
          .describe(
            "Maximum number of search results to return (default: 10, max: 50)",
          ),
      },
      annotations: readOnlyAnnotations,
    },
    wrapToolHandler(TOOL_SEARCH_PAGES, async ({ query, limit }) => {
      try {
        const result = await wikiJsApi.searchPages(query, limit);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result.results, null, 2) },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Error in search_pages: ${String(error)}. Try a different search query or use list_pages to browse.`,
            },
          ],
        };
      }
    }),
  );

  return mcpServer;
}
