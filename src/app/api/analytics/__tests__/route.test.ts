import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildAnalyticsSummary, getPressureBand } from "@/lib/analytics-service";
import { DEFAULT_APP_SETTINGS } from "@/lib/study-service";

const mockGetPublicAnalyticsData = vi.fn();
const mockGetSupabaseAdmin = vi.fn(() => ({ fake: true }));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

vi.mock("@/lib/analytics-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/analytics-service")>(
    "@/lib/analytics-service"
  );
  return {
    ...actual,
    getPublicAnalyticsData: (...args: unknown[]) => mockGetPublicAnalyticsData(...args),
  };
});

import { GET as getAnalytics } from "../route";

describe("buildAnalyticsSummary", () => {
  it("classifies barometric pressure bands correctly", () => {
    expect(getPressureBand(998.5)).toBe("low");
    expect(getPressureBand(1005)).toBe("normal");
    expect(getPressureBand(1015)).toBe("normal");
    expect(getPressureBand(1018.2)).toBe("high");
    expect(getPressureBand(null)).toBe("unknown");
  });

  it("computes 365-day calendar, cross-hour JST heatmap, periods, spots, weather, and pressure without leaking private data", () => {
    // Now: 2026-11-25 14:00 JST (Wed)
    const now = new Date("2026-11-25T05:00:00.000Z");

    const sessions = [
      // 2026-11-25 09:30 - 11:15 JST (Wed, dow=3):
      //   09:00 slot -> 30m (1800s)
      //   10:00 slot -> 60m (3600s)
      //   11:00 slot -> 15m (900s)
      {
        id: "s1",
        category_id: "cat-1",
        location_label: "大学図書館",
        weather_code: 0, // sunny
        temperature_c: 15,
        pressure_hpa: 1018, // high
        day_type: "weekday" as const,
        univ_period: "period_1",
        started_at: "2026-11-25T00:30:00.000Z",
        ended_at: "2026-11-25T02:15:00.000Z",
        duration_sec: 6300,
      },
      // 2026-11-24 20:00 - 21:00 JST (Tue, dow=2), rainy + low pressure
      {
        id: "s2",
        category_id: "cat-2",
        location_label: "Home",
        weather_code: 61, // rainy
        temperature_c: 11,
        pressure_hpa: 1001, // low
        day_type: "weekday" as const,
        univ_period: "after_school",
        started_at: "2026-11-24T11:00:00.000Z",
        ended_at: "2026-11-24T12:00:00.000Z",
        duration_sec: 3600,
      },
    ];

    const summary = buildAnalyticsSummary({
      sessions,
      settings: DEFAULT_APP_SETTINGS,
      days: 90,
      now,
    });

    expect(summary.calendar).toHaveLength(365);
    expect(summary.calendar[364]).toMatchObject({
      date: "2026-11-25",
      total_sec: 6300,
      session_count: 1,
    });
    expect(summary.total_sec).toBe(9900);
    expect(summary.total_sessions).toBe(2);

    const cell = (dow: number, hour: number) =>
      summary.weekday_hour_heatmap.find((c) => c.weekday === dow && c.hour === hour)?.total_sec;
    expect(cell(3, 9)).toBe(1800);
    expect(cell(3, 10)).toBe(3600);
    expect(cell(3, 11)).toBe(900);
    expect(cell(2, 20)).toBe(3600);

    expect(summary.spots.map((s) => s.label)).toEqual(["大学図書館", "Home"]);
    expect(summary.weather.find((w) => w.key === "sunny")?.total_sec).toBe(6300);
    expect(summary.weather.find((w) => w.key === "rainy")?.total_sec).toBe(3600);
    expect(summary.pressure.find((p) => p.key === "high")?.total_sec).toBe(6300);
    expect(summary.pressure.find((p) => p.key === "low")?.total_sec).toBe(3600);

    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain("latitude");
    expect(serialized).not.toContain("longitude");
    expect(serialized).not.toContain("memo");
  });
});

describe("GET /api/analytics route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates days parameter and serves public analytics", async () => {
    expect((await getAnalytics(new Request("http://localhost/api/analytics?days=3"))).status).toBe(400);
    expect((await getAnalytics(new Request("http://localhost/api/analytics?days=500"))).status).toBe(400);
    expect((await getAnalytics(new Request("http://localhost/api/analytics?days="))).status).toBe(400);

    mockGetPublicAnalyticsData.mockResolvedValueOnce({
      days: 30,
      today_logical_date: "2026-11-25",
      total_sec: 0,
      total_sessions: 0,
      calendar: [],
      weekday_hour_heatmap: [],
      univ_periods: [],
      spots: [],
      weather: [],
      pressure: [],
    });

    const ok = await getAnalytics(new Request("http://localhost/api/analytics?days=30"));
    expect(ok.status).toBe(200);
    expect(mockGetPublicAnalyticsData).toHaveBeenCalledWith({ fake: true }, 30);
  });
});
