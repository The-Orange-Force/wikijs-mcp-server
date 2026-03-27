/**
 * Fixed placeholder that replaces each redacted content block.
 */
export const REDACTION_PLACEHOLDER =
  "[\u{1F512} PII redacted \u2014 consult the wiki directly for contact details]";

/**
 * Warning produced when GDPR markers are malformed.
 */
export interface RedactionWarning {
  message: string;
  pageId: number;
  path: string;
}

/**
 * Result of redacting GDPR-marked content from a page.
 */
export interface RedactionResult {
  content: string;
  redactionCount: number;
  warnings: RedactionWarning[];
}

/**
 * Replaces content between `<!-- gdpr-start -->` and `<!-- gdpr-end -->`
 * HTML comment markers with {@link REDACTION_PLACEHOLDER}.
 *
 * Uses a two-pass regex approach:
 *  1. Replace properly closed marker pairs (non-greedy).
 *  2. Replace unclosed start markers by redacting to end of content (fail-closed).
 *  3. Detect orphaned end markers and emit warnings (no content change).
 *
 * The function is pure -- it returns warnings in the result and does not log.
 *
 * @param content - Raw page content (may be null/undefined/empty).
 * @param pageId  - Wiki.js page ID (included in warnings).
 * @param path    - Wiki.js page path (included in warnings).
 */
export function redactContent(
  content: string,
  pageId: number,
  path: string,
): RedactionResult {
  if (!content) {
    return { content: "", redactionCount: 0, warnings: [] };
  }

  const warnings: RedactionWarning[] = [];
  let redactionCount = 0;

  // Pass 1: Replace properly closed marker pairs (non-greedy)
  const pairRe = /<!--\s*gdpr-start\s*-->[\s\S]*?<!--\s*gdpr-end\s*-->/gi;
  let result = content.replace(pairRe, () => {
    redactionCount++;
    return REDACTION_PLACEHOLDER;
  });

  // Pass 2: Handle unclosed start markers -- fail-closed (greedy to end)
  const unclosedRe = /<!--\s*gdpr-start\s*-->[\s\S]*/gi;
  result = result.replace(unclosedRe, () => {
    redactionCount++;
    warnings.push({
      message: "Unclosed gdpr-start marker \u2014 redacted to end of content",
      pageId,
      path,
    });
    return REDACTION_PLACEHOLDER;
  });

  // Pass 3: Detect orphaned end markers (warning only, no content change)
  const orphanEndRe = /<!--\s*gdpr-end\s*-->/gi;
  let match;
  while ((match = orphanEndRe.exec(result)) !== null) {
    warnings.push({
      message: "Orphaned gdpr-end marker without preceding gdpr-start",
      pageId,
      path,
    });
  }

  return { content: result, redactionCount, warnings };
}
