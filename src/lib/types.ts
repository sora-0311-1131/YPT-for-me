export type SpotGroup = "Home" | "Univ" | "Cafe" | "Other";

export type DayType = "weekday" | "weekend" | "holiday";

export interface UnivPeriod {
  key: string;
  label: string;
  /** JST HH:MM (24h) */
  start: string;
  /** JST HH:MM (24h) */
  end: string;
}

export interface AppSettingsRow {
  id: number;
  day_boundary_hour: number;
  streak_min_minutes: number;
  daily_goal_weekday_min: number;
  daily_goal_weekend_min: number;
  long_session_warn_min: number;
  univ_periods: UnivPeriod[];
  updated_at: string;
}

export interface CategoryRow {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  is_archived: boolean;
  created_at: string;
}

export interface SpotRow {
  id: string;
  name: string;
  spot_group: SpotGroup;
  latitude: number;
  longitude: number;
  radius_m: number;
  wifi_ssid: string | null;
  created_at: string;
}

export interface StudySessionRow {
  id: string;
  category_id: string;
  spot_id: string | null;
  location_label: string;
  memo: string | null;
  tag_id: string | null;
  wifi_ssid: string | null;
  latitude: number | null;
  longitude: number | null;
  weather_code: number | null;
  temperature_c: number | null;
  pressure_hpa: number | null;
  pressure_diff_3h: number | null;
  pressure_diff_6h: number | null;
  day_type: DayType | null;
  univ_period: string | null;
  needs_review: boolean;
  start_event_id: string | null;
  stop_event_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_sec: number | null;
  created_at: string;
}

/**
 * Public-safe session DTO.
 * Never includes private coordinates (latitude / longitude), Wi-Fi SSIDs, memos, or internal sync IDs.
 */
export interface PublicSessionDto {
  id: string;
  category_id: string;
  category_name: string;
  category_color: string;
  location_label: string;
  weather_code: number | null;
  temperature_c: number | null;
  pressure_hpa: number | null;
  pressure_diff_3h: number | null;
  pressure_diff_6h: number | null;
  day_type: DayType | null;
  univ_period: string | null;
  started_at: string;
  ended_at: string | null;
  duration_sec: number | null;
}

export interface AdminSessionDto extends PublicSessionDto {
  memo: string | null;
  spot_id: string | null;
  tag_id: string | null;
  wifi_ssid: string | null;
  latitude: number | null;
  longitude: number | null;
  needs_review: boolean;
  start_event_id: string | null;
  stop_event_id: string | null;
  created_at: string;
}

export function toPublicSessionDto(
  row: StudySessionRow,
  category: Pick<CategoryRow, "name" | "color">
): PublicSessionDto {
  return {
    id: row.id,
    category_id: row.category_id,
    category_name: category.name,
    category_color: category.color,
    location_label: row.location_label,
    weather_code: row.weather_code,
    temperature_c: row.temperature_c,
    pressure_hpa: row.pressure_hpa,
    pressure_diff_3h: row.pressure_diff_3h,
    pressure_diff_6h: row.pressure_diff_6h,
    day_type: row.day_type,
    univ_period: row.univ_period,
    started_at: row.started_at,
    ended_at: row.ended_at,
    duration_sec: row.duration_sec,
  };
}

export function toAdminSessionDto(
  row: StudySessionRow,
  category: Pick<CategoryRow, "name" | "color">
): AdminSessionDto {
  return {
    ...toPublicSessionDto(row, category),
    memo: row.memo,
    spot_id: row.spot_id,
    tag_id: row.tag_id,
    wifi_ssid: row.wifi_ssid,
    latitude: row.latitude,
    longitude: row.longitude,
    needs_review: row.needs_review,
    start_event_id: row.start_event_id,
    stop_event_id: row.stop_event_id,
    created_at: row.created_at,
  };
}
