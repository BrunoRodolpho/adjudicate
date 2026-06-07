"use client";

import { useMemo } from "react";
import { AsyncBoundary, EmptyState } from "@/components/ui";
import { DataTable, type DataTableColumn } from "@/components/a11y";
import { BarDistribution, StackedAreaChart, type NamedSeries } from "@/components/charts";
import { useRedTeam, useRedTeamHistory } from "@/hooks/useRedTeam";
import { cn } from "@/lib/cn";

/**
 * Red Team (ADR-133) — the unified operator surface that reconciles the
 * single-shot adversarial report (ADR-118) with a run-history trend into one
 * screen. It answers an operator's three questions in one place:
 *
 *   A. Attack categories — the scenario count per attack VECTOR
 *      (prompt-injection / taint-escalation / tool-scope-violation), derived
 *      from `governance.redTeam`'s results. Shows the suite's coverage.
 *   B. Pass / fail — defended / escaped / error counts + per-vector escapes
 *      (`governance.redTeam`). A non-zero escape is a policy regression (red).
 *   C. Trend — defended vs escaped per recorded run across packs
 *      (`governance.redTeamHistory`), rendered as a <StackedAreaChart> so a
 *      regression (defended dips / escaped rises) is legible over time.
 *
 * The existing governance `RedTeamPanel` stays where it is; `/red-team` is the
 * unified home. All values render as inert text.
 */

const VECTOR_LABEL: Record<string, string> = {
  prompt_injection: "Prompt Injection",
  taint_escalation: "Taint Escalation",
  tool_scope_violation: "Tool-Scope Violation",
};

type Report = NonNullable<ReturnType<typeof useRedTeam>["data"]>;
type History = NonNullable<ReturnType<typeof useRedTeamHistory>["data"]>;

const ESCAPE_COLUMNS: readonly DataTableColumn[] = [
  { key: "vector", header: "Vector" },
  { key: "escapes", header: "Escapes", align: "right" },
];

const RUN_COLUMNS: readonly DataTableColumn[] = [
  { key: "at", header: "Run" },
  { key: "pack", header: "Pack" },
  { key: "defended", header: "Defended", align: "right" },
  { key: "escaped", header: "Escaped", align: "right" },
  { key: "errors", header: "Errors", align: "right" },
  { key: "digest", header: "Digest" },
];

export default function RedTeamPage() {
  const report = useRedTeam();
  const history = useRedTeamHistory();

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between border-b border-edge pb-3">
        <h1 className="text-[10px] uppercase tracking-section text-muted">
          Red Team · attack categories · pass / fail · trend
        </h1>
        <span className="text-[10px] text-faint">ADR-133</span>
      </header>

      <PassFailPanel
        isLoading={report.isLoading}
        isError={report.isError}
        report={report.data}
        onRetry={() => void report.refetch()}
      />

      <AttackCategoriesPanel
        isLoading={report.isLoading}
        isError={report.isError}
        report={report.data}
        onRetry={() => void report.refetch()}
      />

      <TrendPanel
        isLoading={history.isLoading}
        isError={history.isError}
        data={history.data}
        onRetry={() => void history.refetch()}
      />
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
  testId,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section
      className="rounded-sm border border-edge bg-panel/40"
      data-testid={testId}
    >
      <header className="flex items-baseline justify-between border-b border-edge px-3 py-1.5">
        <span className="text-[10px] uppercase tracking-section text-faint">
          {title}
        </span>
        {subtitle ? (
          <span className="text-[10px] text-faint">{subtitle}</span>
        ) : null}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

function PassFailPanel({
  isLoading,
  isError,
  report,
  onRetry,
}: {
  isLoading: boolean;
  isError: boolean;
  report: Report | undefined;
  onRetry: () => void;
}) {
  const rows = useMemo(
    () =>
      Object.entries(report?.summary.escapesByVector ?? {}).map(
        ([vector, count]) => ({
          _key: vector,
          vector: (
            <span className="text-ink">{VECTOR_LABEL[vector] ?? vector}</span>
          ),
          escapes: (
            <span
              className={cn(
                "tabular-nums",
                count > 0 ? "text-red-300" : "text-muted",
              )}
            >
              {count}
            </span>
          ),
        }),
      ),
    [report?.summary.escapesByVector],
  );

  const isEmpty = !isLoading && !isError && report == null;
  const regressed = (report?.summary.escaped ?? 0) > 0;
  const errored = (report?.summary.errors ?? 0) > 0;

  return (
    <Panel
      title="Pass / fail · defended vs escaped"
      subtitle="governance.redTeam"
      testId="red-team-passfail"
    >
      <AsyncBoundary
        isLoading={isLoading}
        isError={isError}
        isEmpty={isEmpty}
        emptyFallback={<EmptyState title="No red-team report configured." />}
        errorMessage="No red-team report configured. Run @adjudicate/red-team against the installed Pack and wire the report into the route handler context."
        onRetry={onRetry}
      >
        {report ? (
          <div className="flex flex-col gap-3">
            <p
              data-testid="red-team-summary"
              className={cn(
                "text-[11px]",
                regressed || errored ? "text-red-300" : "text-emerald-300",
              )}
            >
              {report.summary.total} scenarios · {report.summary.defended}{" "}
              defended · {report.summary.escaped} escaped ·{" "}
              {report.summary.errors} errors
            </p>
            <DataTable
              caption="Escapes per attack vector"
              columns={ESCAPE_COLUMNS}
              rows={rows}
              getRowKey={(row, i) => String(row._key ?? i)}
            />
          </div>
        ) : null}
      </AsyncBoundary>
    </Panel>
  );
}

function AttackCategoriesPanel({
  isLoading,
  isError,
  report,
  onRetry,
}: {
  isLoading: boolean;
  isError: boolean;
  report: Report | undefined;
  onRetry: () => void;
}) {
  // Count scenarios per attack vector from the report's results.
  const data = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of report?.results ?? []) {
      counts.set(r.vector, (counts.get(r.vector) ?? 0) + 1);
    }
    // Stable order over the closed vector set; include zero-count vectors.
    return Object.keys(VECTOR_LABEL).map((vector) => ({
      label: VECTOR_LABEL[vector] ?? vector,
      value: counts.get(vector) ?? 0,
    }));
  }, [report?.results]);

  const isEmpty =
    !isLoading && !isError && (report == null || report.results.length === 0);

  return (
    <Panel
      title="Attack categories · scenarios per vector"
      subtitle="governance.redTeam"
      testId="red-team-categories"
    >
      <AsyncBoundary
        isLoading={isLoading}
        isError={isError}
        isEmpty={isEmpty}
        emptyFallback={
          <EmptyState title="No scenarios in the red-team report." />
        }
        errorMessage="No red-team report configured. Run @adjudicate/red-team against the installed Pack and wire the report into the route handler context."
        onRetry={onRetry}
      >
        <div data-testid="red-team-categories-chart">
          <BarDistribution
            title="Adversarial scenarios per attack vector"
            data={data}
          />
        </div>
      </AsyncBoundary>
    </Panel>
  );
}

