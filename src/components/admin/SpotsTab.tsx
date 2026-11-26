"use client";

import { Link2, MapPin, Pencil, Plus, RefreshCw, Save, Trash2, Wifi, X } from "lucide-react";
import { useState } from "react";
import { formatJstDateHm } from "@/lib/format";
import type {
  AdminSessionDto,
  SpotGroup,
  SpotRow,
  UnregisteredWifiSsidItem,
} from "@/lib/types";

interface SpotsTabProps {
  spots: SpotRow[];
  unregisteredSessions: AdminSessionDto[];
  unregisteredWifiSsids: UnregisteredWifiSsidItem[];
  onRefresh: () => Promise<void>;
  onUnauthorized: () => Promise<void> | void;
}

const SPOT_GROUPS: SpotGroup[] = ["Home", "Univ", "Cafe", "Other"];

export function SpotsTab({
  spots,
  unregisteredSessions,
  unregisteredWifiSsids,
  onRefresh,
  onUnauthorized,
}: SpotsTabProps) {
  const [name, setName] = useState("");
  const [spotGroup, setSpotGroup] = useState<SpotGroup>("Univ");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [radiusM, setRadiusM] = useState("50");
  const [wifiSsid, setWifiSsid] = useState("");
  const [autoReapplyOnCreate, setAutoReapplyOnCreate] = useState(true);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editGroup, setEditGroup] = useState<SpotGroup>("Other");
  const [editLat, setEditLat] = useState("");
  const [editLng, setEditLng] = useState("");
  const [editRadius, setEditRadius] = useState("50");
  const [editWifiSsid, setEditWifiSsid] = useState("");

  const [busy, setBusy] = useState(false);
  const [visibleUnregisteredCount, setVisibleUnregisteredCount] = useState(20);
  const [linkSpotBySsid, setLinkSpotBySsid] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const jsonHeaders = { "Content-Type": "application/json" };

  const parseSpotFields = (latStr: string, lngStr: string, radStr: string) => {
    const lat = Number(latStr.trim());
    const lng = Number(lngStr.trim());
    const radius = Number(radStr.trim());
    if (!latStr.trim() || !lngStr.trim() || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { ok: false as const, error: "緯度・経度を数値で入力してください。" };
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return { ok: false as const, error: "緯度は -90〜90、経度は -180〜180 の範囲で入力してください。" };
    }
    if (!Number.isInteger(radius) || radius < 1 || radius > 50_000) {
      return { ok: false as const, error: "判定半径は 1〜50000 の整数 (m) で入力してください。" };
    }
    return { ok: true as const, lat, lng, radius };
  };

  const handleReapply = async (spotId: string, includeAll: boolean): Promise<string | null> => {
    const res = await fetch(`/api/admin/spots/${spotId}/reapply`, {
      method: "POST",
      credentials: "same-origin",
      headers: jsonHeaders,
      body: JSON.stringify({ include_all: includeAll }),
    });
    if (res.status === 401) {
      await onUnauthorized();
      return null;
    }
    const json = (await res.json()) as {
      error?: string;
      evaluated_count?: number;
      updated_count?: number;
      failed_count?: number;
    };
    if (!res.ok) {
      const detail =
        json.failed_count !== undefined
          ? `（評価 ${json.evaluated_count ?? 0} 件 / 更新 ${json.updated_count ?? 0} 件 / 失敗 ${json.failed_count} 件）`
          : "";
      throw new Error(`${json.error ?? "再適用に失敗しました。"}${detail}`);
    }
    return `評価 ${json.evaluated_count ?? 0} 件中 ${json.updated_count ?? 0} 件を更新しました。`;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFeedback({ type: "error", text: "スポット名を入力してください。" });
      return;
    }
    const parsed = parseSpotFields(latitude, longitude, radiusM);
    if (!parsed.ok) {
      setFeedback({ type: "error", text: parsed.error });
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/spots", {
        method: "POST",
        credentials: "same-origin",
        headers: jsonHeaders,
        body: JSON.stringify({
          name: trimmedName,
          spot_group: spotGroup,
          latitude: parsed.lat,
          longitude: parsed.lng,
          radius_m: parsed.radius,
          wifi_ssid: wifiSsid.trim() || null,
        }),
      });
      if (res.status === 401) {
        await onUnauthorized();
        return;
      }
      const json = (await res.json()) as { error?: string; spot?: SpotRow };
      if (!res.ok || !json.spot) {
        setFeedback({ type: "error", text: json.error ?? "スポット作成に失敗しました。" });
        return;
      }

      let reapplyMsg = "";
      if (autoReapplyOnCreate) {
        try {
          const summary = await handleReapply(json.spot.id, false);
          if (summary) reapplyMsg = `（自動再適用: ${summary}）`;
        } catch (err) {
          reapplyMsg = `（スポットは作成されましたが再適用失敗: ${(err as Error).message}）`;
        }
      }

      setName("");
      setLatitude("");
      setLongitude("");
      setRadiusM("50");
      setWifiSsid("");
      setFeedback({ type: "ok", text: `スポット「${trimmedName}」を登録しました。${reapplyMsg}` });
      await onRefresh();
    } catch {
      setFeedback({ type: "error", text: "通信エラーが発生しました。" });
    } finally {
      setBusy(false);
    }
  };

  const startEditing = (spot: SpotRow) => {
    setEditingId(spot.id);
    setEditName(spot.name);
    setEditGroup(spot.spot_group);
    setEditLat(String(spot.latitude));
    setEditLng(String(spot.longitude));
    setEditRadius(String(spot.radius_m));
    setEditWifiSsid(spot.wifi_ssid ?? "");
  };

  const handleSaveEdit = async (id: string) => {
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setFeedback({ type: "error", text: "スポット名を入力してください。" });
      return;
    }
    const parsed = parseSpotFields(editLat, editLng, editRadius);
    if (!parsed.ok) {
      setFeedback({ type: "error", text: parsed.error });
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/spots", {
        method: "PATCH",
        credentials: "same-origin",
        headers: jsonHeaders,
        body: JSON.stringify({
          id,
          name: trimmedName,
          spot_group: editGroup,
          latitude: parsed.lat,
          longitude: parsed.lng,
          radius_m: parsed.radius,
          wifi_ssid: editWifiSsid.trim() || null,
        }),
      });
      if (res.status === 401) {
        await onUnauthorized();
        return;
      }
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setFeedback({ type: "error", text: json.error ?? "スポット更新に失敗しました。" });
        return;
      }
      setEditingId(null);
      setFeedback({ type: "ok", text: "スポットを更新しました。必要に応じて再適用を実行してください。" });
      await onRefresh();
    } catch {
      setFeedback({ type: "error", text: "通信エラーが発生しました。" });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (spot: SpotRow) => {
    if (!window.confirm(`スポット「${spot.name}」を削除しますか？`)) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/spots?id=${encodeURIComponent(spot.id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (res.status === 401) {
        await onUnauthorized();
        return;
      }
      if (!res.ok) {
        setFeedback({ type: "error", text: "スポットの削除に失敗しました。" });
        return;
      }
      setFeedback({ type: "ok", text: `「${spot.name}」を削除しました。` });
      await onRefresh();
    } catch {
      setFeedback({ type: "error", text: "通信エラーが発生しました。" });
    } finally {
      setBusy(false);
    }
  };

  const handleManualReapply = async (spot: SpotRow, includeAll: boolean) => {
    if (
      includeAll &&
      !window.confirm("座標を持つ全過去セッションに対して入れ子スポット判定を再実行しますか？")
    ) {
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const msg = await handleReapply(spot.id, includeAll);
      if (msg) {
        setFeedback({ type: "ok", text: `「${spot.name}」基準で再適用完了: ${msg}` });
        await onRefresh();
      }
    } catch (err) {
      setFeedback({ type: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const prefillFromSession = (s: AdminSessionDto) => {
    if (s.latitude !== null && s.longitude !== null) {
      setLatitude(s.latitude.toFixed(6));
      setLongitude(s.longitude.toFixed(6));
    }
    if (s.wifi_ssid) {
      setWifiSsid(s.wifi_ssid);
    }
    if (!name.trim()) {
      setName("新スポット");
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const prefillWifiOnly = (ssid: string) => {
    setWifiSsid((prev) => {
      const existing = prev
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      if (existing.includes(ssid)) return prev;
      return [...existing, ssid].join(", ");
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleLinkWifiToSpot = async (ssid: string) => {
    const targetSpotId = linkSpotBySsid[ssid] || spots[0]?.id;
    const spot = spots.find((sp) => sp.id === targetSpotId);
    if (!spot) {
      setFeedback({ type: "error", text: "紐づけ先のスポットを選択してください。" });
      return;
    }

    const currentSsids = (spot.wifi_ssid ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    const nextWifiSsid = currentSsids.includes(ssid)
      ? currentSsids.join(", ")
      : [...currentSsids, ssid].join(", ");

    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/spots", {
        method: "PATCH",
        credentials: "same-origin",
        headers: jsonHeaders,
        body: JSON.stringify({
          id: spot.id,
          wifi_ssid: nextWifiSsid,
        }),
      });
      if (res.status === 401) {
        await onUnauthorized();
        return;
      }
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setFeedback({ type: "error", text: json.error ?? "Wi-Fi SSID の紐づけに失敗しました。" });
        return;
      }
      setFeedback({
        type: "ok",
        text: `Wi-Fi「${ssid}」をスポット「${spot.name}」に紐づけました。`,
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

      {/* Create spot form */}
      <form
        onSubmit={handleCreate}
        className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-900/70"
      >
        <div>
          <h2 className="text-sm font-semibold">スポットを登録（完全非公開・入れ子時は最小半径優先）</h2>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            公開ダッシュボードには「名前」のみ表示され、緯度・経度は公開 API に一切返却されません。
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span>表示名</span>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 大学図書館"
              className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-base text-zinc-900 sm:h-9 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span>グループ</span>
            <select
              value={spotGroup}
              onChange={(e) => setSpotGroup(e.target.value as SpotGroup)}
              className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 text-base text-zinc-900 sm:h-9 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            >
              {SPOT_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span>判定半径 (m)</span>
            <input
              type="number"
              min={1}
              max={50000}
              required
              value={radiusM}
              onChange={(e) => setRadiusM(e.target.value)}
              className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-base text-zinc-900 sm:h-9 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span>緯度 (Latitude)</span>
            <input
              type="text"
              inputMode="decimal"
              required
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              placeholder="35.026200"
              className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 font-mono text-base text-zinc-900 sm:h-9 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span>経度 (Longitude)</span>
            <input
              type="text"
              inputMode="decimal"
              required
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              placeholder="135.780800"
              className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 font-mono text-base text-zinc-900 sm:h-9 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span>Wi-Fi SSID（任意・カンマ区切り可・非公開）</span>
            <input
              type="text"
              value={wifiSsid}
              onChange={(e) => setWifiSsid(e.target.value)}
              placeholder="例: Home-5G, Home-2.4G"
              className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 font-mono text-base text-zinc-900 sm:h-9 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="inline-flex min-h-[36px] items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            <input
              type="checkbox"
              checked={autoReapplyOnCreate}
              onChange={(e) => setAutoReapplyOnCreate(e.target.checked)}
              className="h-4 w-4 shrink-0"
            />
            登録と同時に「未登録座標セッション」へ自動再適用する
          </label>

          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-4 text-xs font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50 sm:h-9 sm:w-auto dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            <Plus className="h-3.5 w-3.5" />
            スポットを登録
          </button>
        </div>
      </form>

      {/* Unregistered Wi-Fi SSIDs (1-click link or prefill) */}
      <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
        <div className="border-b border-zinc-200 px-5 py-3.5 dark:border-zinc-800">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Wifi className="h-4 w-4 text-emerald-500" />
            未登録の Wi-Fi SSID ({unregisteredWifiSsids.length})
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            セッションで検出された未紐づけの Wi-Fi 名です。既存スポットへの紐づけや新規登録フォームへの転記ができます。
          </p>
        </div>

        {unregisteredWifiSsids.length === 0 ? (
          <div className="p-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
            未登録の Wi-Fi SSID はありません。
          </div>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {unregisteredWifiSsids.map((item) => {
              const selectedSpotId = linkSpotBySsid[item.ssid] || spots[0]?.id || "";
              return (
                <li
                  key={item.ssid}
                  className="flex flex-col justify-between gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-5"
                >
                  <div className="space-y-0.5 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {item.ssid}
                      </span>
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        {item.session_count}回
                      </span>
                    </div>
                    <div className="text-zinc-500 dark:text-zinc-400">
                      最終: {formatJstDateHm(item.last_seen_at)}（@ {item.last_location_label}）
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {spots.length > 0 && (
                      <>
                        <select
                          value={selectedSpotId}
                          onChange={(e) =>
                            setLinkSpotBySsid((prev) => ({
                              ...prev,
                              [item.ssid]: e.target.value,
                            }))
                          }
                          aria-label={`${item.ssid} の紐づけ先スポット`}
                          className="h-9 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 text-xs text-zinc-900 sm:h-8 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                        >
                          {spots.map((sp) => (
                            <option key={sp.id} value={sp.id}>
                              {sp.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleLinkWifiToSpot(item.ssid)}
                          className="inline-flex h-9 items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-500/20 disabled:opacity-50 sm:h-8 dark:text-emerald-300"
                        >
                          <Link2 className="h-3.5 w-3.5" />
                          紐づける
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => prefillWifiOnly(item.ssid)}
                      className="inline-flex h-9 items-center gap-1 rounded-lg border border-zinc-200 px-2.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 sm:h-8 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      新規フォームへ転記
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Unregistered coordinate sessions (1-click prefill) */}
      <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
        <div className="border-b border-zinc-200 px-5 py-3.5 dark:border-zinc-800">
          <h3 className="text-sm font-semibold">
            未登録座標のセッション ({unregisteredSessions.length})
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            外出先などで一時記録された座標を 1クリックで上の登録フォームへ転記できます。
          </p>
        </div>

        {unregisteredSessions.length === 0 ? (
          <div className="p-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
            未登録座標のセッションはありません。
          </div>
        ) : (
          <>
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {unregisteredSessions.slice(0, visibleUnregisteredCount).map((s) => (
                <li key={s.id} className="flex flex-col justify-between gap-2.5 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
                  <div className="space-y-0.5 text-xs">
                    <div className="font-semibold">
                      {s.category_name}（{formatJstDateHm(s.started_at)}）
                    </div>
                    <div className="font-mono text-zinc-500 dark:text-zinc-400">
                      {s.latitude !== null && s.longitude !== null
                        ? `${s.latitude.toFixed(6)}, ${s.longitude.toFixed(6)}`
                        : "座標なし"}
                      {s.wifi_ssid && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                          <Wifi className="h-3 w-3" />
                          {s.wifi_ssid}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => prefillFromSession(s)}
                    className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 text-xs font-semibold text-blue-700 transition hover:bg-blue-500/20 sm:h-8 sm:w-auto dark:text-blue-300"
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    この座標からスポット登録
                  </button>
                </li>
              ))}
            </ul>
            {unregisteredSessions.length > visibleUnregisteredCount && (
              <div className="border-t border-zinc-200 px-5 py-3 text-center dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setVisibleUnregisteredCount((c) => c + 20)}
                  className="rounded-lg border border-zinc-200 px-4 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  さらに表示（残り {unregisteredSessions.length - visibleUnregisteredCount} 件）
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* Registered spots list */}
      <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
        <div className="border-b border-zinc-200 px-5 py-3.5 text-sm font-semibold dark:border-zinc-800">
          登録済みスポット一覧 ({spots.length})
        </div>

        {spots.length === 0 ? (
          <div className="p-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
            まだスポットが登録されていません。
          </div>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {spots.map((spot) => {
              const isEditing = editingId === spot.id;
              return (
                <li key={spot.id} className="p-4">
                  {isEditing ? (
                    <div className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="h-11 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-base sm:h-9 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950"
                        />
                        <select
                          value={editGroup}
                          onChange={(e) => setEditGroup(e.target.value as SpotGroup)}
                          className="h-11 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 text-base sm:h-9 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950"
                        >
                          {SPOT_GROUPS.map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min={1}
                          max={50000}
                          value={editRadius}
                          onChange={(e) => setEditRadius(e.target.value)}
                          className="h-11 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-base sm:h-9 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950"
                        />
                        <input
                          type="text"
                          inputMode="decimal"
                          value={editLat}
                          onChange={(e) => setEditLat(e.target.value)}
                          className="h-11 rounded-lg border border-zinc-200 bg-zinc-50 px-3 font-mono text-base sm:h-9 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950"
                        />
                        <input
                          type="text"
                          inputMode="decimal"
                          value={editLng}
                          onChange={(e) => setEditLng(e.target.value)}
                          className="h-11 rounded-lg border border-zinc-200 bg-zinc-50 px-3 font-mono text-base sm:h-9 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950"
                        />
                        <input
                          type="text"
                          value={editWifiSsid}
                          onChange={(e) => setEditWifiSsid(e.target.value)}
                          placeholder="Wi-Fi SSID（任意・カンマ区切り可）"
                          className="h-11 rounded-lg border border-zinc-200 bg-zinc-50 px-3 font-mono text-base sm:h-9 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="inline-flex h-10 items-center gap-1 rounded-lg border border-zinc-200 px-3 text-xs sm:h-8 dark:border-zinc-700"
                        >
                          <X className="h-3.5 w-3.5" />
                          キャンセル
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleSaveEdit(spot.id)}
                          className="inline-flex h-10 items-center gap-1 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50 sm:h-8"
                        >
                          <Save className="h-3.5 w-3.5" />
                          保存
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">{spot.name}</span>
                          <span className="rounded bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                            {spot.spot_group}
                          </span>
                          <span className="rounded bg-blue-500/10 px-2 py-0.5 font-mono text-[11px] text-blue-600 dark:text-blue-400">
                            半径 {spot.radius_m}m
                          </span>
                          {spot.wifi_ssid && (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] text-emerald-700 dark:text-emerald-300">
                              <Wifi className="h-3 w-3" />
                              {spot.wifi_ssid}
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                          {spot.latitude.toFixed(6)}, {spot.longitude.toFixed(6)}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleManualReapply(spot, false)}
                          className="inline-flex h-9 items-center gap-1 rounded-lg border border-zinc-200 px-2.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50 sm:h-8 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          <RefreshCw className="h-3 w-3" />
                          未登録に再適用
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleManualReapply(spot, true)}
                          className="inline-flex h-9 items-center gap-1 rounded-lg border border-zinc-200 px-2.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50 sm:h-8 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          全件再適用
                        </button>
                        <button
                          type="button"
                          onClick={() => startEditing(spot)}
                          aria-label="編集"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-100 sm:h-8 sm:w-8 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleDelete(spot)}
                          aria-label="削除"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-500/30 text-red-600 transition hover:bg-red-500/10 disabled:opacity-50 sm:h-8 sm:w-8 dark:text-red-400"
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
    </div>
  );
}
