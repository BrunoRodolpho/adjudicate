"use client";

import { cn } from "@/lib/cn";

export type DashboardRange = "24h" | "7d" | "30d";

export const RANGE_HOURS: Record<DashboardRange, number> = {
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
};

export const RANGE_BUCKET: Record<DashboardRange, "hour" | "day"> = {
  "24h": "hour",
  "7d": "hour",
  "30d": "day",
};

export function RangePicker({
  value,
  onChange,
}: {
  value: DashboardRange;
  onChange: (r: DashboardRange) => void;
}) {
  const options: readonly DashboardRange[] = ["24h", "7d", "30d"];
  return (
    <div className="flex items-center gap-1 rounded-sm border border-edge bg-canvas/40 p-0.5 text-[11px]">
      {options.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          aria-pressed={value === r}
          className={cn(
            "rounded-sm px-2 py-0.5 transition-colors",
            value === r
              ? "bg-edge text-ink"
              : "text-muted hover:text-ink",
          )}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

/** Compute the ISO timestamp `hours` before `now`. */
export function isoSince(hoursAgo: number, now: Date = new Date()): string {
  return new Date(now.getTime() - hoursAgo * 60 * 60 * 1000).toISOString();
}
