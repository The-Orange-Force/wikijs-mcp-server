import { config as dotenvConfig } from "dotenv";
import { z } from "zod";
import { createRemoteJWKSet } from "jose";

// ---------------------------------------------------------------------------
// Schema -- exported separately for testability (safeParse does not exit)
// ---------------------------------------------------------------------------

export const envSchema = z
  .object({
    PORT: z.string().default("8000").transform(Number),
    WIKIJS_BASE_URL: z.string().url("WIKIJS_BASE_URL must be a valid URL"),
    WIKIJS_TOKEN: z.string().min(1, "WIKIJS_TOKEN must not be empty"),
    AZURE_TENANT_ID: z.string().uuid("AZURE_TENANT_ID must be a valid UUID"),
    AZURE_CLIENT_ID: z.string().uuid("AZURE_CLIENT_ID must be a valid UUID"),
    MCP_RESOURCE_URL: z.string().url("MCP_RESOURCE_URL must be a valid URL"),
    MCP_RESOURCE_DOCS_URL: z
      .string()
      .url("MCP_RESOURCE_DOCS_URL must be a valid URL")
      .optional(),
    MCP_INSTRUCTIONS_PATH: z.string().optional(),
  })
  .transform((env) => ({
    port: env.PORT,
    wikijs: {
      baseUrl: env.WIKIJS_BASE_URL,
      token: env.WIKIJS_TOKEN,
    },
    azure: {
      tenantId: env.AZURE_TENANT_ID,
      clientId: env.AZURE_CLIENT_ID,
      resourceUrl: env.MCP_RESOURCE_URL,
      resourceDocsUrl: env.MCP_RESOURCE_DOCS_URL,
      jwksUri: `https://login.microsoftonline.com/${env.AZURE_TENANT_ID}/discovery/v2.0/keys`,
      issuer: `https://login.microsoftonline.com/${env.AZURE_TENANT_ID}/v2.0`,
    },
    instructionsPath: env.MCP_INSTRUCTIONS_PATH,
  }));

export type AppConfig = z.output<typeof envSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function maskValue(value: string, showChars: number = 4): string {
  if (value.length <= showChars) return "****";
  return value.substring(0, showChars) + "****";
}

export function logConfig(cfg: AppConfig): void {
  console.log("=== Server Configuration ===");
  console.log(`  Port:             ${cfg.port}`);
  console.log(`  WikiJS URL:       ${cfg.wikijs.baseUrl}`);
  console.log(`  WikiJS Token:     ${maskValue(cfg.wikijs.token)}`);
  console.log(`  Azure Tenant ID:  ${maskValue(cfg.azure.tenantId, 8)}`);
  console.log(`  Azure Client ID:  ${maskValue(cfg.azure.clientId, 8)}`);
  console.log(`  Resource URL:     ${cfg.azure.resourceUrl}`);
  console.log(`  JWKS URI:         ${cfg.azure.jwksUri}`);
  console.log(`  Issuer:           ${cfg.azure.issuer}`);
  console.log("============================");
}

// ---------------------------------------------------------------------------
// Module-level: load .env, validate, fail-fast
// ---------------------------------------------------------------------------

function loadConfig(): AppConfig {
  dotenvConfig();

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const fieldErrors = result.error.flatten().fieldErrors;
    const missing: string[] = [];
    const invalid: string[] = [];

    for (const [field, messages] of Object.entries(fieldErrors)) {
      if (!messages) continue;
      for (const msg of messages) {
        if (msg === "Required") {
          missing.push(field);
        } else {
          invalid.push(`  ${field}: ${msg}`);
        }
      }
    }

    console.error("\n=== Configuration Error ===");
    if (missing.length > 0) {
      console.error(`\nMissing required variables:\n  ${missing.join("\n  ")}`);
    }
    if (invalid.length > 0) {
      console.error(`\nInvalid variables:\n${invalid.join("\n")}`);
    }
    console.error("\nSee example.env for required variables.\n");
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();

// ---------------------------------------------------------------------------
// JWKS resolver -- lazy, no network call at creation time
// ---------------------------------------------------------------------------

export const jwks = createRemoteJWKSet(new URL(config.azure.jwksUri));
