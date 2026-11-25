"use client";

import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useState } from "react";
import { isoToJstDatetimeLocal, jstDatetimeLocalToIso } from "@/lib/datetime-local";
import { formatDurationHm, formatJstDateHm } from "@/lib/format";
import type { AdminSessionDto, CategoryRow, SpotRow } from "@/lib/types";

interface SessionsTabProps {
  sessions: AdminSessionDto[];
  reviewSessions: AdminSessionDto[];
  unregisteredSessions: AdminSessionDto[];
  hasMore: boolean;
  loadingMore: boolean;
  categories: CategoryRow[];
  spots: SpotRow[];
  onLoadMore: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onUnauthorized: () => Promise<void> | void;
}

type SessionFilter = "all" | "needs_review" | "unregistered_spot";

export function SessionsTab({
  sessions,
  reviewSessions,
  unregisteredSessions,
  hasMore,
  loadingMore,
  categories,
  spots,
  onLoadMore,
  onRefresh,
  onUnauthorized,
}: SessionsTabProps) {
  const activeCategories = categories.filter((c) => !c.is_archived);

  const [filter, setFilter] = useState<SessionFilter>("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [addCategoryId, setAddCategoryId] = useState(activeCategories[0]?.id ?? "");
  const [addSpotId, setAddSpotId] = useState("");
  const [addStartLocal, setAddStartLocal] = useState("");
  const [addEndLocal, setAddEndLocal] = useState("");
  const [addMemo, setAddMemo] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editSpotId, setEditSpotId] = useState("");
  const [editStartLocal, setEditStartLocal] = useState("");
  const [editEndLocal, setEditEndLocal] = useState("");
  const [editMemo, setEditMemo] = useState("");
  const [editNeedsReview, setEditNeedsReview] = useState(false);

  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const jsonHeaders = { "Content-Type": "application/json" };

  const filtered =
    filter === "needs_review"
      ? reviewSessions
      : filter === "unregistered_spot"
        ? unregisteredSessions
        : sessions;

  const handleAddSession = async (e: React.FormEvent) => {
    e.preventDefault();
    const startedIso = jstDatetimeLocalToIso(addStartLocal);
    const endedIso = jstDatetimeLocalToIso(addEndLocal);
    if (!startedIso || !endedIso) {
      setFeedback({ type: "error", text: "開始・終了時刻を正しく入力してください。" });
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/sessions", {
        method: "POST",
        credentials: "same-origin",
        headers: jsonHeaders,
        body: JSON.stringify({
          category_id: addCategoryId || activeCategories[0]?.id,
          spot_id: addSpotId || null,
          started_at: startedIso,
          ended_at: endedIso,
          memo: addMemo.trim() || null,
        }),
      });
      if (res.status === 401) {
        await onUnauthorized();
        return;
      }
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setFeedback({ type: "error", text: json.error ?? "手動セッションの追加に失敗しました。" });
        return;
      }
      setShowAddForm(false);
      setAddStartLocal("");
      setAddEndLocal("");
      setAddMemo("");
      setFeedback({ type: "ok", text: "手動セッションを追加しました。" });
      await onRefresh();
    } catch {
      setFeedback({ type: "error", text: "通信エラーが発生しました。" });
    } finally {
      setBusy(false);
    }
  };

  const startEditing = (s: AdminSessionDto) => {
    setEditingId(s.id);
    setEditCategoryId(s.category_id);
    setEditSpotId(s.spot_id ?? "");
    setEditStartLocal(isoToJstDatetimeLocal(s.started_at));
    setEditEndLocal(isoToJstDatetimeLocal(s.ended_at));
    setEditMemo(s.memo ?? "");
    setEditNeedsReview(s.needs_review);
  };

  const handleSaveEdit = async (id: string) => {
    const startedIso = jstDatetimeLocalToIso(editStartLocal);
    if (!startedIso) {
      setFeedback({ type: "error", text: "開始時刻の形式が正しくありません。" });
      return;
    }
    const endedIso = editEndLocal.trim() ? jstDatetimeLocalToIso(editEndLocal) : null;
    if (editEndLocal.trim() && !endedIso) {
      setFeedback({ type: "error", text: "終了時刻の形式が正しくありません。" });
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/sessions/${id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: jsonHeaders,
        body: JSON.stringify({
          category_id: editCategoryId,
          spot_id: editSpotId || null,
          started_at: startedIso,
          ended_at: endedIso,
          memo: editMemo.trim() || null,
          needs_review: editNeedsReview,
        }),
      });
      if (res.status === 401) {
        await onUnauthorized();
        return;
      }
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setFeedback({ type: "error", text: json.error ?? "更新に失敗しました。" });
        return;
      }
      setEditingId(null);
      setFeedback({ type: "ok", text: "セッションを更新しました。" });
      await onRefresh();
    } catch {
      setFeedback({ type: "error", text: "通信エラーが発生しました。" });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("このセッションを削除しますか？（元に戻せません）")) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/sessions/${id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (res.status === 401) {
        await onUnauthorized();
        return;
      }
      if (!res.ok) {
        setFeedback({ type: "error", text: "削除に失敗しました。" });
        return;
      }
      setFeedback({ type: "ok", text: "セッションを削除しました。" });
      await onRefresh();
    } catch {
      setFeedback({ type: "error", text: "通信エラーが発生しました。" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
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

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-xl bg-zinc-200/70 p-1 dark:bg-zinc-900">
          {(
            [
              { key: "all", label: `すべて (${sessions.length}${hasMore ? "+" : ""})` },
              {
                key: "needs_review",
                label: `要確認 (${reviewSessions.length})`,
              },
              {
                key: "unregistered_spot",
                label: `未登録スポット (${unregisteredSessions.length})`,
              },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                filter === key
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowAddForm((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          <Plus className="h-3.5 w-3.5" />
          手動セッションを追加
        </button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <form
          onSubmit={handleAddSession}
          className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70"
        >
          <h3 className="text-sm font-semibold">手動セッション追加（JST）</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
              <span>カテゴリ</span>
              <select
                value={addCategoryId || activeCategories[0]?.id || ""}
                onChange={(e) => setAddCategoryId(e.target.value)}
                className="h-9 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                {activeCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
              <span>スポット（任意）</span>
              <select
                value={addSpotId}
                onChange={(e) => setAddSpotId(e.target.value)}
                className="h-9 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                <option value="">Other（未指定）</option>
                {spots.map((sp) => (
                  <option key={sp.id} value={sp.id}>
                    {sp.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
              <span>開始時刻 (JST)</span>
              <input
                type="datetime-local"
                required
                value={addStartLocal}
                onChange={(e) => setAddStartLocal(e.target.value)}
                className="h-9 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
              <span>終了時刻 (JST)</span>
              <input
                type="datetime-local"
                required
                value={addEndLocal}
                onChange={(e) => setAddEndLocal(e.target.value)}
                className="h-9 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span>メモ（任意・非公開）</span>
            <input
              type="text"
              value={addMemo}
              onChange={(e) => setAddMemo(e.target.value)}
              placeholder="作業メモ"
              className="h-9 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium dark:border-zinc-700"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
            >
              追加する
            </button>
          </div>
        </form>
      )}

      {/* Sessions list */}
      <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
            該当するセッションがありません。
          </div>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {filtered.map((s) => {
              const isEditing = editingId === s.id;
              return (
                <li key={s.id} className="p-4">
                  {isEditing ? (
                    <div className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <select
                          value={editCategoryId}
                          onChange={(e) => setEditCategoryId(e.target.value)}
                          className="h-9 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                        >
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={editSpotId}
                          onChange={(e) => setEditSpotId(e.target.value)}
                          className="h-9 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                        >
                          <option value="">Other（スポット未紐付）</option>
                          {spots.map((sp) => (
                            <option key={sp.id} value={sp.id}>
                              {sp.name}
                            </option>
                          ))}
                        </select>
                        <input
                          type="datetime-local"
                          value={editStartLocal}
                          onChange={(e) => setEditStartLocal(e.target.value)}
                          className="h-9 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                        />
                        <input
                          type="datetime-local"
                          value={editEndLocal}
                          onChange={(e) => setEditEndLocal(e.target.value)}
                          className="h-9 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                        />
                      </div>

                      <input
                        type="text"
                        value={editMemo}
                        onChange={(e) => setEditMemo(e.target.value)}
                        placeholder="メモ（非公開）"
                        className="h-9 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                      />

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="inline-flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                          <input
                            type="checkbox"
                            checked={editNeedsReview}
                            onChange={(e) => setEditNeedsReview(e.target.checked)}
                          />
                          要確認フラグ
                        </label>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs dark:border-zinc-700"
                          >
                            <X className="h-3.5 w-3.5" />
                            取消
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleSaveEdit(s.id)}
                            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                          >
                            <Save className="h-3.5 w-3.5" />
                            保存
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: s.category_color }}
                          />
                          <span className="text-sm font-semibold">{s.category_name}</span>
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">
                            @ {s.location_label}
                          </span>
                          {s.needs_review && (
                            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                              要確認
                            </span>
                          )}
                          {s.tag_id && (
                            <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                              {s.tag_id}
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                          {formatJstDateHm(s.started_at)} 〜{" "}
                          {s.ended_at ? formatJstDateHm(s.ended_at) : "計測中"}{" "}
                          {s.duration_sec !== null && `(${formatDurationHm(s.duration_sec)})`}
                        </div>
                        {s.memo && (
                          <div className="text-xs text-zinc-700 dark:text-zinc-300">
                            メモ: {s.memo}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => startEditing(s)}
                          aria-label="編集"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleDelete(s.id)}
                          aria-label="削除"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/30 text-red-600 transition hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {filter === "all" && hasMore && (
        <div className="flex justify-center">
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => void onLoadMore()}
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {loadingMore ? "読み込み中..." : "過去のセッションをさらに読み込む"}
          </button>
        </div>
      )}
    </div>
  );
}
