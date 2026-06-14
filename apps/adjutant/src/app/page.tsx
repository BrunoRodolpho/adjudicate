"use client";

import { AsyncBoundary } from "@/components/ui";
import { useIncidents } from "@/hooks/useIncidents";
import { useProposals } from "@/hooks/useProposals";
import { useApprovals } from "@/hooks/useApprovals";

export const dynamic = "force-dynamic";

/**
 * Overview — at-a-glance counts across the three Adjutant surfaces: open
 * incidents, pending proposals, and pending approvals.
 */
export default function OverviewPage() {
  const incidents = useIncidents();
  const proposals = useProposals();
  const approvals = useApprovals({ status: "pending" });

  const openIncidents =
    incidents.data?.filter((i) => i.status === "open").length ?? 0;
  const pendingProposals =
    proposals.data?.filter(
      (p) => p.status === "pending_review" || p.status === "pending_escalation",
    ).length ?? 0;
  const pendingApprovals = approvals.data?.length ?? 0;

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between border-b border-edge pb-3">
        <h1 className="text-[10px] uppercase tracking-section text-muted">
          Overview · supervised remediation
        </h1>
        <span className="text-[10px] text-faint">Adjutant</span>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          testId="stat-open-incidents"
          label="Open incidents"
          value={openIncidents}
          isLoading={incidents.isLoading}
          isError={incidents.isError}
          href="/incidents"
        />
        <StatCard
          testId="stat-pending-proposals"
          label="Pending proposals"
          value={pendingProposals}
          isLoading={proposals.isLoading}
          isError={proposals.isError}
          href="/proposals"
        />
        <StatCard
          testId="stat-pending-approvals"
          label="Pending approvals"
          value={pendingApprovals}
          isLoading={approvals.isLoading}
          isError={approvals.isError}
          href="/approvals"
        />
      </div>
    </div>
  );
}

function StatCard({
  testId,
  label,
  value,
  isLoading,
  isError,
  href,
}: {
  testId: string;
  label: string;
  value: number;
  isLoading: boolean;
  isError: boolean;
  href: string;
}) {
  return (
    <a
      href={href}
      data-testid={testId}
      className="flex flex-col gap-2 rounded-sm border border-edge bg-panel/40 px-4 py-3 transition-colors hover:border-ink/30"
    >
      <span className="text-[10px] uppercase tracking-section text-faint">
        {label}
      </span>
      <AsyncBoundary
        isLoading={isLoading}
        isError={isError}
        loadingFallback={<span className="text-[11px] text-faint">…</span>}
        errorMessage="Failed to load."
      >
        <span className="text-2xl tabular-nums text-ink">{value}</span>
      </AsyncBoundary>
    </a>
  );
}
