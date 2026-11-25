import type { SupabaseClient } from "@supabase/supabase-js";
import { findMatchingSpot, isValidCoordinate } from "./geo";
import {
  getDayType,
  getLogicalDateJst,
  getLogicalDayBoundsUtc,
  getUnivPeriod,
} from "./time";
import type {
  AppSettingsRow,
  CategoryRow,
  SpotRow,
  StudySessionRow,
  UnivPeriod,
} from "./types";
import { fetchWeatherSnapshot } from "./weather";

const DEFAULT_UNIV_PERIODS: UnivPeriod[] = [
  { key: "morning", label: "朝", start: "04:00", end: "08:50" },
  { key: "period_1", label: "1限", start: "08:50", end: "10:20" },
  { key: "period_2", label: "2限", start: "10:30", end: "12:00" },
  { key: "lunch", label: "昼休み", start: "12:00", end: "13:00" },
  { key: "period_3", label: "3限", start: "13:00", end: "14:30" },
  { key: "period_4", label: "4限", start: "14:40", end: "16:10" },
  { key: "period_5", label: "5限", start: "16:20", end: "17:50" },
  { key: "after_school", label: "放課後", start: "17:50", end: "23:00" },
  { key: "late_night", label: "深夜", start: "23:00", end: "04:00" },
];

export const DEFAULT_APP_SETTINGS: AppSettingsRow = {
  id: 1,
  day_boundary_hour: 4,
  streak_min_minutes: 30,
  daily_goal_weekday_min: 180,
  daily_goal_weekend_min: 360,
  long_session_warn_min: 360,
  univ_periods: DEFAULT_UNIV_PERIODS,
  updated_at: new Date(0).toISOString(),
};

export interface StudyServiceError {
  ok: false;
  status: number;
  error: string;
}

export type ServiceResult<T> = ({ ok: true } & T) | StudyServiceError;

export function parseOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseOccurredAt(value: unknown): { ok: true; date: Date } | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") {
    return { ok: true, date: new Date() };
  }
  if (typeof value !== "string") {
    return { ok: false, error: "occurred_at must be an ISO 8601 timestamp string." };
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, error: "occurred_at is not a valid timestamp." };
  }
  return { ok: true, date };
}

export function parseCoordinates(
  latitude: unknown,
  longitude: unknown
): { ok: true; latitude: number | null; longitude: number | null } | { ok: false; error: string } {
  const hasLat = latitude !== undefined && latitude !== null && latitude !== "";
  const hasLng = longitude !== undefined && longitude !== null && longitude !== "";

  if (!hasLat && !hasLng) {
    return { ok: true, latitude: null, longitude: null };
  }
  if (hasLat !== hasLng) {
    return { ok: false, error: "Both latitude and longitude must be provided together." };
  }

  const latNum = typeof latitude === "number" ? latitude : Number(latitude);
  const lngNum = typeof longitude === "number" ? longitude : Number(longitude);

  if (!isValidCoordinate(latNum, lngNum)) {
    return { ok: false, error: "latitude/longitude values are out of valid WGS84 range." };
  }

  return { ok: true, latitude: latNum, longitude: lngNum };
}

export async function getAppSettings(supabase: SupabaseClient): Promise<AppSettingsRow> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error || !data) {
    return DEFAULT_APP_SETTINGS;
  }

  return data as AppSettingsRow;
}

async function resolveCategory(
  supabase: SupabaseClient,
  input: { category_id?: string | null; category_name?: string | null }
): Promise<CategoryRow | null> {
  if (input.category_id) {
    const { data } = await supabase
      .from("categories")
      .select("*")
      .eq("id", input.category_id)
      .maybeSingle();
    if (data) return data as CategoryRow;
  }

  if (input.category_name) {
    const { data } = await supabase
      .from("categories")
      .select("*")
      .eq("name", input.category_name)
      .maybeSingle();
    if (data) return data as CategoryRow;
  }

  return null;
}

async function computeTodayTotalMinutes(
  supabase: SupabaseClient,
  referenceDate: Date,
  dayBoundaryHour: number
): Promise<number> {
  const logicalDate = getLogicalDateJst(referenceDate, dayBoundaryHour);
  const { startIso, endIso } = getLogicalDayBoundsUtc(logicalDate, dayBoundaryHour);

  const { data, error } = await supabase
    .from("study_sessions")
    .select("duration_sec")
    .gte("started_at", startIso)
    .lt("started_at", endIso)
    .not("duration_sec", "is", null);

  if (error || !data) {
    return 0;
  }

  const totalSec = data.reduce((sum, row) => sum + (Number(row.duration_sec) || 0), 0);
  return Math.round(totalSec / 60);
}

export interface StudyStatusActive {
  is_active: true;
  active_session: {
    id: string;
    category_id: string;
    category_name: string;
    started_at: string;
  };
}

export interface StudyStatusIdle {
  is_active: false;
  last_category: { id: string; name: string } | null;
  categories: Array<{ id: string; name: string; color: string }>;
}

