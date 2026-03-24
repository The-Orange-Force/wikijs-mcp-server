import { describe, it, expect } from "vitest";
import * as jose from "jose";
import {
  mapJoseErrorToRfc6750,
  mapMissingTokenError,
  mapInsufficientScopeError,
  type Rfc6750Error,
} from "../src/auth-errors.js";

const METADATA_URL = "https://mcp.example.com/.well-known/oauth-protected-resource";

describe("mapJoseErrorToRfc6750", () => {
  it("maps JWTExpired to 401 invalid_token with 'Token expired'", () => {
    const err = new jose.errors.JWTExpired("token expired");
    const result = mapJoseErrorToRfc6750(err, METADATA_URL);

    expect(result.statusCode).toBe(401);
    expect(result.error).toBe("invalid_token");
    expect(result.errorDescription).toBe("Token expired");
    expect(result.wwwAuthenticate).toContain('error="invalid_token"');
    expect(result.wwwAuthenticate).toContain('error_description="Token expired"');
    expect(result.wwwAuthenticate).toContain(`resource_metadata="${METADATA_URL}"`);
    expect(result.wwwAuthenticate).toContain('realm="mcp"');
  });

  it("maps JWTClaimValidationFailed with claim='aud' to 'Invalid audience'", () => {
    const err = new jose.errors.JWTClaimValidationFailed("audience mismatch", {}, "aud");
    const result = mapJoseErrorToRfc6750(err, METADATA_URL);

    expect(result.statusCode).toBe(401);
    expect(result.error).toBe("invalid_token");
    expect(result.errorDescription).toBe("Invalid audience");
    expect(result.wwwAuthenticate).toContain(`resource_metadata="${METADATA_URL}"`);
  });

  it("maps JWTClaimValidationFailed with claim='iss' to 'Invalid issuer'", () => {
    const err = new jose.errors.JWTClaimValidationFailed("issuer mismatch", {}, "iss");
    const result = mapJoseErrorToRfc6750(err, METADATA_URL);

    expect(result.statusCode).toBe(401);
    expect(result.error).toBe("invalid_token");
    expect(result.errorDescription).toBe("Invalid issuer");
  });

  it("maps JWTClaimValidationFailed with claim='nbf' to generic claim message", () => {
    const err = new jose.errors.JWTClaimValidationFailed("not before", {}, "nbf");
    const result = mapJoseErrorToRfc6750(err, METADATA_URL);

    expect(result.statusCode).toBe(401);
    expect(result.error).toBe("invalid_token");
    expect(result.errorDescription).toBe("Claim validation failed: nbf");
  });

  it("maps JWSSignatureVerificationFailed to 401 with 'Signature verification failed'", () => {
    const err = new jose.errors.JWSSignatureVerificationFailed("bad sig");
    const result = mapJoseErrorToRfc6750(err, METADATA_URL);

    expect(result.statusCode).toBe(401);
    expect(result.error).toBe("invalid_token");
    expect(result.errorDescription).toBe("Signature verification failed");
    expect(result.wwwAuthenticate).toContain(`resource_metadata="${METADATA_URL}"`);
  });

  it("maps JWKSNoMatchingKey to 401 with 'No matching signing key'", () => {
    const err = new jose.errors.JWKSNoMatchingKey("no key");
    const result = mapJoseErrorToRfc6750(err, METADATA_URL);

    expect(result.statusCode).toBe(401);
    expect(result.error).toBe("invalid_token");
    expect(result.errorDescription).toBe("No matching signing key");
    expect(result.wwwAuthenticate).toContain(`resource_metadata="${METADATA_URL}"`);
  });

  it("maps JWKSTimeout to 503 temporarily_unavailable without resource_metadata", () => {
    const err = new jose.errors.JWKSTimeout("timeout");
    const result = mapJoseErrorToRfc6750(err, METADATA_URL);

    expect(result.statusCode).toBe(503);
    expect(result.error).toBe("temporarily_unavailable");
    expect(result.errorDescription).toBe("Authorization server unreachable");
    expect(result.wwwAuthenticate).not.toContain("resource_metadata");
  });

  it("maps unknown error to 401 invalid_token with generic message", () => {
    const err = new Error("something unexpected");
    const result = mapJoseErrorToRfc6750(err, METADATA_URL);

    expect(result.statusCode).toBe(401);
    expect(result.error).toBe("invalid_token");
    expect(result.errorDescription).toBe("Invalid or malformed token");
    expect(result.wwwAuthenticate).toContain(`resource_metadata="${METADATA_URL}"`);
  });

  it("includes resource_metadata in wwwAuthenticate for all 401 responses", () => {
    const errors = [
      new jose.errors.JWTExpired("expired"),
      new jose.errors.JWSSignatureVerificationFailed("bad"),
      new jose.errors.JWKSNoMatchingKey("no key"),
      new Error("unknown"),
    ];

    for (const err of errors) {
      const result = mapJoseErrorToRfc6750(err, METADATA_URL);
      expect(result.statusCode).toBe(401);
      expect(result.wwwAuthenticate).toContain(`resource_metadata="${METADATA_URL}"`);
    }
  });

  it("does NOT include resource_metadata in wwwAuthenticate for 503", () => {
    const err = new jose.errors.JWKSTimeout("timeout");
    const result = mapJoseErrorToRfc6750(err, METADATA_URL);

    expect(result.statusCode).toBe(503);
    expect(result.wwwAuthenticate).not.toContain("resource_metadata");
  });
});

describe("mapMissingTokenError", () => {
  it("returns 401 invalid_request with 'No access token provided'", () => {
    const result = mapMissingTokenError(METADATA_URL);

    expect(result.statusCode).toBe(401);
    expect(result.error).toBe("invalid_request");
    expect(result.errorDescription).toBe("No access token provided");
    expect(result.wwwAuthenticate).toContain('realm="mcp"');
    expect(result.wwwAuthenticate).toContain(`resource_metadata="${METADATA_URL}"`);
  });
});

describe("mapInsufficientScopeError", () => {
  it("returns 403 insufficient_scope with scope parameter", () => {
    const scopes = ["mcp.tools.read", "mcp.tools.write"];
    const result = mapInsufficientScopeError(METADATA_URL, scopes);

    expect(result.statusCode).toBe(403);
    expect(result.error).toBe("insufficient_scope");
    expect(result.wwwAuthenticate).toContain('realm="mcp"');
    expect(result.wwwAuthenticate).toContain('scope="mcp.tools.read mcp.tools.write"');
    expect(result.wwwAuthenticate).toContain(`resource_metadata="${METADATA_URL}"`);
  });

  it("handles single scope", () => {
    const result = mapInsufficientScopeError(METADATA_URL, ["mcp.tools.read"]);

    expect(result.statusCode).toBe(403);
    expect(result.error).toBe("insufficient_scope");
    expect(result.wwwAuthenticate).toContain('scope="mcp.tools.read"');
  });
});
