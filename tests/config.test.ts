import { describe, it, expect } from "vitest";
import { envSchema } from "../src/config.js";

const validEnv = {
  PORT: "8000",
  WIKIJS_BASE_URL: "http://localhost:3000",
  WIKIJS_TOKEN: "test-token-value",
  AZURE_TENANT_ID: "550e8400-e29b-41d4-a716-446655440000",
  AZURE_CLIENT_ID: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  MCP_RESOURCE_URL: "https://mcp.example.com",
};

describe("envSchema", () => {
  it("parses valid environment variables", () => {
    const result = envSchema.safeParse(validEnv);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.port).toBe(8000);
    expect(result.data.wikijs.baseUrl).toBe("http://localhost:3000");
    expect(result.data.wikijs.token).toBe("test-token-value");
    expect(result.data.azure.tenantId).toBe(
      "550e8400-e29b-41d4-a716-446655440000",
    );
    expect(result.data.azure.clientId).toBe(
      "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    );
    expect(result.data.azure.resourceUrl).toBe("https://mcp.example.com");
  });

  it("derives JWKS URI from tenant ID", () => {
    const result = envSchema.safeParse(validEnv);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.azure.jwksUri).toBe(
      "https://login.microsoftonline.com/550e8400-e29b-41d4-a716-446655440000/discovery/v2.0/keys",
    );
  });

  it("derives issuer URL from tenant ID", () => {
    const result = envSchema.safeParse(validEnv);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.azure.issuer).toBe(
      "https://login.microsoftonline.com/550e8400-e29b-41d4-a716-446655440000/v2.0",
    );
  });

  it("defaults PORT to 8000 when not provided", () => {
    const { PORT, ...envWithoutPort } = validEnv;
    const result = envSchema.safeParse(envWithoutPort);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.port).toBe(8000);
  });

  it("rejects missing required variables", () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(false);
    if (result.success) return;
    const fieldErrors = result.error.flatten().fieldErrors;
    expect(fieldErrors.WIKIJS_BASE_URL).toBeDefined();
    expect(fieldErrors.WIKIJS_TOKEN).toBeDefined();
    expect(fieldErrors.AZURE_TENANT_ID).toBeDefined();
    expect(fieldErrors.AZURE_CLIENT_ID).toBeDefined();
    expect(fieldErrors.MCP_RESOURCE_URL).toBeDefined();
  });

  it("collects all errors at once", () => {
    const result = envSchema.safeParse({ PORT: "8000" });
    expect(result.success).toBe(false);
    if (result.success) return;
    const fieldErrors = result.error.flatten().fieldErrors;
    const errorFields = Object.keys(fieldErrors);
    expect(errorFields.length).toBeGreaterThanOrEqual(5);
  });

  it("rejects invalid UUID for AZURE_TENANT_ID", () => {
    const result = envSchema.safeParse({
      ...validEnv,
      AZURE_TENANT_ID: "not-a-uuid",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const fieldErrors = result.error.flatten().fieldErrors;
    expect(fieldErrors.AZURE_TENANT_ID).toBeDefined();
  });

  it("rejects invalid UUID for AZURE_CLIENT_ID", () => {
    const result = envSchema.safeParse({
      ...validEnv,
      AZURE_CLIENT_ID: "not-a-uuid",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const fieldErrors = result.error.flatten().fieldErrors;
    expect(fieldErrors.AZURE_CLIENT_ID).toBeDefined();
  });

  it("rejects invalid URL for MCP_RESOURCE_URL", () => {
    const result = envSchema.safeParse({
      ...validEnv,
      MCP_RESOURCE_URL: "not-a-url",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const fieldErrors = result.error.flatten().fieldErrors;
    expect(fieldErrors.MCP_RESOURCE_URL).toBeDefined();
  });

  it("rejects invalid URL for WIKIJS_BASE_URL", () => {
    const result = envSchema.safeParse({
      ...validEnv,
      WIKIJS_BASE_URL: "not-a-url",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const fieldErrors = result.error.flatten().fieldErrors;
    expect(fieldErrors.WIKIJS_BASE_URL).toBeDefined();
  });

  it("rejects empty WIKIJS_TOKEN", () => {
    const result = envSchema.safeParse({
      ...validEnv,
      WIKIJS_TOKEN: "",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const fieldErrors = result.error.flatten().fieldErrors;
    expect(fieldErrors.WIKIJS_TOKEN).toBeDefined();
  });
});
