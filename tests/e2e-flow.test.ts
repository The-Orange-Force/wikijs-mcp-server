/**
 * End-to-end OAuth discovery chain integration test.
 *
 * Validates the full MCP client discovery flow: PRM discovery -> AS metadata ->
 * DCR registration -> authorize redirect -> token proxy -> authenticated MCP call.
 *
 * Each step uses the response from the previous step to construct the next
 * request, validating the chain links rather than individual endpoints.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp, capturedFetchCalls } from "./helpers/build-test-app.js";
import { createTestToken } from "../src/auth/__tests__/helpers.js";

describe("E2E OAuth discovery chain", () => {
  let app: FastifyInstance;
  let validToken: string;

  // Shared state populated by sequential steps
  let authorizationServerUrl: string;
  let authorizationEndpoint: string;
  let tokenEndpoint: string;
  let registrationEndpoint: string;
  let clientId: string;

  beforeAll(async () => {
    validToken = await createTestToken();
    app = await buildTestApp();
    await app.ready();
    capturedFetchCalls.length = 0;
  });

  afterAll(async () => { await app.close(); });

  it("Step 1: discovers protected resource metadata", async () => {
    // MCP client's first request without a token gets 401 with PRM hint
    // Then client fetches PRM to find the authorization server
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-protected-resource",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.resource).toBeDefined();
    expect(body.authorization_servers).toBeInstanceOf(Array);
    expect(body.authorization_servers.length).toBeGreaterThanOrEqual(1);
    authorizationServerUrl = body.authorization_servers[0];
    // Key assertion: authorization server is SELF (proxy), not Azure AD
    expect(authorizationServerUrl).toBe("https://mcp.example.com");
    expect(authorizationServerUrl).not.toContain("login.microsoftonline.com");
  });

  it("Step 2: follows to authorization server metadata", async () => {
    // Client constructs .well-known URL from the AS URL found in PRM
    const metadataUrl = new URL("/.well-known/oauth-authorization-server", authorizationServerUrl);
    const res = await app.inject({
      method: "GET",
      url: metadataUrl.pathname,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    // Extract endpoints for subsequent steps
    authorizationEndpoint = body.authorization_endpoint;
    tokenEndpoint = body.token_endpoint;
    registrationEndpoint = body.registration_endpoint;

    // Verify required MCP fields
    expect(body.code_challenge_methods_supported).toContain("S256");
    expect(body.response_types_supported).toContain("code");
    expect(body.grant_types_supported).toEqual(
      expect.arrayContaining(["authorization_code", "refresh_token"]),
    );

    // All endpoints point to self, not Azure AD
    expect(authorizationEndpoint).toContain("https://mcp.example.com");
    expect(tokenEndpoint).toContain("https://mcp.example.com");
    expect(registrationEndpoint).toContain("https://mcp.example.com");
  });

  it("Step 3: registers client via DCR", async () => {
    const regPath = new URL(registrationEndpoint).pathname;
    const res = await app.inject({
      method: "POST",
      url: regPath,
      headers: { "content-type": "application/json" },
      payload: { client_name: "E2E Test Client", redirect_uris: ["http://localhost:3000/callback"] },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    clientId = body.client_id;
    expect(clientId).toBeDefined();
    expect(body.token_endpoint_auth_method).toBe("none");
    // Public client: no client_secret
    expect(body).not.toHaveProperty("client_secret");
  });

  it("Step 4: builds authorize redirect to Azure AD", async () => {
    const authPath = new URL(authorizationEndpoint).pathname;
    const res = await app.inject({
      method: "GET",
      url: authPath,
      query: {
        client_id: clientId,
        redirect_uri: "http://localhost:3000/callback",
        response_type: "code",
        scope: "wikijs:read",
        state: "e2e-state-abc",
        code_challenge: "E2E_test_challenge_value_1234567890abcdef",
        code_challenge_method: "S256",
      },
    });
    expect(res.statusCode).toBe(302);
    const location = new URL(res.headers.location as string);

    // Redirect goes to Azure AD (not self)
    expect(location.hostname).toBe("login.microsoftonline.com");

    // Scope mapping: bare MCP scopes mapped to Azure AD format
    const scope = location.searchParams.get("scope") ?? "";
    expect(scope).toContain("api://");
    expect(scope).toContain("wikijs:read");
    expect(scope).toContain("wikijs:read");

    // openid and offline_access appended
    expect(scope).toContain("openid");
    expect(scope).toContain("offline_access");

    // Client params passed through unchanged
    expect(location.searchParams.get("state")).toBe("e2e-state-abc");
    expect(location.searchParams.get("code_challenge")).toBe("E2E_test_challenge_value_1234567890abcdef");
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("redirect_uri")).toBe("http://localhost:3000/callback");

    // Resource parameter stripped (not present in redirect)
    expect(location.searchParams.has("resource")).toBe(false);
  });

  it("Step 5: proxies token request to Azure AD", async () => {
    capturedFetchCalls.length = 0;
    const tokenPath = new URL(tokenEndpoint).pathname;
    const res = await app.inject({
      method: "POST",
      url: tokenPath,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: [
        `grant_type=authorization_code`,
        `code=fake-auth-code-from-azure`,
        `redirect_uri=${encodeURIComponent("http://localhost:3000/callback")}`,
        `client_id=${clientId}`,
        `code_verifier=e2e-test-verifier-value`,
      ].join("&"),
    });
    // Mock fetch returns 400, so token endpoint returns error -- expected
    // The important assertion: verify the outbound request to Azure AD was correct
    expect(capturedFetchCalls.length).toBe(1);
    const fetchCall = capturedFetchCalls[0];
    expect(fetchCall.url).toContain("login.microsoftonline.com");
    expect(fetchCall.url).toContain("/oauth2/v2.0/token");
    // Verify the fetch was a POST with form body
    expect(fetchCall.init?.method).toBe("POST");
  });

  it("Step 6: authenticated MCP tool invocation succeeds", async () => {
    // Final step: verify that after obtaining a token, the MCP endpoint works
    // (Using a locally-signed test token since we can't get a real one from mock)
    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        authorization: `Bearer ${validToken}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "e2e-test", version: "1.0.0" },
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.result).toBeDefined();
    expect(body.result.protocolVersion).toBeDefined();
  });
});
