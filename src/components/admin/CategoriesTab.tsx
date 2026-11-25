"use client";

import { Archive, ArchiveRestore, Pencil, Plus, Save, X } from "lucide-react";
import { useState } from "react";
import type { CategoryRow } from "@/lib/types";

interface CategoriesTabProps {
  categories: CategoryRow[];
  onRefresh: () => Promise<void>;
  onUnauthorized: () => Promise<void> | void;
}

const PRESET_COLORS = [
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#8B5CF6",
  "#EC4899",
  "#06B6D4",
  "#EF4444",
  "#6B7280",
];

export function CategoriesTab({ categories, onRefresh, onUnauthorized }: CategoriesTabProps) {
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#3B82F6");
  const [newSortOrder, setNewSortOrder] = useState(
    String((categories[categories.length - 1]?.sort_order ?? 0) + 1)
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("#3B82F6");
  const [editSortOrder, setEditSortOrder] = useState("0");

  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const jsonHeaders = { "Content-Type": "application/json" };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    const sortOrder = Number(newSortOrder);
    if (!name) {
      setFeedback({ type: "error", text: "カテゴリ名を入力してください。" });
      return;
    }
    if (!Number.isInteger(sortOrder)) {
      setFeedback({ type: "error", text: "並び順は整数で入力してください。" });
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/categories", {
        method: "POST",
        credentials: "same-origin",
        headers: jsonHeaders,
        body: JSON.stringify({ name, color: newColor, sort_order: sortOrder }),
      });
      if (res.status === 401) {
        await onUnauthorized();
        return;
      }
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setFeedback({ type: "error", text: json.error ?? "カテゴリの作成に失敗しました。" });
        return;
      }
      setNewName("");
      setNewSortOrder(String(sortOrder + 1));
      setFeedback({ type: "ok", text: `カテゴリ「${name}」を追加しました。` });
      await onRefresh();
    } catch {
      setFeedback({ type: "error", text: "通信エラーが発生しました。" });
    } finally {
      setBusy(false);
    }
  };

  const startEditing = (cat: CategoryRow) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditColor(cat.color);
    setEditSortOrder(String(cat.sort_order));
  };

  const handleSaveEdit = async (id: string) => {
    const name = editName.trim();
    const sortOrder = Number(editSortOrder);
    if (!name) {
      setFeedback({ type: "error", text: "カテゴリ名を入力してください。" });
      return;
    }
    if (!Number.isInteger(sortOrder)) {
      setFeedback({ type: "error", text: "並び順は整数で入力してください。" });
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/categories", {
        method: "PATCH",
        credentials: "same-origin",
        headers: jsonHeaders,
        body: JSON.stringify({ id, name, color: editColor, sort_order: sortOrder }),
      });
      if (res.status === 401) {
        await onUnauthorized();
        return;
      }
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setFeedback({ type: "error", text: json.error ?? "カテゴリの更新に失敗しました。" });
        return;
      }
      setEditingId(null);
      setFeedback({ type: "ok", text: "カテゴリを更新しました。" });
      await onRefresh();
    } catch {
      setFeedback({ type: "error", text: "通信エラーが発生しました。" });
    } finally {
      setBusy(false);
    }
  };

  const handleToggleArchive = async (cat: CategoryRow) => {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/categories", {
        method: "PATCH",
        credentials: "same-origin",
        headers: jsonHeaders,
        body: JSON.stringify({ id: cat.id, is_archived: !cat.is_archived }),
      });
      if (res.status === 401) {
        await onUnauthorized();
        return;
      }
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setFeedback({ type: "error", text: json.error ?? "アーカイブ状態の更新に失敗しました。" });
        return;
      }
      setFeedback({
        type: "ok",
        text: !cat.is_archived
          ? `「${cat.name}」をアーカイブしました（過去ログは保持されます）。`
          : `「${cat.name}」を復元しました。`,
      });
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

      {/* Create form */}
      <form
        onSubmit={handleCreate}
        className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70"
      >
        <h2 className="text-sm font-semibold">新しいカテゴリを追加</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400 sm:col-span-2">
            <span>カテゴリ名</span>
            <input
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="例: 競プロ (AtCoder)"
              className="h-9 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span>カラー</span>
            <div className="flex h-9 items-center gap-2">
              <input
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-zinc-200 bg-transparent p-0.5 dark:border-zinc-700"
              />
              <input
                type="text"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                pattern="^#[0-9A-Fa-f]{6}$"
                className="h-9 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2 font-mono text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>
          </label>

          <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span>並び順</span>
            <input
              type="number"
              step={1}
              value={newSortOrder}
              onChange={(e) => setNewSortOrder(e.target.value)}
              className="h-9 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {PRESET_COLORS.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => setNewColor(hex)}
                aria-label={`カラー ${hex}`}
                className={`h-5 w-5 rounded-full border transition ${
                  newColor.toLowerCase() === hex.toLowerCase()
                    ? "scale-110 border-zinc-900 ring-2 ring-zinc-400 dark:border-white"
                    : "border-transparent"
                }`}
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>

          <button
            type="submit"
            disabled={busy || !newName.trim()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-zinc-900 px-4 text-xs font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            <Plus className="h-3.5 w-3.5" />
            追加する
          </button>
        </div>
      </form>

      {/* Categories list */}
      <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
        <div className="border-b border-zinc-200 px-5 py-3.5 text-sm font-semibold dark:border-zinc-800">
          カテゴリ一覧 ({categories.length})
        </div>

        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {categories.map((cat) => {
            const isEditing = editingId === cat.id;
            return (
              <li key={cat.id} className="p-4">
                {isEditing ? (
                  <div className="grid gap-3 sm:grid-cols-4">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="h-9 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950 sm:col-span-2"
                    />
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={editColor}
                        onChange={(e) => setEditColor(e.target.value)}
                        className="h-9 w-12 cursor-pointer rounded border border-zinc-200 bg-transparent p-0.5 dark:border-zinc-700"
                      />
                      <input
                        type="text"
                        value={editColor}
                        onChange={(e) => setEditColor(e.target.value)}
                        className="h-9 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-950"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step={1}
                        value={editSortOrder}
                        onChange={(e) => setEditSortOrder(e.target.value)}
                        className="h-9 w-20 rounded-lg border border-zinc-200 bg-zinc-50 px-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                      />
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        aria-label="キャンセル"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-700"
                      >
                        <X className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleSaveEdit(cat.id)}
                        aria-label="保存"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50"
                      >
                        <Save className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="h-4 w-4 shrink-0 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span
                        className={`text-sm font-semibold ${
                          cat.is_archived ? "text-zinc-400 line-through" : ""
                        }`}
                      >
                        {cat.name}
                      </span>
                      <span className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-[11px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                        order: {cat.sort_order}
                      </span>
                      {cat.is_archived && (
                        <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                          アーカイブ済み
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => startEditing(cat)}
                        aria-label="編集"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleToggleArchive(cat)}
                        title={cat.is_archived ? "アーカイブ解除" : "アーカイブ"}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 px-2.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        {cat.is_archived ? (
                          <>
                            <ArchiveRestore className="h-3.5 w-3.5" />
                            復元
                          </>
                        ) : (
                          <>
                            <Archive className="h-3.5 w-3.5" />
                            アーカイブ
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
