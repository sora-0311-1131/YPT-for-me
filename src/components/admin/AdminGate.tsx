"use client";

import { ArrowLeft, KeyRound, Lock } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AdminShell } from "./AdminShell";

const ADMIN_TOKEN_KEY = "ypt-for-me-admin-token";

export function AdminGate() {
  const [token, setToken] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verifyToken = useCallback(async (candidate: string): Promise<boolean> => {
    try {
      const res = await fetch("/api/admin/verify", {
        method: "POST",
        headers: { Authorization: `Bearer ${candidate}` },
        cache: "no-store",
      });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    let active = true;
    const init = async () => {
      let saved: string | null = null;
      try {
        saved = window.localStorage.getItem(ADMIN_TOKEN_KEY);
      } catch {
        saved = null;
      }

      if (saved) {
        const ok = await verifyToken(saved);
        if (!active) return;
        if (ok) {
          setToken(saved);
        } else {
          try {
            window.localStorage.removeItem(ADMIN_TOKEN_KEY);
          } catch {
            // ignore
          }
        }
      }
      if (active) setChecking(false);
    };

    void init();
    return () => {
      active = false;
    };
  }, [verifyToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const candidate = input.trim();
    if (!candidate) return;

    setSubmitting(true);
    setError(null);
    const ok = await verifyToken(candidate);
    setSubmitting(false);

    if (!ok) {
      setError("パスコードが正しくありません。");
      return;
    }

    try {
      window.localStorage.setItem(ADMIN_TOKEN_KEY, candidate);
    } catch {
      // ignore storage failure
    }
    setToken(candidate);
    setInput("");
  };

  const handleLogout = useCallback(() => {
    try {
      window.localStorage.removeItem(ADMIN_TOKEN_KEY);
    } catch {
      // ignore
    }
    setToken(null);
    setError(null);
  }, []);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 text-sm text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
        認証状態を確認中...
      </div>
    );
  }

  if (token) {
    return <AdminShell token={token} onLogout={handleLogout} />;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <Link
          href="/"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          ダッシュボードへ戻る
        </Link>
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              YPT for me Admin
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              管理操作にはパスコード（API_SECRET）が必要です
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block space-y-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            <span>パスコード</span>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
              <input
                type="password"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="API_SECRET を入力"
                autoComplete="current-password"
                className="h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 pl-9 pr-3 text-sm text-zinc-900 outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>
          </label>

          {error && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !input.trim()}
            className="h-10 w-full rounded-lg bg-zinc-900 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {submitting ? "検証中..." : "管理画面を開く"}
          </button>
        </form>
      </div>
    </div>
  );
}
