import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { DEFAULT_APP_SETTINGS, stopStudySession } from "../study-service";

describe("stopStudySession concurrent idempotency", () => {
  it("returns 200 already_exists when concurrent duplicate stop updates 0 rows", async () => {
    let stopEventLookupCount = 0;

    const fakeSupabase = {
      from: (table: string) => {
        if (table === "app_settings") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: DEFAULT_APP_SETTINGS, error: null }),
              }),
            }),
          };
        }

        if (table === "categories") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { name: "英語" }, error: null }),
              }),
            }),
          };
        }

        if (table === "study_sessions") {
          return {
            select: (cols: string) => {
              if (cols === "duration_sec") {
                return {
                  gte: () => ({
                    lt: () => ({
                      not: async () => ({ data: [{ duration_sec: 1800 }], error: null }),
                    }),
                  }),
                };
              }
              return {
                eq: (col: string) => {
                  if (col === "stop_event_id") {
                    return {
                      maybeSingle: async () => {
                        stopEventLookupCount += 1;
                        // 1st lookup (pre-check): not yet updated by racing peer
                        if (stopEventLookupCount === 1) {
                          return { data: null, error: null };
                        }
                        // 2nd lookup (post-0-row-update re-check): peer committed the stop
                        return {
                          data: {
                            id: "sess-1",
                            category_id: "cat-1",
                            duration_sec: 1800,
                            ended_at: "2026-11-25T10:30:00.000Z",
                          },
                          error: null,
                        };
                      },
                    };
                  }
                  return { maybeSingle: async () => ({ data: null, error: null }) };
                },
                is: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "sess-1",
                      category_id: "cat-1",
                      started_at: "2026-11-25T10:00:00.000Z",
                      ended_at: null,
                    },
                    error: null,
                  }),
                }),
              };
            },
            update: () => ({
              eq: () => ({
                is: () => ({
                  select: () => ({
                    // Simulates 0 rows updated because racing peer already set ended_at
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    } as unknown as SupabaseClient;

    const result = await stopStudySession(fakeSupabase, {
      client_event_id: "evt-stop-race",
      occurred_at: new Date("2026-11-25T10:30:00.000Z"),
    });

    expect(result).toEqual({
      ok: true,
      data: {
        status: "stopped",
        already_exists: true,
        session_id: "sess-1",
        category_name: "英語",
        duration_sec: 1800,
        duration_min: 30,
        today_total_min: 30,
      },
    });
    expect(stopEventLookupCount).toBe(2);
  });
});