function TrendPanel({
  isLoading,
  isError,
  data,
  onRetry,
}: {
  isLoading: boolean;
  isError: boolean;
  data: History | undefined;
  onRetry: () => void;
}) {
  // Two series over the run timeline: defended (emerald) and escaped (red),
  // keyed by run `at`. Trend points arrive chronological asc.
  const series = useMemo<NamedSeries[]>(() => {
    const points = data?.trend ?? [];
    return [
      {
        key: "Defended",
        color: "rgb(52 211 153)",
        points: points.map((p) => ({ t: p.at, value: p.defended })),
      },
      {
        key: "Escaped",
        color: "rgb(248 113 113)",
        points: points.map((p) => ({ t: p.at, value: p.escaped })),
      },
    ];
  }, [data?.trend]);

  const runRows = useMemo(
    () =>
      (data?.runs ?? []).map((r) => {
        const regressed = r.summary.escaped > 0 || r.summary.errors > 0;
        return {
          _key: `${r.packId}:${r.digest}`,
          at: <span className="text-muted">{r.at.slice(0, 10)}</span>,
          pack: <span className="text-ink">{r.packId}</span>,
          defended: (
            <span className="tabular-nums text-emerald-300">
              {r.summary.defended}
            </span>
          ),
          escaped: (
            <span
              className={cn(
                "tabular-nums",
                r.summary.escaped > 0 ? "text-red-300" : "text-muted",
              )}
            >
              {r.summary.escaped}
            </span>
          ),
          errors: (
            <span
              className={cn(
                "tabular-nums",
                r.summary.errors > 0 ? "text-amber-300" : "text-muted",
              )}
            >
              {r.summary.errors}
            </span>
          ),
          digest: (
            <code
              className={cn(
                "font-mono text-[10px]",
                regressed ? "text-red-300" : "text-faint",
              )}
            >
              {r.digest.slice(0, 10)}
            </code>
          ),
        };
      }),
    [data?.runs],
  );

  const isEmpty = !isLoading && !isError && (data?.trend.length ?? 0) === 0;

  return (
    <Panel
      title="Trend · defended vs escaped over runs"
      subtitle="governance.redTeamHistory"
      testId="red-team-trend"
    >
      <AsyncBoundary
        isLoading={isLoading}
        isError={isError}
        isEmpty={isEmpty}
        emptyFallback={
          <EmptyState title="No runs recorded yet — history populates after the first CI red-team run or console cold start." />
        }
        errorMessage="No red-team history configured. Record @adjudicate/red-team reports into a history store and wire it into the route handler context."
        onRetry={onRetry}
      >
        {data ? (
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
        ) : null}
      </AsyncBoundary>
    </Panel>
  );
}
