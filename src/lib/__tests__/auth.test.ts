import { describe, expect, it } from "vitest";
import {
  ADMIN_SESSION_COOKIE,
  computeAdminCookieToken,
  verifyAdminCookie,
  verifyBearerToken,
} from "../auth";

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

describe("verifyAdminCookie", () => {
  it("accepts valid HMAC-derived session cookie and rejects raw secret or tampered cookie", () => {
    const token = computeAdminCookieToken("super-secret-123");
    expect(token).not.toBe("super-secret-123");
    expect(verifyAdminCookie(`${ADMIN_SESSION_COOKIE}=${token}`, "super-secret-123")).toBe(true);
    expect(
      verifyAdminCookie(`other=1; ${ADMIN_SESSION_COOKIE}=${token}; foo=bar`, "super-secret-123")
    ).toBe(true);
    expect(
      verifyAdminCookie(`${ADMIN_SESSION_COOKIE}=super-secret-123`, "super-secret-123")
    ).toBe(false);
    expect(verifyAdminCookie(`${ADMIN_SESSION_COOKIE}=tampered`, "super-secret-123")).toBe(false);
    expect(verifyAdminCookie(null, "super-secret-123")).toBe(false);
  });
});
