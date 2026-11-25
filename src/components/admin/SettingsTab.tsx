"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { AppSettingsRow, UnivPeriod } from "@/lib/types";

interface SettingsTabProps {
  settings: AppSettingsRow | null;
  onRefresh: () => Promise<void>;
  onUnauthorized: () => Promise<void> | void;
}

const HM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function SettingsTab({ settings, onRefresh, onUnauthorized }: SettingsTabProps) {
  const [dayBoundaryHour, setDayBoundaryHour] = useState("4");
  const [streakMinMinutes, setStreakMinMinutes] = useState("30");
  const [goalWeekdayMin, setGoalWeekdayMin] = useState("180");
  const [goalWeekendMin, setGoalWeekendMin] = useState("360");
  const [longWarnMin, setLongWarnMin] = useState("360");
  const [periods, setPeriods] = useState<UnivPeriod[]>([]);

  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!settings) return;
    setDayBoundaryHour(String(settings.day_boundary_hour));
    setStreakMinMinutes(String(settings.streak_min_minutes));
    setGoalWeekdayMin(String(settings.daily_goal_weekday_min));
    setGoalWeekendMin(String(settings.daily_goal_weekend_min));
    setLongWarnMin(String(settings.long_session_warn_min));
    setPeriods(settings.univ_periods.map((p) => ({ ...p })));
  }, [settings]);

  const updatePeriod = (index: number, field: keyof UnivPeriod, value: string) => {
    setPeriods((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, [field]: value } : item))
    );
  };

  const addPeriod = () => {
    setPeriods((prev) => {
      const existingKeys = new Set(prev.map((p) => p.key.trim()));
      let idx = prev.length + 1;
      while (existingKeys.has(`period_custom_${idx}`)) {
        idx += 1;
      }
      return [
        ...prev,
        { key: `period_custom_${idx}`, label: "新規時限", start: "18:00", end: "19:30" },
      ];
    });
  };

  const removePeriod = (index: number) => {
    setPeriods((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const boundary = Number(dayBoundaryHour);
    const streakMin = Number(streakMinMinutes);
    const weekday = Number(goalWeekdayMin);
    const weekend = Number(goalWeekendMin);
    const warn = Number(longWarnMin);

    if (!Number.isInteger(boundary) || boundary < 0 || boundary > 6) {
      setFeedback({ type: "error", text: "1日の日付境界は 0〜6 の整数（時）で指定してください。" });
      return;
    }
    if (!Number.isInteger(streakMin) || streakMin < 0 || streakMin > 1440) {
      setFeedback({ type: "error", text: "Streak 最低時間は 0〜1440 分で指定してください。" });
      return;
    }
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 1440) {
      setFeedback({ type: "error", text: "平日の目標時間は 1〜1440 分で指定してください。" });
      return;
    }
    if (!Number.isInteger(weekend) || weekend < 1 || weekend > 1440) {
      setFeedback({ type: "error", text: "休日目標時間は 1〜1440 分で指定してください。" });
      return;
    }
    if (!Number.isInteger(warn) || warn < 1 || warn > 2880) {
      setFeedback({ type: "error", text: "長時間警告しきい値は 1〜2880 分で指定してください。" });
      return;
    }

    if (periods.length === 0) {
      setFeedback({ type: "error", text: "大学時限は1件以上登録してください。" });
      return;
    }

    const seenKeys = new Set<string>();
    const cleanedPeriods: UnivPeriod[] = [];
    for (let i = 0; i < periods.length; i += 1) {
      const p = periods[i];
      const key = p.key.trim();
      const label = p.label.trim();
      const start = p.start.trim();
      const end = p.end.trim();
      if (!key || !label) {
        setFeedback({ type: "error", text: `時限 ${i + 1} 行目の key と表示名を入力してください。` });
        return;
      }
      if (seenKeys.has(key)) {
        setFeedback({ type: "error", text: `時限 key「${key}」が重複しています。` });
        return;
      }
      if (!HM_RE.test(start) || !HM_RE.test(end)) {
        setFeedback({ type: "error", text: `時限「${label}」の時刻は HH:MM 形式で入力してください。` });
        return;
      }
      if (start === end) {
        setFeedback({ type: "error", text: `時限「${label}」の開始時刻と終了時刻は異なる値にしてください。` });
        return;
      }
      seenKeys.add(key);
      cleanedPeriods.push({ key, label, start, end });
    }

    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          day_boundary_hour: boundary,
          streak_min_minutes: streakMin,
          daily_goal_weekday_min: weekday,
          daily_goal_weekend_min: weekend,
          long_session_warn_min: warn,
          univ_periods: cleanedPeriods,
        }),
      });
      if (res.status === 401) {
        await onUnauthorized();
        return;
      }
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setFeedback({ type: "error", text: json.error ?? "設定の更新に失敗しました。" });
        return;
      }
      setFeedback({ type: "ok", text: "アプリ設定を保存しました。" });
      await onRefresh();
    } catch {
      setFeedback({ type: "error", text: "通信エラーが発生しました。" });
    } finally {
      setBusy(false);
    }
  };

  if (!settings) {
    return (
      <section className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-400">
        設定データを取得できませんでした。右上の再読み込みボタンを押してください。
      </section>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {feedback && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            feedback.type === "ok"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"
          }`}
        >
          {feedback.text}
        </div>
      )}

      <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-900/70">
        <h2 className="text-sm font-semibold">集計・目標・警告設定</h2>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span>1日の日付境界（JST 0〜6時）</span>
            <input
              type="number"
              min={0}
              max={6}
              value={dayBoundaryHour}
              onChange={(e) => setDayBoundaryHour(e.target.value)}
              className="h-11 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-base text-zinc-900 sm:h-9 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span>Streak 達成最低時間（分）</span>
            <input
              type="number"
              min={0}
              max={1440}
              value={streakMinMinutes}
              onChange={(e) => setStreakMinMinutes(e.target.value)}
              className="h-11 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-base text-zinc-900 sm:h-9 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span>長時間警告しきい値（分）</span>
            <input
              type="number"
              min={1}
              max={2880}
              value={longWarnMin}
              onChange={(e) => setLongWarnMin(e.target.value)}
              className="h-11 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-base text-zinc-900 sm:h-9 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span>平日の目標時間（分）</span>
            <input
              type="number"
              min={1}
              max={1440}
              value={goalWeekdayMin}
              onChange={(e) => setGoalWeekdayMin(e.target.value)}
              className="h-11 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-base text-zinc-900 sm:h-9 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span>土日祝の目標時間（分）</span>
            <input
              type="number"
              min={1}
              max={1440}
              value={goalWeekendMin}
              onChange={(e) => setGoalWeekendMin(e.target.value)}
              className="h-11 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-base text-zinc-900 sm:h-9 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-900/70">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">大学時限レンジ（JST）</h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              日跨ぎ（例: 23:00 〜 04:00）も指定できます。
            </p>
          </div>
          <button
            type="button"
            onClick={addPeriod}
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-zinc-200 px-3 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 sm:h-8 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <Plus className="h-3.5 w-3.5" />
            行を追加
          </button>
        </div>

        <div className="space-y-3 sm:space-y-2.5">
          {periods.map((period, idx) => (
            <div
              key={idx}
              className="grid grid-cols-2 items-center gap-2 rounded-xl border border-zinc-100 bg-zinc-50/50 p-2.5 sm:grid-cols-12 sm:border-0 sm:bg-transparent sm:p-0 dark:border-zinc-800/80 dark:bg-zinc-950/30 sm:dark:bg-transparent"
            >
              <input
                type="text"
                value={period.key}
                onChange={(e) => updatePeriod(idx, "key", e.target.value)}
                placeholder="key"
                aria-label="時限キー"
                className="h-10 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 font-mono text-base sm:col-span-3 sm:h-9 sm:text-xs dark:border-zinc-700 dark:bg-zinc-950"
              />
              <input
                type="text"
                value={period.label}
                onChange={(e) => updatePeriod(idx, "label", e.target.value)}
                placeholder="表示名"
                aria-label="時限表示名"
                className="h-10 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 text-base sm:col-span-3 sm:h-9 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
              <input
                type="time"
                value={period.start}
                onChange={(e) => updatePeriod(idx, "start", e.target.value)}
                aria-label="開始時刻"
                className="h-10 w-full min-w-0 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 font-mono text-base sm:col-span-2 sm:h-9 sm:text-xs dark:border-zinc-700 dark:bg-zinc-950"
              />
              <span className="hidden text-center text-xs text-zinc-400 sm:col-span-1 sm:block">
                〜
              </span>
              <input
                type="time"
                value={period.end}
                onChange={(e) => updatePeriod(idx, "end", e.target.value)}
                aria-label="終了時刻"
                className="h-10 w-full min-w-0 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 font-mono text-base sm:col-span-2 sm:h-9 sm:text-xs dark:border-zinc-700 dark:bg-zinc-950"
              />
              <button
                type="button"
                disabled={periods.length <= 1}
                onClick={() => removePeriod(idx)}
                aria-label="行を削除"
                className="col-span-2 inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-red-500/30 text-xs text-red-600 transition hover:bg-red-500/10 disabled:opacity-40 sm:col-span-1 dark:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="sm:hidden">この行を削除</span>
              </button>
            </div>
          ))}
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50 sm:h-10 sm:w-auto"
        >
          <Save className="h-4 w-4" />
          設定を保存
        </button>
      </div>
    </form>
  );
}
