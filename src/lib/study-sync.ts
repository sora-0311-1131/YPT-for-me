import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseCoordinates,
  parseOccurredAt,
  parseOptionalString,
  resolveCategory,
  startStudySession,
  stopStudySession,
} from "./study-service";
import type { StudySessionRow } from "./types";

export const MAX_SYNC_EVENTS = 100;
const WEATHER_FRESHNESS_MS = 30 * 60 * 1000;

export interface SyncStartEvent {
  client_event_id: string;
  type: "start";
  category_id: string | null;
  category_name: string | null;
  memo: string | null;
  tag_id: string | null;
  latitude: number | null;
  longitude: number | null;
  occurred_at: Date;
}

export interface SyncStopEvent {
  client_event_id: string;
  type: "stop";
  occurred_at: Date;
}

export type SyncEvent = SyncStartEvent | SyncStopEvent;

export interface SyncEventResult {
  client_event_id: string;
  type: "start" | "stop";
  outcome:
    | "applied"
    | "already_exists"
    | "applied_with_conflict_close"
    | "skipped_no_active"
    | "error";
  session_id?: string;
  closed_conflict_session_id?: string;
  error?: string;
}

export interface SyncStudyResponse {
  processed_event_ids: string[];
  results: SyncEventResult[];
}

export function parseSyncEvents(
  rawEvents: unknown
): { ok: true; events: SyncEvent[] } | { ok: false; error: string } {
  if (!Array.isArray(rawEvents)) {
    return { ok: false, error: "events must be an array." };
  }
  if (rawEvents.length > MAX_SYNC_EVENTS) {
    return { ok: false, error: `At most ${MAX_SYNC_EVENTS} events can be synced per request.` };
  }

  const parsed: SyncEvent[] = [];

  for (let i = 0; i < rawEvents.length; i += 1) {
    const item = rawEvents[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, error: `events[${i}] must be an object.` };
    }
    const obj = item as Record<string, unknown>;
    const clientEventId = parseOptionalString(obj.client_event_id);
    if (!clientEventId) {
      return { ok: false, error: `events[${i}].client_event_id is required.` };
    }

    if (obj.occurred_at === undefined || obj.occurred_at === null || obj.occurred_at === "") {
      return { ok: false, error: `events[${i}].occurred_at is required.` };
    }
    const occurred = parseOccurredAt(obj.occurred_at);
    if (!occurred.ok) {
      return { ok: false, error: `events[${i}]: ${occurred.error}` };
    }

    if (obj.type === "start") {
      const categoryId = parseOptionalString(obj.category_id) ?? null;
      const categoryName = parseOptionalString(obj.category_name) ?? null;
      if (!categoryId && !categoryName) {
        return {
          ok: false,
          error: `events[${i}] requires category_id or category_name for start events.`,
        };
      }
      const coords = parseCoordinates(obj.latitude, obj.longitude);
      if (!coords.ok) {
        return { ok: false, error: `events[${i}]: ${coords.error}` };
      }
      parsed.push({
        client_event_id: clientEventId,
        type: "start",
        category_id: categoryId,
        category_name: categoryName,
        memo: parseOptionalString(obj.memo) ?? null,
        tag_id: parseOptionalString(obj.tag_id) ?? null,
        latitude: coords.latitude,
        longitude: coords.longitude,
        occurred_at: occurred.date,
      });
    } else if (obj.type === "stop") {
      parsed.push({
        client_event_id: clientEventId,
        type: "stop",
        occurred_at: occurred.date,
      });
    } else {
      return { ok: false, error: `events[${i}].type must be "start" or "stop".` };
    }
  }

  return { ok: true, events: parsed };
}

/**
 * Applies queued offline events in chronological order (`occurred_at` ascending;
 * on equal timestamps, `stop` runs before `start`).
 * - Idempotent via `start_event_id` / `stop_event_id`.
 * - If a `start` arrives while another session is active, automatically closes the
 *   previous active session with `needs_review = true` so recording never stalls.
 * - Skips current-weather lookup for historical events older than 30 minutes.
 */
