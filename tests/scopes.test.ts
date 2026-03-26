import { describe, it, expect } from "vitest";
import {
  SCOPES,
  SCOPE_TOOL_MAP,
  TOOL_SCOPE_MAP,
  SUPPORTED_SCOPES,
  type Scope,
} from "../src/scopes.js";

describe("Scope-to-tool mapping (single-scope model)", () => {
  it("SUPPORTED_SCOPES contains exactly one scope: wikijs:read", () => {
    expect(SUPPORTED_SCOPES).toEqual(["wikijs:read"]);
    expect(SUPPORTED_SCOPES).toHaveLength(1);
  });

  it("SCOPES object has only the READ key", () => {
    expect(SCOPES).toEqual({ READ: "wikijs:read" });
    expect(Object.keys(SCOPES)).toHaveLength(1);
  });

  it("SCOPE_TOOL_MAP[wikijs:read] has exactly 3 tools: get_page, list_pages, search_pages", () => {
    const readTools = SCOPE_TOOL_MAP[SCOPES.READ];
    expect(readTools).toEqual(["get_page", "list_pages", "search_pages"]);
    expect(readTools).toHaveLength(3);
  });

  it("every scope has at least one tool", () => {
    for (const scope of SUPPORTED_SCOPES) {
      const tools = SCOPE_TOOL_MAP[scope as Scope];
      expect(tools.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("maps exactly 3 tools total across all scopes", () => {
    const allTools = Object.values(SCOPE_TOOL_MAP).flat();
    expect(allTools).toHaveLength(3);
  });

  it("has no duplicate tool names across scopes", () => {
    const allTools = Object.values(SCOPE_TOOL_MAP).flat();
    const unique = new Set(allTools);
    expect(unique.size).toBe(allTools.length);
  });

  it("TOOL_SCOPE_MAP reverse lookup covers every tool and all map to wikijs:read", () => {
    const allTools = Object.values(SCOPE_TOOL_MAP).flat();
    for (const tool of allTools) {
      expect(TOOL_SCOPE_MAP[tool]).toBe("wikijs:read");
    }
    expect(Object.keys(TOOL_SCOPE_MAP)).toHaveLength(allTools.length);
  });
});
