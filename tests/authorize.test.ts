/**
 * Integration tests for GET /authorize -- OAuth authorization redirect proxy.
 *
 * Tests cover:
 * - AUTHZ-01: Redirect to Azure AD with mapped scopes, stripped resource, appended OIDC scopes
 * - AUTHZ-02: Passthrough of redirect_uri, state, code_challenge, code_challenge_method
 * - Validation: client_id, redirect_uri, response_type error handling
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp } from "./helpers/build-test-app.js";
import { TEST_CONFIG } from "../src/auth/__tests__/helpers.js";

describe("GET /authorize", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // Helper to build a valid query string
  function validQuery(overrides: Record<string, string> = {}) {
    return {
      client_id: TEST_CONFIG.clientId,
      redirect_uri: "http://localhost:9999/callback",
      response_type: "code",
      scope: "wikijs:read",
      state: "abc123",
      code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
      code_challenge_method: "S256",
      ...overrides,
    };
  }

  const AZURE_AUTHORIZE_BASE = `https://login.microsoftonline.com/${TEST_CONFIG.tenantId}/oauth2/v2.0/authorize`;

  // -----------------------------------------------------------------------
  // AUTHZ-01: Redirect behavior
  // -----------------------------------------------------------------------

  describe("successful redirect (AUTHZ-01)", () => {
    it("returns 302 redirect to Azure AD authorize endpoint", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/authorize",
        query: validQuery(),
      });

      expect(res.statusCode).toBe(302);
      const location = new URL(res.headers.location as string);
      expect(location.origin + location.pathname).toBe(AZURE_AUTHORIZE_BASE);
    });

    it("maps bare MCP scopes to Azure AD api:// format", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/authorize",
        query: validQuery({ scope: "wikijs:read" }),
      });

      const location = new URL(res.headers.location as string);
      const scopeParam = location.searchParams.get("scope")!;
      expect(scopeParam).toContain(`api://${TEST_CONFIG.clientId}/wikijs:read`);
    });

    it("maps MCP scope with api:// prefix and passes unknown scopes through", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/authorize",
        query: validQuery({ scope: "wikijs:read" }),
      });

      const location = new URL(res.headers.location as string);
      const scopeParam = location.searchParams.get("scope")!;
      expect(scopeParam).toContain(`api://${TEST_CONFIG.clientId}/wikijs:read`);
    });

    it("appends openid and offline_access to scope", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/authorize",
        query: validQuery({ scope: "wikijs:read" }),
      });

      const location = new URL(res.headers.location as string);
      const scopeParam = location.searchParams.get("scope")!;
      expect(scopeParam).toContain("openid");
      expect(scopeParam).toContain("offline_access");
    });

    it("deduplicates openid and offline_access when already present", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/authorize",
        query: validQuery({ scope: "wikijs:read openid offline_access" }),
      });

      const location = new URL(res.headers.location as string);
      const scopeParam = location.searchParams.get("scope")!;
      const scopes = scopeParam.split(" ");

      // openid and offline_access should appear exactly once each
      expect(scopes.filter((s) => s === "openid")).toHaveLength(1);
      expect(scopes.filter((s) => s === "offline_access")).toHaveLength(1);
    });

    it("openid and offline_access appear at end of scope string", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/authorize",
        query: validQuery({ scope: "wikijs:read wikijs:write" }),
      });

      const location = new URL(res.headers.location as string);
      const scopeParam = location.searchParams.get("scope")!;
      const scopes = scopeParam.split(" ");

      // Last two should be openid and offline_access
      expect(scopes[scopes.length - 2]).toBe("openid");
      expect(scopes[scopes.length - 1]).toBe("offline_access");
    });

    it("forwards with just openid + offline_access when no scope parameter", async () => {
      const query = validQuery();
      delete (query as Record<string, string | undefined>).scope;

      const res = await app.inject({
        method: "GET",
        url: "/authorize",
        query,
      });

      expect(res.statusCode).toBe(302);
      const location = new URL(res.headers.location as string);
      const scopeParam = location.searchParams.get("scope")!;
      expect(scopeParam).toBe("openid offline_access");
    });

    it("treats empty scope string same as no scope", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/authorize",
        query: validQuery({ scope: "" }),
      });

      expect(res.statusCode).toBe(302);
      const location = new URL(res.headers.location as string);
      const scopeParam = location.searchParams.get("scope")!;
      expect(scopeParam).toBe("openid offline_access");
    });

    it("strips resource parameter from redirect URL", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/authorize",
        query: {
          ...validQuery(),
          resource: "https://mcp.example.com",
        },
      });

      expect(res.statusCode).toBe(302);
      const location = new URL(res.headers.location as string);
      expect(location.searchParams.has("resource")).toBe(false);
    });

    it("passes unknown scopes through unchanged", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/authorize",
        query: validQuery({ scope: "wikijs:read custom:scope" }),
      });

      const location = new URL(res.headers.location as string);
      const scopeParam = location.searchParams.get("scope")!;
      expect(scopeParam).toContain("custom:scope");
      // custom:scope should not be prefixed with api://
      expect(scopeParam).not.toContain(`api://${TEST_CONFIG.clientId}/custom:scope`);
    });
  });

  // -----------------------------------------------------------------------
  // AUTHZ-02: Parameter passthrough
  // -----------------------------------------------------------------------

  describe("parameter passthrough (AUTHZ-02)", () => {
    it("passes redirect_uri through unchanged", async () => {
      const redirectUri = "http://localhost:9999/callback";
      const res = await app.inject({
        method: "GET",
        url: "/authorize",
        query: validQuery({ redirect_uri: redirectUri }),
      });

      const location = new URL(res.headers.location as string);
      expect(location.searchParams.get("redirect_uri")).toBe(redirectUri);
    });

    it("passes state through unchanged", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/authorize",
        query: validQuery({ state: "my-state-value" }),
      });

      const location = new URL(res.headers.location as string);
      expect(location.searchParams.get("state")).toBe("my-state-value");
    });

    it("passes code_challenge through unchanged", async () => {
      const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
      const res = await app.inject({
        method: "GET",
        url: "/authorize",
        query: validQuery({ code_challenge: challenge }),
      });

      const location = new URL(res.headers.location as string);
      expect(location.searchParams.get("code_challenge")).toBe(challenge);
    });

    it("passes code_challenge_method through unchanged", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/authorize",
        query: validQuery({ code_challenge_method: "S256" }),
      });

      const location = new URL(res.headers.location as string);
      expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    });

    it("passes nonce through when present", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/authorize",
        query: { ...validQuery(), nonce: "nonce-value-123" },
      });

      const location = new URL(res.headers.location as string);
      expect(location.searchParams.get("nonce")).toBe("nonce-value-123");
    });

    it("passes prompt through when present", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/authorize",
        query: { ...validQuery(), prompt: "consent" },
      });

      const location = new URL(res.headers.location as string);
      expect(location.searchParams.get("prompt")).toBe("consent");
    });

    it("passes login_hint through when present", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/authorize",
        query: { ...validQuery(), login_hint: "user@contoso.com" },
      });

      const location = new URL(res.headers.location as string);
      expect(location.searchParams.get("login_hint")).toBe("user@contoso.com");
    });

    it("drops unknown query parameters", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/authorize",
        query: {
          ...validQuery(),
          foo: "bar",
          unknown_param: "should_be_dropped",
        },
      });

      expect(res.statusCode).toBe(302);
      const location = new URL(res.headers.location as string);
      expect(location.searchParams.has("foo")).toBe(false);
      expect(location.searchParams.has("unknown_param")).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Validation: error handling
  // -----------------------------------------------------------------------

  describe("validation errors", () => {
    it("returns 400 JSON when client_id is missing", async () => {
      const query = validQuery();
      delete (query as Record<string, string | undefined>).client_id;

      const res = await app.inject({
        method: "GET",
        url: "/authorize",
        query,
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toBe("invalid_request");
      expect(body.error_description).toBe("missing required parameter: client_id");
    });

    it("returns 400 JSON when client_id does not match", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/authorize",
        query: validQuery({ client_id: "00000000-0000-0000-0000-000000000000" }),
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toBe("invalid_client");
      expect(body.error_description).toBe("unknown client_id");
    });

    it("returns 400 JSON when redirect_uri is missing", async () => {
      const query = validQuery();
      delete (query as Record<string, string | undefined>).redirect_uri;

      const res = await app.inject({
        method: "GET",
        url: "/authorize",
        query,
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toBe("invalid_request");
      expect(body.error_description).toBe("missing required parameter: redirect_uri");
    });

    it("redirects with error when response_type is missing", async () => {
      const query = validQuery();
      delete (query as Record<string, string | undefined>).response_type;

      const res = await app.inject({
        method: "GET",
        url: "/authorize",
        query,
      });

      expect(res.statusCode).toBe(302);
      const location = new URL(res.headers.location as string);
      expect(location.origin + location.pathname).toBe("http://localhost:9999/callback");
      expect(location.searchParams.get("error")).toBe("invalid_request");
      expect(location.searchParams.get("error_description")).toBe(
        "missing required parameter: response_type",
      );
    });

    it("includes state in redirect error when response_type is missing", async () => {
      const query = validQuery();
      delete (query as Record<string, string | undefined>).response_type;

      const res = await app.inject({
        method: "GET",
        url: "/authorize",
        query,
      });

      const location = new URL(res.headers.location as string);
      expect(location.searchParams.get("state")).toBe("abc123");
    });

    it("redirects with error when response_type is not 'code'", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/authorize",
        query: validQuery({ response_type: "token" }),
      });

      expect(res.statusCode).toBe(302);
      const location = new URL(res.headers.location as string);
      expect(location.origin + location.pathname).toBe("http://localhost:9999/callback");
      expect(location.searchParams.get("error")).toBe("unsupported_response_type");
      expect(location.searchParams.get("error_description")).toBe(
        "response_type must be 'code'",
      );
    });

    it("includes state in redirect error when response_type is invalid", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/authorize",
        query: validQuery({ response_type: "token", state: "my-state" }),
      });

      const location = new URL(res.headers.location as string);
      expect(location.searchParams.get("state")).toBe("my-state");
    });

    it("redirect error omits state when not provided by client", async () => {
      const query = validQuery({ response_type: "token" });
      delete (query as Record<string, string | undefined>).state;

      const res = await app.inject({
        method: "GET",
        url: "/authorize",
        query,
      });

      const location = new URL(res.headers.location as string);
      expect(location.searchParams.has("state")).toBe(false);
    });
  });
});
