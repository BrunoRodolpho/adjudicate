"use client";

import { AsyncBoundary, EmptyState } from "@/components/ui";
import { useProposals } from "@/hooks/useProposals";

export const dynamic = "force-dynamic";

type ProposalStatus =
  | "executed"
  | "pending_review"
  | "pending_escalation"
  | "declined"
  | "refused"
  | "deferred";

/**
 * Remediation Proposals — the RemediationProposalStore read-model. Columns:
 * proposal, incident, action, blastRadius, disposition, status badge.
 */
export default function ProposalsPage() {
  const proposals = useProposals();
  const rows = proposals.data ?? [];

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between border-b border-edge pb-3">
        <h1 className="text-[10px] uppercase tracking-section text-muted">
          Remediation proposals · read-model
        </h1>
        <span className="text-[10px] tabular-nums text-faint">
          {rows.length} proposal{rows.length === 1 ? "" : "s"}
        </span>
      </header>

      <div
        className="overflow-hidden rounded-sm border border-edge bg-panel/40"
        data-testid="proposals-table"
      >
        <AsyncBoundary
          isLoading={proposals.isLoading}
          isError={proposals.isError}
          isEmpty={rows.length === 0}
          emptyFallback={<EmptyState title="No remediation proposals recorded." />}
          errorMessage="Proposals port not configured. Wire proposalsPort into the route handler context."
        >
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-edge text-left text-faint">
                <th scope="col" className="px-3 py-1.5 font-normal">Proposal</th>
                <th scope="col" className="px-3 py-1.5 font-normal">Incident</th>
                <th scope="col" className="px-3 py-1.5 font-normal">Action</th>
                <th scope="col" className="px-3 py-1.5 text-right font-normal">Blast radius</th>
                <th scope="col" className="px-3 py-1.5 font-normal">Disposition</th>
                <th scope="col" className="px-3 py-1.5 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.proposalId}
                  data-testid={`proposal-row-${r.proposalId}`}
                  className="border-b border-edge/50 last:border-0"
                >
                  <th scope="row" className="px-3 py-1.5 text-left font-mono font-normal text-ink">
                    {r.proposalId}
                  </th>
                  <td className="px-3 py-1.5 font-mono text-muted">{r.incidentId}</td>
                  <td className="px-3 py-1.5 text-muted">{r.action}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-ink">
                    {r.blastRadius}
                  </td>
                  <td className="px-3 py-1.5">
                    <DispositionBadge disposition={r.disposition} />
                  </td>
                  <td className="px-3 py-1.5">
                    <StatusBadge status={r.status} />
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

function DispositionBadge({
  disposition,
}: {
  disposition: "SAFE" | "REVIEW" | "MANUAL";
}) {
  const cls =
    disposition === "SAFE"
      ? "bg-emerald-400/15 text-emerald-300"
      : disposition === "REVIEW"
        ? "bg-amber-400/15 text-amber-300"
        : "bg-fuchsia-400/15 text-fuchsia-300";
  return (
    <span className={`rounded-sm px-1.5 py-0.5 text-[10px] uppercase tracking-section ${cls}`}>
      {disposition}
    </span>
  );
}

const STATUS_STYLE: Record<ProposalStatus, string> = {
  executed: "bg-emerald-400/15 text-emerald-300",
  pending_review: "bg-amber-400/15 text-amber-300",
  pending_escalation: "bg-sky-400/15 text-sky-300",
  declined: "bg-zinc-400/15 text-muted",
  refused: "bg-red-400/15 text-red-300",
  deferred: "bg-zinc-400/15 text-muted",
};

function StatusBadge({ status }: { status: ProposalStatus }) {
  return (
    <span
      className={`rounded-sm px-1.5 py-0.5 text-[10px] uppercase tracking-section ${STATUS_STYLE[status]}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
