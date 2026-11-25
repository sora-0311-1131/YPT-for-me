import { NextResponse } from "next/server";
import { isAuthorizedRequest, unauthorizedResponse } from "@/lib/auth";
import {
  parseOccurredAt,
  parseOptionalString,
  stopStudySession,
} from "@/lib/study-service";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function POST(request: Request): Promise<NextResponse> {
  if (!isAuthorizedRequest(request)) {
    return unauthorizedResponse();
  }

  let body: Record<string, unknown> = {};
  const rawText = await request.text();
  if (rawText.trim().length > 0) {
    try {
      const parsed = JSON.parse(rawText);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }
  }

  const occurredResult = parseOccurredAt(body.occurred_at);
  if (!occurredResult.ok) {
    return NextResponse.json({ error: occurredResult.error }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const result = await stopStudySession(supabase, {
    client_event_id: parseOptionalString(body.client_event_id) ?? null,
    occurred_at: occurredResult.date,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data, { status: 200 });
}
