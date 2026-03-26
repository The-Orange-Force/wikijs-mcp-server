// Wiki.js GraphQL API type definitions

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

export interface PageSearchResult {
  results: WikiJsPage[];
  totalHits: number;
}
