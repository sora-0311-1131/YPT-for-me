import { NextResponse } from "next/server";
import { isAuthorizedRequest, unauthorizedResponse } from "@/lib/auth";
import {
  getStudyStatus,
  parseOptionalString,
  startStudySession,
  stopStudySession,
} from "@/lib/study-service";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Beginner-friendly single-call endpoint for iOS Shortcuts.
 * - Studying now  -> stops the session.
 * - Not studying  -> starts a session with `category_id` (query) or the last used category.
 * Optional query params: `tag_id`, `category_id`. No request body is required.
 * The response includes a ready-to-display `message`.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!isAuthorizedRequest(request)) {
    return unauthorizedResponse();
  }

  const url = new URL(request.url);
  const tagId = parseOptionalString(url.searchParams.get("tag_id")) ?? null;
  const requestedCategoryId = parseOptionalString(url.searchParams.get("category_id")) ?? null;

  const supabase = getSupabaseAdmin();
  const status = await getStudyStatus(supabase);
  if (!status.ok) {
    return NextResponse.json({ error: status.error }, { status: status.status });
  }

  if (status.data.is_active) {
    const stopped = await stopStudySession(supabase, {});
    if (!stopped.ok) {
      return NextResponse.json({ error: stopped.error }, { status: stopped.status });
    }
    const { duration_min, today_total_min, category_name } = stopped.data;
    return NextResponse.json(
      {
        action: "stopped",
        message: `お疲れ様！${category_name}を${duration_min}分集中しました（今日合計 ${today_total_min}分）`,
        ...stopped.data,
      },
      { status: 200 }
    );
  }

  const categoryId = requestedCategoryId ?? status.data.last_category?.id ?? null;
  if (!categoryId) {
    return NextResponse.json(
      { error: "No category available. Create a category in /admin first." },
      { status: 409 }
    );
  }

  const started = await startStudySession(supabase, {
    category_id: categoryId,
    tag_id: tagId,
  });
  if (!started.ok) {
    return NextResponse.json({ error: started.error }, { status: started.status });
  }

  return NextResponse.json(
    {
      action: "started",
      message: `開始しました：${started.data.category_name}`,
      ...started.data,
    },
    { status: started.data.already_exists ? 200 : 201 }
  );
}
