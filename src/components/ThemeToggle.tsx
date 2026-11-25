"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const STORAGE_KEY = "ypt-for-me-theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      const initial: "dark" | "light" = saved === "light" ? "light" : "dark";
      setTheme(initial);
      document.documentElement.classList.toggle("dark", initial === "dark");
    } catch {
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggle = () => {
    const next: "dark" | "light" = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore storage errors in restricted contexts
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "ライトモードに切り替え" : "ダークモードに切り替え"}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
