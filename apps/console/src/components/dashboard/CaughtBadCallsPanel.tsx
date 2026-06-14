"use client";

import { ShieldCheck } from "lucide-react";
import { useCatches } from "@/hooks/useCatches";

/**
 * "Caught a bad call" panel (item 7).
 *
 * Surfaces the two ways the kernel catches a bad LLM tool call. They are
 * tracked over DIFFERENT windows, so they are shown side by side and are
 * deliberately NOT summed:
 *   - REWRITE outcomes — from the dashboard's outcome distribution over the
 *     SELECTED time window (`rewriteCount`).
 *   - out-of-plan tool calls the loop blocked before any adjudication —
 *     ALL-TIME counts from `governance.catches` (the store keeps no timeline).
 */
export function CaughtBadCallsPanel({ rewriteCount }: { rewriteCount: number }) {
  const { data, isError } = useCatches();
  const outOfPlan = isError ? 0 : (data?.total ?? 0);

  return (
    <section
      data-testid="caught-bad-calls"
      className="flex flex-col gap-2 rounded-sm border border-edge bg-panel/40 p-3"
    >
      <header className="flex items-baseline justify-between">
        <h2 className="text-[10px] uppercase tracking-section text-faint">
          Caught a bad call
        </h2>
        <span className="text-[10px] text-faint">item 7</span>
      </header>
      <div className="flex items-center gap-2">
        <ShieldCheck size={16} className="shrink-0 text-emerald-400" aria-hidden />
        <span className="text-[13px] font-mono tabular-nums text-ink">
          <span data-testid="caught-out-of-plan">{outOfPlan.toLocaleString()}</span> blocked
          out-of-plan <span className="text-faint">(all-time)</span>
        </span>
      </div>
      <p className="text-[11px] tabular-nums text-muted">
        <span data-testid="caught-rewrite">{rewriteCount.toLocaleString()}</span> rewritten{" "}
        <span className="text-faint">(selected window)</span>
      </p>
    </section>
  );
}
