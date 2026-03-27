import { readFile } from "node:fs/promises";

// ---------------------------------------------------------------------------
// Default instructions -- hardcoded fallback when no file is configured
// ---------------------------------------------------------------------------

export const DEFAULT_INSTRUCTIONS = `You are a wiki-connected assistant with access to the company knowledge base. \
Use the wiki proactively to provide accurate, up-to-date answers.

When Mendix is mentioned, search the wiki for Mendix projects, best practices, \
deployment guides, and platform-specific documentation. Surface relevant findings immediately.

When client names or project names come up, search the wiki for related project pages, \
client-specific documentation, contracts, and engagement history.

When AI or machine learning topics arise, search the wiki for internal AI guidelines, \
approved tools, usage policies, and any proof-of-concept documentation.

When Java is mentioned, search the wiki for Java coding standards, framework documentation, \
microservice patterns, and deployment procedures used by the team.

When career development, onboarding, or HR topics come up, search the wiki for career paths, \
review processes, training resources, and organizational policies.

Always check the wiki proactively when answering questions. Do not wait to be asked -- \
if the topic might have relevant wiki content, look it up first and incorporate what you find.`;

// ---------------------------------------------------------------------------
// Loader -- reads instructions from disk or returns default
// ---------------------------------------------------------------------------

/**
 * Load MCP server instructions from a file path.
 *
 * - If no path is provided, returns DEFAULT_INSTRUCTIONS immediately.
 * - If the file exists and is readable, returns its trimmed content.
 * - If the file cannot be read (missing, permissions, etc.), logs a warning
 *   and falls back to DEFAULT_INSTRUCTIONS.
 */
export async function loadInstructions(path?: string): Promise<string> {
  if (!path) {
    return DEFAULT_INSTRUCTIONS;
  }

  try {
    const content = await readFile(path, "utf-8");
    console.log(`Loaded instructions from ${path}`);
    return content.trim();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `Could not load instructions from ${path}: ${message}. Using default instructions.`,
    );
    return DEFAULT_INSTRUCTIONS;
  }
}
