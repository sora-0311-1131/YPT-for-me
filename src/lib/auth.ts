import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

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

  const provided = Buffer.from(match[1], "utf8");
  const expected = Buffer.from(expectedSecret, "utf8");

  if (provided.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(provided, expected);
}

export function isAuthorizedRequest(request: Request): boolean {
  return verifyBearerToken(request.headers.get("authorization"));
}

export function unauthorizedResponse(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
