/**
 * GDPR path-blocking predicate.
 *
 * Determines whether a Wiki.js page path identifies a protected client page.
 * A path is blocked when it has exactly two segments and the first segment
 * is "clients" (case-insensitive).
 *
 * @example
 * isBlocked("Clients/AcmeCorp")       // true  -- direct client page
 * isBlocked("clients/acme")           // true  -- case-insensitive
 * isBlocked("Clients")                // false -- listing page (1 segment)
 * isBlocked("Clients/Acme/SubPage")   // false -- subpage (3 segments)
 * isBlocked("Projects/AcmeCorp")      // false -- wrong first segment
 */
export function isBlocked(path: string): boolean {
  if (!path) return false;

  const segments = path.toLowerCase().split("/").filter(Boolean);
  return segments.length === 2 && segments[0] === "clients";
}
