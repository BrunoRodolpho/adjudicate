"use client";

import { GitBranch, Activity, ShieldAlert } from "lucide-react";
import { AsyncBoundary, EmptyState } from "@/components/ui";
import {
  useGuardFireStats,
  useKillSwitchTimeline,
  useOutcomeDistribution,
  usePolicyDescriptor,
} from "@/hooks/useGovernance";

// A wide-open window so the scaffold's dashboards always have data to read; an
// adopter narrows this with a date control.
const WINDOW_SINCE = "2020-01-01T00:00:00.000Z";

const DECISION_KINDS = [
  "EXECUTE",
  "REFUSE",
  "DEFER",
  "ESCALATE",
  "REQUEST_CONFIRMATION",
  "REWRITE",
] as const;

/**
 * 115 — the Governance views of the write-isolated Adjudicant (Inspector-General)
 * OBSERVER plane. Three read-only surfaces, each a pure `.query` over the admin
 * SDK's READ-ONLY router:
 *
 *   1. Policy-version history — the installed policy bundle's structure
 *      (`governance.describePolicy`).
 *   2. Operational dashboards — guard-fire counts + outcome distribution
 *      (`governance.guardFireStats` / `governance.outcomeDistribution`).
 *   3. Kill-switch READ-status — the activation timeline
 *      (`governance.killSwitchTimeline`).
 *
 * This plane only OBSERVES and INVESTIGATES the governance state; it cannot
 * authorize, weaken, or replay-mutate a decision, and it cannot toggle the kill
 * switch (the WRITE stays on the operator console). Every view is
 * FEATURE-DETECTED — an unwired port surfaces as a "not configured" state, never
 * a crash or a fabricated value.
 */
export function GovernancePanel() {
  return (
    <div className="flex flex-col gap-5 p-4" data-testid="governance-panel">
      <header className="flex items-baseline justify-between border-b border-edge pb-3">
        <h1 className="text-[10px] uppercase tracking-section text-muted">
          Governance · inspector-general
        </h1>
        <span className="text-[10px] text-faint">read-only · write-isolated</span>
      </header>

      <p className="max-w-prose text-[11px] leading-relaxed text-muted">
        Read-only governance surfaces: policy-version history, operational
        dashboards, and the kill-switch activation timeline. This plane only
        observes and investigates governance state — it cannot authorize, weaken,
        or replay-mutate a decision, and it cannot toggle the kill switch (that
        write stays on the operator console).
      </p>

      <PolicyHistorySection />
      <DashboardsSection />
      <KillSwitchTimelineSection />
    </div>
  );
}

function SectionHeader({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <h2 className="flex items-center gap-1.5 text-[10px] uppercase tracking-section text-faint">
      <span aria-hidden="true">{icon}</span> {title}
    </h2>
  );
}

