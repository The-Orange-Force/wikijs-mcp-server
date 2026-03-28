import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

describe("docker-compose.yml", () => {
  it("contains read-only volume mount for instructions.txt at /app/instructions.txt", async () => {
    const content = await readFile(join(ROOT, "docker-compose.yml"), "utf-8");
    expect(content).toContain("./instructions.txt:/app/instructions.txt:ro");
  });
});

describe("instructions.txt", () => {
  it("exists at repo root with MCP tool instructions", async () => {
    const content = await readFile(join(ROOT, "instructions.txt"), "utf-8");
    expect(content).toContain("search_pages");
  });
});

describe(".dockerignore", () => {
  it("excludes instructions.txt from the Docker build context", async () => {
    const content = await readFile(join(ROOT, ".dockerignore"), "utf-8");
    const lines = content
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"));
    expect(lines).toContain("instructions.txt");
  });
});

describe(".env.example", () => {
  it("documents MCP_INSTRUCTIONS_PATH as a reference environment variable", async () => {
    const content = await readFile(join(ROOT, ".env.example"), "utf-8");
    expect(content).toContain("MCP_INSTRUCTIONS_PATH");
  });
});
