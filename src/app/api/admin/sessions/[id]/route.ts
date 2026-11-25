import { NextResponse } from "next/server";
import { parseJsonObject } from "@/lib/admin-validation";
import { isAuthorizedRequest, unauthorizedResponse } from "@/lib/auth";
import { getAppSettings, parseOccurredAt, parseOptionalString } from "@/lib/study-service";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getDayType, getUnivPeriod } from "@/lib/time";
import { toAdminSessionDto, type StudySessionRow } from "@/lib/types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  if (!isAuthorizedRequest(request)) {
    return unauthorizedResponse();
  }

  const { id } = await context.params;
  const parsed = await parseJsonObject(request);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const body = parsed.data;

  const supabase = getSupabaseAdmin();
  const { data: existing, error: findError } = await supabase
    .from("study_sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (findError) {
    return NextResponse.json({ error: "Failed to fetch session." }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  const current = existing as StudySessionRow;
  const updates: Record<string, unknown> = {};

  let nextStartedAt = new Date(current.started_at);
  let nextEndedAt: Date | null = current.ended_at ? new Date(current.ended_at) : null;

  if (body.started_at !== undefined) {
    if (typeof body.started_at !== "string" || body.started_at.trim().length === 0) {
      return NextResponse.json(
        { error: "started_at must be a non-empty ISO 8601 timestamp string." },
        { status: 400 }
      );
    }
    const res = parseOccurredAt(body.started_at);
    if (!res.ok) {
      return NextResponse.json({ error: `started_at: ${res.error}` }, { status: 400 });
    }
    nextStartedAt = res.date;
    updates.started_at = nextStartedAt.toISOString();

    const settings = await getAppSettings(supabase);
    updates.day_type = getDayType(nextStartedAt, settings.day_boundary_hour);
    updates.univ_period = getUnivPeriod(nextStartedAt, settings.univ_periods);
  }

  if (body.ended_at !== undefined) {
    if (body.ended_at === null) {
      nextEndedAt = null;
      updates.ended_at = null;
      updates.duration_sec = null;
    } else {
      if (typeof body.ended_at !== "string" || body.ended_at.trim().length === 0) {
        return NextResponse.json(
          { error: "ended_at must be null or a non-empty ISO 8601 timestamp string." },
          { status: 400 }
        );
      }
      const res = parseOccurredAt(body.ended_at);
      if (!res.ok) {
        return NextResponse.json({ error: `ended_at: ${res.error}` }, { status: 400 });
      }
      nextEndedAt = res.date;
      updates.ended_at = nextEndedAt.toISOString();
    }
  }

  if (nextEndedAt !== null) {
    if (nextEndedAt.getTime() < nextStartedAt.getTime()) {
      return NextResponse.json({ error: "ended_at must be >= started_at." }, { status: 400 });
    }
    if (body.started_at !== undefined || body.ended_at !== undefined) {
      updates.duration_sec = Math.round((nextEndedAt.getTime() - nextStartedAt.getTime()) / 1000);
    }
  }

  if (body.category_id !== undefined) {
    const categoryId = parseOptionalString(body.category_id);
    if (!categoryId) {
      return NextResponse.json({ error: "category_id must be a non-empty string." }, { status: 400 });
    }
    const { data: cat } = await supabase
      .from("categories")
      .select("id")
      .eq("id", categoryId)
      .maybeSingle();
    if (!cat) {
      return NextResponse.json({ error: "Category not found." }, { status: 404 });
    }
    updates.category_id = categoryId;
  }

  if (body.spot_id !== undefined) {
    if (body.spot_id === null || body.spot_id === "") {
      updates.spot_id = null;
      if (body.location_label === undefined) {
        updates.location_label = "Other";
      }
    } else {
      const spotId = parseOptionalString(body.spot_id);
      if (!spotId) {
        return NextResponse.json({ error: "Invalid spot_id." }, { status: 400 });
      }
      const { data: spot } = await supabase
        .from("spots")
        .select("id, name")
        .eq("id", spotId)
        .maybeSingle();
      if (!spot) {
        return NextResponse.json({ error: "Spot not found." }, { status: 404 });
      }
      updates.spot_id = spot.id;
      updates.location_label = spot.name;
    }
  }

  if (body.location_label !== undefined) {
    const label = parseOptionalString(body.location_label);
    if (!label) {
      return NextResponse.json({ error: "location_label must be non-empty." }, { status: 400 });
    }
    updates.location_label = label;
  }

  if (body.memo !== undefined) {
    updates.memo = parseOptionalString(body.memo) ?? null;
  }

  if (body.needs_review !== undefined) {
    if (typeof body.needs_review !== "boolean") {
      return NextResponse.json({ error: "needs_review must be a boolean." }, { status: 400 });
    }
    updates.needs_review = body.needs_review;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided." }, { status: 400 });
  }

  const { data: updated, error: updateError } = await supabase
    .from("study_sessions")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (updateError) {
    if (updateError.code === "23505") {
      return NextResponse.json(
        { error: "Cannot reopen session while another session is active." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Failed to update session." }, { status: 500 });
  }

  const updatedRow = updated as StudySessionRow;
  const { data: cat } = await supabase
    .from("categories")
    .select("name, color")
    .eq("id", updatedRow.category_id)
    .maybeSingle();

  return NextResponse.json(
    { session: toAdminSessionDto(updatedRow, cat ?? { name: "Unknown", color: "#6B7280" }) },
    { status: 200 }
  );
}

export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  if (!isAuthorizedRequest(request)) {
    return unauthorizedResponse();
  }

  const { id } = await context.params;
  const supabase = getSupabaseAdmin();

  const { data: deleted, error } = await supabase
    .from("study_sessions")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to delete session." }, { status: 500 });
  }
  if (!deleted) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  return NextResponse.json({ deleted_id: deleted.id }, { status: 200 });
}
