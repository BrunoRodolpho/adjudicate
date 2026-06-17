"use client";

import { AsyncBoundary, EmptyState } from "@/components/ui";
import { useApprovals, useResolveApproval } from "@/hooks/useApprovals";

export const dynamic = "force-dynamic";

/**
 * Approvals queue — pending remediation confirmations from the approval-engine
 * registry. Approve/Decline drive `approval.resolve`, which RE-ADJUDICATES the
 * parked envelope through the kernel's confirmationReceipt path. On success the
 * incidents/proposals/approvals queries are invalidated so all three surfaces
 * reflect the new outcome.
 */
export default function ApprovalsPage() {
  const approvals = useApprovals({ status: "pending" });
  const resolve = useResolveApproval();
  const rows = approvals.data ?? [];

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between border-b border-edge pb-3">
        <h1 className="text-[10px] uppercase tracking-section text-muted">
          Approvals · pending confirmations
        </h1>
        <span className="text-[10px] tabular-nums text-faint">
          {rows.length} pending
        </span>
      </header>

      <p className="rounded-sm border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[10px] text-amber-200">
        Approving DRIVES a full kernel re-adjudication of the parked remediation
        envelope (confirmationReceipt path). If incident state has changed, the
        kernel may REFUSE and nothing executes.
      </p>

      <div
        className="overflow-hidden rounded-sm border border-edge bg-panel/40"
        data-testid="approvals-table"
      >
        <AsyncBoundary
          isLoading={approvals.isLoading}
          isError={approvals.isError}
          isEmpty={rows.length === 0}
          emptyFallback={<EmptyState title="No pending approvals." />}
          errorMessage="Approval port not configured. Wire approvalPort into the route handler context."
        >
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-edge text-left text-faint">
                <th scope="col" className="px-3 py-1.5 font-normal">Token</th>
                <th scope="col" className="px-3 py-1.5 font-normal">Incident</th>
                <th scope="col" className="px-3 py-1.5 font-normal">Intent</th>
                <th scope="col" className="px-3 py-1.5 font-normal">Prompt</th>
                <th scope="col" className="px-3 py-1.5 text-right font-normal">Decision</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.token}
                  data-testid={`approval-row-${r.token}`}
                  className="border-b border-edge/50 last:border-0"
                >
                  <th scope="row" className="px-3 py-1.5 text-left font-mono font-normal text-ink">
                    {r.token}
                  </th>
                  <td className="px-3 py-1.5 font-mono text-muted">{r.sessionId}</td>
                  <td className="px-3 py-1.5 text-muted">{r.intentKind}</td>
                  <td className="px-3 py-1.5 text-muted">{r.prompt}</td>
                  <td className="px-3 py-1.5">
                    {r.source === "agent" ? (
                      // Item D: agent approvals are READ-ONLY here — resolution
                      // stays in ibatexas (POST /api/admin/agent-approvals/:token/
                      // resolve). Hide approve/decline; show a provenance chip.
                      <div className="flex justify-end">
                        <span
                          data-testid={`agent-readonly-${r.token}`}
                          title="Agent approval — resolve in ibatexas (POST /api/admin/agent-approvals/:token/resolve)"
                          className="rounded-sm border border-sky-400/40 bg-sky-400/10 px-2 py-1 text-[10px] uppercase tracking-section text-sky-200"
                        >
                          Agent · resolve in ibatexas
                        </span>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          data-testid={`approve-${r.token}`}
                          disabled={resolve.isPending}
                          onClick={() =>
                            resolve.mutate({ token: r.token, accepted: true })
                          }
                          className="rounded-sm border border-emerald-400/40 bg-emerald-400/10 px-2 py-1 text-[10px] uppercase tracking-section text-emerald-200 hover:border-emerald-300/60 disabled:opacity-50 focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-300"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          data-testid={`decline-${r.token}`}
                          disabled={resolve.isPending}
                          onClick={() =>
                            resolve.mutate({ token: r.token, accepted: false })
                          }
                          className="rounded-sm border border-red-400/40 bg-red-400/10 px-2 py-1 text-[10px] uppercase tracking-section text-red-200 hover:border-red-300/60 disabled:opacity-50 focus:outline-none focus-visible:ring-1 focus-visible:ring-red-300"
                        >
                          Decline
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </AsyncBoundary>
      </div>
    </div>
  );
}
