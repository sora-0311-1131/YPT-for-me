import { describe, expect, it } from "vitest";
import { verifyBearerToken } from "../auth";

describe("verifyBearerToken", () => {
  it("accepts matching Bearer token (case-insensitive scheme)", () => {
    expect(verifyBearerToken("Bearer super-secret-123", "super-secret-123")).toBe(true);
    expect(verifyBearerToken("bearer super-secret-123", "super-secret-123")).toBe(true);
  });

  it("rejects wrong token, wrong length, missing scheme, or missing secret", () => {
    expect(verifyBearerToken("Bearer wrong-secret-123", "super-secret-123")).toBe(false);
    expect(verifyBearerToken("Bearer short", "super-secret-123")).toBe(false);
    expect(verifyBearerToken("Basic super-secret-123", "super-secret-123")).toBe(false);
    expect(verifyBearerToken(null, "super-secret-123")).toBe(false);
    expect(verifyBearerToken("Bearer super-secret-123", undefined)).toBe(false);
    expect(verifyBearerToken("Bearer super-secret-123", "")).toBe(false);
  });
});