export async function getStudyStatus(
  supabase: SupabaseClient
): Promise<ServiceResult<{ data: StudyStatusActive | StudyStatusIdle }>> {
  const { data: activeRow, error: activeError } = await supabase
    .from("study_sessions")
    .select("id, category_id, started_at")
    .is("ended_at", null)
    .maybeSingle();

  if (activeError) {
    return { ok: false, status: 500, error: "Failed to query active study session." };
  }

  if (activeRow) {
    const { data: cat } = await supabase
      .from("categories")
      .select("name")
      .eq("id", activeRow.category_id)
      .maybeSingle();

    return {
      ok: true,
      data: {
        is_active: true,
        active_session: {
          id: activeRow.id,
          category_id: activeRow.category_id,
          category_name: cat?.name ?? "Unknown",
          started_at: activeRow.started_at,
        },
      },
    };
  }

  const [{ data: categories, error: catError }, { data: lastSession }] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, color")
      .eq("is_archived", false)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("study_sessions")
      .select("category_id")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (catError) {
    return { ok: false, status: 500, error: "Failed to load categories." };
  }

  const activeCategories = (categories ?? []) as Array<{ id: string; name: string; color: string }>;

  let lastCategory: { id: string; name: string } | null = null;
  if (lastSession?.category_id) {
    const matched = activeCategories.find((c) => c.id === lastSession.category_id);
    if (matched) {
      lastCategory = { id: matched.id, name: matched.name };
    }
  }
  if (!lastCategory && activeCategories.length > 0) {
    lastCategory = { id: activeCategories[0].id, name: activeCategories[0].name };
  }

  return {
    ok: true,
    data: {
      is_active: false,
      last_category: lastCategory,
      categories: activeCategories,
    },
  };
}

export interface StartStudyInput {
  client_event_id?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  memo?: string | null;
  tag_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  occurred_at?: Date;
  skip_weather?: boolean;
}

export interface StartStudyResponse {
  status: "started";
  already_exists: boolean;
  session_id: string;
  category_id: string;
  category_name: string;
  location_label: string;
  started_at: string;
}

export async function startStudySession(
  supabase: SupabaseClient,
  input: StartStudyInput
): Promise<ServiceResult<{ data: StartStudyResponse }>> {
  // 1. Idempotency check by start_event_id
  if (input.client_event_id) {
    const { data: existing } = await supabase
      .from("study_sessions")
      .select("id, category_id, location_label, started_at")
      .eq("start_event_id", input.client_event_id)
      .maybeSingle();

    if (existing) {
      const { data: cat } = await supabase
        .from("categories")
        .select("name")
        .eq("id", existing.category_id)
        .maybeSingle();

      return {
        ok: true,
        data: {
          status: "started",
          already_exists: true,
          session_id: existing.id,
          category_id: existing.category_id,
          category_name: cat?.name ?? "Unknown",
          location_label: existing.location_label,
          started_at: existing.started_at,
        },
      };
    }
  }

  // 2. Check if another session is currently active
  const { data: activeRow, error: activeError } = await supabase
    .from("study_sessions")
    .select("id")
    .is("ended_at", null)
    .maybeSingle();

  if (activeError) {
    return { ok: false, status: 500, error: "Failed to check active session." };
  }
  if (activeRow) {
    return { ok: false, status: 409, error: "A study session is already active." };
  }

  // 3. Resolve category
  const category = await resolveCategory(supabase, {
    category_id: input.category_id,
    category_name: input.category_name,
  });
  if (!category) {
    return {
      ok: false,
      status: 400,
      error: "Valid category_id or category_name is required.",
    };
  }

  // 4. Server-side enrichment (settings, nested spot match, non-blocking weather)
  const startedAt = input.occurred_at ?? new Date();
  const [settings, spotsResult, weather] = await Promise.all([
    getAppSettings(supabase),
    supabase.from("spots").select("*"),
    input.skip_weather
      ? Promise.resolve(null)
      : fetchWeatherSnapshot(input.latitude ?? null, input.longitude ?? null),
  ]);

  const spots = (spotsResult.data ?? []) as SpotRow[];
  const spotMatch = findMatchingSpot(input.latitude ?? null, input.longitude ?? null, spots);

  const dayType = getDayType(startedAt, settings.day_boundary_hour);
  const univPeriod = getUnivPeriod(startedAt, settings.univ_periods);

  const { data: inserted, error: insertError } = await supabase
    .from("study_sessions")
    .insert({
      category_id: category.id,
      spot_id: spotMatch?.spot.id ?? null,
      location_label: spotMatch?.spot.name ?? "Other",
      memo: input.memo ?? null,
      tag_id: input.tag_id ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      weather_code: weather?.weather_code ?? null,
      temperature_c: weather?.temperature_c ?? null,
      pressure_hpa: weather?.pressure_hpa ?? null,
      day_type: dayType,
      univ_period: univPeriod,
      start_event_id: input.client_event_id ?? null,
      started_at: startedAt.toISOString(),
    })
    .select("id, category_id, location_label, started_at")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      // Handle race on idempotency key vs single active session constraint
      if (input.client_event_id) {
        const { data: raced } = await supabase
          .from("study_sessions")
          .select("id, category_id, location_label, started_at")
          .eq("start_event_id", input.client_event_id)
          .maybeSingle();
        if (raced) {
          return {
            ok: true,
            data: {
              status: "started",
              already_exists: true,
              session_id: raced.id,
              category_id: raced.category_id,
              category_name: category.name,
              location_label: raced.location_label,
              started_at: raced.started_at,
            },
          };
        }
      }
      return { ok: false, status: 409, error: "A study session is already active." };
    }
    return { ok: false, status: 500, error: "Failed to create study session." };
  }

  return {
    ok: true,
    data: {
      status: "started",
      already_exists: false,
      session_id: inserted.id,
      category_id: inserted.category_id,
      category_name: category.name,
      location_label: inserted.location_label,
      started_at: inserted.started_at,
    },
  };
}

