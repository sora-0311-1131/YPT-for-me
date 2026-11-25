import { isValidCoordinate } from "./geo";

export interface WeatherSnapshot {
  weather_code: number | null;
  temperature_c: number | null;
  pressure_hpa: number | null;
}

export type WeatherCategory = "sunny" | "cloudy" | "rainy" | "snowy" | "unknown";

const DEFAULT_TIMEOUT_MS = 2000;

/**
 * Fetches current weather snapshot from Open-Meteo (free, no API key required).
 * Non-blocking by design: returns null on timeout, HTTP error, or invalid payload
 * so study session check-in never fails due to upstream weather outages.
 */
export async function fetchWeatherSnapshot(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  options?: {
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
  }
): Promise<WeatherSnapshot | null> {
  if (!isValidCoordinate(latitude, longitude)) {
    return null;
  }

  const fetchFn = options?.fetchImpl ?? fetch;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current: "weather_code,temperature_2m,surface_pressure",
      timezone: "Asia/Tokyo",
    });

    const response = await fetchFn(
      `https://api.open-meteo.com/v1/forecast?${params.toString()}`,
      {
        signal: controller.signal,
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      current?: {
        weather_code?: unknown;
        temperature_2m?: unknown;
        surface_pressure?: unknown;
      };
    };

    if (!data.current || typeof data.current !== "object") {
      return null;
    }

    const weather_code =
      typeof data.current.weather_code === "number" && Number.isFinite(data.current.weather_code)
        ? Math.round(data.current.weather_code)
        : null;
    const temperature_c =
      typeof data.current.temperature_2m === "number" &&
      Number.isFinite(data.current.temperature_2m)
        ? data.current.temperature_2m
        : null;
    const pressure_hpa =
      typeof data.current.surface_pressure === "number" &&
      Number.isFinite(data.current.surface_pressure)
        ? data.current.surface_pressure
        : null;

    if (weather_code === null && temperature_c === null && pressure_hpa === null) {
      return null;
    }

    return { weather_code, temperature_c, pressure_hpa };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Groups WMO weather codes into simplified analytics categories.
 */
export function getWeatherCategory(weatherCode: number | null | undefined): WeatherCategory {
  if (typeof weatherCode !== "number" || !Number.isFinite(weatherCode)) {
    return "unknown";
  }
  if (weatherCode === 0 || weatherCode === 1) {
    return "sunny";
  }
  if (weatherCode === 2 || weatherCode === 3 || weatherCode === 45 || weatherCode === 48) {
    return "cloudy";
  }
  if (
    (weatherCode >= 51 && weatherCode <= 67) ||
    (weatherCode >= 80 && weatherCode <= 82) ||
    weatherCode >= 95
  ) {
    return "rainy";
  }
  if ((weatherCode >= 71 && weatherCode <= 77) || weatherCode === 85 || weatherCode === 86) {
    return "snowy";
  }
  return "unknown";
}
