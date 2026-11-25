import { NextResponse } from "next/server";
import { isValidHexColor, parseJsonObject } from "@/lib/admin-validation";
import { isAuthorizedRequest, unauthorizedResponse } from "@/lib/auth";
import { parseOptionalString } from "@/lib/study-service";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorizedRequest(request)) {
    return unauthorizedResponse();
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to load categories." }, { status: 500 });
  }

  return NextResponse.json({ categories: data ?? [] }, { status: 200 });
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

  const color = body.color ?? "#3B82F6";
  if (!isValidHexColor(color)) {
    return NextResponse.json({ error: "color must be a valid #RRGGBB hex string." }, { status: 400 });
  }

  let sortOrder = 0;
  if (body.sort_order !== undefined) {
    if (typeof body.sort_order !== "number" || !Number.isInteger(body.sort_order)) {
      return NextResponse.json({ error: "sort_order must be an integer." }, { status: 400 });
    }
    sortOrder = body.sort_order;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("categories")
    .insert({ name, color, sort_order: sortOrder })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Category name already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create category." }, { status: 500 });
  }

  return NextResponse.json({ category: data }, { status: 201 });
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
  if (body.color !== undefined) {
    if (!isValidHexColor(body.color)) {
      return NextResponse.json({ error: "color must be a valid #RRGGBB hex string." }, { status: 400 });
    }
    updates.color = body.color;
  }
  if (body.sort_order !== undefined) {
    if (typeof body.sort_order !== "number" || !Number.isInteger(body.sort_order)) {
      return NextResponse.json({ error: "sort_order must be an integer." }, { status: 400 });
    }
    updates.sort_order = body.sort_order;
  }
  if (body.is_archived !== undefined) {
    if (typeof body.is_archived !== "boolean") {
      return NextResponse.json({ error: "is_archived must be a boolean." }, { status: 400 });
    }
    updates.is_archived = body.is_archived;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("categories")
    .update(updates)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Category name already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to update category." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Category not found." }, { status: 404 });
  }

  return NextResponse.json({ category: data }, { status: 200 });
}
