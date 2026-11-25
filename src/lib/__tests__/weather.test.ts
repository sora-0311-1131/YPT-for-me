import { describe, expect, it, vi } from "vitest";
import { fetchWeatherSnapshot, getWeatherCategory } from "../weather";

describe("weather utilities", () => {
  it("parses valid Open-Meteo response", async () => {
    const mockFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          current: {
            weather_code: 3,
            temperature_2m: 12.4,
            surface_pressure: 1013.8,
          },
        }),
        { status: 200 }
      )
    ) as unknown as typeof fetch;

    const result = await fetchWeatherSnapshot(35.0, 135.7, { fetchImpl: mockFetch });
    expect(result).toEqual({
      weather_code: 3,
      temperature_c: 12.4,
      pressure_hpa: 1013.8,
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("returns null without throwing on HTTP errors, network failures, or timeouts", async () => {
    const errorFetch = vi.fn(async () => new Response("error", { status: 500 })) as unknown as typeof fetch;
    expect(await fetchWeatherSnapshot(35.0, 135.7, { fetchImpl: errorFetch })).toBeNull();

    const rejectFetch = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    expect(await fetchWeatherSnapshot(35.0, 135.7, { fetchImpl: rejectFetch })).toBeNull();

    const slowFetch = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        })
    ) as unknown as typeof fetch;
    expect(
      await fetchWeatherSnapshot(35.0, 135.7, { timeoutMs: 20, fetchImpl: slowFetch })
    ).toBeNull();
  });

  it("skips fetching when coordinates are invalid", async () => {
    const mockFetch = vi.fn() as unknown as typeof fetch;
    expect(await fetchWeatherSnapshot(null, 135.7, { fetchImpl: mockFetch })).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("maps WMO weather codes to analytics categories", () => {
    expect(getWeatherCategory(0)).toBe("sunny");
    expect(getWeatherCategory(2)).toBe("cloudy");
    expect(getWeatherCategory(61)).toBe("rainy");
    expect(getWeatherCategory(73)).toBe("snowy");
    expect(getWeatherCategory(null)).toBe("unknown");
  });
});
