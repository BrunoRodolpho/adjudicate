"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { cn } from "@/lib/cn";
import { useApprovalChain } from "@/hooks/useApprovals";

/**
 * Audit chain (ADR-136) — the ordered request → resolved → resumed lineage for a
 * selected resolved approval, reconstructed by walking the FROZEN
 * `AuditRecord.supersedes` link (confirmation_resolved / defer_resumed) via
 * `approval.chain`.
 *
 * Each ledger-backed step deep-links to Decision Detail (`/decisions/[hash]`).
 * The lock icon signals token PRESENCE only — the token VALUE is never carried
 * by the schema or rendered.
 */
const KIND_LABEL: Record<string, string> = {
  requested: "Confirmation requested",
  resolved: "Operator resolved",
  resumed: "Kernel re-adjudicated (resumed)",
};

const STATUS_STYLE: Record<string, string> = {
  approved: "text-emerald-300",
  declined: "text-red-300",
  expired: "text-faint",
  pending: "text-amber-300",
};

export function ApprovalChainView({ intentHash }: { intentHash?: string }) {
  const { data, isLoading, isError } = useApprovalChain(intentHash);

  return (
    <section
      className="rounded-sm border border-edge bg-panel/40"
      data-testid="approval-chain-view"
    >
      <header className="border-b border-edge px-3 py-1.5">
        <span className="text-[10px] uppercase tracking-section text-faint">
          Audit chain · ADR-136
        </span>
      </header>
      <div className="px-3 py-2">
        {!intentHash ? (
          <p className="text-[11px] italic text-faint">
            Select a resolved approval to view its audit chain.
          </p>
        ) : isLoading ? (
          <p className="text-[11px] text-muted">Loading audit chain…</p>
        ) : isError || !data ? (
          <p className="text-[11px] italic text-faint">Audit chain not configured.</p>
        ) : data.steps.length === 0 ? (
          <p className="text-[11px] italic text-faint">
            No chain — this request was never resolved through the kernel.
          </p>
        ) : (
          <ol className="flex flex-col gap-1.5" data-testid="approval-chain-steps">
            {data.steps.map((step, i) => (
              <li
                key={`${step.kind}-${i}`}
                className="rounded-sm border border-edge/50 px-2 py-1.5 text-[11px]"
                data-testid="approval-chain-step"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-ink">
                    {KIND_LABEL[step.kind] ?? step.kind}
                  </span>
                  <span className="flex items-center gap-2">
                    {step.tokenPresent ? (
                      <Lock
                        size={11}
                        className="text-faint"
                        aria-label="confirmation token present"
                      />
                    ) : null}
                    {step.status ? (
                      <span
                        className={cn(
                          "uppercase tracking-section",
                          STATUS_STYLE[step.status],
                        )}
                      >
                        {step.status}
                      </span>
                    ) : null}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-faint">
                  <span className="tabular-nums">{step.at}</span>
                  {step.supersedesReason ? (
                    <span className="font-mono">{step.supersedesReason}</span>
                  ) : null}
                  {step.actor ? (
                    <span title="Claimed actor — forgeable header, not a verified identity (ADR-136)">
                      by {step.actor.displayName ?? step.actor.id}{" "}
                      <span className="text-[9px] uppercase tracking-section">claimed</span>
                    </span>
                  ) : null}
                  {step.intentHash ? (
                    <Link
                      href={`/decisions/${step.intentHash}`}
                      className="font-mono text-muted underline-offset-2 hover:text-ink hover:underline"
                    >
                      audit record →
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
