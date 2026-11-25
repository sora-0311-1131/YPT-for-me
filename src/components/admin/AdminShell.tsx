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
import { CategoriesTab } from "./CategoriesTab";
import { ControlTab } from "./ControlTab";
import { SessionsTab } from "./SessionsTab";
import { SettingsTab } from "./SettingsTab";
import { SpotsTab } from "./SpotsTab";

type AdminTabKey = "control" | "sessions" | "categories" | "spots" | "settings";

const SESSION_PAGE_SIZE = 50;

interface AdminShellProps {
  onLogout: () => Promise<void> | void;
}

export function AdminShell({ onLogout }: AdminShellProps) {
  const [activeTab, setActiveTab] = useState<AdminTabKey>("control");
  const [sessions, setSessions] = useState<AdminSessionDto[]>([]);
  const [hasMoreSessions, setHasMoreSessions] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reviewSessions, setReviewSessions] = useState<AdminSessionDto[]>([]);
  const [unregisteredSessions, setUnregisteredSessions] = useState<AdminSessionDto[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [spots, setSpots] = useState<SpotRow[]>([]);
  const [settings, setSettings] = useState<AppSettingsRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    const fetchOpts: RequestInit = { credentials: "same-origin", cache: "no-store" };
    try {
      const fetchAllFilteredSessions = async (
        filterParam: "needs_review=true" | "unregistered_spot=true"
      ): Promise<
        { unauthorized: true } | { unauthorized: false; sessions: AdminSessionDto[] }
      > => {
        const collected: AdminSessionDto[] = [];
        let offset = 0;
        const pageSize = 200;
        while (true) {
          const res = await fetch(
            `/api/admin/sessions?${filterParam}&limit=${pageSize}&offset=${offset}`,
            fetchOpts
          );
          if (res.status === 401) return { unauthorized: true };
          if (!res.ok) throw new Error(`Failed to load ${filterParam} sessions`);
          const json = (await res.json()) as {
            sessions: AdminSessionDto[];
            has_more?: boolean;
          };
          collected.push(...json.sessions);
          if (!json.has_more || json.sessions.length === 0) break;
          offset += json.sessions.length;
        }
        return { unauthorized: false, sessions: collected };
      };

      const [sessRes, reviewResult, unregResult, catRes, spotRes, setRes] = await Promise.all([
        fetch(`/api/admin/sessions?limit=${SESSION_PAGE_SIZE}&offset=0`, fetchOpts),
        fetchAllFilteredSessions("needs_review=true"),
        fetchAllFilteredSessions("unregistered_spot=true"),
        fetch("/api/admin/categories", fetchOpts),
        fetch("/api/admin/spots", fetchOpts),
        fetch("/api/admin/settings", fetchOpts),
      ]);

      if (
        reviewResult.unauthorized ||
        unregResult.unauthorized ||
        [sessRes, catRes, spotRes, setRes].some((r) => r.status === 401)
      ) {
        await onLogout();
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
        { sessions: AdminSessionDto[]; has_more?: boolean },
        { categories: CategoryRow[] },
        { spots: SpotRow[] },
        { settings: AppSettingsRow },
      ];

      setSessions(sessJson.sessions);
      setHasMoreSessions(Boolean(sessJson.has_more));
      setReviewSessions(reviewResult.sessions);
      setUnregisteredSessions(unregResult.sessions);
      setCategories(catJson.categories);
      setSpots(spotJson.spots);
      setSettings(setJson.settings);
      setError(null);
    } catch {
      setError("管理データの取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }, [onLogout]);

  const loadMoreSessions = useCallback(async () => {
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/admin/sessions?limit=${SESSION_PAGE_SIZE}&offset=${sessions.length}`,
        { credentials: "same-origin", cache: "no-store" }
      );
      if (res.status === 401) {
        await onLogout();
        return;
      }
      if (!res.ok) {
        setError("追加のセッション履歴の読み込みに失敗しました。");
        return;
      }
      const json = (await res.json()) as { sessions: AdminSessionDto[]; has_more?: boolean };
      setSessions((prev) => {
        const seen = new Set(prev.map((s) => s.id));
        const next = json.sessions.filter((s) => !seen.has(s.id));
        return [...prev, ...next];
      });
      setHasMoreSessions(Boolean(json.has_more));
    } catch {
      setError("通信エラーにより追加履歴を読み込めませんでした。");
    } finally {
      setLoadingMore(false);
    }
  }, [sessions.length, onLogout]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const reviewCount = reviewSessions.length;

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
              onClick={() => void onLogout()}
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
            sessions={sessions}
            reviewSessions={reviewSessions}
            categories={categories}
            settings={settings}
            onRefresh={loadAll}
            onUnauthorized={onLogout}
          />
        ) : activeTab === "sessions" ? (
          <SessionsTab
            sessions={sessions}
            reviewSessions={reviewSessions}
            unregisteredSessions={unregisteredSessions}
            hasMore={hasMoreSessions}
            loadingMore={loadingMore}
            categories={categories}
            spots={spots}
            onLoadMore={loadMoreSessions}
            onRefresh={loadAll}
            onUnauthorized={onLogout}
          />
        ) : activeTab === "categories" ? (
          <CategoriesTab
            categories={categories}
            onRefresh={loadAll}
            onUnauthorized={onLogout}
          />
        ) : activeTab === "spots" ? (
          <SpotsTab
            spots={spots}
            unregisteredSessions={unregisteredSessions}
            onRefresh={loadAll}
            onUnauthorized={onLogout}
          />
        ) : (
          <SettingsTab
            settings={settings}
            onRefresh={loadAll}
            onUnauthorized={onLogout}
          />
        )}
      </main>
    </div>
  );
}