export async function syncStudyEvents(
  supabase: SupabaseClient,
  events: SyncEvent[],
  now: Date = new Date()
): Promise<SyncStudyResponse> {
  const ordered = [...events].sort((a, b) => {
    const diff = a.occurred_at.getTime() - b.occurred_at.getTime();
    if (diff !== 0) return diff;
    if (a.type === b.type) return 0;
    return a.type === "stop" ? -1 : 1;
  });

  const processed_event_ids: string[] = [];
  const results: SyncEventResult[] = [];

  for (const event of ordered) {
    if (event.type === "start") {
      // Pre-check idempotency before touching any active session
      const { data: existingStart } = await supabase
        .from("study_sessions")
        .select("id")
        .eq("start_event_id", event.client_event_id)
        .maybeSingle();

      if (existingStart) {
        processed_event_ids.push(event.client_event_id);
        results.push({
          client_event_id: event.client_event_id,
          type: "start",
          outcome: "already_exists",
          session_id: existingStart.id,
        });
        continue;
      }

      // Validate that the target category actually exists BEFORE touching any active session
      const category = await resolveCategory(supabase, {
        category_id: event.category_id,
        category_name: event.category_name,
      });
      if (!category) {
        results.push({
          client_event_id: event.client_event_id,
          type: "start",
          outcome: "error",
          error: "Valid category_id or category_name is required.",
        });
        continue;
      }

      // Check for an already-active session and auto-close with needs_review = true
      let closedConflictSession: Pick<StudySessionRow, "id" | "needs_review"> | undefined;
      const { data: activeRow } = await supabase
        .from("study_sessions")
        .select("id, started_at, needs_review")
        .is("ended_at", null)
        .maybeSingle();

      if (activeRow) {
        const prev = activeRow as Pick<StudySessionRow, "id" | "started_at" | "needs_review">;
        const prevStartMs = new Date(prev.started_at).getTime();
        const closeMs = Math.max(prevStartMs, event.occurred_at.getTime());
        const durationSec = Math.round((closeMs - prevStartMs) / 1000);

        const { error: closeError } = await supabase
          .from("study_sessions")
          .update({
            ended_at: new Date(closeMs).toISOString(),
            duration_sec: durationSec,
            needs_review: true,
          })
          .eq("id", prev.id)
          .is("ended_at", null);

        if (closeError) {
          results.push({
            client_event_id: event.client_event_id,
            type: "start",
            outcome: "error",
            error: "Failed to auto-close conflicting active session.",
          });
          continue;
        }
        closedConflictSession = { id: prev.id, needs_review: prev.needs_review };
      }

      const ageMs = now.getTime() - event.occurred_at.getTime();
      const skipWeather = ageMs > WEATHER_FRESHNESS_MS || ageMs < -WEATHER_FRESHNESS_MS;

      const startResult = await startStudySession(supabase, {
        client_event_id: event.client_event_id,
        category_id: category.id,
        category_name: category.name,
        memo: event.memo,
        tag_id: event.tag_id,
        latitude: event.latitude,
        longitude: event.longitude,
        occurred_at: event.occurred_at,
        skip_weather: skipWeather,
      });

      if (!startResult.ok) {
        // Best-effort rollback of auto-closed session so active tracking is preserved on start failure
        if (closedConflictSession) {
          await supabase
            .from("study_sessions")
            .update({
              ended_at: null,
              duration_sec: null,
              needs_review: closedConflictSession.needs_review,
            })
            .eq("id", closedConflictSession.id);
        }
        results.push({
          client_event_id: event.client_event_id,
          type: "start",
          outcome: "error",
          error: startResult.error,
        });
        continue;
      }

      processed_event_ids.push(event.client_event_id);
      results.push({
        client_event_id: event.client_event_id,
        type: "start",
        outcome: startResult.data.already_exists
          ? "already_exists"
          : closedConflictSession
            ? "applied_with_conflict_close"
            : "applied",
        session_id: startResult.data.session_id,
        ...(closedConflictSession
          ? { closed_conflict_session_id: closedConflictSession.id }
          : {}),
      });
    } else {
      const stopResult = await stopStudySession(supabase, {
        client_event_id: event.client_event_id,
        occurred_at: event.occurred_at,
      });

      if (stopResult.ok) {
        processed_event_ids.push(event.client_event_id);
        results.push({
          client_event_id: event.client_event_id,
          type: "stop",
          outcome: stopResult.data.already_exists ? "already_exists" : "applied",
          session_id: stopResult.data.session_id,
        });
      } else if (stopResult.status === 404) {
        // No active session left (e.g. already stopped manually) -> mark processed so queue clears
        processed_event_ids.push(event.client_event_id);
        results.push({
          client_event_id: event.client_event_id,
          type: "stop",
          outcome: "skipped_no_active",
        });
      } else {
        results.push({
          client_event_id: event.client_event_id,
          type: "stop",
          outcome: "error",
          error: stopResult.error,
        });
      }
    }
  }

  return { processed_event_ids, results };
}
