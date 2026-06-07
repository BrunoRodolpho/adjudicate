"use client";

import { useTokenBudget } from "@/hooks/useTokenBudget";
import { cn } from "@/lib/cn";

/**
 * Token Budget panel (ADR-120). Per-session cumulative token consumption vs the
 * configured budget. Over-budget rows are highlighted (a token-budget guard
 * would REFUSE/DEFER subsequent steps).
 */
export function TokenBudgetPanel() {
  const { data, isLoading, isError } = useTokenBudget();

  return (
    <section className="flex flex-col gap-2" data-testid="token-budget-panel">
      <header className="flex items-baseline justify-between">
        <h2 className="text-[10px] uppercase tracking-section text-faint">
          Token budget · per session
        </h2>
        <span className="text-[10px] text-faint">ADR-120</span>
      </header>
      <div className="overflow-hidden rounded-sm border border-edge bg-panel/40">
        {isLoading ? (
          <div className="px-3 py-3 text-[11px] text-muted">Loading token budgets…</div>
        ) : isError || !data ? (
          <div className="px-3 py-3 text-[11px] italic text-faint">
            Token-budget telemetry not configured.
          </div>
        ) : data.sessions.length === 0 ? (
          <div className="px-3 py-3 text-[11px] italic text-faint">No token usage recorded.</div>
        ) : (
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-edge text-left text-faint">
                <th className="px-3 py-1.5 font-normal">Session</th>
                <th className="px-3 py-1.5 text-right font-normal">Consumed</th>
                <th className="px-3 py-1.5 text-right font-normal">Budget</th>
                <th className="px-3 py-1.5 text-right font-normal">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {data.sessions.map((s) => {
                const over = s.remaining !== undefined && s.remaining < 0;
                return (
                  <tr key={s.sessionId} className="border-b border-edge/50 last:border-0">
                    <td className="px-3 py-1.5 font-mono">{s.sessionId}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-ink">
                      {s.consumed.toLocaleString()}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted">
                      {s.budget?.toLocaleString() ?? "—"}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-1.5 text-right tabular-nums",
                        over ? "text-red-300" : "text-ink",
                      )}
                    >
                      {s.remaining?.toLocaleString() ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
