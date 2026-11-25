import type { SpotRow } from "./types";

const EARTH_RADIUS_M = 6_371_000;

export function isValidCoordinate(
  latitude: number | null | undefined,
  longitude: number | null | undefined
): boolean {
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return false;
  }
  return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

/**
 * Computes great-circle distance in meters between two WGS84 coordinates.
 */
export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

export interface SpotMatch {
  spot: SpotRow;
  distance_m: number;
}

/**
 * Matches a coordinate against registered spots.
 * When multiple spots contain the coordinate (nested spots such as a library inside a campus),
 * the spot with the smallest `radius_m` wins; ties are broken by shortest center distance.
 */
export function findMatchingSpot(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  spots: SpotRow[]
): SpotMatch | null {
  if (!isValidCoordinate(latitude, longitude) || spots.length === 0) {
    return null;
  }

  const lat = latitude as number;
  const lng = longitude as number;

  let bestMatch: SpotMatch | null = null;

  for (const spot of spots) {
    const distance = haversineDistanceMeters(lat, lng, spot.latitude, spot.longitude);
    if (distance <= spot.radius_m) {
      if (
        !bestMatch ||
        spot.radius_m < bestMatch.spot.radius_m ||
        (spot.radius_m === bestMatch.spot.radius_m && distance < bestMatch.distance_m)
      ) {
        bestMatch = { spot, distance_m: distance };
      }
    }
  }

  return bestMatch;
}
