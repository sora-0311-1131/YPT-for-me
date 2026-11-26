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

  const PAGE_SIZE = 500;
  let lastId: string | null = null;
  let evaluatedCount = 0;
  let updatedCount = 0;
  const failedSessionIds: string[] = [];

  while (true) {
    let sessionsQuery = supabase
      .from("study_sessions")
      .select("id, spot_id, location_label, latitude, longitude, wifi_ssid")
      .or("and(latitude.not.is.null,longitude.not.is.null),wifi_ssid.not.is.null")
      .order("id", { ascending: true })
      .limit(PAGE_SIZE);

    if (!includeAll) {
      sessionsQuery = sessionsQuery.is("spot_id", null);
    }
    if (lastId !== null) {
      sessionsQuery = sessionsQuery.gt("id", lastId);
    }

    const { data: batch, error: sessionsError } = await sessionsQuery;
    if (sessionsError) {
      return NextResponse.json(
        {
          error: "Failed to load sessions for reapply.",
          evaluated_count: evaluatedCount,
          updated_count: updatedCount,
          failed_count: failedSessionIds.length,
          failed_session_ids: failedSessionIds,
        },
        { status: 500 }
      );
    }

    const rows = batch ?? [];
    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      evaluatedCount += 1;
      const match = findMatchingSpot(row.latitude, row.longitude, spots, row.wifi_ssid);
      const nextSpotId = match?.spot.id ?? null;
      const nextLabel = match?.spot.name ?? "Other";

      if (row.spot_id !== nextSpotId || row.location_label !== nextLabel) {
        const { error: updateError } = await supabase
          .from("study_sessions")
          .update({ spot_id: nextSpotId, location_label: nextLabel })
          .eq("id", row.id);
        if (updateError) {
          failedSessionIds.push(row.id);
        } else {
          updatedCount += 1;
        }
      }
    }

    lastId = rows[rows.length - 1].id;
    if (rows.length < PAGE_SIZE) {
      break;
    }
  }

  const failedCount = failedSessionIds.length;
  return NextResponse.json(
    {
      evaluated_count: evaluatedCount,
      updated_count: updatedCount,
      failed_count: failedCount,
      failed_session_ids: failedSessionIds,
    },
    { status: failedCount > 0 ? 500 : 200 }
  );
}
