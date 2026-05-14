"use client";

import { useMemo } from "react";
import type { AuditRecord } from "@adjudicate/core";
import { useAuditQuery } from "@/hooks/useAuditQuery";

/**
 * Top refusal reasons over the dashboard window. Aggregates by
 * `refusal.code` from records returned by `audit.query` (already gated to
 * REFUSE in the request). Bounded to the top 8 reasons; for higher-volume
 * adopters a native Postgres aggregate procedure is the right substrate but
 * the AuditStore-side aggregator is sufficient for the console preview.
 */
export function TopRefusals({ since }: { since: string }) {
  const { data, isLoading, isError } = useAuditQuery({
    since,
    decisionKind: "REFUSE",
    limit: 500,
  });

  const rows = useMemo(() => {
    const records: ReadonlyArray<AuditRecord> = data?.records ?? [];
    const counts = new Map<string, number>();
    for (const r of records) {
      if (r.decision.kind !== "REFUSE") continue;
      const key = r.decision.refusal.code;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [data]);

  return (
    <section className="rounded-sm border border-edge bg-panel/40">
      <header className="border-b border-edge px-3 py-1.5">
        <span className="text-[10px] uppercase tracking-section text-faint">
          Top refusal reasons
        </span>
      </header>
      <div className="px-3 py-2">
        {isLoading ? (
          <p className="text-[11px] text-muted">Loading refusals…</p>
        ) : isError ? (
          <p className="text-[11px] italic text-faint">
            Failed to load refusal counts.
          </p>
        ) : rows.length === 0 ? (
          <p className="text-[11px] italic text-faint">
            No refusals in the selected window.
          </p>
        ) : (
          <ul className="flex flex-col gap-1 text-[11px]">
            {rows.map(([code, count]) => (
              <li
                key={code}
                className="flex items-center justify-between rounded-sm border border-edge bg-canvas/40 px-2 py-1"
              >
                <code className="text-ink">{code}</code>
                <span className="tabular-nums text-muted">{count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
