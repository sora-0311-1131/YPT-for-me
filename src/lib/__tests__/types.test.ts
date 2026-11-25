import { describe, expect, it } from "vitest";
import { toAdminSessionDto, toPublicSessionDto, type StudySessionRow } from "../types";

const sampleRow: StudySessionRow = {
  id: "session-1",
  category_id: "cat-1",
  spot_id: "spot-1",
  location_label: "大学図書館",
  memo: "計算論レポート",
  tag_id: "pc_palmrest",
  latitude: 35.0262,
  longitude: 135.7808,
  weather_code: 0,
  temperature_c: 14.5,
  pressure_hpa: 1016.2,
  day_type: "weekday",
  univ_period: "period_2",
  needs_review: true,
  start_event_id: "evt-start-1",
  stop_event_id: "evt-stop-1",
  started_at: "2026-11-25T01:30:00.000Z",
  ended_at: "2026-11-25T02:20:00.000Z",
  duration_sec: 3000,
  created_at: "2026-11-25T01:30:00.000Z",
};

describe("session DTO mappers", () => {
  it("strips private coordinates and internal fields from PublicSessionDto", () => {
    const dto = toPublicSessionDto(sampleRow, { name: "大学講義・課題", color: "#3B82F6" });
    const serialized = JSON.stringify(dto);

    expect(dto.location_label).toBe("大学図書館");
    expect(dto.category_name).toBe("大学講義・課題");
    expect(serialized).not.toContain("latitude");
    expect(serialized).not.toContain("longitude");
    expect(serialized).not.toContain("35.0262");
    expect(serialized).not.toContain("135.7808");
    expect(serialized).not.toContain("memo");
    expect(serialized).not.toContain("計算論レポート");
    expect(serialized).not.toContain("spot_id");
    expect(serialized).not.toContain("start_event_id");
  });

  it("retains private coordinates, memo, and review flags in AdminSessionDto", () => {
    const dto = toAdminSessionDto(sampleRow, { name: "大学講義・課題", color: "#3B82F6" });
    expect(dto.memo).toBe("計算論レポート");
    expect(dto.latitude).toBe(35.0262);
    expect(dto.longitude).toBe(135.7808);
    expect(dto.needs_review).toBe(true);
    expect(dto.spot_id).toBe("spot-1");
  });
});
