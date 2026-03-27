import { describe, it, expect } from "vitest";
import { buildPageUrl } from "../url.js";

describe("buildPageUrl", () => {
  it("constructs URL with baseUrl/locale/path format", () => {
    const result = buildPageUrl(
      "https://wiki.example.com",
      "en",
      "Mendix/BestPractices",
    );
    expect(result).toBe("https://wiki.example.com/en/Mendix/BestPractices");
  });

  it("strips leading slash from path", () => {
    const result = buildPageUrl(
      "https://wiki.example.com",
      "en",
      "/Mendix/BestPractices",
    );
    expect(result).toBe("https://wiki.example.com/en/Mendix/BestPractices");
  });

  it("strips multiple leading slashes from path", () => {
    const result = buildPageUrl(
      "https://wiki.example.com",
      "en",
      "///path",
    );
    expect(result).not.toContain("//path");
    expect(result).toBe("https://wiki.example.com/en/path");
  });

  it("encodes special characters per segment", () => {
    const result = buildPageUrl(
      "https://wiki.example.com",
      "en",
      "Clients/A & B",
    );
    expect(result).toBe(
      "https://wiki.example.com/en/Clients/A%20%26%20B",
    );
  });

  it("encodes non-ASCII characters", () => {
    const result = buildPageUrl(
      "https://wiki.example.com",
      "en",
      "docs/\u00dcbersicht",
    );
    expect(result).toBe(
      "https://wiki.example.com/en/docs/%C3%9Cbersicht",
    );
  });

  it("filters empty path segments", () => {
    const result = buildPageUrl(
      "https://wiki.example.com",
      "en",
      "docs//page",
    );
    expect(result).toBe("https://wiki.example.com/en/docs/page");
  });

  it("handles single segment path", () => {
    const result = buildPageUrl(
      "https://wiki.example.com",
      "en",
      "home",
    );
    expect(result).toBe("https://wiki.example.com/en/home");
  });

  it("uses the provided locale in the URL", () => {
    const result = buildPageUrl(
      "https://wiki.example.com",
      "nl",
      "docs/page",
    );
    expect(result).toBe("https://wiki.example.com/nl/docs/page");
  });
});
