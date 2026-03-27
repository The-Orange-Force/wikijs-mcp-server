import { describe, it, expect } from "vitest";
import { isBlocked } from "../gdpr.js";

describe("isBlocked", () => {
  describe("blocked paths (exactly 2 segments, first is 'clients')", () => {
    it("blocks 'Clients/AcmeCorp'", () => {
      expect(isBlocked("Clients/AcmeCorp")).toBe(true);
    });

    it("blocks 'clients/acme' (lowercase)", () => {
      expect(isBlocked("clients/acme")).toBe(true);
    });

    it("blocks 'CLIENTS/ACME' (uppercase)", () => {
      expect(isBlocked("CLIENTS/ACME")).toBe(true);
    });

    it("blocks 'cLiEnTs/SomeCorp' (mixed case)", () => {
      expect(isBlocked("cLiEnTs/SomeCorp")).toBe(true);
    });
  });

  describe("allowed paths (not blocked)", () => {
    it("allows 'Clients' (1 segment)", () => {
      expect(isBlocked("Clients")).toBe(false);
    });

    it("allows 'Clients/Acme/SubPage' (3 segments)", () => {
      expect(isBlocked("Clients/Acme/SubPage")).toBe(false);
    });

    it("allows 'Projects/AcmeCorp' (wrong first segment)", () => {
      expect(isBlocked("Projects/AcmeCorp")).toBe(false);
    });

    it("allows 'home' (root-level page)", () => {
      expect(isBlocked("home")).toBe(false);
    });
  });

  describe("normalization variants", () => {
    it("blocks '/Clients/AcmeCorp' (leading slash)", () => {
      expect(isBlocked("/Clients/AcmeCorp")).toBe(true);
    });

    it("blocks 'Clients/AcmeCorp/' (trailing slash)", () => {
      expect(isBlocked("Clients/AcmeCorp/")).toBe(true);
    });

    it("blocks 'Clients//AcmeCorp' (double slashes)", () => {
      expect(isBlocked("Clients//AcmeCorp")).toBe(true);
    });

    it("blocks '/Clients/AcmeCorp/' (leading + trailing slashes)", () => {
      expect(isBlocked("/Clients/AcmeCorp/")).toBe(true);
    });
  });

  describe("null, undefined, and empty input", () => {
    it("returns false for empty string", () => {
      expect(isBlocked("")).toBe(false);
    });

    it("returns false for null", () => {
      expect(isBlocked(null as any)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isBlocked(undefined as any)).toBe(false);
    });
  });

  describe("unicode and special characters", () => {
    it("blocks 'Clients/\u00dcnited' (unicode umlaut)", () => {
      expect(isBlocked("Clients/\u00dcnited")).toBe(true);
    });

    it("blocks 'Clients/Acme Corp' (spaces)", () => {
      expect(isBlocked("Clients/Acme Corp")).toBe(true);
    });

    it("blocks \"Clients/O'Brien\" (apostrophes)", () => {
      expect(isBlocked("Clients/O'Brien")).toBe(true);
    });
  });

  describe("path traversal (treated as literal segments)", () => {
    it("allows '../Clients/AcmeCorp' (3 segments with '..')", () => {
      expect(isBlocked("../Clients/AcmeCorp")).toBe(false);
    });

    it("allows './Clients/AcmeCorp' (3 segments with '.')", () => {
      expect(isBlocked("./Clients/AcmeCorp")).toBe(false);
    });
  });
});
