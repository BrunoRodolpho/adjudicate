"use client";

import { cn } from "@/lib/cn";
import { useApprovalHistory } from "@/hooks/useApprovals";

/**
 * Decision history (ADR-136) — durable, ledger-adjacent view of resolved
 * approvals from the persisted registry projection. Read-only.
 *
 * `resolvedBy` is rendered as a CLAIMED actor, not a verified principal: it is
 * sourced from the forgeable `x-adjudicate-actor-*` headers until real
 * per-operator identity (OIDC/Clerk) lands. The label keeps this honest.
 *
 * Selecting a row raises the chosen `intentHash` so the parent can render the
 * audit chain for that decision.
 */
const STATUS_STYLE: Record<string, string> = {
  approved: "text-emerald-300",
  declined: "text-red-300",
  expired: "text-faint",
  pending: "text-amber-300",
};

export function ApprovalHistoryView({
  selectedHash,
  onSelect,
}: {
  selectedHash?: string;
  onSelect?: (intentHash: string) => void;
}) {
  const { data, isLoading, isError } = useApprovalHistory();

  return (
    <section
      className="rounded-sm border border-edge bg-panel/40"
      data-testid="approval-history-view"
    >
      <header className="border-b border-edge px-3 py-1.5">
        <span className="text-[10px] uppercase tracking-section text-faint">
          Decision history · ADR-136
        </span>
      </header>
      <div className="px-3 py-2">
        {isLoading ? (
          <p className="text-[11px] text-muted">Loading decision history…</p>
        ) : isError || !data ? (
          <p className="text-[11px] italic text-faint">
            Decision history not configured.
          </p>
        ) : data.entries.length === 0 ? (
          <p className="text-[11px] italic text-faint">
            No resolved approvals yet — history populates after the first resolve.
          </p>
        ) : (
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr className="text-faint">
                <th scope="col" className="py-1 pr-2 font-normal">
                  Intent
                </th>
                <th scope="col" className="py-1 pr-2 font-normal">
                  Status
                </th>
                <th scope="col" className="py-1 pr-2 font-normal">
                  Approvers
                </th>
                <th scope="col" className="py-1 pr-2 font-normal">
                  Resolved
                </th>
                <th scope="col" className="py-1 pr-2 font-normal">
                  Claimed actor
                </th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((e) => {
                const isSelected = selectedHash === e.intentHash;
                return (
                  <tr
                    key={e.token}
                    className={cn(
                      "cursor-pointer border-t border-edge/40 hover:bg-panel/60",
                      isSelected && "bg-panel/60",
                    )}
                    aria-selected={isSelected}
                    onClick={() => onSelect?.(e.intentHash)}
                    data-testid="approval-history-row"
                  >
                    <td className="py-1 pr-2 font-mono text-muted">{e.intentKind}</td>
                    <td className="py-1 pr-2">
                      <span
                        className={cn(
                          "uppercase tracking-section",
                          STATUS_STYLE[e.status],
                        )}
                      >
                        {e.status}
                      </span>
                    </td>
                    <td
                      className="py-1 pr-2 tabular-nums text-faint"
                      data-testid="approver-count"
                    >
                      {e.approvals && e.approvals.length > 0 ? e.approvals.length : "—"}
                    </td>
                    <td className="py-1 pr-2 tabular-nums text-faint">
                      {e.resolvedAt ?? "—"}
                    </td>
                    <td className="py-1 pr-2 text-ink">
                      {/* CLAIMED actor — forgeable header until OIDC. */}
                      <span title="Claimed actor — attested via forgeable header, not a verified identity (ADR-136)">
                        {e.resolvedBy?.displayName ?? e.resolvedBy?.id ?? "—"}
                        <span className="ml-1 text-[9px] uppercase tracking-section text-faint">
                          claimed
                        </span>
                      </span>
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
