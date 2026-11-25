import { NextResponse } from "next/server";
import { parseJsonObject } from "@/lib/admin-validation";
import { isAuthorizedRequest, unauthorizedResponse } from "@/lib/auth";
import { getAppSettings, parseOccurredAt, parseOptionalString } from "@/lib/study-service";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getDayType, getUnivPeriod } from "@/lib/time";
import {
  toAdminSessionDto,
  type CategoryRow,
  type StudySessionRow,
} from "@/lib/types";

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorizedRequest(request)) {
    return unauthorizedResponse();
  }

  const url = new URL(request.url);
  const needsReviewOnly = url.searchParams.get("needs_review") === "true";
  const unregisteredSpotOnly = url.searchParams.get("unregistered_spot") === "true";
  const rawLimit = Number(url.searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 200) : 50;

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("study_sessions")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);

  if (needsReviewOnly) {
    query = query.eq("needs_review", true);
  }
  if (unregisteredSpotOnly) {
    query = query.is("spot_id", null).not("latitude", "is", null).not("longitude", "is", null);
  }

  const [{ data: sessions, error: sessionsError }, { data: categories, error: catError }] =
    await Promise.all([query, supabase.from("categories").select("id, name, color")]);

  if (sessionsError || catError) {
    return NextResponse.json({ error: "Failed to load sessions." }, { status: 500 });
  }

  const catMap = new Map<string, Pick<CategoryRow, "name" | "color">>();
  for (const cat of (categories ?? []) as Array<Pick<CategoryRow, "id" | "name" | "color">>) {
    catMap.set(cat.id, { name: cat.name, color: cat.color });
  }

  const items = ((sessions ?? []) as StudySessionRow[]).map((row) =>
    toAdminSessionDto(row, catMap.get(row.category_id) ?? { name: "Unknown", color: "#6B7280" })
  );

  return NextResponse.json({ sessions: items }, { status: 200 });
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!isAuthorizedRequest(request)) {
    return unauthorizedResponse();
  }

  const parsed = await parseJsonObject(request);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const body = parsed.data;

  const categoryId = parseOptionalString(body.category_id);
  if (!categoryId) {
    return NextResponse.json({ error: "category_id is required." }, { status: 400 });
  }

  if (!body.started_at || !body.ended_at) {
    return NextResponse.json(
      { error: "started_at and ended_at are required for manual session creation." },
      { status: 400 }
    );
  }

  const startRes = parseOccurredAt(body.started_at);
  const endRes = parseOccurredAt(body.ended_at);
  if (!startRes.ok) {
    return NextResponse.json({ error: `started_at: ${startRes.error}` }, { status: 400 });
  }
  if (!endRes.ok) {
    return NextResponse.json({ error: `ended_at: ${endRes.error}` }, { status: 400 });
  }
  if (endRes.date.getTime() < startRes.date.getTime()) {
    return NextResponse.json({ error: "ended_at must be >= started_at." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: category } = await supabase
    .from("categories")
    .select("id, name, color")
    .eq("id", categoryId)
    .maybeSingle();

  if (!category) {
    return NextResponse.json({ error: "Category not found." }, { status: 404 });
  }

  const spotId = parseOptionalString(body.spot_id) ?? null;
  let locationLabel = parseOptionalString(body.location_label) ?? "Other";

  if (spotId) {
    const { data: spot } = await supabase
      .from("spots")
      .select("id, name")
      .eq("id", spotId)
      .maybeSingle();
    if (!spot) {
      return NextResponse.json({ error: "Spot not found." }, { status: 404 });
    }
    locationLabel = spot.name;
  }

  const settings = await getAppSettings(supabase);
  const durationSec = Math.round((endRes.date.getTime() - startRes.date.getTime()) / 1000);

  const { data: inserted, error: insertError } = await supabase
    .from("study_sessions")
    .insert({
      category_id: category.id,
      spot_id: spotId,
      location_label: locationLabel,
      memo: parseOptionalString(body.memo) ?? null,
      tag_id: "web_manual",
      day_type: getDayType(startRes.date, settings.day_boundary_hour),
      univ_period: getUnivPeriod(startRes.date, settings.univ_periods),
      started_at: startRes.date.toISOString(),
      ended_at: endRes.date.toISOString(),
      duration_sec: durationSec,
      needs_review: false,
    })
    .select("*")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json({ error: "Failed to create manual session." }, { status: 500 });
  }

  return NextResponse.json(
    { session: toAdminSessionDto(inserted as StudySessionRow, category) },
    { status: 201 }
  );
}
