import { describe, expect, it } from "vitest";
import { findMatchingSpot, haversineDistanceMeters, isValidCoordinate } from "../geo";
import type { SpotRow } from "../types";

const makeSpot = (overrides: Partial<SpotRow>): SpotRow => ({
  id: "spot-id",
  name: "Spot",
  spot_group: "Other",
  latitude: 35.0262,
  longitude: 135.7808,
  radius_m: 50,
  created_at: "2026-11-25T00:00:00.000Z",
  ...overrides,
});

describe("geo utilities", () => {
  it("validates coordinates correctly", () => {
    expect(isValidCoordinate(35.0, 135.7)).toBe(true);
    expect(isValidCoordinate(91, 135.7)).toBe(false);
    expect(isValidCoordinate(35.0, -181)).toBe(false);
    expect(isValidCoordinate(Number.NaN, 135.7)).toBe(false);
    expect(isValidCoordinate(null, 135.7)).toBe(false);
  });

  it("computes Haversine distance accurately", () => {
    // Same point
    expect(haversineDistanceMeters(35.0, 135.0, 35.0, 135.0)).toBe(0);
    // ~111m for 0.001 deg latitude
    const dist = haversineDistanceMeters(35.0, 135.0, 35.001, 135.0);
    expect(dist).toBeGreaterThan(105);
    expect(dist).toBeLessThan(115);
  });

  it("prefers the smallest-radius spot when nested spots overlap", () => {
    const campus = makeSpot({
      id: "campus",
      name: "大学キャンパス",
      spot_group: "Univ",
      latitude: 35.0262,
      longitude: 135.7808,
      radius_m: 300,
    });
    const library = makeSpot({
      id: "library",
      name: "大学図書館",
      spot_group: "Univ",
      latitude: 35.0264,
      longitude: 135.781,
      radius_m: 40,
    });

    // Inside both campus (300m) and library (40m), even if closer to campus center
    const match = findMatchingSpot(35.02635, 135.78095, [campus, library]);
    expect(match?.spot.id).toBe("library");
  });

  it("breaks radius ties by shortest distance to spot center", () => {
    const cafeA = makeSpot({
      id: "cafe-a",
      name: "カフェA",
      spot_group: "Cafe",
      latitude: 35.0,
      longitude: 135.0,
      radius_m: 50,
    });
    const cafeB = makeSpot({
      id: "cafe-b",
      name: "カフェB",
      spot_group: "Cafe",
      latitude: 35.0002,
      longitude: 135.0,
      radius_m: 50,
    });

    const match = findMatchingSpot(35.00018, 135.0, [cafeA, cafeB]);
    expect(match?.spot.id).toBe("cafe-b");
  });

  it("returns null when outside all spot radii or given invalid coordinates", () => {
    const home = makeSpot({ id: "home", name: "Home", radius_m: 50 });
    expect(findMatchingSpot(35.1, 135.9, [home])).toBeNull();
    expect(findMatchingSpot(null, null, [home])).toBeNull();
  });
});
