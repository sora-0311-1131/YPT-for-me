"use client";

import { Calendar, Cloud, Clock, Gauge, MapPin } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CalendarDayItem, PublicAnalyticsResponse } from "@/lib/analytics-service";
import { formatDurationHm } from "@/lib/format";

interface AnalyticsViewProps {
  refreshTick: number;
}

const WEEKDAY_LABELS_MON_FIRST: Array<{ dow: number; label: string }> = [
  { dow: 1, label: "月" },
  { dow: 2, label: "火" },
  { dow: 3, label: "水" },
  { dow: 4, label: "木" },
  { dow: 5, label: "金" },
  { dow: 6, label: "土" },
  { dow: 0, label: "日" },
];

const CALENDAR_LEVEL_CLASSES: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: "bg-zinc-100 dark:bg-zinc-800/80",
  1: "bg-emerald-200 dark:bg-emerald-950/90",
  2: "bg-emerald-400 dark:bg-emerald-700",
  3: "bg-emerald-500 dark:bg-emerald-500",
  4: "bg-emerald-600 dark:bg-emerald-400",
};

function heatColorClass(sec: number, maxSec: number): string {
  if (sec <= 0 || maxSec <= 0) return "bg-zinc-100 dark:bg-zinc-800/70";
  const ratio = sec / maxSec;
  if (ratio < 0.25) return "bg-blue-200 dark:bg-blue-950/90";
  if (ratio < 0.5) return "bg-blue-400 dark:bg-blue-700";
  if (ratio < 0.75) return "bg-blue-500 dark:bg-blue-500";
  return "bg-blue-600 dark:bg-blue-400";
}

