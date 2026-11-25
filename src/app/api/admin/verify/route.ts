import { NextResponse } from "next/server";
import {
  attachAdminSessionCookie,
  clearAdminSessionCookie,
  isAuthorizedRequest,
  unauthorizedResponse,
  verifyBearerToken,
} from "@/lib/auth";

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorizedRequest(request)) {
    return unauthorizedResponse();
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.API_SECRET;
  if (!secret) {
    return unauthorizedResponse();
  }

  // Accept Authorization: Bearer header, existing valid cookie, or JSON `{ passcode }`
  let authorized = isAuthorizedRequest(request);
  if (!authorized) {
    const rawText = await request.text();
    if (rawText.trim().length > 0) {
      try {
        const parsed = JSON.parse(rawText) as { passcode?: unknown };
        if (typeof parsed?.passcode === "string") {
          authorized = verifyBearerToken(`Bearer ${parsed.passcode}`, secret);
        }
      } catch {
        return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
      }
    }
  }

  if (!authorized) {
    return unauthorizedResponse();
  }

  const response = NextResponse.json({ ok: true }, { status: 200 });
  return attachAdminSessionCookie(response, secret);
}

export async function DELETE(): Promise<NextResponse> {
  const response = NextResponse.json({ ok: true }, { status: 200 });
  return clearAdminSessionCookie(response);
}
