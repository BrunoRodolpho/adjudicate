"use client";

import { AuditTable } from "@/components/table/AuditTable";
import { useAuditQuery } from "@/hooks/useAuditQuery";
import { useUrlFilters } from "@/hooks/useUrlFilters";
import { getClientGatewayMode, modeLabel } from "@/lib/runtime-mode";

/**
 * Audit Explorer — Phase 1 home.
 *
 * Reads filters from the URL via `useUrlFilters`, fetches via
 * `useAuditQuery`, hands records to the virtualization-ready
 * `<AuditTable>`. Click-to-navigate to `/decisions/[intentHash]` is the
 * one read-only interaction.
 */
export default function AuditExplorerPage() {
  const { filters, hasActiveFilters } = useUrlFilters();
  const { data, isLoading, isError } = useAuditQuery(filters);

  const recordCount = data?.records.length ?? 0;

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
        </h1>
        <span className="text-[10px] uppercase tracking-wider text-faint">
          {recordCount} record{recordCount === 1 ? "" : "s"} ·{" "}
          {modeLabel(getClientGatewayMode())} gateway
        </span>
      </header>

      {isLoading ? (
        <div className="rounded-sm border border-edge bg-panel/40 px-3 py-2 text-[11px] text-muted">
          Loading audit records…
        </div>
      ) : isError ? (
        <div className="rounded-sm border border-red-500/40 bg-red-500/5 px-3 py-2 text-[11px] text-red-300">
          Failed to load audit records.
        </div>
      ) : (
        <AuditTable records={data?.records ?? []} />
      )}
    </div>
  );
}
