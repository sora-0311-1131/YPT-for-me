"use client";

import { BarChart3, Clock, History, Lock, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { CategoryBreakdownItem, PublicDashboardResponse } from "@/lib/dashboard-service";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { addDaysToYmd, getLogicalDayBoundsUtc, getOverlapSeconds } from "@/lib/time";
import { AnalyticsView } from "./AnalyticsView";
import { CategoryBreakdown } from "./CategoryBreakdown";
import { HistoryView } from "./HistoryView";
import { KpiSummary } from "./KpiSummary";
import { TimerCard } from "./TimerCard";

type TabKey = "overview" | "analytics" | "history";

export function DashboardShell() {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [data, setData] = useState<PublicDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [refreshTick, setRefreshTick] = useState(0);

  const fetchDashboard = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store", signal });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as PublicDashboardResponse;
      setData(json);
      setRefreshTick((t) => t + 1);
      setError(null);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError("ダッシュボードデータの読み込みに失敗しました。");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + visibility refresh
  useEffect(() => {
    const controller = new AbortController();
    void fetchDashboard(controller.signal);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void fetchDashboard();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      controller.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fetchDashboard]);

  // Privacy-safe Realtime subscription on study_realtime_signals
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel("public-study-signals")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "study_realtime_signals" },
        () => {
          void fetchDashboard();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchDashboard]);

  // 1-second ticker when a session is active
  const activeStartedAt = data?.active_session?.started_at ?? null;
  useEffect(() => {
    if (!activeStartedAt) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [activeStartedAt]);

  const activeElapsedSec = useMemo(() => {
    if (!activeStartedAt) return 0;
    const startMs = new Date(activeStartedAt).getTime();
    if (Number.isNaN(startMs)) return 0;
    return Math.max(0, Math.floor((nowMs - startMs) / 1000));
  }, [activeStartedAt, nowMs]);

  const { activeTodaySec, activeWeekSec } = useMemo(() => {
    if (!data?.active_session) {
      return { activeTodaySec: 0, activeWeekSec: 0 };
    }
    const startMs = new Date(data.active_session.started_at).getTime();
    if (Number.isNaN(startMs) || nowMs <= startMs) {
      return { activeTodaySec: 0, activeWeekSec: 0 };
    }

    const boundary = data.settings_public.day_boundary_hour;
    const todayBounds = getLogicalDayBoundsUtc(data.today.logical_date, boundary);
    const weekStartYmd = addDaysToYmd(data.today.logical_date, -6);
    const weekStartBounds = getLogicalDayBoundsUtc(weekStartYmd, boundary);

    const todayStartMs = new Date(todayBounds.startIso).getTime();
    const todayEndMs = new Date(todayBounds.endIso).getTime();
    const weekStartMs = new Date(weekStartBounds.startIso).getTime();

    return {
      activeTodaySec: getOverlapSeconds(startMs, nowMs, todayStartMs, todayEndMs),
      activeWeekSec: getOverlapSeconds(startMs, nowMs, weekStartMs, todayEndMs),
    };
  }, [data, nowMs]);

  const liveTodayCategories = useMemo<CategoryBreakdownItem[]>(() => {
    if (!data) return [];
    const base = data.today.categories.map((item) => ({ ...item }));
    if (data.active_session && activeTodaySec > 0) {
      const existing = base.find((c) => c.category_id === data.active_session!.category_id);
      if (existing) {
        existing.total_sec += activeTodaySec;
      } else {
        base.push({
          category_id: data.active_session.category_id,
          name: data.active_session.category_name,
          color: data.active_session.category_color,
          total_sec: activeTodaySec,
        });
      }
      base.sort((a, b) => b.total_sec - a.total_sec);
    }
    return base;
  }, [data, activeTodaySec]);

  const liveTodayTotalSec = (data?.today.completed_sec ?? 0) + activeTodaySec;
  const liveWeekTotalSec = (data?.week.completed_sec ?? 0) + activeWeekSec;

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 transition-colors dark:bg-zinc-950 dark:text-zinc-100">
      <header className="sticky top-0 z-30 border-b border-zinc-200/80 bg-white/80 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                data?.active_session ? "animate-pulse bg-emerald-500" : "bg-zinc-400 dark:bg-zinc-600"
              }`}
            />
            <span className="truncate text-base font-bold tracking-tight">YPT for me</span>
          </div>

          <nav
            aria-label="ダッシュボードタブ"
            className="hidden items-center gap-1 rounded-xl bg-zinc-100 p-1 sm:flex dark:bg-zinc-900"
          >
            {(
              [
                { key: "overview", label: "Overview", icon: Clock },
                { key: "analytics", label: "Analytics", icon: BarChart3 },
                { key: "history", label: "History", icon: History },
              ] as const
            ).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  activeTab === key
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void fetchDashboard()}
              aria-label="最新データを再読み込み"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <ThemeToggle />
            <Link
              href="/admin"
              aria-label="管理画面"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <Lock className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-24 pt-5 sm:px-6 sm:py-8">
        {error && (
          <div className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {loading && !data ? (
          <div className="space-y-4">
            <div className="h-56 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-900" />
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="h-32 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-900" />
              <div className="h-32 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-900" />
              <div className="h-32 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-900" />
            </div>
          </div>
        ) : !data ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900/70">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              データを取得できませんでした。再読み込みを試してください。
            </p>
            <button
              type="button"
              onClick={() => void fetchDashboard()}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              再読み込み
            </button>
          </section>
        ) : activeTab === "overview" ? (
          <div className="space-y-6">
            <TimerCard
              activeSession={data.active_session}
              elapsedSec={activeElapsedSec}
              longSessionWarnMin={data.settings_public.long_session_warn_min}
            />

            <KpiSummary
              todayTotalSec={liveTodayTotalSec}
              todayGoalMin={data.today.goal_min}
              todayDayType={data.today.day_type}
              streakDays={data.streak_days}
              streakMinMinutes={data.settings_public.streak_min_minutes}
              weekTotalSec={liveWeekTotalSec}
            />

            <CategoryBreakdown items={liveTodayCategories} />
          </div>
        ) : activeTab === "history" ? (
          <HistoryView
            initialSessions={data.recent_sessions}
            categories={data.categories}
            locations={data.locations}
            univPeriods={data.settings_public.univ_periods}
            refreshTick={refreshTick}
          />
        ) : (
          <AnalyticsView refreshTick={refreshTick} />
        )}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav
        aria-label="モバイルナビゲーション"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200/80 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden dark:border-zinc-800/80 dark:bg-zinc-950/90"
      >
        <div className="grid grid-cols-3">
          {(
            [
              { key: "overview", label: "Overview", icon: Clock },
              { key: "analytics", label: "Analytics", icon: BarChart3 },
              { key: "history", label: "History", icon: History },
            ] as const
          ).map(({ key, label, icon: Icon }) => {
            const active = activeTab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium transition ${
                  active
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                }`}
              >
                <span
                  className={`inline-flex items-center justify-center rounded-full px-3.5 py-0.5 transition ${
                    active ? "bg-blue-500/12 dark:bg-blue-400/15" : ""
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
