"use client";

import { useMemo, useState } from "react";
import {
  DECISION_KIND_ORDER,
  decisionTheme,
} from "@/lib/decision-theme";
import { useOutcomeDistribution } from "@/hooks/useOutcomeDistribution";
import {
  OutcomeChart,
  OutcomeChartLegend,
} from "@/components/dashboard/OutcomeChart";
import {
  RANGE_BUCKET,
  RANGE_HOURS,
  RangePicker,
  isoSince,
  type DashboardRange,
} from "@/components/dashboard/RangePicker";
import { AccuracyPanel } from "@/components/dashboard/AccuracyPanel";
import { DriftPanel } from "@/components/dashboard/DriftPanel";
import { PiiClassificationPanel } from "@/components/dashboard/PiiClassificationPanel";
import { TokenBudgetPanel } from "@/components/dashboard/TokenBudgetPanel";
import { SLOPanel } from "@/components/dashboard/SLOPanel";
import { TopRefusals } from "@/components/dashboard/TopRefusals";

/**
 * Dashboard — Console v0.2 outcome-distribution surface.
 *
 * Renders a stacked area chart of `Decision.kind` counts over the selected
 * window. Backs by the `governance.outcomeDistribution` tRPC procedure.
 * Decision-state colours match the rest of the console. Below the chart:
 * the SA2-Rec-6 decision-accuracy panel (powered by retrospective outcomes)
 * plus the top-refusal-reasons table aggregated from `audit.query`.
 */
export default function DashboardPage() {
  const [range, setRange] = useState<DashboardRange>("24h");
  const since = useMemo(() => isoSince(RANGE_HOURS[range]), [range]);
  const { data, isLoading, isError } = useOutcomeDistribution({
    since,
    bucket: RANGE_BUCKET[range],
  });

  const buckets = data?.buckets ?? [];
  const totals = useMemo(() => {
    const t: Record<string, number> = {
      EXECUTE: 0,
      REFUSE: 0,
      REWRITE: 0,
      DEFER: 0,
      ESCALATE: 0,
      REQUEST_CONFIRMATION: 0,
    };
    for (const b of buckets)
      for (const k of DECISION_KIND_ORDER) t[k]! += b[k];
    return t;
  }, [buckets]);

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between border-b border-edge pb-3">
        <h1 className="text-[10px] uppercase tracking-section text-muted">
          Dashboard · Outcome Distribution
        </h1>
        <RangePicker value={range} onChange={setRange} />
      </header>

      <section className="rounded-sm border border-edge bg-panel/40 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-section text-faint">
            Decisions over {range} ({RANGE_BUCKET[range]} buckets)
          </span>
          <OutcomeChartLegend />
        </div>
        {isLoading ? (
          <div className="flex h-60 items-center justify-center text-[11px] text-muted">
            Loading distribution…
          </div>
        ) : isError ? (
          <div className="flex h-60 items-center justify-center text-[11px] text-red-300">
            Failed to load distribution.
          </div>
        ) : (
          <OutcomeChart buckets={buckets} />
        )}
      </section>

      <section className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
        {DECISION_KIND_ORDER.map((kind) => {
          const t = decisionTheme[kind];
          return (
            <div
              key={kind}
              className={`flex flex-col gap-1 rounded-sm border ${t.border} ${t.bg} px-3 py-2`}
            >
              <span className="flex items-center gap-1 text-[10px] uppercase tracking-section text-faint">
                <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
                {t.label}
              </span>
              <span className={`text-lg ${t.fg} tabular-nums`}>
                {totals[kind]}
              </span>
            </div>
          );
        })}
      </section>

      <section className="flex flex-col gap-2">
        <header className="text-[10px] uppercase tracking-section text-faint">
          Decision accuracy
        </header>
        <AccuracyPanel since={since} />
      </section>

      <TopRefusals since={since} />

      <SLOPanel />

      <DriftPanel />

      <PiiClassificationPanel since={since} />

      <TokenBudgetPanel />
    </div>
  );
}