export interface StopStudyInput {
  client_event_id?: string | null;
  occurred_at?: Date;
}

export interface StopStudyResponse {
  status: "stopped";
  already_exists: boolean;
  session_id: string;
  category_name: string;
  duration_sec: number;
  duration_min: number;
  today_total_min: number;
}

async function findStoppedByEventId(
  supabase: SupabaseClient,
  clientEventId: string,
  dayBoundaryHour: number,
  fallbackRefDate: Date
): Promise<StopStudyResponse | null> {
  const { data: existing } = await supabase
    .from("study_sessions")
    .select("id, category_id, duration_sec, ended_at")
    .eq("stop_event_id", clientEventId)
    .maybeSingle();

  if (!existing) {
    return null;
  }

  const refDate = existing.ended_at ? new Date(existing.ended_at) : fallbackRefDate;
  const [{ data: cat }, todayTotalMin] = await Promise.all([
    supabase.from("categories").select("name").eq("id", existing.category_id).maybeSingle(),
    computeTodayTotalMinutes(supabase, refDate, dayBoundaryHour),
  ]);
  const durationSec = existing.duration_sec ?? 0;

  return {
    status: "stopped",
    already_exists: true,
    session_id: existing.id,
    category_name: cat?.name ?? "Unknown",
    duration_sec: durationSec,
    duration_min: Math.round(durationSec / 60),
    today_total_min: todayTotalMin,
  };
}

export async function stopStudySession(
  supabase: SupabaseClient,
  input: StopStudyInput
): Promise<ServiceResult<{ data: StopStudyResponse }>> {
  const settings = await getAppSettings(supabase);
  const now = input.occurred_at ?? new Date();

  // 1. Idempotency check by stop_event_id
  if (input.client_event_id) {
    const existing = await findStoppedByEventId(
      supabase,
      input.client_event_id,
      settings.day_boundary_hour,
      now
    );
    if (existing) {
      return { ok: true, data: existing };
    }
  }

  // 2. Find active session
  const { data: activeRow, error: activeError } = await supabase
    .from("study_sessions")
    .select("*")
    .is("ended_at", null)
    .maybeSingle();

  if (activeError) {
    return { ok: false, status: 500, error: "Failed to find active study session." };
  }
  if (!activeRow) {
    return { ok: false, status: 404, error: "No active study session found." };
  }

  const session = activeRow as StudySessionRow;
  const startedAt = new Date(session.started_at);
  const endedAt = now;

  if (endedAt.getTime() < startedAt.getTime()) {
    return {
      ok: false,
      status: 400,
      error: "occurred_at cannot be earlier than the session started_at.",
    };
  }

  const durationSec = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);

  const { data: updatedRow, error: updateError } = await supabase
    .from("study_sessions")
    .update({
      ended_at: endedAt.toISOString(),
      duration_sec: durationSec,
      stop_event_id: input.client_event_id ?? null,
    })
    .eq("id", session.id)
    .is("ended_at", null)
    .select("id")
    .maybeSingle();

  if (updateError) {
    if (updateError.code === "23505" && input.client_event_id) {
      const raced = await findStoppedByEventId(
        supabase,
        input.client_event_id,
        settings.day_boundary_hour,
        endedAt
      );
      if (raced) {
        return { ok: true, data: raced };
      }
    }
    return { ok: false, status: 500, error: "Failed to stop study session." };
  }

  if (!updatedRow) {
    // Concurrent duplicate stop with the same client_event_id may update 0 rows cleanly
    if (input.client_event_id) {
      const raced = await findStoppedByEventId(
        supabase,
        input.client_event_id,
        settings.day_boundary_hour,
        endedAt
      );
      if (raced) {
        return { ok: true, data: raced };
      }
    }
    return { ok: false, status: 404, error: "No active study session found." };
  }

  const [{ data: cat }, todayTotalMin] = await Promise.all([
    supabase.from("categories").select("name").eq("id", session.category_id).maybeSingle(),
    computeTodayTotalMinutes(supabase, endedAt, settings.day_boundary_hour),
  ]);

  return {
    ok: true,
    data: {
      status: "stopped",
      already_exists: false,
      session_id: session.id,
      category_name: cat?.name ?? "Unknown",
      duration_sec: durationSec,
      duration_min: Math.round(durationSec / 60),
      today_total_min: todayTotalMin,
    },
  };
}
