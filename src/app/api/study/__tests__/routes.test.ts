import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseCoordinates, parseOccurredAt } from "@/lib/study-service";

const mockGetStudyStatus = vi.fn();
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
    getStudyStatus: (...args: unknown[]) => mockGetStudyStatus(...args),
    startStudySession: (...args: unknown[]) => mockStartStudySession(...args),
    stopStudySession: (...args: unknown[]) => mockStopStudySession(...args),
  };
});

import { GET as getStatus } from "../status/route";
import { POST as postStart } from "../start/route";
import { POST as postStop } from "../stop/route";

describe("study-service parsers", () => {
  it("validates coordinates strictly", () => {
    expect(parseCoordinates(undefined, undefined)).toEqual({
      ok: true,
      latitude: null,
      longitude: null,
    });
    expect(parseCoordinates(35.0, 135.7)).toEqual({
      ok: true,
      latitude: 35.0,
      longitude: 135.7,
    });
    expect(parseCoordinates(35.0, undefined).ok).toBe(false);
    expect(parseCoordinates(95.0, 135.7).ok).toBe(false);
  });

  it("validates occurred_at ISO strings", () => {
    expect(parseOccurredAt(undefined).ok).toBe(true);
    expect(parseOccurredAt("2026-11-25T09:00:00Z").ok).toBe(true);
    expect(parseOccurredAt("not-a-date").ok).toBe(false);
    expect(parseOccurredAt(12345).ok).toBe(false);
  });
});

describe("/api/study/* routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.API_SECRET = "test-secret";
  });

  it("returns 401 when Bearer auth is missing or invalid", async () => {
    const reqStatus = new Request("http://localhost/api/study/status");
    expect((await getStatus(reqStatus)).status).toBe(401);

    const reqStart = new Request("http://localhost/api/study/start", {
      method: "POST",
      headers: { Authorization: "Bearer wrong" },
      body: JSON.stringify({ category_name: "英語" }),
    });
    expect((await postStart(reqStart)).status).toBe(401);

    const reqStop = new Request("http://localhost/api/study/stop", { method: "POST" });
    expect((await postStop(reqStop)).status).toBe(401);
  });

  it("GET /api/study/status returns status payload when authorized", async () => {
    mockGetStudyStatus.mockResolvedValueOnce({
      ok: true,
      data: {
        is_active: false,
        last_category: { id: "cat-1", name: "英語" },
        categories: [{ id: "cat-1", name: "英語", color: "#8B5CF6" }],
      },
    });

    const req = new Request("http://localhost/api/study/status", {
      headers: { Authorization: "Bearer test-secret" },
    });
    const res = await getStatus(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      is_active: false,
      last_category: { id: "cat-1", name: "英語" },
      categories: [{ id: "cat-1", name: "英語", color: "#8B5CF6" }],
    });
  });

  it("POST /api/study/start validates payload and returns 201 on new start / 200 on idempotent replay", async () => {
    // Invalid JSON
    const badJson = new Request("http://localhost/api/study/start", {
      method: "POST",
      headers: { Authorization: "Bearer test-secret" },
      body: "{broken",
    });
    expect((await postStart(badJson)).status).toBe(400);

    // Partial coordinates rejected
    const badCoords = new Request("http://localhost/api/study/start", {
      method: "POST",
      headers: { Authorization: "Bearer test-secret" },
      body: JSON.stringify({ category_name: "英語", latitude: 35.0 }),
    });
    expect((await postStart(badCoords)).status).toBe(400);

    // New start -> 201
    mockStartStudySession.mockResolvedValueOnce({
      ok: true,
      data: {
        status: "started",
        already_exists: false,
        session_id: "sess-1",
        category_id: "cat-1",
        category_name: "英語",
        location_label: "Home",
        started_at: "2026-11-25T09:00:00.000Z",
      },
    });
    const okReq = new Request("http://localhost/api/study/start", {
      method: "POST",
      headers: { Authorization: "Bearer test-secret" },
      body: JSON.stringify({
        client_event_id: "evt-1",
        category_name: "英語",
        latitude: 35.0,
        longitude: 135.7,
        tag_id: "pc_palmrest",
      }),
    });
    expect((await postStart(okReq)).status).toBe(201);

    // Idempotent replay -> 200
    mockStartStudySession.mockResolvedValueOnce({
      ok: true,
      data: {
        status: "started",
        already_exists: true,
        session_id: "sess-1",
        category_id: "cat-1",
        category_name: "英語",
        location_label: "Home",
        started_at: "2026-11-25T09:00:00.000Z",
      },
    });
    const replayReq = new Request("http://localhost/api/study/start", {
      method: "POST",
      headers: { Authorization: "Bearer test-secret" },
      body: JSON.stringify({ client_event_id: "evt-1", category_name: "英語" }),
    });
    expect((await postStart(replayReq)).status).toBe(200);
  });

  it("POST /api/study/stop accepts empty body and returns stopped summary", async () => {
    mockStopStudySession.mockResolvedValueOnce({
      ok: true,
      data: {
        status: "stopped",
        already_exists: false,
        session_id: "sess-1",
        category_name: "英語",
        duration_sec: 3000,
        duration_min: 50,
        today_total_min: 120,
      },
    });

    const req = new Request("http://localhost/api/study/stop", {
      method: "POST",
      headers: { Authorization: "Bearer test-secret" },
    });
    const res = await postStop(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: "stopped",
      duration_min: 50,
      today_total_min: 120,
    });
  });

  it("POST /api/study/stop propagates 404 when no session is active", async () => {
    mockStopStudySession.mockResolvedValueOnce({
      ok: false,
      status: 404,
      error: "No active study session found.",
    });

    const req = new Request("http://localhost/api/study/stop", {
      method: "POST",
      headers: { Authorization: "Bearer test-secret" },
      body: JSON.stringify({}),
    });
    expect((await postStop(req)).status).toBe(404);
  });
});