// ── 1. Policy-version history ────────────────────────────────────────────────
function PolicyHistorySection() {
  const policy = usePolicyDescriptor();
  const phases = policy.data?.phases ?? [];

  return (
    <section
      data-testid="governance-policy"
      className="flex flex-col gap-2 rounded-sm border border-edge bg-panel/30 p-3"
    >
      <SectionHeader
        icon={<GitBranch className="h-3 w-3" />}
        title="Policy-version history"
      />
      <AsyncBoundary
        isLoading={policy.isLoading}
        isError={policy.isError}
        onRetry={() => void policy.refetch()}
        errorMessage="Policy descriptor not configured (PRECONDITION_FAILED). Wire ctx.policyDescriptor to surface the policy structure."
      >
        {policy.data ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] text-faint">
              default outcome:{" "}
              <span className="text-ink" data-testid="policy-default">
                {policy.data.default}
              </span>
            </p>
            <ul className="flex flex-col gap-0.5">
              {phases.map((phase) => (
                <li
                  key={phase.phase}
                  className="flex items-center justify-between font-mono text-[10px] text-muted"
                >
                  <span>{phase.phase}</span>
                  <span className="tabular-nums text-faint">
                    {phase.guards.length} guard
                    {phase.guards.length === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </AsyncBoundary>
    </section>
  );
}

// ── 2. Operational dashboards ────────────────────────────────────────────────
function DashboardsSection() {
  const guards = useGuardFireStats(WINDOW_SINCE);
  const outcomes = useOutcomeDistribution(WINDOW_SINCE, "day");

  // Sum every decision-kind count across every time bucket.
  const totals = DECISION_KINDS.reduce<Record<string, number>>((acc, kind) => {
    acc[kind] = (outcomes.data?.buckets ?? []).reduce(
      (sum, b) => sum + (b[kind] ?? 0),
      0,
    );
    return acc;
  }, {});
  const guardBuckets = guards.data?.buckets ?? [];

  return (
    <section
      data-testid="governance-dashboards"
      className="flex flex-col gap-3 rounded-sm border border-edge bg-panel/30 p-3"
    >
      <SectionHeader
        icon={<Activity className="h-3 w-3" />}
        title="Operational dashboards"
      />

      <div>
        <p className="mb-1 text-[10px] uppercase tracking-section text-faint">
          Outcome distribution
        </p>
        <AsyncBoundary
          isLoading={outcomes.isLoading}
          isError={outcomes.isError}
          onRetry={() => void outcomes.refetch()}
          isEmpty={
            outcomes.data !== undefined && outcomes.data.buckets.length === 0
          }
          emptyFallback={
            <EmptyState
              title="No decisions in window"
              hint="The OBSERVER's audit store has no records yet."
            />
          }
          errorMessage="Failed to load outcome distribution."
        >
          <ul
            data-testid="outcome-distribution"
            className="grid grid-cols-2 gap-1 sm:grid-cols-3"
          >
            {DECISION_KINDS.map((kind) => (
              <li
                key={kind}
                className="flex items-center justify-between rounded-sm border border-edge/60 px-2 py-1 text-[10px]"
              >
                <span className="text-muted">{kind}</span>
                <span className="tabular-nums text-ink">{totals[kind] ?? 0}</span>
              </li>
            ))}
          </ul>
        </AsyncBoundary>
      </div>

      <div>
        <p className="mb-1 text-[10px] uppercase tracking-section text-faint">
          Guard-fire stats
        </p>
        <AsyncBoundary
          isLoading={guards.isLoading}
          isError={guards.isError}
          onRetry={() => void guards.refetch()}
          isEmpty={guards.data !== undefined && guardBuckets.length === 0}
          emptyFallback={
            <EmptyState
              title="No guard fires in window"
              hint="No guard has fired in the OBSERVER's accumulator yet."
            />
          }
          errorMessage="Guard-fire stats not configured (PRECONDITION_FAILED). Wire ctx.guardFireStats."
        >
          <ul data-testid="guard-fire-stats" className="flex flex-col gap-0.5">
            {guardBuckets.map((b, i) => (
              <li
                key={`${b.guardName}-${b.guardPhase}-${b.decisionKind}-${b.day}-${i}`}
                className="flex items-center justify-between font-mono text-[10px] text-muted"
              >
                <span>
                  {b.guardName}{" "}
                  <span className="text-faint">
                    ({b.guardPhase} → {b.decisionKind})
                  </span>
                </span>
                <span className="tabular-nums text-ink">{b.count}</span>
              </li>
            ))}
          </ul>
        </AsyncBoundary>
      </div>
    </section>
  );
}

// ── 3. Kill-switch READ-status ───────────────────────────────────────────────
function KillSwitchTimelineSection() {
  const timeline = useKillSwitchTimeline();
  const report = timeline.data;

  return (
    <section
      data-testid="governance-killswitch"
      className="flex flex-col gap-2 rounded-sm border border-edge bg-panel/30 p-3"
    >
      <SectionHeader
        icon={<ShieldAlert className="h-3 w-3" />}
        title="Kill-switch read-status"
      />
      <p className="text-[10px] italic text-faint">
        Read-only timeline — the kill-switch WRITE stays on the operator console.
      </p>
      <AsyncBoundary
        isLoading={timeline.isLoading}
        isError={timeline.isError}
        onRetry={() => void timeline.refetch()}
        errorMessage="Kill-switch timeline not configured (PRECONDITION_FAILED). Map emergency.history → KillSwitchEvent[] and wire ctx.killSwitchTimeline."
      >
        {report ? (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] text-ink" data-testid="killswitch-headline">
              {report.headline}
            </p>
            <ul className="grid grid-cols-2 gap-1 sm:grid-cols-4">
              <Stat label="stability" value={report.stability} />
              <Stat label="trips" value={report.trips} />
              <Stat label="clears" value={report.clears} />
              <Stat label="transitions" value={report.transitions} />
            </ul>
          </div>
        ) : null}
      </AsyncBoundary>
    </section>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <li className="flex flex-col rounded-sm border border-edge/60 px-2 py-1 text-[10px]">
      <span className="uppercase tracking-section text-faint">{label}</span>
      <span className="tabular-nums text-ink">{value}</span>
    </li>
  );
}
