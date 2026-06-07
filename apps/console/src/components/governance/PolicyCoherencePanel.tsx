"use client";

import { usePolicyCoherence } from "@/hooks/usePolicyCoherence";
import { cn } from "@/lib/cn";

/**
 * Policy Coherence panel (AJD-301, ADR-125) — structural coherence diagnostics
 * (orphan defers, unreachable/phantom intents, system-taint contradictions)
 * over the installed Pack + planner probes.
 */
const SEVERITY_STYLE: Record<string, string> = {
  error: "text-red-300",
  warning: "text-amber-300",
  note: "text-muted",
};

export function PolicyCoherencePanel() {
  const { data, isLoading, isError } = usePolicyCoherence();

  return (
    <section className="rounded-sm border border-edge bg-panel/40" data-testid="policy-coherence-panel">
      <header className="flex items-baseline justify-between border-b border-edge px-3 py-1.5">
        <span className="text-[10px] uppercase tracking-section text-faint">Policy Coherence · AJD-301</span>
        <span className="text-[10px] text-faint">ADR-125</span>
      </header>
      <div className="px-3 py-2 text-[11px]">
        {isLoading ? (
          <p className="text-muted">Analyzing policy…</p>
        ) : isError || !data ? (
          <p className="italic text-faint">Policy-coherence analysis not configured.</p>
        ) : data.diagnostics.length === 0 ? (
          <p className="text-emerald-300">✓ No coherence issues found.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {data.diagnostics
              .filter((d) => d.code === "AJD-301")
              .map((d, i) => (
                <li key={i} className="border-b border-edge/50 pb-1 last:border-0">
                  <span className={cn("uppercase tracking-section", SEVERITY_STYLE[d.severity])}>
                    {d.severity}
                  </span>{" "}
                  <span className="text-faint">{(d.detail?.rule as string) ?? d.code}</span>
                  <p className="text-ink">{d.message}</p>
                </li>
              ))}
          </ul>
        )}
      </div>
    </section>
  );
}
