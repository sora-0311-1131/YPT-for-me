import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

export const ADMIN_SESSION_COOKIE = "ypt_admin_session";
const ADMIN_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 days

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Derives an opaque HMAC-SHA256 cookie token from `API_SECRET` so the raw secret
 * is never stored in cookies or exposed to client-side JavaScript.
 */
export function computeAdminCookieToken(secret: string): string {
  return createHmac("sha256", secret).update("ypt-for-me:admin-session:v1").digest("hex");
}

function parseCookieHeader(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

/**
 * Validates `Authorization: Bearer <API_SECRET>` using constant-time comparison.
 */
export function verifyBearerToken(
  authHeader: string | null,
  expectedSecret: string | undefined = process.env.API_SECRET
): boolean {
  if (!expectedSecret || !authHeader) {
    return false;
  }

  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!match) {
    return false;
  }

  return safeEqual(match[1], expectedSecret);
}

/**
 * Validates the HttpOnly admin session cookie using constant-time comparison.
 */
export function verifyAdminCookie(
  cookieHeader: string | null,
  expectedSecret: string | undefined = process.env.API_SECRET
): boolean {
  if (!expectedSecret || !cookieHeader) {
    return false;
  }

  const cookieValue = parseCookieHeader(cookieHeader, ADMIN_SESSION_COOKIE);
  if (!cookieValue) {
    return false;
  }

  return safeEqual(cookieValue, computeAdminCookieToken(expectedSecret));
}

export function isAuthorizedRequest(request: Request): boolean {
  return (
    verifyBearerToken(request.headers.get("authorization")) ||
    verifyAdminCookie(request.headers.get("cookie"))
  );
}

export function attachAdminSessionCookie(response: NextResponse, secret: string): NextResponse {
  response.cookies.set(ADMIN_SESSION_COOKIE, computeAdminCookieToken(secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_COOKIE_MAX_AGE_SEC,
  });
  return response;
}

export function clearAdminSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export function unauthorizedResponse(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
