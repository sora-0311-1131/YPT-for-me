import { NextResponse } from "next/server";
import { parseJsonObject, validateUnivPeriods } from "@/lib/admin-validation";
import { isAuthorizedRequest, unauthorizedResponse } from "@/lib/auth";
import { getAppSettings } from "@/lib/study-service";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorizedRequest(request)) {
    return unauthorizedResponse();
  }

  const supabase = getSupabaseAdmin();
  const settings = await getAppSettings(supabase);
  return NextResponse.json({ settings }, { status: 200 });
}

export async function PATCH(request: Request): Promise<NextResponse> {
  if (!isAuthorizedRequest(request)) {
    return unauthorizedResponse();
  }

  const parsed = await parseJsonObject(request);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const body = parsed.data;
  const updates: Record<string, unknown> = {};

  if (body.day_boundary_hour !== undefined) {
    if (
      typeof body.day_boundary_hour !== "number" ||
      !Number.isInteger(body.day_boundary_hour) ||
      body.day_boundary_hour < 0 ||
      body.day_boundary_hour > 6
    ) {
      return NextResponse.json(
        { error: "day_boundary_hour must be an integer between 0 and 6." },
        { status: 400 }
      );
    }
    updates.day_boundary_hour = body.day_boundary_hour;
  }

  if (body.streak_min_minutes !== undefined) {
    if (
      typeof body.streak_min_minutes !== "number" ||
      !Number.isInteger(body.streak_min_minutes) ||
      body.streak_min_minutes < 0 ||
      body.streak_min_minutes > 1440
    ) {
      return NextResponse.json(
        { error: "streak_min_minutes must be an integer between 0 and 1440." },
        { status: 400 }
      );
    }
    updates.streak_min_minutes = body.streak_min_minutes;
  }

  if (body.daily_goal_weekday_min !== undefined) {
    if (
      typeof body.daily_goal_weekday_min !== "number" ||
      !Number.isInteger(body.daily_goal_weekday_min) ||
      body.daily_goal_weekday_min <= 0 ||
      body.daily_goal_weekday_min > 1440
    ) {
      return NextResponse.json(
        { error: "daily_goal_weekday_min must be an integer between 1 and 1440." },
        { status: 400 }
      );
    }
    updates.daily_goal_weekday_min = body.daily_goal_weekday_min;
  }

  if (body.daily_goal_weekend_min !== undefined) {
    if (
      typeof body.daily_goal_weekend_min !== "number" ||
      !Number.isInteger(body.daily_goal_weekend_min) ||
      body.daily_goal_weekend_min <= 0 ||
      body.daily_goal_weekend_min > 1440
    ) {
      return NextResponse.json(
        { error: "daily_goal_weekend_min must be an integer between 1 and 1440." },
        { status: 400 }
      );
    }
    updates.daily_goal_weekend_min = body.daily_goal_weekend_min;
  }

  if (body.long_session_warn_min !== undefined) {
    if (
      typeof body.long_session_warn_min !== "number" ||
      !Number.isInteger(body.long_session_warn_min) ||
      body.long_session_warn_min <= 0 ||
      body.long_session_warn_min > 2880
    ) {
      return NextResponse.json(
        { error: "long_session_warn_min must be an integer between 1 and 2880." },
        { status: 400 }
      );
    }
    updates.long_session_warn_min = body.long_session_warn_min;
  }

  if (body.univ_periods !== undefined) {
    const periodsRes = validateUnivPeriods(body.univ_periods);
    if (!periodsRes.ok) {
      return NextResponse.json({ error: periodsRes.error }, { status: 400 });
    }
    updates.univ_periods = periodsRes.periods;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("app_settings")
    .update(updates)
    .eq("id", 1)
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Failed to update settings." }, { status: 500 });
  }

  return NextResponse.json({ settings: data }, { status: 200 });
}
