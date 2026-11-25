import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetStudyStatus = vi.fn();
const mockStartStudySession = vi.fn();
const mockStopStudySession = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => ({ fake: true }),
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

import { POST as postToggle } from "../toggle/route";

const authed = (query = "") =>
  new Request(`http://localhost/api/study/toggle${query}`, {
    method: "POST",
    headers: { Authorization: "Bearer test-secret" },
  });

describe("POST /api/study/toggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.API_SECRET = "test-secret";
  });

  it("returns 401 without valid Bearer auth", async () => {
    const res = await postToggle(new Request("http://localhost/api/study/toggle", { method: "POST" }));
    expect(res.status).toBe(401);
    expect(mockGetStudyStatus).not.toHaveBeenCalled();
  });

  it("starts with the last used category when idle and passes tag_id", async () => {
    mockGetStudyStatus.mockResolvedValueOnce({
      ok: true,
      data: {
        is_active: false,
        last_category: { id: "cat-2", name: "英語" },
        categories: [{ id: "cat-2", name: "英語", color: "#8B5CF6" }],
      },
    });
    mockStartStudySession.mockResolvedValueOnce({
      ok: true,
      data: {
        status: "started",
        already_exists: false,
        session_id: "sess-1",
        category_id: "cat-2",
        category_name: "英語",
        location_label: "Other",
        started_at: "2026-11-25T04:00:00.000Z",
      },
    });

    const res = await postToggle(authed("?tag_id=pc_palmrest"));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ action: "started", message: "開始しました：英語" });
    expect(mockStartStudySession).toHaveBeenCalledWith(
      { fake: true },
      { category_id: "cat-2", tag_id: "pc_palmrest" }
    );
    expect(mockStopStudySession).not.toHaveBeenCalled();
  });

  it("prefers an explicit category_id query over the last category", async () => {
    mockGetStudyStatus.mockResolvedValueOnce({
      ok: true,
      data: { is_active: false, last_category: { id: "cat-2", name: "英語" }, categories: [] },
    });
    mockStartStudySession.mockResolvedValueOnce({
      ok: true,
      data: {
        status: "started",
        already_exists: false,
        session_id: "sess-1",
        category_id: "cat-9",
        category_name: "資格",
        location_label: "Other",
        started_at: "2026-11-25T04:00:00.000Z",
      },
    });

    await postToggle(authed("?category_id=cat-9"));
    expect(mockStartStudySession).toHaveBeenCalledWith(
      { fake: true },
      { category_id: "cat-9", tag_id: null }
    );
  });

  it("stops the active session and returns a Japanese summary message", async () => {
    mockGetStudyStatus.mockResolvedValueOnce({
      ok: true,
      data: {
        is_active: true,
        active_session: {
          id: "sess-1",
          category_id: "cat-2",
          category_name: "英語",
          started_at: "2026-11-25T03:00:00.000Z",
        },
      },
    });
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

    const res = await postToggle(authed());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      action: "stopped",
      message: "お疲れ様！英語を50分集中しました（今日合計 120分）",
    });
    expect(mockStartStudySession).not.toHaveBeenCalled();
  });

  it("returns 409 when idle and no category exists", async () => {
    mockGetStudyStatus.mockResolvedValueOnce({
      ok: true,
      data: { is_active: false, last_category: null, categories: [] },
    });
    const res = await postToggle(authed());
    expect(res.status).toBe(409);
    expect(mockStartStudySession).not.toHaveBeenCalled();
  });
});
