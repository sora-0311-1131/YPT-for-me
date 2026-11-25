import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDashboardSummary } from "@/lib/dashboard-service";
import { DEFAULT_APP_SETTINGS } from "@/lib/study-service";

const mockGetPublicDashboardData = vi.fn();
const mockGetSupabaseAdmin = vi.fn(() => ({ fake: true }));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

vi.mock("@/lib/dashboard-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/dashboard-service")>(
    "@/lib/dashboard-service"
  );
  return {
    ...actual,
    getPublicDashboardData: (...args: unknown[]) => mockGetPublicDashboardData(...args),
  };
});

import { GET as getDashboard } from "../route";

describe("buildDashboardSummary", () => {
  const categories = [
    { id: "cat-1", name: "大学講義・課題", color: "#3B82F6", sort_order: 1, is_archived: false },
    { id: "cat-2", name: "個人開発・A4", color: "#10B981", sort_order: 2, is_archived: false },
  ];

  it("computes today/week totals, streak, daily goal, long-session warning, and strips all private coordinates", () => {
    // 2026-11-25 14:00 JST (Wednesday -> weekday goal = 180 min)
    const now = new Date("2026-11-25T05:00:00.000Z");

    const sessions = [
      // Yesterday (2026-11-24): 40 min -> meets 30 min streak threshold
      {
        id: "s-prev",
        category_id: "cat-1",
        location_label: "大学図書館",
        memo: null,
        weather_code: 0,
        temperature_c: 14,
        pressure_hpa: 1015,
        day_type: "weekday" as const,
        univ_period: "period_2",
        started_at: "2026-11-24T02:00:00.000Z",
        ended_at: "2026-11-24T02:40:00.000Z",
        duration_sec: 2400,
      },
      // Today (2026-11-25): 60 min -> meets 30 min streak threshold (streak = 2)
      {
        id: "s-today",
        category_id: "cat-2",
        location_label: "Home",
        memo: "PR #8",
        weather_code: 2,
        temperature_c: 15,
        pressure_hpa: 1012,
        day_type: "weekday" as const,
        univ_period: "period_1",
        started_at: "2026-11-25T00:00:00.000Z",
        ended_at: "2026-11-25T01:00:00.000Z",
        duration_sec: 3600,
      },
    ];

    // Active session running for 7 hours -> triggers long_session_warning (>= 360 min)
    const activeRow = {
      id: "s-active",
      category_id: "cat-1",
      location_label: "Home",
      memo: null,
      weather_code: 0,
      temperature_c: 13,
      pressure_hpa: 1016,
      day_type: "weekday" as const,
      univ_period: "morning",
      started_at: "2026-11-24T22:00:00.000Z", // 7 hours before now
      ended_at: null,
      duration_sec: null,
    };

    const summary = buildDashboardSummary({
      sessions,
      activeRow,
      categories,
      settings: DEFAULT_APP_SETTINGS,
      now,
    });

    expect(summary.today.logical_date).toBe("2026-11-25");
    expect(summary.today.day_type).toBe("weekday");
    expect(summary.today.goal_min).toBe(180);
    expect(summary.today.completed_sec).toBe(3600);
    expect(summary.week.completed_sec).toBe(6000);
    expect(summary.streak_days).toBe(2);
    expect(summary.long_session_warning).toBe(true);
    expect(summary.locations).toEqual(["Home", "大学図書館"]);

    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain("latitude");
    expect(serialized).not.toContain("longitude");
    expect(serialized).not.toContain("spot_id");
    expect(serialized).not.toContain("start_event_id");
  });

  it("filters recent_sessions by category_id, location, and logical date", () => {
    const now = new Date("2026-11-25T05:00:00.000Z");
    const sessions = [
      {
        id: "s1",
        category_id: "cat-1",
        location_label: "大学図書館",
        memo: null,
        weather_code: null,
        temperature_c: null,
        pressure_hpa: null,
        day_type: "weekday" as const,
        univ_period: "period_1",
        started_at: "2026-11-25T00:00:00.000Z",
        ended_at: "2026-11-25T01:00:00.000Z",
        duration_sec: 3600,
      },
      {
        id: "s2",
        category_id: "cat-2",
        location_label: "Home",
        memo: null,
        weather_code: null,
        temperature_c: null,
        pressure_hpa: null,
        day_type: "weekday" as const,
        univ_period: "period_2",
        started_at: "2026-11-24T02:00:00.000Z",
        ended_at: "2026-11-24T03:00:00.000Z",
        duration_sec: 3600,
      },
    ];

    const summary = buildDashboardSummary({
      sessions,
      activeRow: null,
      categories,
      settings: DEFAULT_APP_SETTINGS,
      now,
      filters: { category_id: "cat-1", location: "大学図書館", date: "2026-11-25" },
    });

    expect(summary.recent_sessions.map((s) => s.id)).toEqual(["s1"]);
  });
});

describe("GET /api/dashboard route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is publicly accessible without Authorization header and validates query params", async () => {
    const badDate = await getDashboard(new Request("http://localhost/api/dashboard?date=2026/11/25"));
    expect(badDate.status).toBe(400);

    const badLimit = await getDashboard(new Request("http://localhost/api/dashboard?limit=999"));
    expect(badLimit.status).toBe(400);

    mockGetPublicDashboardData.mockResolvedValueOnce({
      active_session: null,
      long_session_warning: false,
      today: { logical_date: "2026-11-25", day_type: "weekday", completed_sec: 0, goal_min: 180, categories: [] },
      week: { completed_sec: 0, categories: [] },
      streak_days: 0,
      settings_public: {
        day_boundary_hour: 4,
        streak_min_minutes: 30,
        daily_goal_weekday_min: 180,
        daily_goal_weekend_min: 360,
        long_session_warn_min: 360,
        univ_periods: [],
      },
      categories: [],
      locations: [],
      recent_sessions: [],
    });

    const ok = await getDashboard(new Request("http://localhost/api/dashboard?limit=20"));
    expect(ok.status).toBe(200);
    expect(mockGetPublicDashboardData).toHaveBeenCalledTimes(1);
  });
});
