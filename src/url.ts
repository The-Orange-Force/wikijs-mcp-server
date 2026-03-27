/**
 * Constructs a direct URL to a Wiki.js page.
 *
 * @param baseUrl - Wiki.js base URL (trailing slashes already stripped by config)
 * @param locale - Wiki.js locale code (e.g., "en")
 * @param path - Page path from Wiki.js API (e.g., "Mendix/BestPractices")
 * @returns Full page URL, e.g., "https://wiki.company.com/en/Mendix/BestPractices"
 */
export function buildPageUrl(
  baseUrl: string,
  locale: string,
  path: string,
): string {
  // Strip leading slashes from path to avoid double slashes
  const normalizedPath = path.replace(/^\/+/, "");

  // Encode each path segment individually (preserves / separators)
  const encodedPath = normalizedPath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${baseUrl}/${locale}/${encodedPath}`;
}
