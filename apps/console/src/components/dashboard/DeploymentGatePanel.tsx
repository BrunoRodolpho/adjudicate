"use client";

import { useMemo } from "react";
import type { AuditRecord } from "@adjudicate/core";
import { useAuditQuery } from "@/hooks/useAuditQuery";
import { cn } from "@/lib/cn";

/**
 * Deployment release-gate panel (Item 14). Client-aggregated from the audit
 * table (like DriftPanel) — counts deployment-request gate outcomes over the
 * window: regression ESCALATEs, carbon-budget REWRITEs, model/prompt CONFIRMs.
 */
const GATES = [
  { key: "ESCALATE", label: "Regression / approval escalations" },
  { key: "REWRITE", label: "Carbon-budget region rewrites" },
  { key: "REQUEST_CONFIRMATION", label: "Model/prompt confirmations" },
] as const;

function isDeployment(r: AuditRecord): boolean {
  return r.envelope.kind.startsWith("deployment.");
}

export function DeploymentGatePanel() {
  const since = useMemo(() => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), []);
  const { data, isLoading, isError } = useAuditQuery({ since, limit: 1000 });

  const counts = useMemo(() => {
    const c: Record<string, number> = { ESCALATE: 0, REWRITE: 0, REQUEST_CONFIRMATION: 0 };
    for (const r of data?.records ?? []) {
      if (!isDeployment(r)) continue;
      if (r.decision.kind in c) c[r.decision.kind] = (c[r.decision.kind] ?? 0) + 1;
    }
    return c;
  }, [data?.records]);

  return (
    <section className="flex flex-col gap-2" data-testid="deployment-gate-panel">
      <header className="flex items-baseline justify-between">
        <h2 className="text-[10px] uppercase tracking-section text-faint">Deployment release gates · last 7 days</h2>
        <span className="text-[10px] text-faint">client-side aggregation</span>
      </header>
      <div className="overflow-hidden rounded-sm border border-edge bg-panel/40">
        {isLoading ? (
          <div className="px-3 py-3 text-[11px] text-muted">Loading deployment gates…</div>
        ) : isError ? (
          <div className="px-3 py-3 text-[11px] italic text-faint">Failed to load.</div>
        ) : (
          <table className="w-full border-collapse text-[11px]">
            <tbody>
              {GATES.map((g) => (
                <tr key={g.key} className="border-b border-edge/50 last:border-0">
                  <td className="px-3 py-1.5 text-ink">{g.label}</td>
                  <td className={cn("px-3 py-1.5 text-right tabular-nums", counts[g.key]! > 0 ? "text-amber-300" : "text-muted")}>
                    {counts[g.key]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
