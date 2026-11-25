"use client";

import {
  ArrowLeft,
  ListChecks,
  LogOut,
  MapPin,
  RefreshCw,
  Settings,
  Sliders,
  Tags,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { AdminSessionDto, AppSettingsRow, CategoryRow, SpotRow } from "@/lib/types";
import { ControlTab } from "./ControlTab";
import { SessionsTab } from "./SessionsTab";

type AdminTabKey = "control" | "sessions" | "categories" | "spots" | "settings";

interface AdminShellProps {
  token: string;
  onLogout: () => void;
}

export function AdminShell({ token, onLogout }: AdminShellProps) {
  const [activeTab, setActiveTab] = useState<AdminTabKey>("control");
  const [sessions, setSessions] = useState<AdminSessionDto[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [spots, setSpots] = useState<SpotRow[]>([]);
  const [settings, setSettings] = useState<AppSettingsRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const [sessRes, catRes, spotRes, setRes] = await Promise.all([
        fetch("/api/admin/sessions?limit=100", { headers, cache: "no-store" }),
        fetch("/api/admin/categories", { headers, cache: "no-store" }),
        fetch("/api/admin/spots", { headers, cache: "no-store" }),
        fetch("/api/admin/settings", { headers, cache: "no-store" }),
      ]);

      if ([sessRes, catRes, spotRes, setRes].some((r) => r.status === 401)) {
        onLogout();
        return;
      }

      if (!sessRes.ok || !catRes.ok || !spotRes.ok || !setRes.ok) {
        throw new Error("Admin data load failed");
      }

      const [sessJson, catJson, spotJson, setJson] = (await Promise.all([
        sessRes.json(),
        catRes.json(),
        spotRes.json(),
        setRes.json(),
      ])) as [
        { sessions: AdminSessionDto[] },
        { categories: CategoryRow[] },
        { spots: SpotRow[] },
        { settings: AppSettingsRow },
      ];

      setSessions(sessJson.sessions);
      setCategories(catJson.categories);
      setSpots(spotJson.spots);
      setSettings(setJson.settings);
      setError(null);
    } catch {
      setError("管理データの取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const reviewCount = sessions.filter((s) => s.needs_review).length;

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="sticky top-0 z-30 border-b border-zinc-200/80 bg-white/80 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              公開画面
            </Link>
            <span className="text-sm font-bold tracking-tight">YPT Admin</span>
          </div>

          <nav className="flex flex-wrap items-center gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
            {(
              [
                { key: "control", label: "Control", icon: Sliders, badge: reviewCount },
                { key: "sessions", label: "Sessions", icon: ListChecks, badge: 0 },
                { key: "categories", label: "Categories", icon: Tags, badge: 0 },
                { key: "spots", label: "Spots", icon: MapPin, badge: 0 },
                { key: "settings", label: "Settings", icon: Settings, badge: 0 },
              ] as const
            ).map(({ key, label, icon: Icon, badge }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                  activeTab === key
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
                {badge > 0 && (
                  <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">
                    {badge}
                  </span>
                )}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadAll()}
              aria-label="再読み込み"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <ThemeToggle />
            <button
              type="button"
              onClick={onLogout}
              aria-label="ログアウト"
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <LogOut className="h-3.5 w-3.5" />
              ロック
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        {error && (
          <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            <div className="h-40 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-900" />
            <div className="h-64 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-900" />
          </div>
        ) : activeTab === "control" ? (
          <ControlTab
            token={token}
            sessions={sessions}
            categories={categories}
            settings={settings}
            onRefresh={loadAll}
            onUnauthorized={onLogout}
          />
        ) : activeTab === "sessions" ? (
          <SessionsTab
            token={token}
            sessions={sessions}
            categories={categories}
            spots={spots}
            onRefresh={loadAll}
            onUnauthorized={onLogout}
          />
        ) : (
          <section className="rounded-2xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900/70">
            <h2 className="text-base font-semibold capitalize">{activeTab} タブ</h2>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              次の PR で Categories / Spots（未登録座標からの1クリック逆引き登録＆一括再適用） / Settings UI を追加予定です。
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
