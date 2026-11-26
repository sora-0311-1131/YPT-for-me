import { describe, expect, it } from "vitest";
import { buildAnalyticsSummary, getPressureTrend } from "../analytics-service";
import type { SanitizedSessionRow } from "../dashboard-service";
import { DEFAULT_APP_SETTINGS } from "../study-service";

describe("analytics pressure trend", () => {
  it("classifies pressure deltas with 6h priority and 3h fallback", () => {
    expect(getPressureTrend(-4.2, -1.0)).toBe("rapid_drop");
    expect(getPressureTrend(-2.0, 0.5)).toBe("dropping");
    expect(getPressureTrend(0.3, -2.5)).toBe("stable");
    expect(getPressureTrend(1.5, 0.2)).toBe("rising");
    expect(getPressureTrend(null, -3.5)).toBe("rapid_drop");
    expect(getPressureTrend(null, null)).toBe("unknown");
  });

  it("aggregates pressure_trend buckets in buildAnalyticsSummary", () => {
    const now = new Date("2026-11-26T05:00:00.000Z");
    const sessions: SanitizedSessionRow[] = [
      {
        id: "s1",
        category_id: "c1",
        location_label: "Home",
        weather_code: 61,
        temperature_c: 15,
        pressure_hpa: 1003,
        pressure_diff_3h: -2.0,
        pressure_diff_6h: -4.1,
        day_type: "weekday",
        univ_period: "period_3",
        started_at: "2026-11-26T04:00:00.000Z",
        ended_at: "2026-11-26T04:30:00.000Z",
        duration_sec: 1800,
      },
      {
        id: "s2",
        category_id: "c1",
        location_label: "Home",
        weather_code: 0,
        temperature_c: 18,
        pressure_hpa: 1018,
        pressure_diff_3h: 0.2,
        pressure_diff_6h: 0.4,
        day_type: "weekday",
        univ_period: "period_4",
        started_at: "2026-11-26T04:35:00.000Z",
        ended_at: "2026-11-26T04:55:00.000Z",
        duration_sec: 1200,
      },
    ];

    const summary = buildAnalyticsSummary({
      sessions,
      settings: DEFAULT_APP_SETTINGS,
      days: 30,
      now,
    });

    const rapidDrop = summary.pressure_trend.find((b) => b.key === "rapid_drop");
    const stable = summary.pressure_trend.find((b) => b.key === "stable");
    expect(rapidDrop).toMatchObject({ total_sec: 1800, session_count: 1, avg_sec: 1800 });
    expect(stable).toMatchObject({ total_sec: 1200, session_count: 1, avg_sec: 1200 });
  });
});