export function AnalyticsView({ refreshTick }: AnalyticsViewProps) {
  const [days, setDays] = useState<30 | 90 | 365>(90);
  const [data, setData] = useState<PublicAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`/api/analytics?days=${days}`, { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as PublicAnalyticsResponse;
        setData(json);
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError") return;
        setError("分析データの読み込みに失敗しました。");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [days, refreshTick]);

  // Build Sunday-start 7-row week columns for the 365-day contribution calendar
  const calendarWeeks = useMemo<Array<Array<CalendarDayItem | null>>>(() => {
    if (!data || data.calendar.length === 0) return [];
    const first = data.calendar[0];
    const [y, m, d] = first.date.split("-").map(Number);
    const startDow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat

    const padded: Array<CalendarDayItem | null> = [
      ...Array<null>(startDow).fill(null),
      ...data.calendar,
    ];
    const weeks: Array<Array<CalendarDayItem | null>> = [];
    for (let i = 0; i < padded.length; i += 7) {
      const slice = padded.slice(i, i + 7);
      while (slice.length < 7) slice.push(null);
      weeks.push(slice);
    }
    return weeks;
  }, [data]);

  const heatmapLookup = useMemo(() => {
    const map = new Map<string, number>();
    let maxSec = 0;
    for (const cell of data?.weekday_hour_heatmap ?? []) {
      map.set(`${cell.weekday}:${cell.hour}`, cell.total_sec);
      if (cell.total_sec > maxSec) maxSec = cell.total_sec;
    }
    return { map, maxSec };
  }, [data]);

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
        {error}
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className="h-44 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-900" />
        <div className="h-56 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-900" />
      </div>
    );
  }

  if (!data) return null;

  const maxPeriodSec = Math.max(1, ...data.univ_periods.map((p) => p.total_sec));
  const maxSpotSec = Math.max(1, ...data.spots.map((s) => s.total_sec));
  const visibleWeather = data.weather.filter((w) => w.session_count > 0);
  const visiblePressure = data.pressure.filter((p) => p.session_count > 0);

  return (
    <div className="space-y-6">
      {/* Period Selector & Summary */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-5 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
            集計期間: 直近 {days} 日間
          </span>
          <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
            計 {formatDurationHm(data.total_sec)} / {data.total_sessions} セッション
          </span>
        </div>

        <div className="flex items-center gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800">
          {([30, 90, 365] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setDays(option)}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                days === option
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-50"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              }`}
            >
              {option}日
            </button>
          ))}
        </div>
      </div>

      {/* 1. GitHub Grass Calendar (always 365 days) */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Calendar className="h-4 w-4 text-emerald-500" />
            年間学習カレンダー（直近 365 日）
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            <span>少</span>
            {([0, 1, 2, 3, 4] as const).map((lvl) => (
              <span
                key={lvl}
                className={`inline-block h-3 w-3 rounded-[3px] ${CALENDAR_LEVEL_CLASSES[lvl]}`}
              />
            ))}
            <span>多</span>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto pb-1">
          <div className="inline-flex gap-1">
            {calendarWeeks.map((week, wIdx) => (
              <div key={wIdx} className="flex flex-col gap-1">
                {week.map((day, dIdx) =>
                  day ? (
                    <div
                      key={day.date}
                      title={`${day.date}: ${formatDurationHm(day.total_sec)} (${day.session_count}件)`}
                      className={`h-3 w-3 rounded-[3px] ${CALENDAR_LEVEL_CLASSES[day.level]}`}
                    />
                  ) : (
                    <div key={`pad-${wIdx}-${dIdx}`} className="h-3 w-3" />
                  )
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 2. Weekday x Hour Heatmap */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Clock className="h-4 w-4 text-blue-500" />
          曜日 × 時間帯ヒートマップ（JST・実時間按分）
        </div>

        <div className="mt-4 overflow-x-auto">
          <div className="min-w-[600px] space-y-1.5">
            <div className="grid grid-cols-[28px_repeat(24,minmax(0,1fr))] gap-1 text-center font-mono text-[10px] text-zinc-400">
              <span />
              {Array.from({ length: 24 }, (_, hour) => (
                <span key={hour}>{hour % 3 === 0 ? hour : ""}</span>
              ))}
            </div>

            {WEEKDAY_LABELS_MON_FIRST.map(({ dow, label }) => (
              <div
                key={dow}
                className="grid grid-cols-[28px_repeat(24,minmax(0,1fr))] items-center gap-1"
              >
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  {label}
                </span>
                {Array.from({ length: 24 }, (_, hour) => {
                  const sec = heatmapLookup.map.get(`${dow}:${hour}`) ?? 0;
                  return (
                    <div
                      key={hour}
                      title={`${label}曜 ${hour}:00台 — ${formatDurationHm(sec)}`}
                      className={`h-5 rounded-[4px] ${heatColorClass(sec, heatmapLookup.maxSec)}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. University Period & 4. Spot Breakdown */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
          <h3 className="text-sm font-semibold">大学時限別（JST）</h3>
          <div className="mt-4 space-y-3">
            {data.univ_periods.map((item) => {
              const pct = Math.round((item.total_sec / maxPeriodSec) * 100);
              return (
                <div key={item.key} className="space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">
                      {item.label}
                    </span>
                    <span className="font-mono text-zinc-500 dark:text-zinc-400">
                      {formatDurationHm(item.total_sec)} ({item.session_count}回)
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-indigo-500"
                      style={{ width: `${item.total_sec > 0 ? Math.max(3, pct) : 0}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <MapPin className="h-4 w-4 text-emerald-500" />
            スポット別集中比較
          </div>

          {data.spots.length === 0 ? (
            <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
              この期間のデータがありません。
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {data.spots.map((spot) => {
                const pct = Math.round((spot.total_sec / maxSpotSec) * 100);
                return (
                  <div key={spot.key} className="space-y-1 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                        {spot.label}
                      </span>
                      <span className="font-mono text-zinc-500 dark:text-zinc-400">
                        計 {formatDurationHm(spot.total_sec)} / 平均 {formatDurationHm(spot.avg_sec)} ({spot.session_count}回)
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${Math.max(3, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* 5. Weather & Pressure Correlation */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Cloud className="h-4 w-4 text-sky-500" />
            天気別の集中傾向
          </div>

          {visibleWeather.length === 0 ? (
            <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
              天気データ付きのセッションがありません。
            </p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {visibleWeather.map((w) => (
                <div
                  key={w.key}
                  className="rounded-xl border border-zinc-200 bg-zinc-50 p-3.5 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    {w.label}
                  </div>
                  <div className="mt-1 font-mono text-lg font-bold tabular-nums">
                    {formatDurationHm(w.total_sec)}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                    平均 {formatDurationHm(w.avg_sec)} / {w.session_count}回
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Gauge className="h-4 w-4 text-amber-500" />
            気圧帯別の集中傾向
          </div>

          {visiblePressure.length === 0 ? (
            <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
              気圧データ付きのセッションがありません。
            </p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {visiblePressure.map((p) => (
                <div
                  key={p.key}
                  className="rounded-xl border border-zinc-200 bg-zinc-50 p-3.5 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    {p.label}
                  </div>
                  <div className="mt-1 font-mono text-lg font-bold tabular-nums">
                    {formatDurationHm(p.total_sec)}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                    平均 {formatDurationHm(p.avg_sec)} / {p.session_count}回
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
