"use client";

import { useMemo } from "react";
import { usePiiClassification } from "@/hooks/usePiiClassification";
import { cn } from "@/lib/cn";

/**
 * Data-classification (PII) panel (ADR-117).
 *
 * Surfaces `createDataClassificationGuard` outcomes: how many intents had PII
 * REWRITE-redacted vs REFUSE-blocked, bucketed by sensitivity tier. Counts come
 * from `governance.piiClassificationStats`, which reads the
 * `validation.pii_redacted` / `validation.pii_blocked` basis codes whose
 * `detail.sensitivityLevel` rides on the audit record.
 *
 * Distinct from the operational DriftPanel — this is PII *volume*, not
 * integrity drift.
 */
const TIERS = ["critical", "high", "medium", "low"] as const;
type Tier = (typeof TIERS)[number];

const TIER_STYLE: Record<Tier, string> = {
  critical: "text-red-300",
  high: "text-amber-300",
  medium: "text-yellow-200",
  low: "text-muted",
};

export function PiiClassificationPanel({ since }: { since: string }) {
  const { data, isLoading, isError } = usePiiClassification({ since });

  const rows = useMemo(() => {
    const byTier = new Map<Tier, { redacted: number; blocked: number }>();
    for (const tier of TIERS) byTier.set(tier, { redacted: 0, blocked: 0 });
    for (const b of data?.buckets ?? []) {
      const row = byTier.get(b.sensitivityLevel as Tier);
      if (!row) continue;
      if (b.disposition === "redacted") row.redacted += b.count;
      else row.blocked += b.count;
    }
    return TIERS.map((tier) => ({ tier, ...byTier.get(tier)! }));
  }, [data?.buckets]);

  const total = useMemo(
    () => rows.reduce((sum, r) => sum + r.redacted + r.blocked, 0),
    [rows],
  );

  return (
    <section className="flex flex-col gap-2" data-testid="pii-panel">
      <header className="flex items-baseline justify-between">
        <h2 className="text-[10px] uppercase tracking-section text-faint">
          Data classification · PII dispositions
        </h2>
        <span className="text-[10px] text-faint">ADR-117</span>
      </header>
      <div className="overflow-hidden rounded-sm border border-edge bg-panel/40">
        {isLoading ? (
          <div className="px-3 py-3 text-[11px] text-muted">Loading PII stats…</div>
        ) : isError || !data ? (
          <div className="px-3 py-3 text-[11px] italic text-faint">
            Data-classification stats unavailable.
          </div>
        ) : total === 0 ? (
          <div className="px-3 py-3 text-[11px] italic text-faint">
            No PII detections in this window.
          </div>
        ) : (
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-edge text-left text-faint">
                <th className="px-3 py-1.5 font-normal">Sensitivity</th>
                <th className="px-3 py-1.5 text-right font-normal">Redacted</th>
                <th className="px-3 py-1.5 text-right font-normal">Blocked</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.tier} className="border-b border-edge/50 last:border-0">
                  <td className={cn("px-3 py-1.5 uppercase tracking-section", TIER_STYLE[r.tier])}>
                    {r.tier}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-ink">{r.redacted}</td>
                  <td
                    className={cn(
                      "px-3 py-1.5 text-right tabular-nums",
                      r.blocked > 0 ? "text-red-300" : "text-ink",
                    )}
                  >
                    {r.blocked}
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
