import { NextResponse } from "next/server";
import { isAuthorizedRequest, unauthorizedResponse } from "@/lib/auth";
import { parseSyncEvents, syncStudyEvents } from "@/lib/study-sync";
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

  const eventsResult = parseSyncEvents(body.events);
  if (!eventsResult.ok) {
    return NextResponse.json({ error: eventsResult.error }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const response = await syncStudyEvents(supabase, eventsResult.events);
  return NextResponse.json(response, { status: 200 });
}
