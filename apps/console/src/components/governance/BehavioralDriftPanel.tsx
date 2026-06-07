"use client";

import { useBehavioralDrift } from "@/hooks/useBehavioralDrift";
import { cn } from "@/lib/cn";

/**
 * Behavioral Drift panel (ADR-119) — statistical decision-distribution shift
 * (TVD per dimension + alerts). DISTINCT from the operational DriftPanel
 * (integrity codes) on the dashboard.
 */
export function BehavioralDriftPanel() {
  const { data, isLoading, isError } = useBehavioralDrift();

  return (
    <section className="rounded-sm border border-edge bg-panel/40" data-testid="behavioral-drift-panel">
      <header className="flex items-baseline justify-between border-b border-edge px-3 py-1.5">
        <span className="text-[10px] uppercase tracking-section text-faint">
          Behavioral Drift · distribution shift
        </span>
        <span className="text-[10px] text-faint">ADR-119</span>
      </header>
      <div className="px-3 py-2">
        {isLoading ? (
          <p className="text-[11px] text-muted">Loading drift snapshot…</p>
        ) : isError || !data ? (
          <p className="text-[11px] italic text-faint">
            No behavioral-drift detector configured. Wire an @adjudicate/drift
            detector into the route handler context.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-[10px] text-faint">
              {data.totalObserved} observed · baseline {data.baselineWindow} / recent{" "}
              {data.recentWindow} · threshold {data.alertThreshold}
            </p>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-edge text-left text-faint">
                  <th className="py-1 font-normal">Dimension</th>
                  <th className="py-1 text-right font-normal">TVD</th>
                  <th className="py-1 text-right font-normal">Alerts</th>
                </tr>
              </thead>
              <tbody>
                {data.dimensions.map((d) => (
                  <tr key={d.dimension} className="border-b border-edge/50 last:border-0">
                    <td className="py-1">{d.dimension}</td>
                    <td
                      className={cn(
                        "py-1 text-right tabular-nums",
                        d.tvd >= data.alertThreshold ? "text-amber-300" : "text-ink",
                      )}
                    >
                      {d.tvd.toFixed(2)}
                    </td>
                    <td
                      className={cn(
                        "py-1 text-right tabular-nums",
                        d.alerts.length > 0 ? "text-red-300" : "text-ink",
                      )}
                    >
                      {d.alerts.length}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
