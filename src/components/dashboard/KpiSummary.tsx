"use client";

import { CalendarDays, Flame, Target } from "lucide-react";
import { formatDurationHm } from "@/lib/format";
import type { DayType } from "@/lib/types";

interface KpiSummaryProps {
  todayTotalSec: number;
  todayGoalMin: number;
  todayDayType: DayType;
  streakDays: number;
  streakMinMinutes: number;
  weekTotalSec: number;
}

export function KpiSummary({
  todayTotalSec,
  todayGoalMin,
  todayDayType,
  streakDays,
  streakMinMinutes,
  weekTotalSec,
}: KpiSummaryProps) {
  const goalSec = Math.max(1, todayGoalMin * 60);
  const progressPct = Math.min(100, Math.round((todayTotalSec / goalSec) * 100));
  const dayTypeLabel =
    todayDayType === "holiday" ? "祝日目標" : todayDayType === "weekend" ? "休日目標" : "平日目標";

  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
      {/* Today Total & Daily Goal */}
      <div className="col-span-2 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:col-span-1 sm:p-5 dark:border-zinc-800 dark:bg-zinc-900/70">
        <div className="flex items-center justify-between gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          <span className="inline-flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 text-blue-500" />
            今日の合計
          </span>
          <span>
            {dayTypeLabel} {formatDurationHm(todayGoalMin * 60)}
          </span>
        </div>

        <div className="mt-2.5 flex items-baseline justify-between sm:mt-3">
          <span className="font-mono text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
            {formatDurationHm(todayTotalSec)}
          </span>
          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
            {progressPct}%
          </span>
        </div>

        <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-zinc-100 sm:mt-3 dark:bg-zinc-800">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Streak */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 dark:border-zinc-800 dark:bg-zinc-900/70">
        <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] font-medium text-zinc-500 sm:text-xs dark:text-zinc-400">
          <span className="inline-flex items-center gap-1">
            <Flame className="h-3.5 w-3.5 shrink-0 text-orange-500" />
            連続達成
          </span>
          <span>{streakMinMinutes}分/日</span>
        </div>

        <div className="mt-2.5 flex items-baseline gap-1 sm:mt-3 sm:gap-1.5">
          <span className="font-mono text-xl font-bold tabular-nums text-zinc-900 sm:text-2xl dark:text-zinc-50">
            {streakDays}
          </span>
          <span className="text-xs text-zinc-500 sm:text-sm dark:text-zinc-400">日連続</span>
        </div>

        <p className="mt-2 text-[11px] leading-relaxed text-zinc-500 sm:mt-3 sm:text-xs dark:text-zinc-400">
          {todayTotalSec >= streakMinMinutes * 60
            ? "今日の基準を達成済み"
            : `あと ${Math.max(1, Math.ceil((streakMinMinutes * 60 - todayTotalSec) / 60))} 分で達成`}
        </p>
      </div>

      {/* Last 7 days */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 dark:border-zinc-800 dark:bg-zinc-900/70">
        <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] font-medium text-zinc-500 sm:text-xs dark:text-zinc-400">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
            直近7日間
          </span>
          <span className="hidden sm:inline">1日平均</span>
        </div>

        <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-1 sm:mt-3">
          <span className="font-mono text-xl font-bold tabular-nums text-zinc-900 sm:text-2xl dark:text-zinc-50">
            {formatDurationHm(weekTotalSec)}
          </span>
          <span className="font-mono text-[11px] text-zinc-500 sm:text-xs dark:text-zinc-400">
            {formatDurationHm(Math.round(weekTotalSec / 7))}/日
          </span>
        </div>

        <p className="mt-2 text-[11px] leading-relaxed text-zinc-500 sm:mt-3 sm:text-xs dark:text-zinc-400">
          論理日付ベース累計
        </p>
      </div>
    </section>
  );
}
