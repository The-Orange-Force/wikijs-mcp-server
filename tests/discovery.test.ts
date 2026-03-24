import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/server.js";
import type { AppConfig } from "../src/config.js";
import type { FastifyInstance } from "fastify";

const FAKE_TENANT_ID = "550e8400-e29b-41d4-a716-446655440000";
const FAKE_CLIENT_ID = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const FAKE_RESOURCE_URL = "https://mcp.example.com";

function makeConfig(overrides?: Partial<AppConfig["azure"]>): AppConfig {
  return {
    port: 0,
    wikijs: {
      baseUrl: "http://localhost:3000",
      token: "test-token",
    },
    azure: {
      tenantId: FAKE_TENANT_ID,
      clientId: FAKE_CLIENT_ID,
      resourceUrl: FAKE_RESOURCE_URL,
      jwksUri: `https://login.microsoftonline.com/${FAKE_TENANT_ID}/discovery/v2.0/keys`,
      issuer: `https://login.microsoftonline.com/${FAKE_TENANT_ID}/v2.0`,
      ...overrides,
    },
  };
}

describe("GET /.well-known/oauth-protected-resource", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp(makeConfig());
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 200 with JSON body", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-protected-resource",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toBeDefined();
  });

  it("returns Content-Type application/json", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-protected-resource",
    });
    expect(res.headers["content-type"]).toContain("application/json");
  });

  it("contains resource field matching config value", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-protected-resource",
    });
    const body = res.json();
    expect(body.resource).toBe(FAKE_RESOURCE_URL);
  });

  it("contains authorization_servers with a valid URL including tenant ID", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-protected-resource",
    });
    const body = res.json();
    expect(body.authorization_servers).toBeInstanceOf(Array);
    expect(body.authorization_servers.length).toBeGreaterThanOrEqual(1);
    const server = body.authorization_servers[0];
    // Non-brittle: check valid URL and contains tenant ID
    expect(() => new URL(server)).not.toThrow();
    expect(server).toContain(FAKE_TENANT_ID);
  });

  it("contains scopes_supported with all three scopes", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-protected-resource",
    });
    const body = res.json();
    expect(body.scopes_supported).toEqual(
      expect.arrayContaining(["wikijs.read", "wikijs.write", "wikijs.admin"]),
    );
    expect(body.scopes_supported).toHaveLength(3);
  });

  it('contains bearer_methods_supported equal to ["header"]', async () => {
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-protected-resource",
    });
    const body = res.json();
    expect(body.bearer_methods_supported).toEqual(["header"]);
  });

  it('contains resource_signing_alg_values_supported equal to ["RS256"]', async () => {
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-protected-resource",
    });
    const body = res.json();
    expect(body.resource_signing_alg_values_supported).toEqual(["RS256"]);
  });

  it("includes Cache-Control header", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-protected-resource",
    });
    expect(res.headers["cache-control"]).toBe("public, max-age=3600");
  });

  it("returns 200 WITHOUT an Authorization header (DISC-03)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-protected-resource",
      // No Authorization header set
    });
    expect(res.statusCode).toBe(200);
  });

  it("does NOT include resource_documentation when MCP_RESOURCE_DOCS_URL is not set", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-protected-resource",
    });
    const body = res.json();
    expect(body).not.toHaveProperty("resource_documentation");
  });

  describe("with MCP_RESOURCE_DOCS_URL set", () => {
    let appWithDocs: FastifyInstance;
    const docsUrl = "https://docs.example.com/mcp-server";

    beforeAll(async () => {
      appWithDocs = buildApp(
        makeConfig({ resourceDocsUrl: docsUrl } as any),
      );
      await appWithDocs.ready();
    });

    afterAll(async () => {
      await appWithDocs.close();
    });

    it("includes resource_documentation when MCP_RESOURCE_DOCS_URL is set", async () => {
      const res = await appWithDocs.inject({
        method: "GET",
        url: "/.well-known/oauth-protected-resource",
      });
      const body = res.json();
      expect(body.resource_documentation).toBe(docsUrl);
    });
  });
});
