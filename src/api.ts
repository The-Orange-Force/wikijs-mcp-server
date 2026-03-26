import { GraphQLClient } from "graphql-request";
import {
  WikiJsPage,
  WikiJsUser,
  WikiJsGroup,
  ResponseResult,
} from "./types.js";

// Класс для взаимодействия с Wiki.js GraphQL API
export class WikiJsApi {
  private client: GraphQLClient;

  constructor(baseUrl: string, token: string) {
    // GraphQL эндпоинт Wiki.js
    this.client = new GraphQLClient(`${baseUrl}/graphql`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  // Проверка соединения с Wiki.js
  async checkConnection(): Promise<boolean> {
    try {
      const query = `
        {
          pages {
            list (limit: 1) {
              title
            }
          }
        }
      `;
      const response = await this.client.request(query);
      return !!response;
    } catch (error) {
      console.error("Ошибка соединения с Wiki.js:", error);
      return false;
    }
  }

  // Получение страницы по ID (consolidated: metadata + content + isPublished in one call)
  async getPageById(id: number): Promise<WikiJsPage> {
    const query = `
      {
        pages {
          single (id: ${id}) {
            id
            path
            title
            description
            content
            isPublished
            createdAt
            updatedAt
          }
        }
      }
    `;
    const response: any = await this.client.request(query);
    return response.pages.single;
  }

  // List pages with optional unpublished filter (replaces getPagesList + getAllPagesList)
  async listPages(
    limit: number = 50,
    orderBy: string = "TITLE",
    includeUnpublished: boolean = false
  ): Promise<WikiJsPage[]> {
    const query = `
      {
        pages {
          list (limit: ${limit}, orderBy: ${orderBy}) {
            id
            path
            title
            description
            isPublished
            createdAt
            updatedAt
          }
        }
      }
    `;
    const response: any = await this.client.request(query);
    let pages: WikiJsPage[] = response.pages.list;

    if (!includeUnpublished) {
      pages = pages.filter((page) => page.isPublished === true);
    }

    return pages;
  }

  // Поиск страниц
  async searchPages(query: string, limit: number = 10): Promise<WikiJsPage[]> {
    const gqlQuery = `
      {
        pages {
          search (query: ${JSON.stringify(query)}) {
            results {
              id
              path
              title
              description
              locale
            }
            suggestions
            totalHits
          }
        }
      }
    `;
    const response: any = await this.client.request(gqlQuery);
    const results = response.pages.search.results ?? [];
    return results.slice(0, limit);
  }

  // Создание новой страницы
  async createPage(
    title: string,
    content: string,
    path: string,
    description: string = ""
  ): Promise<ResponseResult> {
    const mutation = `
      mutation {
        pages {
          create (
            content: ${JSON.stringify(content)}
            description: ${JSON.stringify(description)}
            editor: "markdown"
            isPublished: true
            isPrivate: false
            locale: "en"
            path: ${JSON.stringify(path)}
            tags: []
            title: ${JSON.stringify(title)}
          ) {
            responseResult {
              succeeded
              errorCode
              slug
              message
            }
            page {
              id
              path
              title
            }
          }
        }
      }
    `;
    const response: any = await this.client.request(mutation);
    return response.pages.create.responseResult;
  }

  // Обновление страницы
  async updatePage(id: number, content: string): Promise<ResponseResult> {
    const mutation = `
      mutation {
        pages {
          update (
            id: ${id}
            content: ${JSON.stringify(content)}
          ) {
            responseResult {
              succeeded
              errorCode
              slug
              message
            }
          }
        }
      }
    `;
    const response: any = await this.client.request(mutation);
    return response.pages.update.responseResult;
  }

  // Удаление страницы
  async deletePage(id: number): Promise<ResponseResult> {
    const mutation = `
      mutation {
        pages {
          delete (
            id: ${id}
          ) {
            responseResult {
              succeeded
              errorCode
              slug
              message
            }
          }
        }
      }
    `;
    const response: any = await this.client.request(mutation);
    return response.pages.delete.responseResult;
  }

  // Получение списка пользователей
  async getUsersList(): Promise<WikiJsUser[]> {
    const query = `
      {
        users {
          list {
            id
            name
            email
            providerKey
            isSystem
            isActive
            createdAt
            lastLoginAt
          }
        }
      }
    `;
    const response: any = await this.client.request(query);
    return response.users.list;
  }

  // Поиск пользователей
  async searchUsers(query: string): Promise<WikiJsUser[]> {
    const gqlQuery = `
      {
        users {
          search (query: ${JSON.stringify(query)}) {
            id
            name
            email
            providerKey
            isSystem
            isActive
            createdAt
            lastLoginAt
          }
        }
      }
    `;
    const response: any = await this.client.request(gqlQuery);
    return response.users.search;
  }

  // Получение списка групп
  async getGroupsList(): Promise<WikiJsGroup[]> {
    const query = `
      {
        groups {
          list {
            id
            name
            isSystem
          }
        }
      }
    `;
    const response: any = await this.client.request(query);
    return response.groups.list;
  }

  // Создание пользователя
  async createUser(
    email: string,
    name: string,
    passwordRaw: string,
    providerKey: string = "local",
    groups: number[] = [2],
    mustChangePassword: boolean = false,
    sendWelcomeEmail: boolean = false
  ): Promise<ResponseResult> {
    const mutation = `
      mutation {
        users {
          create (
            email: ${JSON.stringify(email)}
            name: ${JSON.stringify(name)}
            passwordRaw: ${JSON.stringify(passwordRaw)}
            providerKey: ${JSON.stringify(providerKey)}
            groups: [${groups.join(",")}]
            mustChangePassword: ${mustChangePassword}
            sendWelcomeEmail: ${sendWelcomeEmail}
          ) {
            responseResult {
              succeeded
              slug
              message
            }
            user {
              id
            }
          }
        }
      }
    `;
    const response: any = await this.client.request(mutation);
    return response.users.create.responseResult;
  }

  // Обновление пользователя
  async updateUser(id: number, name: string): Promise<ResponseResult> {
    const mutation = `
      mutation {
        users {
          update (
            id: ${id}
            name: ${JSON.stringify(name)}
          ) {
            responseResult {
              succeeded
              errorCode
              slug
              message
            }
          }
        }
      }
    `;
    const response: any = await this.client.request(mutation);
    return response.users.update.responseResult;
  }

  // Search unpublished pages (delegates to listPages with includeUnpublished)
  async searchUnpublishedPages(
    query: string,
    limit: number = 10
  ): Promise<WikiJsPage[]> {
    const allPages = await this.listPages(200, "UPDATED", true);

    // Filter to unpublished pages only
    const unpublishedPages = allPages.filter((page) => !page.isPublished);

    // Search by query in title, path, or description
    const queryLower = query.toLowerCase();
    const matches = unpublishedPages.filter((page) => {
      const titleMatch = page.title.toLowerCase().includes(queryLower);
      const pathMatch = page.path.toLowerCase().includes(queryLower);
      const descMatch = page.description?.toLowerCase().includes(queryLower);

      return titleMatch || pathMatch || descMatch;
    });

    return matches.slice(0, limit);
  }

  // Force delete a page (delegates to deletePage -- Wiki.js has no special flag)
  async forceDeletePage(id: number): Promise<ResponseResult> {
    return this.deletePage(id);
  }

  // Get page publication status (delegates to getPageById which now includes isPublished)
  async getPageStatus(id: number): Promise<WikiJsPage> {
    return this.getPageById(id);
  }

  // Публикация страницы
  async publishPage(id: number): Promise<ResponseResult> {
    const mutation = `
      mutation {
        pages {
          render (id: ${id}) {
            responseResult {
              succeeded
              errorCode
              slug
              message
            }
          }
        }
      }
    `;

    try {
      const response: any = await this.client.request(mutation);
      return response.pages.render.responseResult;
    } catch (error) {
      return {
        succeeded: false,
        errorCode: 500,
        message: `Ошибка при публикации страницы: ${error}`,
      };
    }
  }
}
