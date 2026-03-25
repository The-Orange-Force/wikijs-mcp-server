import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleTokenRequest, AADSTS_TO_OAUTH } from "../token-proxy.js";
import type { TokenProxyContext } from "../token-proxy.js";

const CLIENT_ID = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const TOKEN_ENDPOINT =
  "https://login.microsoftonline.com/test-tenant/oauth2/v2.0/token";

function createMockFetch(
  body: Record<string, unknown>,
  status = 200,
  contentType = "application/json",
): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": contentType },
    }),
  );
}

function createMockLog() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeCtx(
  fetchFn: typeof globalThis.fetch,
  log = createMockLog(),
): TokenProxyContext {
  return { clientId: CLIENT_ID, tokenEndpoint: TOKEN_ENDPOINT, fetch: fetchFn, log };
}

describe("handleTokenRequest", () => {
  let mockLog: ReturnType<typeof createMockLog>;

  beforeEach(() => {
    mockLog = createMockLog();
  });

  // ---- authorization_code grant ----

  describe("authorization_code grant", () => {
    const baseBody = {
      grant_type: "authorization_code",
      code: "test-auth-code",
      redirect_uri: "http://localhost:3000/callback",
      client_id: CLIENT_ID,
    };

    it("calls fetch with correct Azure AD token URL and form-encoded body with mapped scopes", async () => {
      const mockFetch = createMockFetch({
        access_token: "at",
        token_type: "Bearer",
        expires_in: 3599,
        scope: `api://${CLIENT_ID}/wikijs:read openid`,
      });
      const ctx = makeCtx(mockFetch as unknown as typeof globalThis.fetch, mockLog);

      await handleTokenRequest({ ...baseBody, scope: "wikijs:read openid" }, ctx);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe(TOKEN_ENDPOINT);
      expect(opts.method).toBe("POST");
      expect(opts.headers["Content-Type"]).toBe(
        "application/x-www-form-urlencoded",
      );

      const params = new URLSearchParams(opts.body);
      expect(params.get("scope")).toBe(
        `api://${CLIENT_ID}/wikijs:read openid`,
      );
    });

    it("returns Azure AD success response with reverse-mapped scopes", async () => {
      const mockFetch = createMockFetch({
        access_token: "at",
        token_type: "Bearer",
        expires_in: 3599,
        scope: `api://${CLIENT_ID}/wikijs:read openid`,
        refresh_token: "rt",
      });
      const ctx = makeCtx(mockFetch as unknown as typeof globalThis.fetch, mockLog);

      const result = await handleTokenRequest(baseBody, ctx);

      expect(result.status).toBe(200);
      expect(result.body).toMatchObject({
        access_token: "at",
        token_type: "Bearer",
        expires_in: 3599,
        scope: "wikijs:read openid",
        refresh_token: "rt",
      });
    });

    it("passes code_verifier through to Azure AD unchanged", async () => {
      const mockFetch = createMockFetch({
        access_token: "at",
        token_type: "Bearer",
        expires_in: 3599,
      });
      const ctx = makeCtx(mockFetch as unknown as typeof globalThis.fetch, mockLog);

      await handleTokenRequest(
        { ...baseBody, code_verifier: "pkce-verifier-value" },
        ctx,
      );

      const params = new URLSearchParams(mockFetch.mock.calls[0][1].body);
      expect(params.get("code_verifier")).toBe("pkce-verifier-value");
    });

    it("strips resource parameter before forwarding", async () => {
      const mockFetch = createMockFetch({
        access_token: "at",
        token_type: "Bearer",
        expires_in: 3599,
      });
      const ctx = makeCtx(mockFetch as unknown as typeof globalThis.fetch, mockLog);

      await handleTokenRequest(
        { ...baseBody, resource: "https://example.com" },
        ctx,
      );

      const params = new URLSearchParams(mockFetch.mock.calls[0][1].body);
      expect(params.has("resource")).toBe(false);
    });

    it("returns invalid_request when code is missing", async () => {
      const mockFetch = vi.fn();
      const ctx = makeCtx(mockFetch as unknown as typeof globalThis.fetch, mockLog);
      const { code: _, ...bodyNoCode } = baseBody;

      const result = await handleTokenRequest(bodyNoCode, ctx);

      expect(result.status).toBe(400);
      expect(result.body.error).toBe("invalid_request");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("returns invalid_request when redirect_uri is missing", async () => {
      const mockFetch = vi.fn();
      const ctx = makeCtx(mockFetch as unknown as typeof globalThis.fetch, mockLog);
      const { redirect_uri: _, ...bodyNoRedirect } = baseBody;

      const result = await handleTokenRequest(bodyNoRedirect, ctx);

      expect(result.status).toBe(400);
      expect(result.body.error).toBe("invalid_request");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("returns invalid_request when client_id is missing", async () => {
      const mockFetch = vi.fn();
      const ctx = makeCtx(mockFetch as unknown as typeof globalThis.fetch, mockLog);
      const { client_id: _, ...bodyNoClient } = baseBody;

      const result = await handleTokenRequest(bodyNoClient, ctx);

      expect(result.status).toBe(400);
      expect(result.body.error).toBe("invalid_request");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("returns invalid_client when client_id does not match", async () => {
      const mockFetch = vi.fn();
      const ctx = makeCtx(mockFetch as unknown as typeof globalThis.fetch, mockLog);

      const result = await handleTokenRequest(
        { ...baseBody, client_id: "wrong-client-id" },
        ctx,
      );

      expect(result.status).toBe(400);
      expect(result.body.error).toBe("invalid_client");
      expect(result.body.error_description).toBe("unknown client_id");
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ---- refresh_token grant ----

  describe("refresh_token grant", () => {
    const baseBody = {
      grant_type: "refresh_token",
      refresh_token: "test-refresh-token",
      client_id: CLIENT_ID,
    };

    it("calls fetch with correct body including mapped scopes", async () => {
      const mockFetch = createMockFetch({
        access_token: "new-at",
        token_type: "Bearer",
        expires_in: 3599,
        scope: `api://${CLIENT_ID}/wikijs:read openid`,
        refresh_token: "new-rt",
      });
      const ctx = makeCtx(mockFetch as unknown as typeof globalThis.fetch, mockLog);

      await handleTokenRequest(
        { ...baseBody, scope: "wikijs:read openid" },
        ctx,
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const params = new URLSearchParams(mockFetch.mock.calls[0][1].body);
      expect(params.get("grant_type")).toBe("refresh_token");
      expect(params.get("refresh_token")).toBe("test-refresh-token");
      expect(params.get("scope")).toBe(
        `api://${CLIENT_ID}/wikijs:read openid`,
      );
    });

    it("returns Azure AD success response with reverse-mapped scopes", async () => {
      const mockFetch = createMockFetch({
        access_token: "new-at",
        token_type: "Bearer",
        expires_in: 3599,
        scope: `api://${CLIENT_ID}/wikijs:write openid`,
        refresh_token: "new-rt",
      });
      const ctx = makeCtx(mockFetch as unknown as typeof globalThis.fetch, mockLog);

      const result = await handleTokenRequest(baseBody, ctx);

      expect(result.status).toBe(200);
      expect(result.body).toMatchObject({
        access_token: "new-at",
        scope: "wikijs:write openid",
        refresh_token: "new-rt",
      });
    });

    it("returns invalid_request when refresh_token field is missing", async () => {
      const mockFetch = vi.fn();
      const ctx = makeCtx(mockFetch as unknown as typeof globalThis.fetch, mockLog);
      const { refresh_token: _, ...bodyNoToken } = baseBody;

      const result = await handleTokenRequest(bodyNoToken, ctx);

      expect(result.status).toBe(400);
      expect(result.body.error).toBe("invalid_request");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("returns invalid_request when client_id is missing", async () => {
      const mockFetch = vi.fn();
      const ctx = makeCtx(mockFetch as unknown as typeof globalThis.fetch, mockLog);
      const { client_id: _, ...bodyNoClient } = baseBody;

      const result = await handleTokenRequest(bodyNoClient, ctx);

      expect(result.status).toBe(400);
      expect(result.body.error).toBe("invalid_request");
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ---- unsupported / missing grant_type ----

  describe("unsupported grant_type", () => {
    it("returns unsupported_grant_type for client_credentials", async () => {
      const mockFetch = vi.fn();
      const ctx = makeCtx(mockFetch as unknown as typeof globalThis.fetch, mockLog);

      const result = await handleTokenRequest(
        { grant_type: "client_credentials", client_id: CLIENT_ID },
        ctx,
      );

      expect(result.status).toBe(400);
      expect(result.body.error).toBe("unsupported_grant_type");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("returns unsupported_grant_type when grant_type is missing", async () => {
      const mockFetch = vi.fn();
      const ctx = makeCtx(mockFetch as unknown as typeof globalThis.fetch, mockLog);

      const result = await handleTokenRequest({ client_id: CLIENT_ID }, ctx);

      expect(result.status).toBe(400);
      expect(result.body.error).toBe("unsupported_grant_type");
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ---- AADSTS error normalization ----

  describe("AADSTS error normalization", () => {
    it("normalizes AADSTS70008 to invalid_grant", async () => {
      const mockFetch = createMockFetch(
        {
          error: "invalid_grant",
          error_description:
            "AADSTS70008: The provided authorization code has expired.",
        },
        400,
      );
      const ctx = makeCtx(mockFetch as unknown as typeof globalThis.fetch, mockLog);

      const result = await handleTokenRequest(
        {
          grant_type: "authorization_code",
          code: "expired-code",
          redirect_uri: "http://localhost:3000/callback",
          client_id: CLIENT_ID,
        },
        ctx,
      );

      expect(result.status).toBe(400);
      expect(result.body.error).toBe("invalid_grant");
      expect(result.body.error_description).toBe(
        "The authorization code has expired or is invalid.",
      );
    });

    it("normalizes AADSTS700082 to invalid_grant", async () => {
      const mockFetch = createMockFetch(
        {
          error: "invalid_grant",
          error_description:
            "AADSTS700082: The refresh token has expired due to inactivity.",
        },
        400,
      );
      const ctx = makeCtx(mockFetch as unknown as typeof globalThis.fetch, mockLog);

      const result = await handleTokenRequest(
        {
          grant_type: "refresh_token",
          refresh_token: "expired-rt",
          client_id: CLIENT_ID,
        },
        ctx,
      );

      expect(result.status).toBe(400);
      expect(result.body.error).toBe("invalid_grant");
      expect(result.body.error_description).toBe(
        "The refresh token has expired.",
      );
    });

    it("normalizes AADSTS70011 to invalid_scope", async () => {
      const mockFetch = createMockFetch(
        {
          error: "invalid_scope",
          error_description: "AADSTS70011: The requested scope is invalid.",
        },
        400,
      );
      const ctx = makeCtx(mockFetch as unknown as typeof globalThis.fetch, mockLog);

      const result = await handleTokenRequest(
        {
          grant_type: "authorization_code",
          code: "test-code",
          redirect_uri: "http://localhost:3000/callback",
          client_id: CLIENT_ID,
        },
        ctx,
      );

      expect(result.status).toBe(400);
      expect(result.body.error).toBe("invalid_scope");
      expect(result.body.error_description).toBe(
        "The requested scope is invalid.",
      );
    });

    it("normalizes AADSTS65001 to consent_required", async () => {
      const mockFetch = createMockFetch(
        {
          error: "interaction_required",
          error_description:
            "AADSTS65001: The user or administrator has not consented.",
        },
        400,
      );
      const ctx = makeCtx(mockFetch as unknown as typeof globalThis.fetch, mockLog);

      const result = await handleTokenRequest(
        {
          grant_type: "authorization_code",
          code: "test-code",
          redirect_uri: "http://localhost:3000/callback",
          client_id: CLIENT_ID,
        },
        ctx,
      );

      expect(result.status).toBe(400);
      expect(result.body.error).toBe("consent_required");
      expect(result.body.error_description).toBe(
        "User consent is required.",
      );
    });

    it("falls back to invalid_request for unknown AADSTS code", async () => {
      const mockFetch = createMockFetch(
        {
          error: "unknown_error",
          error_description: "AADSTS99999: Something unexpected happened.",
        },
        400,
      );
      const ctx = makeCtx(mockFetch as unknown as typeof globalThis.fetch, mockLog);

      const result = await handleTokenRequest(
        {
          grant_type: "authorization_code",
          code: "test-code",
          redirect_uri: "http://localhost:3000/callback",
          client_id: CLIENT_ID,
        },
        ctx,
      );

      expect(result.status).toBe(400);
      expect(result.body.error).toBe("invalid_request");
    });
  });

  // ---- Non-JSON and network errors ----

  describe("error handling", () => {
    it("returns server_error for non-JSON Azure AD response", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response("<html>Error</html>", {
          status: 502,
          headers: { "Content-Type": "text/html" },
        }),
      );
      const ctx = makeCtx(mockFetch as unknown as typeof globalThis.fetch, mockLog);

      const result = await handleTokenRequest(
        {
          grant_type: "authorization_code",
          code: "test-code",
          redirect_uri: "http://localhost:3000/callback",
          client_id: CLIENT_ID,
        },
        ctx,
      );

      expect(result.status).toBe(502);
      expect(result.body.error).toBe("server_error");
      expect(result.body.error_description).toBe(
        "Authorization server unavailable",
      );
    });

    it("returns server_error when fetch throws (network error)", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
      const ctx = makeCtx(mockFetch as unknown as typeof globalThis.fetch, mockLog);

      const result = await handleTokenRequest(
        {
          grant_type: "authorization_code",
          code: "test-code",
          redirect_uri: "http://localhost:3000/callback",
          client_id: CLIENT_ID,
        },
        ctx,
      );

      expect(result.status).toBe(502);
      expect(result.body.error).toBe("server_error");
      expect(result.body.error_description).toBe(
        "Authorization server unavailable",
      );
    });

    it("mirrors Azure AD HTTP status code on error", async () => {
      const mockFetch = createMockFetch(
        {
          error: "invalid_grant",
          error_description: "AADSTS70008: Code expired.",
        },
        401,
      );
      const ctx = makeCtx(mockFetch as unknown as typeof globalThis.fetch, mockLog);

      const result = await handleTokenRequest(
        {
          grant_type: "authorization_code",
          code: "test-code",
          redirect_uri: "http://localhost:3000/callback",
          client_id: CLIENT_ID,
        },
        ctx,
      );

      expect(result.status).toBe(401);
    });

    it("strips client_secret from outbound body", async () => {
      const mockFetch = createMockFetch({
        access_token: "at",
        token_type: "Bearer",
        expires_in: 3599,
      });
      const ctx = makeCtx(mockFetch as unknown as typeof globalThis.fetch, mockLog);

      await handleTokenRequest(
        {
          grant_type: "authorization_code",
          code: "test-code",
          redirect_uri: "http://localhost:3000/callback",
          client_id: CLIENT_ID,
          client_secret: "should-not-be-sent",
        },
        ctx,
      );

      const params = new URLSearchParams(mockFetch.mock.calls[0][1].body);
      expect(params.has("client_secret")).toBe(false);
    });
  });

  // ---- AADSTS_TO_OAUTH export ----

  describe("AADSTS_TO_OAUTH", () => {
    it("is exported as a lookup table", () => {
      expect(typeof AADSTS_TO_OAUTH).toBe("object");
      expect(AADSTS_TO_OAUTH["AADSTS70008"]).toBe("invalid_grant");
    });
  });
});
