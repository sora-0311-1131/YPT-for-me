import { NextResponse } from "next/server";
import { getPublicAnalyticsData } from "@/lib/analytics-service";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const rawDays = url.searchParams.get("days");

  let days = 90;
  if (rawDays !== null) {
    const parsed = Number(rawDays);
    if (!Number.isInteger(parsed) || parsed < 7 || parsed > 365) {
      return NextResponse.json(
        { error: "days query parameter must be an integer between 7 and 365." },
        { status: 400 }
      );
    }
    days = parsed;
  }

  try {
    const supabase = getSupabaseAdmin();
    const data = await getPublicAnalyticsData(supabase, days);
    return NextResponse.json(data, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to load analytics data." }, { status: 500 });
  }
}
