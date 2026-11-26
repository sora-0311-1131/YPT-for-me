import { NextResponse } from "next/server";
import { isAuthorizedRequest, unauthorizedResponse } from "@/lib/auth";
import {
  parseCoordinates,
  parseOccurredAt,
  parseOptionalString,
  startStudySession,
} from "@/lib/study-service";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function POST(request: Request): Promise<NextResponse> {
  if (!isAuthorizedRequest(request)) {
    return unauthorizedResponse();
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const occurredResult = parseOccurredAt(body.occurred_at);
  if (!occurredResult.ok) {
    return NextResponse.json({ error: occurredResult.error }, { status: 400 });
  }

  const coordsResult = parseCoordinates(body.latitude, body.longitude);
  if (!coordsResult.ok) {
    return NextResponse.json({ error: coordsResult.error }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const result = await startStudySession(supabase, {
    client_event_id: parseOptionalString(body.client_event_id) ?? null,
    category_id: parseOptionalString(body.category_id) ?? null,
    category_name: parseOptionalString(body.category_name) ?? null,
    memo: parseOptionalString(body.memo) ?? null,
    tag_id: parseOptionalString(body.tag_id) ?? null,
    wifi_ssid: parseOptionalString(body.wifi_ssid) ?? null,
    latitude: coordsResult.latitude,
    longitude: coordsResult.longitude,
    occurred_at: occurredResult.date,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data, { status: result.data.already_exists ? 200 : 201 });
}
