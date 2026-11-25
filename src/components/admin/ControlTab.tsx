"use client";

import { AlertTriangle, CheckCircle2, Play, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { isoToJstDatetimeLocal, jstDatetimeLocalToIso } from "@/lib/datetime-local";
import { formatDurationHm, formatDurationHms, formatJstDateHm } from "@/lib/format";
import type { AdminSessionDto, AppSettingsRow, CategoryRow } from "@/lib/types";

interface ControlTabProps {
  sessions: AdminSessionDto[];
  reviewSessions: AdminSessionDto[];
  categories: CategoryRow[];
  settings: AppSettingsRow | null;
  onRefresh: () => Promise<void>;
  onUnauthorized: () => Promise<void> | void;
}

export function ControlTab({
  sessions,
  reviewSessions,
  categories,
  settings,
  onRefresh,
  onUnauthorized,
}: ControlTabProps) {
  const activeSession = sessions.find((s) => s.ended_at === null) ?? null;
  const activeCategories = categories.filter((c) => !c.is_archived);

  const [selectedCategoryId, setSelectedCategoryId] = useState(activeCategories[0]?.id ?? "");
  const [memo, setMemo] = useState("");
  const [customEndLocal, setCustomEndLocal] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!selectedCategoryId && activeCategories.length > 0) {
      setSelectedCategoryId(activeCategories[0].id);
    }
  }, [activeCategories, selectedCategoryId]);

  useEffect(() => {
    if (!activeSession) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [activeSession]);

  const elapsedSec = activeSession
    ? Math.max(0, Math.floor((nowMs - new Date(activeSession.started_at).getTime()) / 1000))
    : 0;
  const warnMin = settings?.long_session_warn_min ?? 360;
  const isLongActive = activeSession !== null && elapsedSec >= warnMin * 60;

  const jsonHeaders = { "Content-Type": "application/json" };

  const handleManualStart = async () => {
    if (!selectedCategoryId) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/study/start", {
        method: "POST",
        credentials: "same-origin",
        headers: jsonHeaders,
        body: JSON.stringify({
          category_id: selectedCategoryId,
          memo: memo.trim() || undefined,
          tag_id: "web_manual",
        }),
      });
      if (res.status === 401) {
        await onUnauthorized();
        return;
      }
      const json = (await res.json()) as { error?: string; category_name?: string };
      if (!res.ok) {
        setFeedback({ type: "error", text: json.error ?? "開始に失敗しました。" });
        return;
      }
      setMemo("");
      setFeedback({ type: "ok", text: `「${json.category_name ?? ""}」の計測を開始しました。` });
      await onRefresh();
    } catch {
      setFeedback({ type: "error", text: "通信エラーが発生しました。" });
    } finally {
      setBusy(false);
    }
  };

  const handleManualStopNow = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/study/stop", {
        method: "POST",
        credentials: "same-origin",
        headers: jsonHeaders,
        body: JSON.stringify({}),
      });
      if (res.status === 401) {
        await onUnauthorized();
        return;
      }
      const json = (await res.json()) as { error?: string; duration_min?: number };
      if (!res.ok) {
        setFeedback({ type: "error", text: json.error ?? "終了に失敗しました。" });
        return;
      }
      setFeedback({ type: "ok", text: `計測を終了しました（${json.duration_min ?? 0}分）。` });
      await onRefresh();
    } catch {
      setFeedback({ type: "error", text: "通信エラーが発生しました。" });
    } finally {
      setBusy(false);
    }
  };

  const handleCloseWithCustomTime = async () => {
    if (!activeSession || !customEndLocal) return;
    const endedIso = jstDatetimeLocalToIso(customEndLocal);
    if (!endedIso) {
      setFeedback({ type: "error", text: "終了時刻の形式が正しくありません。" });
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/sessions/${activeSession.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: jsonHeaders,
        body: JSON.stringify({ ended_at: endedIso, needs_review: false }),
      });
      if (res.status === 401) {
        await onUnauthorized();
        return;
      }
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setFeedback({ type: "error", text: json.error ?? "終了時刻の補正に失敗しました。" });
        return;
      }
      setCustomEndLocal("");
      setFeedback({ type: "ok", text: "指定時刻でセッションを終了・補正しました。" });
      await onRefresh();
    } catch {
      setFeedback({ type: "error", text: "通信エラーが発生しました。" });
    } finally {
      setBusy(false);
    }
  };

  const handleResolveReview = async (sessionId: string) => {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/sessions/${sessionId}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: jsonHeaders,
        body: JSON.stringify({ needs_review: false }),
      });
      if (res.status === 401) {
        await onUnauthorized();
        return;
      }
      if (!res.ok) {
        setFeedback({ type: "error", text: "要確認フラグの解除に失敗しました。" });
        return;
      }
      setFeedback({ type: "ok", text: "確認済みにしました。" });
      await onRefresh();
    } catch {
      setFeedback({ type: "error", text: "通信エラーが発生しました。" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
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

      {/* Long session / needs_review alerts */}
      {(isLongActive || reviewSessions.length > 0) && (
        <section className="space-y-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4" />
            要確認アラート
          </div>

          {isLongActive && activeSession && (
            <div className="rounded-xl bg-white/80 p-4 text-xs text-zinc-800 dark:bg-zinc-950/70 dark:text-zinc-200">
              <p className="font-semibold">
                現在計測中の「{activeSession.category_name}」が {Math.round(warnMin / 60)} 時間を超えています（経過 {formatDurationHms(elapsedSec)}）。
              </p>
              <p className="mt-1 text-zinc-500 dark:text-zinc-400">
                下の「終了時刻を指定して補正」から正しい終了時刻を設定できます。
              </p>
            </div>
          )}

          {reviewSessions.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/80 p-3.5 text-xs dark:bg-zinc-950/70"
            >
              <div>
                <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {s.category_name}（{s.location_label}）
                </div>
                <div className="mt-0.5 font-mono text-zinc-500 dark:text-zinc-400">
                  {formatJstDateHm(s.started_at)} 〜{" "}
                  {s.ended_at ? formatJstDateHm(s.ended_at) : "計測中"}{" "}
                  {s.duration_sec !== null && `(${formatDurationHm(s.duration_sec)})`}
                </div>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleResolveReview(s.id)}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                確認済みにする
              </button>
            </div>
          ))}
        </section>
      )}

      {/* Manual Start / Stop */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          手動タイマー操作
        </h2>

        {activeSession ? (
          <div className="mt-4 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: activeSession.category_color }}
                  />
                  <span className="text-sm font-semibold">{activeSession.category_name}</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    @ {activeSession.location_label}
                  </span>
                </div>
                <div className="mt-1 font-mono text-3xl font-bold tabular-nums">
                  {formatDurationHms(elapsedSec)}
                </div>
                <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  開始: {formatJstDateHm(activeSession.started_at)} JST
                </div>
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={() => void handleManualStopNow()}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
              >
                <Square className="h-4 w-4 fill-current" />
                今すぐ計測を終了
              </button>
            </div>

            <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                終了し忘れ補正（終了時刻を JST で指定して確定）
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <input
                  type="datetime-local"
                  value={customEndLocal}
                  onChange={(e) => setCustomEndLocal(e.target.value)}
                  placeholder={isoToJstDatetimeLocal(new Date().toISOString())}
                  className="h-9 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
                <button
                  type="button"
                  disabled={busy || !customEndLocal}
                  onClick={() => void handleCloseWithCustomTime()}
                  className="h-9 rounded-lg bg-zinc-900 px-4 text-xs font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  指定時刻で終了
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
              <span>カテゴリ</span>
              <select
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
                className="h-10 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                {activeCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
              <span>メモ（任意・非公開）</span>
              <input
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="例: 計算論レポート"
                className="h-10 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>

            <div className="flex items-end">
              <button
                type="button"
                disabled={busy || !selectedCategoryId}
                onClick={() => void handleManualStart()}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
              >
                <Play className="h-4 w-4 fill-current" />
                手動で計測開始
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
