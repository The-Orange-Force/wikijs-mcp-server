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

  // ---------------------------------------------------------------------------
  // Page tools (10)
  // ---------------------------------------------------------------------------

  mcpServer.registerTool(
    "get_page",
    {
      description: "Get a Wiki.js page by its ID",
      inputSchema: {
        id: z.number().int().positive().describe("Page ID"),
      },
    },
    async ({ id }) => {
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
    },
  );

  mcpServer.registerTool(
    "get_page_content",
    {
      description: "Get the content of a Wiki.js page by its ID",
      inputSchema: {
        id: z.number().int().positive().describe("Page ID"),
      },
    },
    async ({ id }) => {
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
    },
  );

  mcpServer.registerTool(
    "list_pages",
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
    async ({ limit, orderBy }) => {
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
    },
  );

  mcpServer.registerTool(
    "search_pages",
    {
      description: "Search Wiki.js pages",
      inputSchema: {
        query: z.string().min(1).describe("Search query"),
        limit: z.number().int().positive().optional().describe("Max results"),
      },
    },
    async ({ query, limit }) => {
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
    },
  );

  mcpServer.registerTool(
    "create_page",
    {
      description: "Create a new Wiki.js page",
      inputSchema: {
        title: z.string().min(1).describe("Page title"),
        content: z.string().describe("Markdown content"),
        path: z.string().min(1).describe("Page path e.g. folder/page"),
        description: z.string().optional().describe("Page description"),
      },
    },
    async ({ title, content, path, description }) => {
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
    },
  );

  mcpServer.registerTool(
    "update_page",
    {
      description: "Update the content of a Wiki.js page",
      inputSchema: {
        id: z.number().int().positive().describe("Page ID"),
        content: z.string().min(1).describe("New page content"),
      },
    },
    async ({ id, content }) => {
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
    },
  );

  mcpServer.registerTool(
    "delete_page",
    {
      description: "Delete a Wiki.js page",
      inputSchema: {
        id: z.number().int().positive().describe("Page ID"),
      },
    },
    async ({ id }) => {
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
    },
  );

  mcpServer.registerTool(
    "list_all_pages",
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
    async ({ limit, orderBy, includeUnpublished }) => {
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
    },
  );

  mcpServer.registerTool(
    "search_unpublished_pages",
    {
      description: "Search unpublished Wiki.js pages",
      inputSchema: {
        query: z.string().min(1).describe("Search query"),
        limit: z.number().int().positive().optional().describe("Max results"),
      },
    },
    async ({ query, limit }) => {
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
    },
  );

  mcpServer.registerTool(
    "force_delete_page",
    {
      description: "Force delete a Wiki.js page including unpublished",
      inputSchema: {
        id: z.number().int().positive().describe("Page ID"),
      },
    },
    async ({ id }) => {
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
    },
  );

  // ---------------------------------------------------------------------------
  // Page status tools (2)
  // ---------------------------------------------------------------------------

  mcpServer.registerTool(
    "get_page_status",
    {
      description: "Get the publication status of a Wiki.js page",
      inputSchema: {
        id: z.number().int().positive().describe("Page ID"),
      },
    },
    async ({ id }) => {
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
    },
  );

  mcpServer.registerTool(
    "publish_page",
    {
      description: "Publish a Wiki.js page",
      inputSchema: {
        id: z.number().int().positive().describe("Page ID"),
      },
    },
    async ({ id }) => {
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
    },
  );

  // ---------------------------------------------------------------------------
  // User tools (3)
  // ---------------------------------------------------------------------------

  mcpServer.registerTool(
    "list_users",
    {
      description: "Get list of Wiki.js users",
      inputSchema: {},
    },
    async () => {
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
    },
  );

  mcpServer.registerTool(
    "search_users",
    {
      description: "Search Wiki.js users",
      inputSchema: {
        query: z.string().min(1).describe("Search query"),
      },
    },
    async ({ query }) => {
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
    },
  );

  mcpServer.registerTool(
    "create_user",
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
    async ({
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
    },
  );

  // ---------------------------------------------------------------------------
  // Group tools (1)
  // ---------------------------------------------------------------------------

  mcpServer.registerTool(
    "list_groups",
    {
      description: "Get list of Wiki.js groups",
      inputSchema: {},
    },
    async () => {
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
    },
  );

  // ---------------------------------------------------------------------------
  // User management (1)
  // ---------------------------------------------------------------------------

  mcpServer.registerTool(
    "update_user",
    {
      description: "Update a Wiki.js user name",
      inputSchema: {
        id: z.number().int().positive().describe("User ID"),
        name: z.string().min(1).describe("New user name"),
      },
    },
    async ({ id, name }) => {
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
    },
  );

  return mcpServer;
}
