"use client";

import { useApprovals, useResolveApproval } from "@/hooks/useApprovals";
import { cn } from "@/lib/cn";

/**
 * Approvals panel (ADR-122) — pending REQUEST_CONFIRMATION items with
 * approve/decline actions. Resolving routes through the approval engine →
 * adapter-core `confirm()` (replay-safe single-use token).
 */
const STATUS_STYLE: Record<string, string> = {
  pending: "text-amber-300",
  approved: "text-emerald-300",
  declined: "text-red-300",
  expired: "text-faint",
};

export function ApprovalsPanel() {
  const { data, isLoading, isError } = useApprovals();
  const resolve = useResolveApproval();

  return (
    <section className="rounded-sm border border-edge bg-panel/40" data-testid="approvals-panel">
      <header className="border-b border-edge px-3 py-1.5">
        <span className="text-[10px] uppercase tracking-section text-faint">Approvals · ADR-122</span>
      </header>
      <div className="px-3 py-2">
        {isLoading ? (
          <p className="text-[11px] text-muted">Loading approvals…</p>
        ) : isError || !data ? (
          <p className="text-[11px] italic text-faint">
            Approval engine not configured.
          </p>
        ) : data.length === 0 ? (
          <p className="text-[11px] italic text-faint">No approval requests.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.map((a) => (
              <li key={a.token} className="rounded-sm border border-edge/50 px-2 py-1.5 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-muted">{a.intentKind}</span>
                  <span className={cn("uppercase tracking-section", STATUS_STYLE[a.status])}>{a.status}</span>
                </div>
                <p className="mt-0.5 text-ink">{a.prompt}</p>
                {a.status === "pending" ? (
                  <div className="mt-1 flex gap-2">
                    <button
                      type="button"
                      className="rounded-sm border border-emerald-500/40 px-2 py-0.5 text-emerald-300"
                      onClick={() => resolve.mutate({ token: a.token, accepted: true })}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="rounded-sm border border-red-500/40 px-2 py-0.5 text-red-300"
                      onClick={() => resolve.mutate({ token: a.token, accepted: false })}
                    >
                      Decline
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
