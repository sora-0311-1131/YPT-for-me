"use client";

import type { CategoryBreakdownItem } from "@/lib/dashboard-service";
import { formatDurationHm } from "@/lib/format";

interface CategoryBreakdownProps {
  items: CategoryBreakdownItem[];
  title?: string;
}

export function CategoryBreakdown({ items, title = "今日のカテゴリ別内訳" }: CategoryBreakdownProps) {
  const totalSec = items.reduce((sum, item) => sum + item.total_sec, 0);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-900/70">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
        <span className="shrink-0 font-mono text-xs text-zinc-500 dark:text-zinc-400">
          合計 {formatDurationHm(totalSec)}
        </span>
      </div>

      {items.length === 0 || totalSec === 0 ? (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
          まだ今日の記録がありません。
        </p>
      ) : (
        <>
          <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            {items.map((item) => {
              const widthPct = (item.total_sec / totalSec) * 100;
              return (
                <div
                  key={item.category_id}
                  style={{ width: `${widthPct}%`, backgroundColor: item.color }}
                  title={`${item.name}: ${formatDurationHm(item.total_sec)}`}
                />
              );
            })}
          </div>

          <ul className="mt-4 space-y-2.5">
            {items.map((item) => {
              const pct = Math.round((item.total_sec / totalSec) * 100);
              return (
                <li
                  key={item.category_id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="truncate font-medium text-zinc-800 dark:text-zinc-200">
                      {item.name}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 font-mono text-xs tabular-nums">
                    <span className="text-zinc-900 dark:text-zinc-100">
                      {formatDurationHm(item.total_sec)}
                    </span>
                    <span className="w-9 text-right text-zinc-500 dark:text-zinc-400">
                      {pct}%
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
