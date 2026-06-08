import { ConsoleChrome } from "@/components/console-kit/chrome/ConsoleChrome";
import { DataTable, type DataTableColumn } from "@/components/console-kit/a11y";
import {
  BarDistribution,
  StackedAreaChart,
  type NamedSeries,
} from "@/components/console-kit/charts";
import {
  RED_TEAM_REPLICA,
  RED_TEAM_VECTOR_LABEL,
  RED_TEAM_VECTOR_ORDER,
} from "@/lib/red-team-replica";
import { cn } from "@/lib/cn";

/**
 * RedTeamReplica — a focused, static replica of the operator console's red-team
 * surface (ADR-133), mirroring apps/console/src/app/red-team.
 *
 * SERVER component. It renders inside {@link ConsoleChrome} (the reviewed
 * honesty boundary — the standing "Illustrative replica · sample data" label is
 * non-removable) and shows the three operator sub-views over a representative
 * window, all driven by the committed `RED_TEAM_REPLICA` fixture:
 *
 *   A. Pass / fail — the latest run's total / defended / escaped / error counts.
 *      A non-zero escape would read red (a policy regression).
 *   B. Attack categories — scenario count per attack VECTOR, rendered as a
 *      {@link BarDistribution} (the suite's coverage).
 *   C. Trend — defended vs escaped per recorded run rendered as a
 *      {@link StackedAreaChart}, plus a run-history {@link DataTable} (newest
 *      first).
 *
 * There is no clock, no RNG, no network, and no admin/DB access in this path —
 * the data is fixed literals, so the surface renders identically everywhere.
 * SAFETY: only the closed attack-VECTOR category + aggregate COUNTS are shown —
 * NEVER a scenario name, basis code, attack payload, or per-vector escape map.
 */

const RUN_COLUMNS: readonly DataTableColumn[] = [
  { key: "at", header: "Run" },
  { key: "pack", header: "Pack" },
  { key: "defended", header: "Defended", align: "right" },
  { key: "escaped", header: "Escaped", align: "right" },
  { key: "errors", header: "Errors", align: "right" },
  { key: "digest", header: "Digest" },
];

export function RedTeamReplica({ className }: { readonly className?: string }) {
  const { summary, vectorCounts, trend, runs } = RED_TEAM_REPLICA;

  const regressed = summary.escaped > 0 || summary.errors > 0;

  // Scenarios per attack vector — stable order over the closed vector set,
  // including any zero-count vector.
  const countByVector = new Map(vectorCounts.map((v) => [v.vector, v.count]));
  const vectorData = RED_TEAM_VECTOR_ORDER.map((vector) => ({
    label: RED_TEAM_VECTOR_LABEL[vector],
    value: countByVector.get(vector) ?? 0,
  }));

  // Two trend series over the run timeline: defended (emerald), escaped (red).
  const series: NamedSeries[] = [
    {
      key: "Defended",
      color: "rgb(52 211 153)",
      points: trend.map((p) => ({ t: p.at, value: p.defended })),
    },
    {
      key: "Escaped",
      color: "rgb(248 113 113)",
      points: trend.map((p) => ({ t: p.at, value: p.escaped })),
    },
  ];

  const runRows = runs.map((r) => {
    const runRegressed = r.summary.escaped > 0 || r.summary.errors > 0;
    return {
      _key: `${r.packId}:${r.digest}`,
      at: <span className="text-console-muted">{r.at.slice(0, 10)}</span>,
      pack: <span className="text-console-ink">{r.packId}</span>,
      defended: (
        <span className="tabular-nums text-emerald-300">
          {r.summary.defended}
        </span>
      ),
      escaped: (
        <span
          className={cn(
            "tabular-nums",
            r.summary.escaped > 0 ? "text-red-300" : "text-console-muted",
          )}
        >
          {r.summary.escaped}
        </span>
      ),
      errors: (
        <span
          className={cn(
            "tabular-nums",
            r.summary.errors > 0 ? "text-amber-300" : "text-console-muted",
          )}
        >
          {r.summary.errors}
        </span>
      ),
      digest: (
        <code
          className={cn(
            "font-mono text-[10px]",
            runRegressed ? "text-red-300" : "text-console-faint",
          )}
        >
          {r.digest.slice(0, 10)}
        </code>
      ),
    };
  });

  return (
    <ConsoleChrome caption="red-team · localhost:5180" className={className}>
      <div className="flex flex-col gap-4">
        {/* A. Pass / fail · defended vs escaped. */}
        <Panel
          title="Pass / fail · defended vs escaped"
          subtitle="governance.redTeam"
          testId="red-team-passfail"
        >
          <p
            data-testid="red-team-summary"
            className={cn(
              "text-[11px]",
              regressed ? "text-red-300" : "text-emerald-300",
            )}
          >
            {summary.total} scenarios · {summary.defended} defended ·{" "}
            {summary.escaped} escaped · {summary.errors} errors
          </p>
        </Panel>

        {/* B. Attack categories · scenarios per vector. */}
        <Panel
          title="Attack categories · scenarios per vector"
          subtitle="governance.redTeam"
          testId="red-team-categories"
        >
          <div data-testid="red-team-categories-chart">
            <BarDistribution
              title="Adversarial scenarios per attack vector"
              data={vectorData}
            />
          </div>
        </Panel>

        {/* C. Trend · defended vs escaped over runs + run history. */}
        <Panel
          title="Trend · defended vs escaped over runs"
          subtitle="governance.redTeamHistory"
          testId="red-team-trend"
        >
          <div className="flex flex-col gap-3" data-testid="red-team-trend-chart">
            <StackedAreaChart
              title="Defended vs escaped per recorded run"
              series={series}
            />
            <DataTable
              caption="Recorded red-team runs, newest first"
              columns={RUN_COLUMNS}
              rows={runRows}
              getRowKey={(row, i) => String(row._key ?? i)}
            />
          </div>
        </Panel>
      </div>
    </ConsoleChrome>
  );
}

/** Bordered console-panel section matching the operator red-team screen's panels. */
function Panel({
  title,
  subtitle,
  children,
  testId,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly children: React.ReactNode;
  readonly testId?: string;
}) {
  return (
    <section
      className="rounded-sm border border-console-edge bg-console-panel/40"
      data-testid={testId}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-console-edge px-3 py-1.5">
        <span className="text-[10px] uppercase tracking-section text-console-faint">
          {title}
        </span>
        {subtitle ? (
          <span className="text-[10px] text-console-faint">{subtitle}</span>
        ) : null}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}
