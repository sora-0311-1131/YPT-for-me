import { NextResponse } from "next/server";
import { isAuthorizedRequest, unauthorizedResponse } from "@/lib/auth";
import { getStudyStatus } from "@/lib/study-service";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorizedRequest(request)) {
    return unauthorizedResponse();
  }

  const supabase = getSupabaseAdmin();
  const result = await getStudyStatus(supabase);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data, { status: 200 });
}
