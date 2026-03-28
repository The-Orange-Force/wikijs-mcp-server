import { GraphQLClient } from "graphql-request";
import { WikiJsPage, PageSearchResult } from "./types.js";
import { requestContext } from "./request-context.js";

/** Raw search result item from the Wiki.js pages.search GraphQL query. */
interface RawSearchResult {
  id: string;
  path: string;
  title: string;
  description: string;
  locale: string;
}

/** Item pending fallback resolution after singleByPath fails. */
interface UnresolvedItem {
  path: string;
  locale: string;
  searchId: string;
}

// Wiki.js GraphQL API client
export class WikiJsApi {
  private client: GraphQLClient;

  constructor(baseUrl: string, token: string) {
    this.client = new GraphQLClient(`${baseUrl}/graphql`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  // Verify connectivity to Wiki.js by issuing a minimal query
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
      console.error("Wiki.js connection error:", error);
      return false;
    }
  }

  // Retrieve a single page by ID (metadata + content + isPublished in one call)
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

  // List pages with optional unpublished filter
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

  // Resolve a single page by path and locale via singleByPath query
  private async resolvePageByPath(path: string, locale: string): Promise<WikiJsPage> {
    const query = `
      {
        pages {
          singleByPath (path: ${JSON.stringify(path)}, locale: ${JSON.stringify(locale)}) {
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
    return response.pages.singleByPath;
  }

  // Batch-resolve unresolved search results via a single pages.list call
  private async resolveViaPagesList(
    unresolved: UnresolvedItem[]
  ): Promise<{ resolved: WikiJsPage[]; dropped: UnresolvedItem[]; allPages: WikiJsPage[] }> {
    const query = `
      {
        pages {
          list (limit: 500, orderBy: UPDATED) {
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
    const allPages: WikiJsPage[] = response.pages.list;

    // Build lookup map keyed by path
    const pagesByPath = new Map<string, WikiJsPage>();
    for (const page of allPages) {
      pagesByPath.set(page.path, page);
    }

    const resolved: WikiJsPage[] = [];
    const dropped: UnresolvedItem[] = [];

    for (const item of unresolved) {
      const page = pagesByPath.get(item.path);
      if (page) {
        resolved.push(page);
      } else {
        dropped.push(item);
      }
    }

    return { resolved, dropped, allPages };
  }

  // Supplement search results by matching query against page titles and paths
  private async searchPagesByMetadata(
    query: string,
    limit: number,
    existingIds: Set<number>,
    allPages?: WikiJsPage[]
  ): Promise<WikiJsPage[]> {
    // Fetch pages if not provided (zero-result path)
    if (!allPages) {
      try {
        const pagesQuery = `
          {
            pages {
              list (limit: 500, orderBy: UPDATED) {
                id path title description isPublished createdAt updatedAt
              }
            }
          }
        `;
        const response: any = await this.client.request(pagesQuery);
        allPages = response.pages.list;
      } catch {
        return [];
      }
      if (!allPages) {
        return [];
      }
    }

    const lowerQuery = query.toLowerCase();
    const titleMatches: WikiJsPage[] = [];
    const pathOnlyMatches: WikiJsPage[] = [];

    for (const page of allPages) {
      // Exclude unpublished pages
      if (page.isPublished !== true) continue;
      // Deduplicate against existing results
      if (existingIds.has(page.id)) continue;

      const lowerTitle = page.title.toLowerCase();
      const lowerPath = page.path.toLowerCase();

      if (lowerTitle.includes(lowerQuery)) {
        titleMatches.push(page);
      } else if (lowerPath.includes(lowerQuery)) {
        pathOnlyMatches.push(page);
      }
    }

    // Title matches first, then path-only matches
    // Within each tier, UPDATED order preserved from pages.list
    return [...titleMatches, ...pathOnlyMatches];
  }

  // Search pages by keyword query, resolving search index IDs to real database page IDs
  async searchPages(query: string, limit: number = 10): Promise<PageSearchResult> {
    // Step 1: Execute the search query
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
    const rawResults: RawSearchResult[] = (response.pages.search.results ?? []).slice(0, limit);
    let totalHits: number = response.pages.search.totalHits ?? 0;

    if (rawResults.length === 0) {
      const existingIds = new Set<number>();
      const metadataResults = await this.searchPagesByMetadata(query, limit, existingIds);
      const finalResults = metadataResults.slice(0, limit);
      if (finalResults.length > 0) {
        const ctx = requestContext.getStore();
        ctx?.log.info(
          { query, metadataHits: finalResults.length, totalResolved: finalResults.length },
          "Metadata fallback supplemented search results"
        );
      }
      return {
        results: finalResults,
        totalHits: Math.max(totalHits, finalResults.length),
      };
    }

    // Step 2: Resolve each result via singleByPath in parallel
    const settlements = await Promise.allSettled(
      rawResults.map((item) => this.resolvePageByPath(item.path, item.locale))
    );

    const resolved: WikiJsPage[] = [];
    const unresolved: UnresolvedItem[] = [];

    for (let i = 0; i < settlements.length; i++) {
      const settlement = settlements[i];
      if (settlement.status === "fulfilled") {
        resolved.push(settlement.value);
      } else {
        unresolved.push({
          path: rawResults[i].path,
          locale: rawResults[i].locale,
          searchId: rawResults[i].id,
        });
      }
    }

    // Step 3: Fallback to pages.list for unresolved results
    let allPages: WikiJsPage[] | undefined;
    if (unresolved.length > 0) {
      const fallback = await this.resolveViaPagesList(unresolved);
      resolved.push(...fallback.resolved);
      allPages = fallback.allPages;

      // Log warnings for still-dropped results
      const ctx = requestContext.getStore();
      for (const dropped of fallback.dropped) {
        ctx?.log.warn(
          { path: dropped.path, searchId: dropped.searchId },
          "Search result could not be resolved to a database page; dropping from results"
        );
      }

      // Log consolidated permission warning if all singleByPath calls failed
      if (unresolved.length === rawResults.length) {
        ctx?.log.warn(
          { unresolvedCount: unresolved.length },
          "All singleByPath calls failed; check API token has manage:pages + delete:pages permissions"
        );
      }
    }

    // Step 4: Metadata fallback if still under limit
    if (resolved.length < limit) {
      const existingIds = new Set(resolved.map(r => r.id));
      const metadataResults = await this.searchPagesByMetadata(query, limit, existingIds, allPages);
      const remainingSlots = limit - resolved.length;
      resolved.push(...metadataResults.slice(0, remainingSlots));
      const metadataHits = Math.min(metadataResults.length, remainingSlots);
      if (metadataHits > 0) {
        const ctx = requestContext.getStore();
        ctx?.log.info(
          { query, metadataHits, totalResolved: resolved.length },
          "Metadata fallback supplemented search results"
        );
      }
      totalHits = Math.max(totalHits, resolved.length);
    }

    return { results: resolved, totalHits };
  }
}
