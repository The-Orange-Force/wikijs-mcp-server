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
      expect.arrayContaining(["wikijs.read", "wikijs.write", "wikijs.admin"]),
    );
    expect(SUPPORTED_SCOPES).toHaveLength(3);
  });

  it("every scope has at least one tool", () => {
    for (const scope of SUPPORTED_SCOPES) {
      expect(SCOPE_TOOL_MAP[scope as Scope].length).toBeGreaterThanOrEqual(1);
    }
  });

  it("maps exactly 17 tools total", () => {
    const allTools = Object.values(SCOPE_TOOL_MAP).flat();
    expect(allTools).toHaveLength(17);
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

  it("assigns read tools to wikijs.read", () => {
    const readTools = SCOPE_TOOL_MAP[SCOPES.READ];
    expect(readTools).toContain("get_page");
    expect(readTools).toContain("get_page_content");
    expect(readTools).toContain("list_pages");
    expect(readTools).toContain("list_all_pages");
    expect(readTools).toContain("search_pages");
    expect(readTools).toContain("search_unpublished_pages");
    expect(readTools).toContain("get_page_status");
    expect(readTools).toHaveLength(7);
  });

  it("assigns write tools to wikijs.write", () => {
    const writeTools = SCOPE_TOOL_MAP[SCOPES.WRITE];
    expect(writeTools).toContain("create_page");
    expect(writeTools).toContain("update_page");
    expect(writeTools).toContain("publish_page");
    expect(writeTools).toHaveLength(3);
  });

  it("assigns admin tools to wikijs.admin", () => {
    const adminTools = SCOPE_TOOL_MAP[SCOPES.ADMIN];
    expect(adminTools).toContain("delete_page");
    expect(adminTools).toContain("force_delete_page");
    expect(adminTools).toContain("list_users");
    expect(adminTools).toContain("search_users");
    expect(adminTools).toContain("list_groups");
    expect(adminTools).toContain("create_user");
    expect(adminTools).toContain("update_user");
    expect(adminTools).toHaveLength(7);
  });

  it("TOOL_SCOPE_MAP returns correct scope for specific tools", () => {
    expect(TOOL_SCOPE_MAP["get_page"]).toBe("wikijs.read");
    expect(TOOL_SCOPE_MAP["create_page"]).toBe("wikijs.write");
    expect(TOOL_SCOPE_MAP["delete_page"]).toBe("wikijs.admin");
  });

  it("SCOPES object has correct constant values", () => {
    expect(SCOPES.READ).toBe("wikijs.read");
    expect(SCOPES.WRITE).toBe("wikijs.write");
    expect(SCOPES.ADMIN).toBe("wikijs.admin");
  });
});
