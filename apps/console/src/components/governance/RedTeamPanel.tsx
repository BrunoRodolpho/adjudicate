"use client";

import { useRedTeam } from "@/hooks/useRedTeam";
import { cn } from "@/lib/cn";

/**
 * Red-Team panel (ADR-118). Renders the adversarial escape-count report for the
 * installed Pack — defended vs escaped per attack vector. A non-zero escape
 * count is a policy regression (highlighted red).
 */
const VECTOR_LABEL: Record<string, string> = {
  prompt_injection: "Prompt Injection",
  taint_escalation: "Taint Escalation",
  tool_scope_violation: "Tool-Scope Violation",
};

export function RedTeamPanel() {
  const { data, isLoading, isError } = useRedTeam();

  return (
    <section className="rounded-sm border border-edge bg-panel/40" data-testid="red-team-panel">
      <header className="flex items-baseline justify-between border-b border-edge px-3 py-1.5">
        <span className="text-[10px] uppercase tracking-section text-faint">
          Red-Team · adversarial defenses
        </span>
        <span className="text-[10px] text-faint">ADR-118</span>
      </header>
      <div className="px-3 py-2">
        {isLoading ? (
          <p className="text-[11px] text-muted">Loading red-team report…</p>
        ) : isError || !data ? (
          <p className="text-[11px] italic text-faint">
            No red-team report configured. Run @adjudicate/red-team against the
            installed Pack and wire the report into the route handler context.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <p
              className={cn(
                "text-[11px]",
                data.summary.escaped > 0 ? "text-red-300" : "text-emerald-300",
              )}
            >
              {data.summary.total} scenarios · {data.summary.defended} defended ·{" "}
              {data.summary.escaped} escaped · {data.summary.errors} errors
            </p>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-edge text-left text-faint">
                  <th className="py-1 font-normal">Vector</th>
                  <th className="py-1 text-right font-normal">Escapes</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.summary.escapesByVector).map(([vector, count]) => (
                  <tr key={vector} className="border-b border-edge/50 last:border-0">
                    <td className="py-1">{VECTOR_LABEL[vector] ?? vector}</td>
                    <td
                      className={cn(
                        "py-1 text-right tabular-nums",
                        count > 0 ? "text-red-300" : "text-ink",
                      )}
                    >
                      {count}
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
