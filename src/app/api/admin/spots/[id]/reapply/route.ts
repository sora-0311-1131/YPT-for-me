import { NextResponse } from "next/server";
import { isAuthorizedRequest, unauthorizedResponse } from "@/lib/auth";
import { findMatchingSpot } from "@/lib/geo";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { SpotRow } from "@/lib/types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Re-evaluates registered spots (using nested smallest-radius priority) against
 * historical sessions with recorded coordinates.
 * Defaults to unregistered sessions (`spot_id IS NULL`); pass `{ "include_all": true }`
 * to re-evaluate all sessions with coordinates.
 */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  if (!isAuthorizedRequest(request)) {
    return unauthorizedResponse();
  }

  const { id } = await context.params;
  let includeAll = false;
  const rawText = await request.text();
  if (rawText.trim().length > 0) {
    try {
      const parsed = JSON.parse(rawText);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
      }
      const rawIncludeAll = (parsed as Record<string, unknown>).include_all;
      if (rawIncludeAll !== undefined && typeof rawIncludeAll !== "boolean") {
        return NextResponse.json({ error: "include_all must be a boolean." }, { status: 400 });
      }
      includeAll = rawIncludeAll ?? false;
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }
  }

  const supabase = getSupabaseAdmin();
  const { data: allSpots, error: spotsError } = await supabase.from("spots").select("*");
  if (spotsError) {
    return NextResponse.json({ error: "Failed to load spots." }, { status: 500 });
  }

  const spots = (allSpots ?? []) as SpotRow[];
  if (!spots.some((s) => s.id === id)) {
    return NextResponse.json({ error: "Spot not found." }, { status: 404 });
  }

  let sessionsQuery = supabase
    .from("study_sessions")
    .select("id, spot_id, location_label, latitude, longitude")
    .not("latitude", "is", null)
    .not("longitude", "is", null);

  if (!includeAll) {
    sessionsQuery = sessionsQuery.is("spot_id", null);
  }

  const { data: sessions, error: sessionsError } = await sessionsQuery;
  if (sessionsError) {
    return NextResponse.json({ error: "Failed to load sessions for reapply." }, { status: 500 });
  }

  let updatedCount = 0;
  for (const row of sessions ?? []) {
    const match = findMatchingSpot(row.latitude, row.longitude, spots);
    const nextSpotId = match?.spot.id ?? null;
    const nextLabel = match?.spot.name ?? "Other";

    if (row.spot_id !== nextSpotId || row.location_label !== nextLabel) {
      const { error: updateError } = await supabase
        .from("study_sessions")
        .update({ spot_id: nextSpotId, location_label: nextLabel })
        .eq("id", row.id);
      if (!updateError) {
        updatedCount += 1;
      }
    }
  }

  return NextResponse.json(
    {
      evaluated_count: (sessions ?? []).length,
      updated_count: updatedCount,
    },
    { status: 200 }
  );
}
