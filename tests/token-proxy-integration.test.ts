import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { oauthProxyRoutes } from "../src/routes/oauth-proxy.js";
import { makeTestConfig } from "./helpers/build-test-app.js";

const CLIENT_ID = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

const mockFetch = vi.fn();
const appConfig = makeTestConfig();

describe("POST /token integration", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(oauthProxyRoutes, { appConfig, fetch: mockFetch });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns 200 with access_token for authorization_code grant", async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "integration-at",
          token_type: "Bearer",
          expires_in: 3599,
          scope: `api://${CLIENT_ID}/wikijs:read openid`,
          refresh_token: "integration-rt",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const res = await app.inject({
      method: "POST",
      url: "/token",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: new URLSearchParams({
        grant_type: "authorization_code",
        code: "test-code",
        redirect_uri: "http://localhost:3000/callback",
        client_id: CLIENT_ID,
      }).toString(),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.access_token).toBe("integration-at");
    expect(body.scope).toBe("wikijs:read openid");
  });

  it("returns 200 with access_token for refresh_token grant", async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "refreshed-at",
          token_type: "Bearer",
          expires_in: 3599,
          scope: `api://${CLIENT_ID}/wikijs:read openid`,
          refresh_token: "new-rt",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const res = await app.inject({
      method: "POST",
      url: "/token",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: "old-rt",
        client_id: CLIENT_ID,
      }).toString(),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.access_token).toBe("refreshed-at");
  });

  it("sets Cache-Control: no-store header", async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "at", token_type: "Bearer", expires_in: 3599 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const res = await app.inject({
      method: "POST",
      url: "/token",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: new URLSearchParams({
        grant_type: "authorization_code",
        code: "test-code",
        redirect_uri: "http://localhost:3000/callback",
        client_id: CLIENT_ID,
      }).toString(),
    });

    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("sets Pragma: no-cache header", async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "at", token_type: "Bearer", expires_in: 3599 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const res = await app.inject({
      method: "POST",
      url: "/token",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: new URLSearchParams({
        grant_type: "authorization_code",
        code: "test-code",
        redirect_uri: "http://localhost:3000/callback",
        client_id: CLIENT_ID,
      }).toString(),
    });

    expect(res.headers["pragma"]).toBe("no-cache");
  });

  it("sets Content-Type: application/json header", async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "at", token_type: "Bearer", expires_in: 3599 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const res = await app.inject({
      method: "POST",
      url: "/token",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: new URLSearchParams({
        grant_type: "authorization_code",
        code: "test-code",
        redirect_uri: "http://localhost:3000/callback",
        client_id: CLIENT_ID,
      }).toString(),
    });

    expect(res.headers["content-type"]).toContain("application/json");
  });

  it("sets X-Upstream-Duration-Ms header as numeric string", async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "at", token_type: "Bearer", expires_in: 3599 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const res = await app.inject({
      method: "POST",
      url: "/token",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: new URLSearchParams({
        grant_type: "authorization_code",
        code: "test-code",
        redirect_uri: "http://localhost:3000/callback",
        client_id: CLIENT_ID,
      }).toString(),
    });

    const duration = res.headers["x-upstream-duration-ms"];
    expect(duration).toBeDefined();
    expect(Number(duration)).toBeGreaterThanOrEqual(0);
  });

  it("returns 400 with unsupported_grant_type for unsupported grant", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/token",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: CLIENT_ID,
      }).toString(),
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("unsupported_grant_type");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 400 with invalid_request for missing params", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/token",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: CLIENT_ID,
        // missing code and redirect_uri
      }).toString(),
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("invalid_request");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns normalized OAuth error for AADSTS error response", async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "invalid_grant",
          error_description: "AADSTS70008: The code has expired.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    );

    const res = await app.inject({
      method: "POST",
      url: "/token",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: new URLSearchParams({
        grant_type: "authorization_code",
        code: "expired-code",
        redirect_uri: "http://localhost:3000/callback",
        client_id: CLIENT_ID,
      }).toString(),
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("invalid_grant");
    expect(body.error_description).toBe(
      "The authorization code has expired or is invalid.",
    );
  });
});
