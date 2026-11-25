import { NextResponse } from "next/server";
import { getPublicDashboardData } from "@/lib/dashboard-service";
import { parseOptionalString } from "@/lib/study-service";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidCalendarYmd(ymd: string): boolean {
  if (!YMD_RE.test(ymd)) {
    return false;
  }
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() + 1 === m &&
    date.getUTCDate() === d
  );
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const categoryId = parseOptionalString(url.searchParams.get("category_id")) ?? null;
  const location = parseOptionalString(url.searchParams.get("location")) ?? null;
  const rawDate = parseOptionalString(url.searchParams.get("date")) ?? null;

  if (rawDate !== null && !isValidCalendarYmd(rawDate)) {
    return NextResponse.json(
      { error: "date query parameter must be a valid YYYY-MM-DD calendar date." },
      { status: 400 }
    );
  }

  const rawLimitParam = url.searchParams.get("limit");
  let limit = 50;
  if (rawLimitParam !== null) {
    const parsedLimit = Number(rawLimitParam);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 200) {
      return NextResponse.json(
        { error: "limit query parameter must be an integer between 1 and 200." },
        { status: 400 }
      );
    }
    limit = parsedLimit;
  }

  try {
    const supabase = getSupabaseAdmin();
    const data = await getPublicDashboardData(supabase, {
      category_id: categoryId,
      location,
      date: rawDate,
      limit,
    });
    return NextResponse.json(data, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to load dashboard data." }, { status: 500 });
  }
}
