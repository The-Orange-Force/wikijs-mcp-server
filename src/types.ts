// Типы для Wiki.js GraphQL API

// Типы инструментов, которые будет предоставлять MCP
export interface WikiJsToolDefinition {
  type: string;
  function: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, any>;
      required: string[];
    };
  };
}

// Типы для страниц Wiki.js
export interface WikiJsPage {
  id: number;
  path: string;
  title: string;
  description: string;
  content?: string;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

// Search result wrapper for paginated search responses (used by Plan 02)
export interface PageSearchResult {
  results: WikiJsPage[];
  totalHits: number;
}

// Тип для пользователей Wiki.js
export interface WikiJsUser {
  id: number;
  name: string;
  email: string;
  providerKey: string;
  isSystem?: boolean;
  isActive?: boolean;
  createdAt?: string;
  lastLoginAt?: string;
}

// Тип для групп Wiki.js
export interface WikiJsGroup {
  id: number;
  name: string;
  isSystem?: boolean;
}

// Тип ответа для мутаций
export interface ResponseResult {
  succeeded: boolean;
  errorCode?: number;
  slug?: string;
  message?: string;
}
