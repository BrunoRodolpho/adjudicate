"use client";

import { AsyncBoundary } from "@/components/ui";
import { useAuditRecords } from "@/hooks/useAuditRecords";
import { useKillSwitchStatus } from "@/hooks/useKillSwitchStatus";

export const dynamic = "force-dynamic";

/**
 * Overview — the Inspector-General landing. At-a-glance READ-ONLY governance
 * status: the recent audit-record count and the current kill-switch state. Both
 * are pure reads over the admin SDK's read-only router — there is no control on
 * this plane that could authorize or weaken a decision. 112+ deepen these into
 * the Audit Explorer, Investigations, and Governance views.
 */
export default function OverviewPage() {
  const audit = useAuditRecords({ limit: 100 });
  const killSwitch = useKillSwitchStatus();

  const recordCount = audit.data?.records.length ?? 0;
  const switchStatus = killSwitch.data?.status ?? "—";

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between border-b border-edge pb-3">
        <h1 className="text-[10px] uppercase tracking-section text-muted">
          Overview · inspector-general
        </h1>
        <span className="text-[10px] text-faint">Adjudicant</span>
      </header>

      <p className="max-w-prose text-[11px] leading-relaxed text-muted">
        This is the write-isolated OBSERVER plane. It reads the kernel decision
        trail and governance state; it cannot authorize, weaken, or replay-mutate
        a decision — those surfaces live on the operator and approver planes.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard
          testId="stat-audit-records"
          label="Audit records (recent)"
          value={recordCount}
          isLoading={audit.isLoading}
          isError={audit.isError}
        />
        <StatCard
          testId="stat-kill-switch"
          label="Kill switch (read-only)"
          value={switchStatus}
          isLoading={killSwitch.isLoading}
          isError={killSwitch.isError}
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
}: {
  testId: string;
  label: string;
  value: number | string;
  isLoading: boolean;
  isError: boolean;
}) {
  return (
    <div
      data-testid={testId}
      className="flex flex-col gap-2 rounded-sm border border-edge bg-panel/40 px-4 py-3"
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
    </div>
  );
}
