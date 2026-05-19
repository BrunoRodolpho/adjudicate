"use client";

import { useMemo } from "react";
import type { AuditRecord, DecisionKind, Taint } from "@adjudicate/core";
import { useLiveTailContext } from "@/components/shell/LiveTailContext";
import { AuditTable } from "@/components/table/AuditTable";
import { useAuditQuery } from "@/hooks/useAuditQuery";
import { useUrlFilters } from "@/hooks/useUrlFilters";
import { getClientGatewayMode, modeLabel } from "@/lib/runtime-mode";
import type { AuditQuery } from "@/types/adjudicate";

/**
 * Audit Explorer — Phase 1 home, with live-tail overlay (T-080).
 *
 * Reads filters from the URL via `useUrlFilters`. When the operator has
 * the TopBar's live-tail toggle off, the page behaves exactly as before
 * (single `useAuditQuery`). When live tail is on, the merged `records`
 * stream from {@link useLiveTailContext} replaces the static query
 * results and the table highlights newly-arrived rows for 1.5s.
 */
export default function AuditExplorerPage() {
  const { filters, hasActiveFilters } = useUrlFilters();
  const { data, isLoading, isError } = useAuditQuery(filters);
  const liveTail = useLiveTailContext();

  const displayedRecords = useMemo(() => {
    const base = liveTail.enabled
      ? applyFilters(liveTail.records, filters)
      : (data?.records ?? []);
    return base;
  }, [data?.records, liveTail.enabled, liveTail.records, filters]);

  const recordCount = displayedRecords.length;

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between border-b border-edge pb-3">
        <h1 className="text-[10px] uppercase tracking-section text-muted">
          Audit Explorer
          {hasActiveFilters ? (
            <span className="ml-2 normal-case tracking-normal text-faint">
              · filtered
            </span>
          ) : null}
          {liveTail.enabled ? (
            <span className="ml-2 normal-case tracking-normal text-emerald-300">
              · live
            </span>
          ) : null}
        </h1>
        <span className="text-[10px] uppercase tracking-wider text-faint">
          {recordCount} record{recordCount === 1 ? "" : "s"} ·{" "}
          {modeLabel(getClientGatewayMode())} gateway
        </span>
      </header>

      {!liveTail.enabled && isLoading ? (
        <div className="rounded-sm border border-edge bg-panel/40 px-3 py-2 text-[11px] text-muted">
          Loading audit records…
        </div>
      ) : !liveTail.enabled && isError ? (
        <div className="rounded-sm border border-red-500/40 bg-red-500/5 px-3 py-2 text-[11px] text-red-300">
          Failed to load audit records.
        </div>
      ) : (
        <AuditTable
          records={displayedRecords}
          highlightHashes={liveTail.enabled ? liveTail.newHashes : undefined}
        />
      )}
    </div>
  );
}

/** Apply the active URL filters to the live-tail record set. The tail
 * hook fetches with the empty filter (so the operator can keep their URL
 * filters and still see ALL incoming traffic), but the table should obey
 * the URL — otherwise filter selections silently break under live mode.
 */
function applyFilters(
  records: readonly AuditRecord[],
  q: AuditQuery,
): readonly AuditRecord[] {
  if (
    !q.decisionKind &&
    !q.taint &&
    !q.intentKind &&
    !q.refusalCode &&
    !q.intentHash
  ) {
    return records;
  }
  return records.filter((r) => {
    if (q.decisionKind && r.decision.kind !== (q.decisionKind as DecisionKind))
      return false;
    if (q.taint && r.envelope.taint !== (q.taint as Taint)) return false;
    if (q.intentKind && r.envelope.kind !== q.intentKind) return false;
    if (
      q.refusalCode &&
      (r.decision.kind !== "REFUSE" ||
        r.decision.refusal.code !== q.refusalCode)
    )
      return false;
    if (q.intentHash && !r.intentHash.includes(q.intentHash)) return false;
    return true;
  });
}
