import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    env: {
      // Provide valid env vars so config.ts module-level loadConfig() succeeds
      // during test import. Tests use envSchema.safeParse() directly with
      // custom inputs, so these values only satisfy the module-level parse.
      WIKIJS_BASE_URL: "http://localhost:3000",
      WIKIJS_TOKEN: "test-token-for-vitest",
      AZURE_TENANT_ID: "550e8400-e29b-41d4-a716-446655440000",
      AZURE_CLIENT_ID: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      MCP_RESOURCE_URL: "https://mcp.example.com",
    },
  },
});
