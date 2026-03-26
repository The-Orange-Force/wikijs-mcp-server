import { describe, it, expect } from "vitest";
import { mapScopes, stripResourceParam, unmapScopes } from "../scope-mapper.js";

const CLIENT_ID = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

describe("mapScopes", () => {
  it("prefixes a single bare MCP scope with api://{clientId}/", () => {
    expect(mapScopes(["wikijs:read"], CLIENT_ID)).toEqual([
      `api://${CLIENT_ID}/wikijs:read`,
    ]);
  });

  it("prefixes the single MCP scope wikijs:read", () => {
    expect(
      mapScopes(["wikijs:read"], CLIENT_ID),
    ).toEqual([
      `api://${CLIENT_ID}/wikijs:read`,
    ]);
  });

  it("passes OIDC scopes through unchanged", () => {
    expect(mapScopes(["openid", "offline_access"], CLIENT_ID)).toEqual([
      "openid",
      "offline_access",
    ]);
  });

  it("prefixes MCP scopes and passes OIDC scopes through in mixed input", () => {
    expect(
      mapScopes(
        ["wikijs:read", "openid", "offline_access"],
        CLIENT_ID,
      ),
    ).toEqual([
      `api://${CLIENT_ID}/wikijs:read`,
      "openid",
      "offline_access",
    ]);
  });

  it("passes unrecognized wikijs scopes through unchanged", () => {
    expect(
      mapScopes(["wikijs:admin"], CLIENT_ID),
    ).toEqual(["wikijs:admin"]);
  });

  it("returns empty array for empty input", () => {
    expect(mapScopes([], CLIENT_ID)).toEqual([]);
  });

  it("passes unknown scopes through unchanged", () => {
    expect(mapScopes(["custom:scope"], CLIENT_ID)).toEqual(["custom:scope"]);
  });

  it("does not double-prefix already-prefixed api:// scopes", () => {
    expect(mapScopes(["api://already/prefixed"], CLIENT_ID)).toEqual([
      "api://already/prefixed",
    ]);
  });
});

describe("stripResourceParam", () => {
  it("removes the resource key from params", () => {
    expect(
      stripResourceParam({ resource: "https://example.com", client_id: "abc" }),
    ).toEqual({ client_id: "abc" });
  });

  it("returns params unchanged when no resource key is present", () => {
    expect(
      stripResourceParam({ client_id: "abc", scope: "read" }),
    ).toEqual({ client_id: "abc", scope: "read" });
  });

  it("returns empty object for empty input", () => {
    expect(stripResourceParam({})).toEqual({});
  });
});

describe("unmapScopes", () => {
  it("strips api://{clientId}/ prefix from a single MCP scope", () => {
    expect(
      unmapScopes(`api://${CLIENT_ID}/wikijs:read openid`, CLIENT_ID),
    ).toBe("wikijs:read openid");
  });

  it("strips api://{clientId}/ prefix from multiple MCP scopes", () => {
    expect(
      unmapScopes(
        `api://${CLIENT_ID}/wikijs:read api://${CLIENT_ID}/wikijs:write openid offline_access`,
        CLIENT_ID,
      ),
    ).toBe("wikijs:read wikijs:write openid offline_access");
  });

  it("passes through scopes without api:// prefix unchanged", () => {
    expect(unmapScopes("openid offline_access", CLIENT_ID)).toBe(
      "openid offline_access",
    );
  });

  it("returns empty string for empty input", () => {
    expect(unmapScopes("", CLIENT_ID)).toBe("");
  });

  it("leaves scopes with a different clientId prefix unchanged", () => {
    const otherClientId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    expect(
      unmapScopes(`api://${otherClientId}/wikijs:read openid`, CLIENT_ID),
    ).toBe(`api://${otherClientId}/wikijs:read openid`);
  });
});
