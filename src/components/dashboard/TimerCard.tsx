"use client";

import { AlertTriangle, Cloud, CloudRain, CloudSnow, MapPin, Maximize2, Minimize2, Sun, Timer } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDurationHms, formatJstTimeHm, formatWeatherLabel } from "@/lib/format";
import type { PublicSessionDto } from "@/lib/types";
import { getWeatherCategory } from "@/lib/weather";

interface TimerCardProps {
  activeSession: PublicSessionDto | null;
  elapsedSec: number;
  longSessionWarnMin: number;
}

function WeatherBadge({
  weatherCode,
  temperatureC,
}: {
  weatherCode: number | null;
  temperatureC: number | null;
}) {
  if (weatherCode === null && temperatureC === null) return null;
  const cat = getWeatherCategory(weatherCode);
  const Icon =
    cat === "sunny" ? Sun : cat === "rainy" ? CloudRain : cat === "snowy" ? CloudSnow : Cloud;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
      <Icon className="h-3.5 w-3.5" />
      <span>{formatWeatherLabel(weatherCode)}</span>
      {temperatureC !== null && <span>{Math.round(temperatureC)}°C</span>}
    </span>
  );
}

export function TimerCard({ activeSession, elapsedSec, longSessionWarnMin }: TimerCardProps) {
  const [presentMode, setPresentMode] = useState(false);

  useEffect(() => {
    if (!presentMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPresentMode(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [presentMode]);

  const isLongSession =
    activeSession !== null && elapsedSec >= longSessionWarnMin * 60;

  return (
    <>
      <section className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
        {activeSession && (
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-1"
            style={{ backgroundColor: activeSession.category_color }}
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {activeSession ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                LIVE FOCUS
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                <Timer className="h-3.5 w-3.5" />
                STANDBY
              </span>
            )}

            {activeSession && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-white"
                style={{ backgroundColor: activeSession.category_color }}
              >
                {activeSession.category_name}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setPresentMode(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            LT 拡大表示
          </button>
        </div>

        <div className="mt-6 flex flex-col items-center justify-center py-4 text-center">
          <div className="font-mono text-5xl font-bold tracking-tight tabular-nums text-zinc-900 sm:text-7xl dark:text-zinc-50">
            {activeSession ? formatDurationHms(elapsedSec) : "00:00:00"}
          </div>

          {activeSession ? (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                <MapPin className="h-3.5 w-3.5" />
                {activeSession.location_label}
              </span>
              <WeatherBadge
                weatherCode={activeSession.weather_code}
                temperatureC={activeSession.temperature_c}
              />
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                開始 {formatJstTimeHm(activeSession.started_at)} JST
              </span>
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
              PC パームレストの NFC タグに iPhone をかざすと自動で計測が始まります
            </p>
          )}
        </div>

        {isLongSession && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-300">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                計測時間が {Math.round(longSessionWarnMin / 60)} 時間を超えています。終了し忘れの場合は管理画面から補正できます。
              </span>
            </div>
            <Link
              href="/admin"
              className="font-semibold underline underline-offset-2 hover:opacity-80"
            >
              管理画面へ →
            </Link>
          </div>
        )}
      </section>

      {presentMode && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="LT プレゼン用タイマー表示"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-zinc-950 p-8 text-zinc-50"
        >
          <button
            type="button"
            onClick={() => setPresentMode(false)}
            className="absolute right-6 top-6 inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800"
          >
            <Minimize2 className="h-4 w-4" />
            閉じる (Esc)
          </button>

          <div className="flex items-center gap-3">
            {activeSession ? (
              <>
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/20 px-4 py-1.5 text-sm font-semibold text-emerald-400">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" />
                  LIVE FOCUS
                </span>
                <span
                  className="rounded-full px-4 py-1.5 text-sm font-semibold text-white"
                  style={{ backgroundColor: activeSession.category_color }}
                >
                  {activeSession.category_name}
                </span>
              </>
            ) : (
              <span className="rounded-full bg-zinc-800 px-4 py-1.5 text-sm font-medium text-zinc-400">
                STANDBY — NFC タッチ待機中
              </span>
            )}
          </div>

          <div className="mt-10 font-mono text-7xl font-bold tracking-tight tabular-nums sm:text-9xl">
            {activeSession ? formatDurationHms(elapsedSec) : "00:00:00"}
          </div>

          {activeSession && (
            <div className="mt-8 flex items-center gap-4 text-base text-zinc-300">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4" />
                {activeSession.location_label}
              </span>
              {activeSession.temperature_c !== null && (
                <span>
                  {formatWeatherLabel(activeSession.weather_code)}{" "}
                  {Math.round(activeSession.temperature_c)}°C
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
