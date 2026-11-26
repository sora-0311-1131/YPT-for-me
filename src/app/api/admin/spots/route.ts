import { NextResponse } from "next/server";
import { isValidSpotGroup, parseJsonObject } from "@/lib/admin-validation";
import { isAuthorizedRequest, unauthorizedResponse } from "@/lib/auth";
import { parseSpotWifiSsids } from "@/lib/geo";
import { parseCoordinates, parseOptionalString } from "@/lib/study-service";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { SpotRow, UnregisteredWifiSsidItem } from "@/lib/types";

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorizedRequest(request)) {
    return unauthorizedResponse();
  }

  const supabase = getSupabaseAdmin();
  const [{ data, error }, { data: wifiSessions }] = await Promise.all([
    supabase.from("spots").select("*").order("created_at", { ascending: true }),
    supabase
      .from("study_sessions")
      .select("wifi_ssid, location_label, started_at")
      .not("wifi_ssid", "is", null)
      .order("started_at", { ascending: false })
      .limit(1000),
  ]);

  if (error) {
    return NextResponse.json({ error: "Failed to load spots." }, { status: 500 });
  }

  const spots = (data ?? []) as SpotRow[];
  const registeredSsids = new Set<string>();
  for (const spot of spots) {
    for (const ssid of parseSpotWifiSsids(spot.wifi_ssid)) {
      registeredSsids.add(ssid);
    }
  }

  const unregisteredMap = new Map<string, UnregisteredWifiSsidItem>();
  for (const row of wifiSessions ?? []) {
    const ssid = typeof row.wifi_ssid === "string" ? row.wifi_ssid.trim() : "";
    if (!ssid || registeredSsids.has(ssid)) continue;
    const existing = unregisteredMap.get(ssid);
    if (existing) {
      existing.session_count += 1;
    } else {
      unregisteredMap.set(ssid, {
        ssid,
        session_count: 1,
        last_seen_at: row.started_at as string,
        last_location_label: (row.location_label as string) || "Other",
      });
    }
  }

  const unregistered_wifi_ssids = Array.from(unregisteredMap.values()).sort(
    (a, b) => b.session_count - a.session_count
  );

  return NextResponse.json({ spots, unregistered_wifi_ssids }, { status: 200 });
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!isAuthorizedRequest(request)) {
    return unauthorizedResponse();
  }

  const parsed = await parseJsonObject(request);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const body = parsed.data;

  const name = parseOptionalString(body.name);
  if (!name) {
    return NextResponse.json({ error: "name is required." }, { status: 400 });
  }

  const spotGroup = body.spot_group ?? "Other";
  if (!isValidSpotGroup(spotGroup)) {
    return NextResponse.json(
      { error: "spot_group must be one of Home, Univ, Cafe, Other." },
      { status: 400 }
    );
  }

  const coords = parseCoordinates(body.latitude, body.longitude);
  if (!coords.ok || coords.latitude === null || coords.longitude === null) {
    return NextResponse.json(
      { error: coords.ok ? "latitude and longitude are required." : coords.error },
      { status: 400 }
    );
  }

  const radiusM = body.radius_m === undefined ? 50 : Number(body.radius_m);
  if (!Number.isInteger(radiusM) || radiusM <= 0 || radiusM > 50_000) {
    return NextResponse.json(
      { error: "radius_m must be an integer between 1 and 50000." },
      { status: 400 }
    );
  }

  const wifiSsid = parseOptionalString(body.wifi_ssid) ?? null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("spots")
    .insert({
      name,
      spot_group: spotGroup,
      latitude: coords.latitude,
      longitude: coords.longitude,
      radius_m: radiusM,
      wifi_ssid: wifiSsid,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Spot name already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create spot." }, { status: 500 });
  }

  return NextResponse.json({ spot: data }, { status: 201 });
}

export async function PATCH(request: Request): Promise<NextResponse> {
  if (!isAuthorizedRequest(request)) {
    return unauthorizedResponse();
  }

  const parsed = await parseJsonObject(request);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const body = parsed.data;

  const id = parseOptionalString(body.id);
  if (!id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = parseOptionalString(body.name);
    if (!name) {
      return NextResponse.json({ error: "name must be non-empty." }, { status: 400 });
    }
    updates.name = name;
  }
  if (body.spot_group !== undefined) {
    if (!isValidSpotGroup(body.spot_group)) {
      return NextResponse.json(
        { error: "spot_group must be one of Home, Univ, Cafe, Other." },
        { status: 400 }
      );
    }
    updates.spot_group = body.spot_group;
  }
  if (body.latitude !== undefined || body.longitude !== undefined) {
    const coords = parseCoordinates(body.latitude, body.longitude);
    if (!coords.ok || coords.latitude === null || coords.longitude === null) {
      return NextResponse.json(
        { error: coords.ok ? "Both latitude and longitude are required." : coords.error },
        { status: 400 }
      );
    }
    updates.latitude = coords.latitude;
    updates.longitude = coords.longitude;
  }
  if (body.radius_m !== undefined) {
    const radiusM = Number(body.radius_m);
    if (!Number.isInteger(radiusM) || radiusM <= 0 || radiusM > 50_000) {
      return NextResponse.json(
        { error: "radius_m must be an integer between 1 and 50000." },
        { status: 400 }
      );
    }
    updates.radius_m = radiusM;
  }
  if (body.wifi_ssid !== undefined) {
    updates.wifi_ssid = parseOptionalString(body.wifi_ssid) ?? null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("spots")
    .update(updates)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Spot name already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to update spot." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Spot not found." }, { status: 404 });
  }

  return NextResponse.json({ spot: data }, { status: 200 });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  if (!isAuthorizedRequest(request)) {
    return unauthorizedResponse();
  }

  const url = new URL(request.url);
  const id = parseOptionalString(url.searchParams.get("id"));
  if (!id) {
    return NextResponse.json({ error: "id query parameter is required." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: deleted, error } = await supabase
    .from("spots")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to delete spot." }, { status: 500 });
  }
  if (!deleted) {
    return NextResponse.json({ error: "Spot not found." }, { status: 404 });
  }

  return NextResponse.json({ deleted_id: deleted.id }, { status: 200 });
}
