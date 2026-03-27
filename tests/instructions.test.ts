import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFile } from "node:fs/promises";

// Mock node:fs/promises before importing the module under test
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

// Import after mock is set up
import {
  loadInstructions,
  DEFAULT_INSTRUCTIONS,
} from "../src/instructions.js";

describe("loadInstructions", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(readFile).mockReset();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it("returns DEFAULT_INSTRUCTIONS when no path is provided", async () => {
    const result = await loadInstructions();
    expect(result).toBe(DEFAULT_INSTRUCTIONS);
    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it("returns DEFAULT_INSTRUCTIONS when path is undefined", async () => {
    const result = await loadInstructions(undefined);
    expect(result).toBe(DEFAULT_INSTRUCTIONS);
    expect(readFile).not.toHaveBeenCalled();
  });

  it("returns file content when path is valid", async () => {
    vi.mocked(readFile).mockResolvedValue("  Custom instructions content  ");
    const result = await loadInstructions("/valid/path.txt");
    expect(result).toBe("Custom instructions content");
    expect(readFile).toHaveBeenCalledWith("/valid/path.txt", "utf-8");
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("/valid/path.txt"),
    );
  });

  it("returns DEFAULT_INSTRUCTIONS and logs warning when file not found (ENOENT)", async () => {
    const err = new Error("ENOENT: no such file or directory");
    (err as NodeJS.ErrnoException).code = "ENOENT";
    vi.mocked(readFile).mockRejectedValue(err);

    const result = await loadInstructions("/nonexistent/path.txt");
    expect(result).toBe(DEFAULT_INSTRUCTIONS);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("/nonexistent/path.txt"),
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("ENOENT"),
    );
  });

  it("returns DEFAULT_INSTRUCTIONS and logs warning when file is unreadable (EACCES)", async () => {
    const err = new Error("EACCES: permission denied");
    (err as NodeJS.ErrnoException).code = "EACCES";
    vi.mocked(readFile).mockRejectedValue(err);

    const result = await loadInstructions("/unreadable/path.txt");
    expect(result).toBe(DEFAULT_INSTRUCTIONS);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("/unreadable/path.txt"),
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("EACCES"),
    );
  });

  it("logs info message on successful file load", async () => {
    vi.mocked(readFile).mockResolvedValue("Some content");
    await loadInstructions("/some/path.txt");
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("Loaded instructions from"),
    );
  });
});

describe("DEFAULT_INSTRUCTIONS", () => {
  it("mentions all 5 required topics", () => {
    const lower = DEFAULT_INSTRUCTIONS.toLowerCase();
    expect(lower).toContain("mendix");
    expect(lower).toContain("client");
    expect(lower).toContain("ai");
    expect(lower).toContain("java");
    expect(lower).toContain("career");
  });

  it("does NOT contain specific tool names", () => {
    expect(DEFAULT_INSTRUCTIONS).not.toContain("search_pages");
    expect(DEFAULT_INSTRUCTIONS).not.toContain("get_page");
    expect(DEFAULT_INSTRUCTIONS).not.toContain("list_pages");
  });

  it("uses imperative tone with direct commands", () => {
    // Should contain action verbs / imperative constructs
    const lower = DEFAULT_INSTRUCTIONS.toLowerCase();
    expect(lower).toMatch(/search the wiki/);
  });
});
