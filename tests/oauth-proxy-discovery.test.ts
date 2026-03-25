import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp } from "./helpers/build-test-app.js";

const FAKE_RESOURCE_URL = "https://mcp.example.com";

describe("GET /.well-known/oauth-authorization-server", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 200 with JSON body", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-authorization-server",
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/json");
  });

  it("contains issuer matching resourceUrl", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-authorization-server",
    });
    const body = res.json();
    expect(body.issuer).toBe(FAKE_RESOURCE_URL);
  });

  it("contains authorization_endpoint pointing to self (not Azure AD)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-authorization-server",
    });
    const body = res.json();
    expect(body.authorization_endpoint).toBe(`${FAKE_RESOURCE_URL}/authorize`);
  });

  it("contains token_endpoint pointing to self (not Azure AD)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-authorization-server",
    });
    const body = res.json();
    expect(body.token_endpoint).toBe(`${FAKE_RESOURCE_URL}/token`);
  });

  it("contains registration_endpoint pointing to self", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-authorization-server",
    });
    const body = res.json();
    expect(body.registration_endpoint).toBe(`${FAKE_RESOURCE_URL}/register`);
  });

  it('contains response_types_supported: ["code"]', async () => {
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-authorization-server",
    });
    const body = res.json();
    expect(body.response_types_supported).toEqual(["code"]);
  });

  it('contains grant_types_supported: ["authorization_code", "refresh_token"]', async () => {
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-authorization-server",
    });
    const body = res.json();
    expect(body.grant_types_supported).toEqual(["authorization_code", "refresh_token"]);
  });

  it('contains code_challenge_methods_supported: ["S256"]', async () => {
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-authorization-server",
    });
    const body = res.json();
    expect(body.code_challenge_methods_supported).toEqual(["S256"]);
  });

  it('contains token_endpoint_auth_methods_supported: ["none"]', async () => {
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-authorization-server",
    });
    const body = res.json();
    expect(body.token_endpoint_auth_methods_supported).toEqual(["none"]);
  });

  it("contains scopes_supported with all three scopes", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-authorization-server",
    });
    const body = res.json();
    expect(body.scopes_supported).toEqual(
      expect.arrayContaining(["wikijs:read", "wikijs:write", "wikijs:admin"]),
    );
    expect(body.scopes_supported).toHaveLength(3);
  });

  it("includes Cache-Control header", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-authorization-server",
    });
    expect(res.headers["cache-control"]).toBe("public, max-age=3600");
  });

  it("is accessible without Authorization header", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-authorization-server",
      // No Authorization header
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("GET /.well-known/openid-configuration", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 200 with JSON body", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/openid-configuration",
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/json");
  });

  it("returns identical body to oauth-authorization-server", async () => {
    const asRes = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-authorization-server",
    });
    const oidcRes = await app.inject({
      method: "GET",
      url: "/.well-known/openid-configuration",
    });
    expect(oidcRes.json()).toEqual(asRes.json());
  });

  it("includes Cache-Control header", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/openid-configuration",
    });
    expect(res.headers["cache-control"]).toBe("public, max-age=3600");
  });
});

describe("POST /register", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 201 with client_id", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/register",
      payload: { client_name: "test-client" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.client_id).toBeDefined();
  });

  it("returns client_id matching configured clientId", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/register",
      payload: { client_name: "test-client" },
    });
    const body = res.json();
    expect(body.client_id).toBe("6ba7b810-9dad-11d1-80b4-00c04fd430c8");
  });

  it('returns token_endpoint_auth_method: "none"', async () => {
    const res = await app.inject({
      method: "POST",
      url: "/register",
      payload: { client_name: "test-client" },
    });
    const body = res.json();
    expect(body.token_endpoint_auth_method).toBe("none");
  });

  it('returns grant_types: ["authorization_code", "refresh_token"]', async () => {
    const res = await app.inject({
      method: "POST",
      url: "/register",
      payload: { client_name: "test-client" },
    });
    const body = res.json();
    expect(body.grant_types).toEqual(["authorization_code", "refresh_token"]);
  });

  it('returns response_types: ["code"]', async () => {
    const res = await app.inject({
      method: "POST",
      url: "/register",
      payload: { client_name: "test-client" },
    });
    const body = res.json();
    expect(body.response_types).toEqual(["code"]);
  });

  it("does NOT include client_secret in response", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/register",
      payload: { client_name: "test-client" },
    });
    const body = res.json();
    expect(body).not.toHaveProperty("client_secret");
  });

  it("returns 415 for non-JSON content type", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/register",
      headers: { "content-type": "text/plain" },
      payload: "not json",
    });
    expect(res.statusCode).toBe(415);
  });

  it("is idempotent (two calls return same client_id)", async () => {
    const res1 = await app.inject({
      method: "POST",
      url: "/register",
      payload: { client_name: "client-a" },
    });
    const res2 = await app.inject({
      method: "POST",
      url: "/register",
      payload: { client_name: "client-b" },
    });
    expect(res1.json().client_id).toBe(res2.json().client_id);
  });

  it("is accessible without Authorization header", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/register",
      payload: { client_name: "test-client" },
      // No Authorization header
    });
    expect(res.statusCode).toBe(201);
  });
});
