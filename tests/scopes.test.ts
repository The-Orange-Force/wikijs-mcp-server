import { describe, it, expect } from "vitest";
import {
  SCOPES,
  SCOPE_TOOL_MAP,
  TOOL_SCOPE_MAP,
  SUPPORTED_SCOPES,
  type Scope,
} from "../src/scopes.js";

describe("Scope-to-tool mapping", () => {
  it("SUPPORTED_SCOPES contains exactly the three expected scopes", () => {
    expect(SUPPORTED_SCOPES).toEqual(
      expect.arrayContaining(["wikijs:read", "wikijs:write", "wikijs:admin"]),
    );
    expect(SUPPORTED_SCOPES).toHaveLength(3);
  });

  it("read scope has tools mapped", () => {
    expect(SCOPE_TOOL_MAP[SCOPES.READ].length).toBeGreaterThanOrEqual(1);
  });

  it("maps exactly 3 tools total (consolidated read-only tools)", () => {
    const allTools = Object.values(SCOPE_TOOL_MAP).flat();
    expect(allTools).toHaveLength(3);
  });

  it("has no duplicate tool names across scopes", () => {
    const allTools = Object.values(SCOPE_TOOL_MAP).flat();
    const unique = new Set(allTools);
    expect(unique.size).toBe(allTools.length);
  });

  it("TOOL_SCOPE_MAP reverse lookup covers every tool in SCOPE_TOOL_MAP", () => {
    const allTools = Object.values(SCOPE_TOOL_MAP).flat();
    for (const tool of allTools) {
      expect(TOOL_SCOPE_MAP[tool]).toBeDefined();
    }
    expect(Object.keys(TOOL_SCOPE_MAP)).toHaveLength(allTools.length);
  });

  it("assigns read tools to wikijs:read", () => {
    const readTools = SCOPE_TOOL_MAP[SCOPES.READ];
    expect(readTools).toContain("get_page");
    expect(readTools).toContain("list_pages");
    expect(readTools).toContain("search_pages");
    expect(readTools).toHaveLength(3);
  });

  it("write and admin scopes are empty (write/admin tools removed in consolidation)", () => {
    expect(SCOPE_TOOL_MAP[SCOPES.WRITE]).toHaveLength(0);
    expect(SCOPE_TOOL_MAP[SCOPES.ADMIN]).toHaveLength(0);
  });

  it("TOOL_SCOPE_MAP returns correct scope for read tools", () => {
    expect(TOOL_SCOPE_MAP["get_page"]).toBe("wikijs:read");
    expect(TOOL_SCOPE_MAP["list_pages"]).toBe("wikijs:read");
    expect(TOOL_SCOPE_MAP["search_pages"]).toBe("wikijs:read");
  });

  it("SCOPES object has correct constant values", () => {
    expect(SCOPES.READ).toBe("wikijs:read");
    expect(SCOPES.WRITE).toBe("wikijs:write");
    expect(SCOPES.ADMIN).toBe("wikijs:admin");
  });
});
