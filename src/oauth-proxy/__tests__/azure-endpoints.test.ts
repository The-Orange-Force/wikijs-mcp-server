import { describe, it, expect } from "vitest";
import { buildAzureEndpoints } from "../azure-endpoints.js";

const TENANT_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("buildAzureEndpoints", () => {
  it("constructs authorize URL from tenant ID", () => {
    const endpoints = buildAzureEndpoints(TENANT_ID);
    expect(endpoints.authorize).toBe(
      `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize`,
    );
  });

  it("constructs token URL from tenant ID", () => {
    const endpoints = buildAzureEndpoints(TENANT_ID);
    expect(endpoints.token).toBe(
      `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    );
  });

  it("returns object with authorize and token properties", () => {
    const endpoints = buildAzureEndpoints(TENANT_ID);
    expect(endpoints).toHaveProperty("authorize");
    expect(endpoints).toHaveProperty("token");
    expect(typeof endpoints.authorize).toBe("string");
    expect(typeof endpoints.token).toBe("string");
  });
});
