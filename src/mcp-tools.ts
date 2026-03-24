/**
 * MCP SDK tool registration module.
 *
 * Exports a factory function that creates a configured McpServer with all 17
 * WikiJS tools registered via the SDK's registerTool() API. Tool handlers
 * delegate to the WikiJsApi class from src/api.ts.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { WikiJsApi } from "./api.js";
import { wrapToolHandler } from "./tool-wrapper.js";

/**
 * Creates and returns a fully configured McpServer instance with all 17
 * WikiJS tools registered.
 *
 * @param wikiJsApi - WikiJsApi instance used by tool handlers
 * @returns Configured McpServer ready for transport connection
 */
export function createMcpServer(wikiJsApi: WikiJsApi): McpServer {
  const mcpServer = new McpServer({
    name: "wikijs-mcp",
    version: "1.3.0",
  });

  // Tool name constants (used in both registerTool and wrapToolHandler)
  const TOOL_GET_PAGE = "get_page";
  const TOOL_GET_PAGE_CONTENT = "get_page_content";
  const TOOL_LIST_PAGES = "list_pages";
  const TOOL_SEARCH_PAGES = "search_pages";
  const TOOL_CREATE_PAGE = "create_page";
  const TOOL_UPDATE_PAGE = "update_page";
  const TOOL_DELETE_PAGE = "delete_page";
  const TOOL_LIST_ALL_PAGES = "list_all_pages";
  const TOOL_SEARCH_UNPUBLISHED_PAGES = "search_unpublished_pages";
  const TOOL_FORCE_DELETE_PAGE = "force_delete_page";
  const TOOL_GET_PAGE_STATUS = "get_page_status";
  const TOOL_PUBLISH_PAGE = "publish_page";
  const TOOL_LIST_USERS = "list_users";
  const TOOL_SEARCH_USERS = "search_users";
  const TOOL_CREATE_USER = "create_user";
  const TOOL_LIST_GROUPS = "list_groups";
  const TOOL_UPDATE_USER = "update_user";

  // ---------------------------------------------------------------------------
  // Page tools (10)
  // ---------------------------------------------------------------------------

  mcpServer.registerTool(
    TOOL_GET_PAGE,
    {
      description: "Get a Wiki.js page by its ID",
      inputSchema: {
        id: z.number().int().positive().describe("Page ID"),
      },
    },
    wrapToolHandler(TOOL_GET_PAGE, async ({ id }) => {
      try {
        const page = await wikiJsApi.getPageById(id);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(page, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
          isError: true,
        };
      }
    }),
  );

  mcpServer.registerTool(
    TOOL_GET_PAGE_CONTENT,
    {
      description: "Get the content of a Wiki.js page by its ID",
      inputSchema: {
        id: z.number().int().positive().describe("Page ID"),
      },
    },
    wrapToolHandler(TOOL_GET_PAGE_CONTENT, async ({ id }) => {
      try {
        const content = await wikiJsApi.getPageContent(id);
        return {
          content: [{ type: "text" as const, text: content }],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
          isError: true,
        };
      }
    }),
  );

  mcpServer.registerTool(
    TOOL_LIST_PAGES,
    {
      description: "List Wiki.js pages",
      inputSchema: {
        limit: z.number().int().positive().optional().describe("Max results"),
        orderBy: z
          .enum(["TITLE", "CREATED", "UPDATED"])
          .optional()
          .describe("Sort order"),
      },
    },
    wrapToolHandler(TOOL_LIST_PAGES, async ({ limit, orderBy }) => {
      try {
        const pages = await wikiJsApi.getPagesList(limit, orderBy);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(pages, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
          isError: true,
        };
      }
    }),
  );

  mcpServer.registerTool(
    TOOL_SEARCH_PAGES,
    {
      description: "Search Wiki.js pages",
      inputSchema: {
        query: z.string().min(1).describe("Search query"),
        limit: z.number().int().positive().optional().describe("Max results"),
      },
    },
    wrapToolHandler(TOOL_SEARCH_PAGES, async ({ query, limit }) => {
      try {
        const pages = await wikiJsApi.searchPages(query, limit);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(pages, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
          isError: true,
        };
      }
    }),
  );

  mcpServer.registerTool(
    TOOL_CREATE_PAGE,
    {
      description: "Create a new Wiki.js page",
      inputSchema: {
        title: z.string().min(1).describe("Page title"),
        content: z.string().describe("Markdown content"),
        path: z.string().min(1).describe("Page path e.g. folder/page"),
        description: z.string().optional().describe("Page description"),
      },
    },
    wrapToolHandler(TOOL_CREATE_PAGE, async ({ title, content, path, description }) => {
      try {
        const result = await wikiJsApi.createPage(title, content, path, description);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
          isError: true,
        };
      }
    }),
  );

  mcpServer.registerTool(
    TOOL_UPDATE_PAGE,
    {
      description: "Update the content of a Wiki.js page",
      inputSchema: {
        id: z.number().int().positive().describe("Page ID"),
        content: z.string().min(1).describe("New page content"),
      },
    },
    wrapToolHandler(TOOL_UPDATE_PAGE, async ({ id, content }) => {
      try {
        const result = await wikiJsApi.updatePage(id, content);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
          isError: true,
        };
      }
    }),
  );

  mcpServer.registerTool(
    TOOL_DELETE_PAGE,
    {
      description: "Delete a Wiki.js page",
      inputSchema: {
        id: z.number().int().positive().describe("Page ID"),
      },
    },
    wrapToolHandler(TOOL_DELETE_PAGE, async ({ id }) => {
      try {
        const result = await wikiJsApi.deletePage(id);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
          isError: true,
        };
      }
    }),
  );

  mcpServer.registerTool(
    TOOL_LIST_ALL_PAGES,
    {
      description: "List all Wiki.js pages including unpublished",
      inputSchema: {
        limit: z.number().int().positive().optional().describe("Max results"),
        orderBy: z
          .enum(["TITLE", "CREATED", "UPDATED"])
          .optional()
          .describe("Sort order"),
        includeUnpublished: z
          .boolean()
          .optional()
          .describe("Include unpublished pages"),
      },
    },
    wrapToolHandler(TOOL_LIST_ALL_PAGES, async ({ limit, orderBy, includeUnpublished }) => {
      try {
        const pages = await wikiJsApi.getAllPagesList(
          limit,
          orderBy,
          includeUnpublished,
        );
        return {
          content: [{ type: "text" as const, text: JSON.stringify(pages, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
          isError: true,
        };
      }
    }),
  );

  mcpServer.registerTool(
    TOOL_SEARCH_UNPUBLISHED_PAGES,
    {
      description: "Search unpublished Wiki.js pages",
      inputSchema: {
        query: z.string().min(1).describe("Search query"),
        limit: z.number().int().positive().optional().describe("Max results"),
      },
    },
    wrapToolHandler(TOOL_SEARCH_UNPUBLISHED_PAGES, async ({ query, limit }) => {
      try {
        const pages = await wikiJsApi.searchUnpublishedPages(query, limit);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(pages, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
          isError: true,
        };
      }
    }),
  );

  mcpServer.registerTool(
    TOOL_FORCE_DELETE_PAGE,
    {
      description: "Force delete a Wiki.js page including unpublished",
      inputSchema: {
        id: z.number().int().positive().describe("Page ID"),
      },
    },
    wrapToolHandler(TOOL_FORCE_DELETE_PAGE, async ({ id }) => {
      try {
        const result = await wikiJsApi.forceDeletePage(id);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
          isError: true,
        };
      }
    }),
  );

  // ---------------------------------------------------------------------------
  // Page status tools (2)
  // ---------------------------------------------------------------------------

  mcpServer.registerTool(
    TOOL_GET_PAGE_STATUS,
    {
      description: "Get the publication status of a Wiki.js page",
      inputSchema: {
        id: z.number().int().positive().describe("Page ID"),
      },
    },
    wrapToolHandler(TOOL_GET_PAGE_STATUS, async ({ id }) => {
      try {
        const status = await wikiJsApi.getPageStatus(id);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(status, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
          isError: true,
        };
      }
    }),
  );

  mcpServer.registerTool(
    TOOL_PUBLISH_PAGE,
    {
      description: "Publish a Wiki.js page",
      inputSchema: {
        id: z.number().int().positive().describe("Page ID"),
      },
    },
    wrapToolHandler(TOOL_PUBLISH_PAGE, async ({ id }) => {
      try {
        const result = await wikiJsApi.publishPage(id);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
          isError: true,
        };
      }
    }),
  );

  // ---------------------------------------------------------------------------
  // User tools (3)
  // ---------------------------------------------------------------------------

  mcpServer.registerTool(
    TOOL_LIST_USERS,
    {
      description: "Get list of Wiki.js users",
      inputSchema: {},
    },
    wrapToolHandler(TOOL_LIST_USERS, async () => {
      try {
        const users = await wikiJsApi.getUsersList();
        return {
          content: [{ type: "text" as const, text: JSON.stringify(users, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
          isError: true,
        };
      }
    }),
  );

  mcpServer.registerTool(
    TOOL_SEARCH_USERS,
    {
      description: "Search Wiki.js users",
      inputSchema: {
        query: z.string().min(1).describe("Search query"),
      },
    },
    wrapToolHandler(TOOL_SEARCH_USERS, async ({ query }) => {
      try {
        const users = await wikiJsApi.searchUsers(query);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(users, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
          isError: true,
        };
      }
    }),
  );

  mcpServer.registerTool(
    TOOL_CREATE_USER,
    {
      description: "Create a new Wiki.js user",
      inputSchema: {
        email: z.string().email().describe("User email"),
        name: z.string().min(1).describe("User name"),
        passwordRaw: z.string().min(8).describe("Password"),
        providerKey: z.string().optional().describe("Auth provider key"),
        groups: z
          .array(z.number().int().positive())
          .optional()
          .describe("Group IDs"),
        mustChangePassword: z
          .boolean()
          .optional()
          .describe("Require password change"),
        sendWelcomeEmail: z
          .boolean()
          .optional()
          .describe("Send welcome email"),
      },
    },
    wrapToolHandler(TOOL_CREATE_USER, async ({
      email,
      name,
      passwordRaw,
      providerKey,
      groups,
      mustChangePassword,
      sendWelcomeEmail,
    }) => {
      try {
        const result = await wikiJsApi.createUser(
          email,
          name,
          passwordRaw,
          providerKey,
          groups,
          mustChangePassword,
          sendWelcomeEmail,
        );
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
          isError: true,
        };
      }
    }),
  );

  // ---------------------------------------------------------------------------
  // Group tools (1)
  // ---------------------------------------------------------------------------

  mcpServer.registerTool(
    TOOL_LIST_GROUPS,
    {
      description: "Get list of Wiki.js groups",
      inputSchema: {},
    },
    wrapToolHandler(TOOL_LIST_GROUPS, async () => {
      try {
        const groups = await wikiJsApi.getGroupsList();
        return {
          content: [{ type: "text" as const, text: JSON.stringify(groups, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
          isError: true,
        };
      }
    }),
  );

  // ---------------------------------------------------------------------------
  // User management (1)
  // ---------------------------------------------------------------------------

  mcpServer.registerTool(
    TOOL_UPDATE_USER,
    {
      description: "Update a Wiki.js user name",
      inputSchema: {
        id: z.number().int().positive().describe("User ID"),
        name: z.string().min(1).describe("New user name"),
      },
    },
    wrapToolHandler(TOOL_UPDATE_USER, async ({ id, name }) => {
      try {
        const result = await wikiJsApi.updateUser(id, name);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
          isError: true,
        };
      }
    }),
  );

  return mcpServer;
}
