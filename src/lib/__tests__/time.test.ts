import { describe, expect, it } from "vitest";
import {
  calculateStreak,
  getDayType,
  getLogicalDateJst,
  getLogicalDayBoundsUtc,
  getUnivPeriod,
  isJapaneseHoliday,
} from "../time";
import type { UnivPeriod } from "../types";

const defaultPeriods: UnivPeriod[] = [
  { key: "morning", label: "朝", start: "04:00", end: "08:50" },
  { key: "period_1", label: "1限", start: "08:50", end: "10:20" },
  { key: "period_2", label: "2限", start: "10:30", end: "12:00" },
  { key: "after_school", label: "放課後", start: "17:50", end: "23:00" },
  { key: "late_night", label: "深夜", start: "23:00", end: "04:00" },
];

describe("time utilities", () => {
  it("applies dayBoundaryHour to compute logical JST date", () => {
    // 2026-11-25 03:59 JST -> belongs to 2026-11-24
    expect(getLogicalDateJst(new Date("2026-11-24T18:59:00.000Z"), 4)).toBe("2026-11-24");
    // 2026-11-25 04:00 JST -> belongs to 2026-11-25
    expect(getLogicalDateJst(new Date("2026-11-24T19:00:00.000Z"), 4)).toBe("2026-11-25");
    // With boundary = 0: 2026-11-25 00:30 JST -> 2026-11-25
    expect(getLogicalDateJst(new Date("2026-11-24T15:30:00.000Z"), 0)).toBe("2026-11-25");
  });

  it("computes UTC bounds for a logical JST date", () => {
    const bounds = getLogicalDayBoundsUtc("2026-11-25", 4);
    expect(bounds.startIso).toBe("2026-11-24T19:00:00.000Z");
    expect(bounds.endIso).toBe("2026-11-25T19:00:00.000Z");
  });

  it("detects Japanese national holidays including substitute and citizens holidays", () => {
    expect(isJapaneseHoliday("2026-01-01")).toBe(true); // New Year's Day
    expect(isJapaneseHoliday("2026-11-23")).toBe(true); // Labor Thanksgiving Day
    expect(isJapaneseHoliday("2026-05-06")).toBe(true); // Substitute for May 3 (Sunday in 2026)
    expect(isJapaneseHoliday("2026-09-22")).toBe(true); // Citizens' Holiday between 9/21 and 9/23
    expect(isJapaneseHoliday("2026-11-25")).toBe(false);
  });

  it("classifies weekday, weekend, and holiday correctly", () => {
    // 2026-11-25 (Wed) 10:00 JST
    expect(getDayType(new Date("2026-11-25T01:00:00.000Z"), 4)).toBe("weekday");
    // 2026-11-28 (Sat) 10:00 JST
    expect(getDayType(new Date("2026-11-28T01:00:00.000Z"), 4)).toBe("weekend");
    // 2026-11-23 (Mon, Labor Thanksgiving Day) 10:00 JST
    expect(getDayType(new Date("2026-11-23T01:00:00.000Z"), 4)).toBe("holiday");
  });

  it("resolves university periods including midnight wrap-around", () => {
    // 09:15 JST -> period_1
    expect(getUnivPeriod(new Date("2026-11-25T00:15:00.000Z"), defaultPeriods)).toBe("period_1");
    // 23:30 JST -> late_night
    expect(getUnivPeriod(new Date("2026-11-25T14:30:00.000Z"), defaultPeriods)).toBe("late_night");
    // 01:45 JST -> late_night
    expect(getUnivPeriod(new Date("2026-11-24T16:45:00.000Z"), defaultPeriods)).toBe("late_night");
    // 10:25 JST (gap between 1st and 2nd period) -> null
    expect(getUnivPeriod(new Date("2026-11-25T01:25:00.000Z"), defaultPeriods)).toBeNull();
  });

  it("calculates study streak accurately", () => {
    const map = new Map<string, number>([
      ["2026-11-22", 45],
      ["2026-11-23", 30],
      ["2026-11-24", 60],
      ["2026-11-25", 10], // today not yet met (30 min threshold)
    ]);

    // Still preserves streak from yesterday
    expect(calculateStreak(map, "2026-11-25", 30)).toBe(3);

    // Once today reaches 30 min, streak increments to 4
    map.set("2026-11-25", 30);
    expect(calculateStreak(map, "2026-11-25", 30)).toBe(4);

    // Broken if both today and yesterday are below threshold
    map.set("2026-11-24", 15);
    map.set("2026-11-25", 10);
    expect(calculateStreak(map, "2026-11-25", 30)).toBe(0);
  });
});
