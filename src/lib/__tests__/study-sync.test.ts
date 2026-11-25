import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseSyncEvents, syncStudyEvents } from "../study-sync";

const mockStartStudySession = vi.fn();
const mockStopStudySession = vi.fn();
const mockGetSupabaseAdmin = vi.fn(() => ({ fake: true }));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

vi.mock("@/lib/study-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/study-service")>("@/lib/study-service");
  return {
    ...actual,
    startStudySession: (...args: unknown[]) => mockStartStudySession(...args),
    stopStudySession: (...args: unknown[]) => mockStopStudySession(...args),
  };
});

import { POST as postSync } from "@/app/api/study/sync/route";

describe("parseSyncEvents", () => {
  it("validates event structure and fields", () => {
    expect(parseSyncEvents("not-array").ok).toBe(false);
    expect(
      parseSyncEvents([{ client_event_id: "e1", type: "start", occurred_at: "2026-11-25T09:00:00Z" }])
        .ok
    ).toBe(false); // missing category
    expect(
      parseSyncEvents([
        {
          client_event_id: "e1",
          type: "start",
          category_name: "英語",
          occurred_at: "2026-11-25T09:00:00Z",
          latitude: 35.0,
          longitude: 135.7,
        },
        {
          client_event_id: "e2",
          type: "stop",
          occurred_at: "2026-11-25T09:45:00Z",
        },
      ]).ok
    ).toBe(true);
  });
});

describe("syncStudyEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.API_SECRET = "test-secret";
  });

  it("orders events chronologically, auto-closes conflicting active session with needs_review=true, and skips stale weather", async () => {
    const updatedPayloads: Array<Record<string, unknown>> = [];
    const callOrder: string[] = [];

    const fakeSupabase = {
      from: (table: string) => {
        if (table === "categories") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: "cat-1", name: "英語", color: "#8B5CF6", sort_order: 4, is_archived: false },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table !== "study_sessions") {
          throw new Error(`Unexpected table ${table}`);
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
            is: () => ({
              // Active conflicting session exists before the new start
              maybeSingle: async () => ({
                data: { id: "prev-active", started_at: "2026-11-25T07:00:00.000Z", needs_review: false },
                error: null,
              }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            updatedPayloads.push(payload);
            return {
              eq: () => ({
                is: async () => ({ error: null }),
              }),
            };
          },
        };
      },
    } as unknown as SupabaseClient;

    mockStartStudySession.mockImplementationOnce(async (_sb, input) => {
      callOrder.push(`start:${input.client_event_id}:skipWeather=${String(input.skip_weather)}`);
      return {
        ok: true,
        data: {
          status: "started",
          already_exists: false,
          session_id: "new-sess",
          category_id: "cat-1",
          category_name: "英語",
          location_label: "Home",
          started_at: input.occurred_at.toISOString(),
        },
      };
    });

    mockStopStudySession.mockImplementationOnce(async (_sb, input) => {
      callOrder.push(`stop:${input.client_event_id}`);
      return {
        ok: true,
        data: {
          status: "stopped",
          already_exists: false,
          session_id: "new-sess",
          category_name: "英語",
          duration_sec: 1800,
          duration_min: 30,
          today_total_min: 90,
        },
      };
    });

    // Intentionally pass stop before start to verify chronological sorting
    const parsed = parseSyncEvents([
      {
        client_event_id: "evt-2",
        type: "stop",
        occurred_at: "2026-11-25T08:30:00.000Z",
      },
      {
        client_event_id: "evt-1",
        type: "start",
        category_name: "英語",
        occurred_at: "2026-11-25T08:00:00.000Z",
      },
    ]);
    if (!parsed.ok) throw new Error(parsed.error);

    // Reference "now" is 2 hours later -> weather should be skipped for stale event
    const result = await syncStudyEvents(
      fakeSupabase,
      parsed.events,
      new Date("2026-11-25T10:00:00.000Z")
    );

    expect(callOrder).toEqual(["start:evt-1:skipWeather=true", "stop:evt-2"]);
    expect(updatedPayloads).toHaveLength(1);
    expect(updatedPayloads[0]).toMatchObject({
      ended_at: "2026-11-25T08:00:00.000Z",
      duration_sec: 3600,
      needs_review: true,
    });
    expect(result.processed_event_ids).toEqual(["evt-1", "evt-2"]);
    expect(result.results[0]).toMatchObject({
      client_event_id: "evt-1",
      outcome: "applied_with_conflict_close",
      closed_conflict_session_id: "prev-active",
      session_id: "new-sess",
    });
    expect(result.results[1]).toMatchObject({
      client_event_id: "evt-2",
      outcome: "applied",
    });
  });

  it("marks already-applied start events as already_exists without closing active session", async () => {
    const fakeSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { id: "existing-sess" }, error: null }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    const parsed = parseSyncEvents([
      {
        client_event_id: "evt-dup",
        type: "start",
        category_name: "英語",
        occurred_at: "2026-11-25T09:00:00.000Z",
      },
    ]);
    if (!parsed.ok) throw new Error(parsed.error);

    const result = await syncStudyEvents(fakeSupabase, parsed.events);
    expect(result.processed_event_ids).toEqual(["evt-dup"]);
    expect(result.results[0]).toMatchObject({
      outcome: "already_exists",
      session_id: "existing-sess",
    });
    expect(mockStartStudySession).not.toHaveBeenCalled();
  });

  it("does not close active session when start event references a nonexistent category", async () => {
    const updateSpy = vi.fn();
    const fakeSupabase = {
      from: (table: string) => {
        if (table === "categories") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
            is: () => ({
              maybeSingle: async () => ({
                data: { id: "active-keep", started_at: "2026-11-25T07:00:00.000Z", needs_review: false },
                error: null,
              }),
            }),
          }),
          update: updateSpy,
        };
      },
    } as unknown as SupabaseClient;

    const parsed = parseSyncEvents([
      {
        client_event_id: "evt-bad-cat",
        type: "start",
        category_name: "削除済みカテゴリ",
        occurred_at: "2026-11-25T09:00:00.000Z",
      },
    ]);
    if (!parsed.ok) throw new Error(parsed.error);

    const result = await syncStudyEvents(fakeSupabase, parsed.events);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(mockStartStudySession).not.toHaveBeenCalled();
    expect(result.processed_event_ids).toEqual([]);
    expect(result.results[0]).toMatchObject({
      client_event_id: "evt-bad-cat",
      outcome: "error",
    });
  });

  it("POST /api/study/sync enforces auth and validates payload", async () => {
    const unauth = new Request("http://localhost/api/study/sync", {
      method: "POST",
      body: JSON.stringify({ events: [] }),
    });
    expect((await postSync(unauth)).status).toBe(401);

    const invalid = new Request("http://localhost/api/study/sync", {
      method: "POST",
      headers: { Authorization: "Bearer test-secret" },
      body: JSON.stringify({ events: "bad" }),
    });
    expect((await postSync(invalid)).status).toBe(400);
  });
});
