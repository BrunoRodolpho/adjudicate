"use client";

import { useApprovals, useResolveApproval } from "@/hooks/useApprovals";
import { cn } from "@/lib/cn";
import { escalationDue, quorumProgress } from "@/lib/approval-governance";

/**
 * Approvals panel (ADR-122) — pending REQUEST_CONFIRMATION items with
 * approve/decline actions.
 *
 * NOTE: in the reference console this is a DISPLAY-ONLY projection. Resolving
 * flips the registry status for the operator view; it does NOT run the
 * authorization path. In production, resolve routes through
 * `createApprovalEngine` → adapter-core `confirm()` (single-use token take,
 * timing-safe hash verification, kernel re-adjudication). The banner below makes
 * this explicit so an operator never mistakes the demo for the real gate.
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
      <p
        className="border-b border-edge bg-amber-500/5 px-3 py-1 text-[10px] italic text-amber-300/80"
        data-testid="approvals-display-only-note"
      >
        Reference projection — resolving updates the operator view only. Production
        authorization runs through the approval engine → adapter-core confirm()
        (single-use token + hash verification + kernel re-adjudication).
      </p>
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
            {data.map((a) => {
              const q = quorumProgress(a);
              const due = escalationDue(a, Date.now());
              return (
              <li key={a.token} className="rounded-sm border border-edge/50 px-2 py-1.5 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-muted">{a.intentKind}</span>
                  <span className={cn("uppercase tracking-section", STATUS_STYLE[a.status])}>{a.status}</span>
                </div>
                <p className="mt-0.5 text-ink">{a.prompt}</p>
                {q || due ? (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5" data-testid="approval-governance">
                    {q ? (
                      <span
                        className={cn(
                          "rounded-sm border px-1.5 py-0.5 text-[10px] uppercase tracking-section",
                          q.met
                            ? "border-emerald-500/40 text-emerald-300"
                            : "border-amber-500/40 text-amber-300",
                        )}
                        data-testid="quorum-progress"
                      >
                        Quorum {q.count}/{q.required}
                      </span>
                    ) : null}
                    {due ? (
                      <span
                        className="rounded-sm border border-red-500/40 px-1.5 py-0.5 text-[10px] uppercase tracking-section text-red-300"
                        data-testid="escalation-due"
                      >
                        Escalation due{a.escalation ? ` → ${a.escalation.to}` : ""}
                      </span>
                    ) : null}
                  </div>
                ) : null}
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
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
