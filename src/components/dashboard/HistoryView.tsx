"use client";

import { Calendar, Cloud, MapPin, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { PublicDashboardResponse } from "@/lib/dashboard-service";
import { formatDurationHm, formatJstDateHm, formatJstTimeHm, formatWeatherLabel } from "@/lib/format";
import type { CategoryRow, PublicSessionDto, UnivPeriod } from "@/lib/types";

interface HistoryViewProps {
  initialSessions: PublicSessionDto[];
  categories: Array<Pick<CategoryRow, "id" | "name" | "color" | "sort_order" | "is_archived">>;
  locations: string[];
  univPeriods: UnivPeriod[];
  refreshTick: number;
}

export function HistoryView({
  initialSessions,
  categories,
  locations,
  univPeriods,
  refreshTick,
}: HistoryViewProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [filteredSessions, setFilteredSessions] = useState<PublicSessionDto[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasFilter = Boolean(selectedCategoryId || selectedLocation || selectedDate);

  const periodLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of univPeriods) {
      map.set(p.key, p.label);
    }
    return map;
  }, [univPeriods]);

  useEffect(() => {
    if (!hasFilter) {
      setFilteredSessions(null);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ limit: "100" });
    if (selectedCategoryId) params.set("category_id", selectedCategoryId);
    if (selectedLocation) params.set("location", selectedLocation);
    if (selectedDate) params.set("date", selectedDate);

    fetch(`/api/dashboard?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as PublicDashboardResponse;
        setFilteredSessions(json.recent_sessions);
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError") return;
        setError("履歴の絞り込み取得に失敗しました。");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [hasFilter, selectedCategoryId, selectedLocation, selectedDate, refreshTick]);

  const sessions = hasFilter ? (filteredSessions ?? []) : initialSessions;
  const totalSec = sessions.reduce((sum, s) => sum + (s.duration_sec ?? 0), 0);

  const resetFilters = () => {
    setSelectedCategoryId("");
    setSelectedLocation("");
    setSelectedDate("");
  };

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            <span>カテゴリ</span>
            <select
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              className="h-9 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            >
              <option value="">すべて</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                  {cat.is_archived ? "（アーカイブ）" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            <span>場所</span>
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="h-9 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            >
              <option value="">すべて</option>
              {locations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            <span>論理日付</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="h-9 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>

          <div className="flex items-end justify-between gap-2">
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              <div>{sessions.length} 件</div>
              <div className="font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                計 {formatDurationHm(totalSec)}
              </div>
            </div>
            {hasFilter && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                クリア
              </button>
            )}
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Session list */}
      <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
        {loading ? (
          <div className="space-y-3 p-4">
            <div className="h-14 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
            <div className="h-14 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
            <div className="h-14 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
            条件に一致する学習履歴がありません。
          </div>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {sessions.map((session) => {
              const periodLabel = session.univ_period
                ? periodLabelMap.get(session.univ_period) ?? session.univ_period
                : null;

              return (
                <li
                  key={session.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: session.category_color }}
                      />
                      <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {session.category_name}
                      </span>
                      {session.ended_at === null && (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          計測中
                        </span>
                      )}
                      {periodLabel && (
                        <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                          {periodLabel}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                      <span className="inline-flex items-center gap-1 font-mono">
                        <Calendar className="h-3 w-3" />
                        {formatJstDateHm(session.started_at)}
                        {" – "}
                        {session.ended_at ? formatJstTimeHm(session.ended_at) : "現在"}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {session.location_label}
                      </span>
                      {(session.weather_code !== null || session.temperature_c !== null) && (
                        <span className="inline-flex items-center gap-1">
                          <Cloud className="h-3 w-3" />
                          {formatWeatherLabel(session.weather_code)}
                          {session.temperature_c !== null &&
                            ` ${Math.round(session.temperature_c)}°C`}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="font-mono text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                    {session.duration_sec !== null
                      ? formatDurationHm(session.duration_sec)
                      : "LIVE"}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
