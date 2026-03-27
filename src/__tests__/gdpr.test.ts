import { describe, it, expect } from "vitest";
import { redactContent, REDACTION_PLACEHOLDER } from "../gdpr.js";

describe("redactContent", () => {
  describe("REDACT-01: single marker pair", () => {
    it("replaces content between markers with placeholder", () => {
      const input = "Hello <!-- gdpr-start -->SECRET<!-- gdpr-end --> World";
      const result = redactContent(input, 1, "test/page");
      expect(result.content).toBe(`Hello ${REDACTION_PLACEHOLDER} World`);
      expect(result.redactionCount).toBe(1);
      expect(result.warnings).toHaveLength(0);
    });

    it("redacts multiline content between markers", () => {
      const input = `Public
<!-- gdpr-start -->
Line 1
Line 2
Line 3
<!-- gdpr-end -->
More public`;
      const result = redactContent(input, 42, "docs/contact");
      expect(result.content).toBe(`Public\n${REDACTION_PLACEHOLDER}\nMore public`);
      expect(result.redactionCount).toBe(1);
      expect(result.warnings).toHaveLength(0);
    });

    it("redacts content that is only markers", () => {
      const input = "<!-- gdpr-start -->everything is secret<!-- gdpr-end -->";
      const result = redactContent(input, 1, "test");
      expect(result.content).toBe(REDACTION_PLACEHOLDER);
      expect(result.redactionCount).toBe(1);
    });
  });

  describe("REDACT-02: multiple marker pairs", () => {
    it("independently redacts two marker pairs", () => {
      const input = "A <!-- gdpr-start -->X<!-- gdpr-end --> B <!-- gdpr-start -->Y<!-- gdpr-end --> C";
      const result = redactContent(input, 1, "test/page");
      expect(result.content).toBe(`A ${REDACTION_PLACEHOLDER} B ${REDACTION_PLACEHOLDER} C`);
      expect(result.redactionCount).toBe(2);
      expect(result.warnings).toHaveLength(0);
    });

    it("preserves public content between redacted blocks", () => {
      const input = "<!-- gdpr-start -->secret1<!-- gdpr-end --> public middle <!-- gdpr-start -->secret2<!-- gdpr-end -->";
      const result = redactContent(input, 5, "data/info");
      expect(result.content).toBe(`${REDACTION_PLACEHOLDER} public middle ${REDACTION_PLACEHOLDER}`);
      expect(result.redactionCount).toBe(2);
    });

    it("handles three separate redacted blocks", () => {
      const input = "a <!-- gdpr-start -->1<!-- gdpr-end --> b <!-- gdpr-start -->2<!-- gdpr-end --> c <!-- gdpr-start -->3<!-- gdpr-end --> d";
      const result = redactContent(input, 1, "test");
      expect(result.content).toBe(`a ${REDACTION_PLACEHOLDER} b ${REDACTION_PLACEHOLDER} c ${REDACTION_PLACEHOLDER} d`);
      expect(result.redactionCount).toBe(3);
    });
  });

  describe("REDACT-03: exact placeholder text", () => {
    it("uses the correct placeholder constant", () => {
      expect(REDACTION_PLACEHOLDER).toBe(
        "[\u{1F512} PII redacted \u2014 consult the wiki directly for contact details]"
      );
    });

    it("uses REDACTION_PLACEHOLDER constant in output", () => {
      const input = "before <!-- gdpr-start -->pii<!-- gdpr-end --> after";
      const result = redactContent(input, 1, "test");
      expect(result.content).toContain(REDACTION_PLACEHOLDER);
    });
  });

  describe("REDACT-04: unclosed start marker (fail-closed)", () => {
    it("redacts from unclosed start marker to end of content", () => {
      const input = "Public <!-- gdpr-start -->Secret to end";
      const result = redactContent(input, 10, "clients/acme");
      expect(result.content).toBe(`Public ${REDACTION_PLACEHOLDER}`);
      expect(result.redactionCount).toBe(1);
    });

    it("generates a warning for unclosed start marker", () => {
      const input = "Public <!-- gdpr-start -->Secret to end";
      const result = redactContent(input, 10, "clients/acme");
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].pageId).toBe(10);
      expect(result.warnings[0].path).toBe("clients/acme");
      expect(result.warnings[0].message).toMatch(/unclosed/i);
    });

    it("handles closed pair followed by unclosed start", () => {
      const input = "A <!-- gdpr-start -->X<!-- gdpr-end --> B <!-- gdpr-start -->rest of page";
      const result = redactContent(input, 1, "test");
      expect(result.content).toBe(`A ${REDACTION_PLACEHOLDER} B ${REDACTION_PLACEHOLDER}`);
      expect(result.redactionCount).toBe(2);
      expect(result.warnings).toHaveLength(1);
    });
  });

  describe("REDACT-05: malformed marker warnings", () => {
    it("warns on orphaned end marker without preceding start", () => {
      const input = "<!-- gdpr-end --> text after";
      const result = redactContent(input, 7, "info/page");
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].pageId).toBe(7);
      expect(result.warnings[0].path).toBe("info/page");
      expect(result.warnings[0].message).toMatch(/orphan/i);
    });

    it("does not modify content for orphaned end marker", () => {
      const input = "<!-- gdpr-end --> text after";
      const result = redactContent(input, 7, "info/page");
      expect(result.content).toBe("<!-- gdpr-end --> text after");
      expect(result.redactionCount).toBe(0);
    });

    it("warns on both unclosed start and orphaned end in same content", () => {
      const input = "<!-- gdpr-end --> middle <!-- gdpr-start -->rest";
      const result = redactContent(input, 3, "mixed");
      // The unclosed start redacts to end
      // The orphaned end at the beginning generates a warning
      expect(result.warnings.length).toBeGreaterThanOrEqual(2);
    });

    it("warning objects contain pageId and path", () => {
      const input = "<!-- gdpr-start -->no end";
      const result = redactContent(input, 99, "some/path");
      expect(result.warnings[0]).toMatchObject({
        pageId: 99,
        path: "some/path",
      });
    });
  });

  describe("REDACT-06: case and whitespace tolerance", () => {
    it("matches UPPERCASE markers", () => {
      const input = "<!-- GDPR-START -->secret<!-- GDPR-END -->";
      const result = redactContent(input, 1, "test");
      expect(result.content).toBe(REDACTION_PLACEHOLDER);
      expect(result.redactionCount).toBe(1);
    });

    it("matches no-space markers", () => {
      const input = "<!--gdpr-start-->secret<!--gdpr-end-->";
      const result = redactContent(input, 1, "test");
      expect(result.content).toBe(REDACTION_PLACEHOLDER);
      expect(result.redactionCount).toBe(1);
    });

    it("matches extra-space markers", () => {
      const input = "<!--  gdpr-start  -->secret<!--  gdpr-end  -->";
      const result = redactContent(input, 1, "test");
      expect(result.content).toBe(REDACTION_PLACEHOLDER);
      expect(result.redactionCount).toBe(1);
    });

    it("matches mixed-case markers", () => {
      const input = "<!-- Gdpr-Start -->secret<!-- Gdpr-End -->";
      const result = redactContent(input, 1, "test");
      expect(result.content).toBe(REDACTION_PLACEHOLDER);
      expect(result.redactionCount).toBe(1);
    });

    it("matches tab-separated markers", () => {
      const input = "<!--\tgdpr-start\t-->secret<!--\tgdpr-end\t-->";
      const result = redactContent(input, 1, "test");
      expect(result.content).toBe(REDACTION_PLACEHOLDER);
      expect(result.redactionCount).toBe(1);
    });
  });

  describe("edge cases", () => {
    it("returns content unchanged when no markers present", () => {
      const input = "Just regular content with no markers";
      const result = redactContent(input, 1, "test");
      expect(result.content).toBe(input);
      expect(result.redactionCount).toBe(0);
      expect(result.warnings).toHaveLength(0);
    });

    it("handles nested start markers (first-start to first-end pairing)", () => {
      const input = "A <!-- gdpr-start -->B <!-- gdpr-start -->C<!-- gdpr-end --> D";
      const result = redactContent(input, 1, "test");
      // The inner gdpr-start is just redacted content between the first start and first end
      expect(result.content).toBe(`A ${REDACTION_PLACEHOLDER} D`);
      expect(result.redactionCount).toBe(1);
    });

    it("is callable multiple times without state issues", () => {
      const input = "<!-- gdpr-start -->X<!-- gdpr-end -->";
      const r1 = redactContent(input, 1, "test");
      const r2 = redactContent(input, 2, "test2");
      expect(r1.content).toBe(REDACTION_PLACEHOLDER);
      expect(r2.content).toBe(REDACTION_PLACEHOLDER);
      expect(r1.redactionCount).toBe(1);
      expect(r2.redactionCount).toBe(1);
    });
  });

  describe("null, undefined, and empty input", () => {
    it("returns empty result for empty string", () => {
      const result = redactContent("", 1, "test");
      expect(result).toEqual({ content: "", redactionCount: 0, warnings: [] });
    });

    it("returns empty result for null", () => {
      const result = redactContent(null as any, 1, "test");
      expect(result).toEqual({ content: "", redactionCount: 0, warnings: [] });
    });

    it("returns empty result for undefined", () => {
      const result = redactContent(undefined as any, 1, "test");
      expect(result).toEqual({ content: "", redactionCount: 0, warnings: [] });
    });
  });
});
