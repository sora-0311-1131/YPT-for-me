import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidHexColor, isValidSpotGroup, validateUnivPeriods } from "@/lib/admin-validation";

const mockGetSupabaseAdmin = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

import { POST as postVerify } from "../verify/route";
import { GET as getSessions, POST as postSession } from "../sessions/route";
import { DELETE as deleteSession, PATCH as patchSession } from "../sessions/[id]/route";
import { GET as getCategories, POST as postCategory } from "../categories/route";
import { DELETE as deleteSpot, GET as getSpots, POST as postSpot } from "../spots/route";
import { POST as postReapplySpot } from "../spots/[id]/reapply/route";
import { GET as getSettings, PATCH as patchSettings } from "../settings/route";

const AUTH_HEADERS = { Authorization: "Bearer admin-secret" };

describe("admin validation helpers", () => {
  it("validates hex colors and spot groups", () => {
    expect(isValidHexColor("#3B82F6")).toBe(true);
    expect(isValidHexColor("3B82F6")).toBe(false);
    expect(isValidHexColor("#FFF")).toBe(false);
    expect(isValidSpotGroup("Univ")).toBe(true);
    expect(isValidSpotGroup("Library")).toBe(false);
  });

  it("validates univ_periods array strictly", () => {
    expect(
      validateUnivPeriods([{ key: "p1", label: "1限", start: "08:50", end: "10:20" }]).ok
    ).toBe(true);
    expect(validateUnivPeriods([]).ok).toBe(false);
    expect(
      validateUnivPeriods([{ key: "p1", label: "1限", start: "25:00", end: "10:20" }]).ok
    ).toBe(false);
    expect(
      validateUnivPeriods([
        { key: "dup", label: "A", start: "08:00", end: "09:00" },
        { key: "dup", label: "B", start: "09:00", end: "10:00" },
      ]).ok
    ).toBe(false);
  });
});

describe("/api/admin/* routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.API_SECRET = "admin-secret";
  });

  it("enforces Bearer auth (401) across all admin endpoints", async () => {
    const ctx = { params: Promise.resolve({ id: "id-1" }) };
    expect((await postVerify(new Request("http://localhost/api/admin/verify", { method: "POST" }))).status).toBe(401);
    expect((await getSessions(new Request("http://localhost/api/admin/sessions"))).status).toBe(401);
    expect((await postSession(new Request("http://localhost/api/admin/sessions", { method: "POST" }))).status).toBe(401);
    expect((await patchSession(new Request("http://localhost/api/admin/sessions/1", { method: "PATCH" }), ctx)).status).toBe(401);
    expect((await deleteSession(new Request("http://localhost/api/admin/sessions/1", { method: "DELETE" }), ctx)).status).toBe(401);
    expect((await getCategories(new Request("http://localhost/api/admin/categories"))).status).toBe(401);
    expect((await getSpots(new Request("http://localhost/api/admin/spots"))).status).toBe(401);
    expect((await deleteSpot(new Request("http://localhost/api/admin/spots?id=1", { method: "DELETE" }))).status).toBe(401);
    expect((await postReapplySpot(new Request("http://localhost/api/admin/spots/1/reapply", { method: "POST" }), ctx)).status).toBe(401);
    expect((await getSettings(new Request("http://localhost/api/admin/settings"))).status).toBe(401);
  });

  it("POST /api/admin/verify succeeds with valid Bearer token", async () => {
    const res = await postVerify(
      new Request("http://localhost/api/admin/verify", { method: "POST", headers: AUTH_HEADERS })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("validates payloads on categories, spots, and settings", async () => {
    const badColor = await postCategory(
      new Request("http://localhost/api/admin/categories", {
        method: "POST",
        headers: AUTH_HEADERS,
        body: JSON.stringify({ name: "Test", color: "blue" }),
      })
    );
    expect(badColor.status).toBe(400);

    const badSpot = await postSpot(
      new Request("http://localhost/api/admin/spots", {
        method: "POST",
        headers: AUTH_HEADERS,
        body: JSON.stringify({ name: "Home", latitude: 35.0, longitude: 135.7, radius_m: -10 }),
      })
    );
    expect(badSpot.status).toBe(400);

    const badSetting = await patchSettings(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        headers: AUTH_HEADERS,
        body: JSON.stringify({ day_boundary_hour: "" }),
      })
    );
    expect(badSetting.status).toBe(400);

    const badOrder = await postSession(
      new Request("http://localhost/api/admin/sessions", {
        method: "POST",
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          category_id: "cat-1",
          started_at: "2026-11-25T10:00:00Z",
          ended_at: "2026-11-25T09:00:00Z",
        }),
      })
    );
    expect(badOrder.status).toBe(400);
  });

  it("POST /api/admin/spots/[id]/reapply re-evaluates nested spots and updates matched sessions", async () => {
    const updatedSessions: Array<{ id: string; spot_id: string | null; location_label: string }> = [];

    mockGetSupabaseAdmin.mockReturnValue({
      from: (table: string) => {
        if (table === "spots") {
          return {
            select: async () => ({
              data: [
                {
                  id: "campus",
                  name: "大学キャンパス",
                  spot_group: "Univ",
                  latitude: 35.0262,
                  longitude: 135.7808,
                  radius_m: 300,
                  created_at: "2026-11-25T00:00:00Z",
                },
                {
                  id: "library",
                  name: "大学図書館",
                  spot_group: "Univ",
                  latitude: 35.0264,
                  longitude: 135.781,
                  radius_m: 40,
                  created_at: "2026-11-25T00:00:00Z",
                },
              ],
              error: null,
            }),
          };
        }
        if (table === "study_sessions") {
          return {
            select: () => ({
              not: () => ({
                not: () => ({
                  is: async () => ({
                    data: [
                      {
                        id: "s1",
                        spot_id: null,
                        location_label: "Other",
                        latitude: 35.02635,
                        longitude: 135.78095,
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
            update: (payload: { spot_id: string | null; location_label: string }) => ({
              eq: async (_col: string, id: string) => {
                updatedSessions.push({ id, ...payload });
                return { error: null };
              },
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    });

    const res = await postReapplySpot(
      new Request("http://localhost/api/admin/spots/library/reapply", {
        method: "POST",
        headers: AUTH_HEADERS,
      }),
      { params: Promise.resolve({ id: "library" }) }
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ evaluated_count: 1, updated_count: 1 });
    expect(updatedSessions).toEqual([
      { id: "s1", spot_id: "library", location_label: "大学図書館" },
    ]);
  });
});
