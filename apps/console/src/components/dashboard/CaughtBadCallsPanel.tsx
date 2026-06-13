"use client";

import { ShieldCheck } from "lucide-react";
import { useCatches } from "@/hooks/useCatches";

/**
 * "Caught a bad call" headline (item 7).
 *
 * SUMS the two ways the kernel catches a bad LLM tool call into one
 * operator-facing number:
 *   - REWRITE outcomes (already counted by the outcome distribution; the
 *     dashboard passes that bucket in as `rewriteCount`), and
 *   - out-of-plan tool calls the loop blocked before any adjudication
 *     (`governance.catches`, never adjudicated so counted separately here).
 *
 * Avoids double-counting: REWRITE comes only from the outcome distribution,
 * out_of_plan only from the catch store.
 */
export function CaughtBadCallsPanel({ rewriteCount }: { rewriteCount: number }) {
  const { data, isError } = useCatches();
  const outOfPlan = isError ? 0 : (data?.total ?? 0);
  const total = rewriteCount + outOfPlan;

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
        <span className="text-[15px] font-mono tabular-nums text-ink">
          caught <span data-testid="caught-total">{total.toLocaleString()}</span> bad{" "}
          {total === 1 ? "call" : "calls"}
        </span>
      </div>
      <p className="text-[11px] tabular-nums text-muted">
        <span data-testid="caught-rewrite">{rewriteCount.toLocaleString()}</span> rewritten
        {" · "}
        <span data-testid="caught-out-of-plan">{outOfPlan.toLocaleString()}</span> blocked out-of-plan
      </p>
    </section>
  );
}
