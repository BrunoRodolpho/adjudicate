"use client";

import type { GuardFireBucketParsed } from "@adjudicate/admin-sdk";
import { decisionTheme } from "@/lib/decision-theme";
import type { DecisionKind } from "@adjudicate/core";

/**
 * Horizontal bar list of top guards by fire count. Renders each guard as a
 * named row, with the total count and a per-decision-kind segmented bar.
 *
 * Coalesces multiple bucket-days into a single per-guard total so the chart
 * stays readable even on a 30-day window.
 */
export function GuardFireBars({
  buckets,
}: {
  buckets: readonly GuardFireBucketParsed[];
}) {
  if (buckets.length === 0) {
    return (
      <div className="rounded-sm border border-edge bg-panel/40 px-3 py-2 text-[11px] italic text-faint">
        No guard fires in the selected window yet — adjudicate something to
        populate the in-memory accumulator.
      </div>
    );
  }

  // Roll up buckets into per-guard totals.
  type Row = {
    guardName: string;
    guardPhase: string;
    total: number;
    perKind: Record<DecisionKind, number>;
  };
  const rows = new Map<string, Row>();
  for (const b of buckets) {
    const key = `${b.guardName}|${b.guardPhase}`;
    const row =
      rows.get(key) ??
      ({
        guardName: b.guardName,
        guardPhase: b.guardPhase,
        total: 0,
        perKind: {
          EXECUTE: 0,
          REFUSE: 0,
          DEFER: 0,
          ESCALATE: 0,
          REQUEST_CONFIRMATION: 0,
          REWRITE: 0,
        },
      } satisfies Row);
    row.total += b.count;
    row.perKind[b.decisionKind] += b.count;
    rows.set(key, row);
  }

  const sorted = Array.from(rows.values()).sort((a, b) => b.total - a.total);
  const max = sorted[0]?.total ?? 1;

  return (
    <ul className="flex flex-col gap-1.5">
      {sorted.map((r) => {
        const widthPct = Math.max(2, (r.total / max) * 100);
        return (
          <li
            key={`${r.guardName}|${r.guardPhase}`}
            className="grid grid-cols-[1fr_3fr_auto] items-center gap-2 rounded-sm border border-edge bg-canvas/40 px-2 py-1.5 text-[11px]"
          >
            <div className="flex flex-col">
              <span className="text-ink">{r.guardName}</span>
              <span className="text-[10px] uppercase tracking-section text-faint">
                {r.guardPhase}
              </span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-sm bg-edge/40">
              <div
                className="flex h-full"
                style={{ width: `${widthPct}%` }}
              >
                {(
                  [
                    "EXECUTE",
                    "REWRITE",
                    "DEFER",
                    "ESCALATE",
                    "REQUEST_CONFIRMATION",
                    "REFUSE",
                  ] as const
                ).map((kind) => {
                  const t = decisionTheme[kind];
                  const w = r.perKind[kind];
                  if (w === 0) return null;
                  return (
                    <div
                      key={kind}
                      title={`${kind}: ${w}`}
                      className={`${t.bg.replace("/10", "/40")} ${t.dot.replace("bg-", "border-")}`}
                      style={{ flex: w }}
                    />
                  );
                })}
              </div>
            </div>
            <code className="text-ink tabular-nums">{r.total}</code>
          </li>
        );
      })}
    </ul>
  );
}
