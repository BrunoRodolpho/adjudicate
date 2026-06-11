"use client";

import { useMemo, useState } from "react";
import { ConsoleChrome } from "@/components/console-kit/chrome/ConsoleChrome";
import { ChartReveal } from "./ChartReveal";
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
 * RedTeamReplica — an interactive, client replica of the operator console's
 * red-team surface (ADR-133), mirroring apps/console/src/app/red-team.
 *
 * CLIENT component. It renders inside {@link ConsoleChrome} (the reviewed
 * honesty boundary — the standing "Illustrative replica · sample data" label is
 * non-removable) and shows the operator sub-views over a representative window,
 * all driven by the committed `RED_TEAM_REPLICA` fixture:
 *
 *   A. Pass / fail — the SELECTED run's total / defended / escaped / error
 *      counts. A non-zero escape reads red (a policy regression).
 *   B. Attack categories — scenario COUNT per attack VECTOR for the suite the
 *      selected run exercised, rendered as a {@link BarDistribution}.
 *   C. Trend — defended vs escaped per recorded run rendered as a
 *      {@link StackedAreaChart} with the selected run marked, plus a selectable
 *      run-history list (newest first; the latest run is the default).
 *
 * Interactivity is pure client state (the selected run) over the EXISTING
 * committed fixtures — no fetch, no clock, no RNG, no admin/DB access. The data
 * is fixed literals, so the surface renders deterministically everywhere, and
 * selection only re-projects committed counts.
 *
 * SAFETY (load-bearing): only the closed attack-VECTOR category + aggregate
 * COUNTS are shown — NEVER a scenario name, basis code, attack payload, or a
 * per-vector escape map. The per-vector view is scenario COVERAGE (counts only);
 * the defended/escaped split is reported at the RUN aggregate level only, which
 * is the deepest the fixture carries and the deepest the replica may show.
 */

export function RedTeamReplica({ className }: { readonly className?: string }) {
  const { vectorCounts, trend, runs } = RED_TEAM_REPLICA;

  // Default to the latest run (runs are NEWEST-first per the fixture contract).
  const [selectedKey, setSelectedKey] = useState<string>(() =>
    runs.length > 0 ? runKey(runs[0]!) : "",
  );

  const selectedIndex = Math.max(
    0,
    runs.findIndex((r) => runKey(r) === selectedKey),
  );
  const selected = runs[selectedIndex] ?? runs[0];
  const selectedSummary = selected?.summary ?? {
    total: 0,
    defended: 0,
    escaped: 0,
    errors: 0,
  };
  const regressed =
    selectedSummary.escaped > 0 || selectedSummary.errors > 0;

  // Scenarios per attack vector — stable order over the closed vector set,
  // including any zero-count vector. This is the suite COVERAGE (counts only);
  // it is not a per-vector escape breakdown (none exists in the fixture).
  const vectorData = useMemo(() => {
    const countByVector = new Map(vectorCounts.map((v) => [v.vector, v.count]));
    return RED_TEAM_VECTOR_ORDER.map((vector) => ({
      label: RED_TEAM_VECTOR_LABEL[vector],
      value: countByVector.get(vector) ?? 0,
    }));
  }, [vectorCounts]);

  // Trend series over the run timeline: defended (emerald), escaped (red). The
  // two REAL series are passed verbatim — we never inject a synthetic marker
  // series, since the StackedAreaChart stacks layers and mirrors every series in
  // its screen-reader data table (a fake layer would distort the totals and the
  // text alternative). The selected run is marked outside the chart instead.
  const series = useMemo<NamedSeries[]>(
    () => [
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
    ],
    [trend],
  );

  // Index of the selected run within the ASCENDING trend timeline, used to mark
  // the selected point under the chart (the chart's x-axis order).
  const trendIndex = selected
    ? trend.findIndex((p) => p.at === selected.at)
    : -1;

  return (
    <ConsoleChrome caption="red-team · localhost:5180" className={className}>
      <div className="flex flex-col gap-4">
        {/* A. Pass / fail · the SELECTED run's defended vs escaped. */}
        <Panel
          title="Pass / fail · defended vs escaped"
          subtitle="governance.redTeam"
          testId="red-team-passfail"
        >
          <div className="flex flex-col gap-1">
            <p className="text-[10px] leading-relaxed text-console-muted">
              Defended = the adversarial probe was blocked by a guard. Escaped =
              the probe bypassed the guards (a policy regression). Any non-zero
              escape reads red.
            </p>
            <p
              data-testid="red-team-summary"
              className={cn(
                "text-[11px]",
                regressed ? "text-red-300" : "text-emerald-300",
              )}
            >
              {selectedSummary.total} scenarios · {selectedSummary.defended}{" "}
              defended · {selectedSummary.escaped} escaped ·{" "}
              {selectedSummary.errors} errors
            </p>
            {selected ? (
              <p className="text-[10px] text-console-muted">
                Selected run · {selected.at.slice(0, 10)} · {selected.packId}
              </p>
            ) : null}
          </div>
        </Panel>

        {/* B. Attack categories · scenario coverage per vector (counts only). */}
        <Panel
          title="Attack categories · scenarios per vector"
          subtitle="governance.redTeam"
          testId="red-team-categories"
        >
          <div data-testid="red-team-categories-chart">
            <ChartReveal>
              <BarDistribution
                title="Adversarial scenarios per attack vector"
                data={vectorData}
              />
            </ChartReveal>
          </div>
        </Panel>

        {/* C. Trend · defended vs escaped over runs + selectable run history. */}
        <Panel
          title="Trend · defended vs escaped over runs"
          subtitle="governance.redTeamHistory"
          testId="red-team-trend"
        >
          <div
            className="flex flex-col gap-3"
            data-testid="red-team-trend-chart"
          >
            <ChartReveal>
              <StackedAreaChart
                title="Defended vs escaped per recorded run"
                series={series}
              />
            </ChartReveal>

            {/* Selected-run marker, aligned to the trend's ascending x-axis. A
                UI annotation over the SAME timeline — not chart data, so it does
                not distort the stacked totals or the chart's text alternative.
                One static pip per run time; no animation (reduced-motion-safe). */}
            {trend.length > 0 ? (
              <div
                className="flex items-center"
                aria-hidden="true"
                data-testid="red-team-trend-marker"
              >
                {trend.map((p, i) => (
                  <span
                    key={p.at}
                    className="flex flex-1 justify-center"
                    style={
                      trend.length > 1
                        ? {
                            // Match the chart's edge-anchored x positions: first
                            // point hugs the left, last hugs the right.
                            justifyContent:
                              i === 0
                                ? "flex-start"
                                : i === trend.length - 1
                                  ? "flex-end"
                                  : "center",
                          }
                        : undefined
                    }
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        i === trendIndex
                          ? "bg-sky-400 ring-2 ring-sky-400/30"
                          : "bg-console-edge",
                      )}
                    />
                  </span>
                ))}
              </div>
            ) : null}

            {/* Selectable run history — button rows, newest first. The active
                row carries aria-current; selecting it re-projects panels A/B/C
                over the SAME committed fixture (no fetch). */}
            <div className="overflow-hidden rounded-sm border border-console-edge bg-console-panel/40">
              <div className="border-b border-console-edge px-3 py-1.5 text-[10px] uppercase tracking-section text-console-muted">
                Recorded red-team runs, newest first
              </div>
              <ul
                role="list"
                aria-label="Recorded red-team runs"
                className="divide-y divide-console-edge/50"
                data-testid="red-team-run-history"
              >
                {runs.map((r) => {
                  const key = runKey(r);
                  const active = key === selectedKey;
                  const runRegressed =
                    r.summary.escaped > 0 || r.summary.errors > 0;
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() => setSelectedKey(key)}
                        aria-current={active ? "true" : undefined}
                        aria-label={`Run ${r.at.slice(0, 10)}, ${
                          r.summary.defended
                        } defended, ${r.summary.escaped} escaped, ${
                          r.summary.errors
                        } errors`}
                        className={cn(
                          "flex w-full items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-[11px] transition-colors",
                          "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-400/60",
                          active
                            ? "bg-sky-500/10"
                            : "hover:bg-console-edge/30",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "h-1.5 w-1.5 shrink-0 rounded-full",
                            active ? "bg-sky-400" : "bg-transparent",
                          )}
                        />
                        <span
                          className={cn(
                            "w-[5.5rem] shrink-0 tabular-nums",
                            active ? "text-console-ink" : "text-console-muted",
                          )}
                        >
                          {r.at.slice(0, 10)}
                        </span>
                        <span className="hidden min-w-0 flex-1 truncate text-console-muted sm:inline">
                          {r.packId}
                        </span>
                        <span className="ml-auto flex shrink-0 items-center gap-x-3 tabular-nums">
                          <span className="text-emerald-300">
                            {r.summary.defended}
                            <span className="ml-1 text-[9px] uppercase tracking-section text-console-muted">
                              def
                            </span>
                          </span>
                          <span
                            className={cn(
                              r.summary.escaped > 0
                                ? "text-red-300"
                                : "text-console-muted",
                            )}
                          >
                            {r.summary.escaped}
                            <span className="ml-1 text-[9px] uppercase tracking-section text-console-muted">
                              esc
                            </span>
                          </span>
                          <span
                            className={cn(
                              r.summary.errors > 0
                                ? "text-amber-300"
                                : "text-console-muted",
                            )}
                          >
                            {r.summary.errors}
                            <span className="ml-1 text-[9px] uppercase tracking-section text-console-muted">
                              err
                            </span>
                          </span>
                          <code
                            className={cn(
                              "hidden font-mono text-[10px] md:inline",
                              runRegressed
                                ? "text-red-300"
                                : "text-console-muted",
                            )}
                          >
                            {r.digest.slice(0, 10)}
                          </code>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </Panel>
      </div>
    </ConsoleChrome>
  );
}

/** Stable per-run key (also the selection identity) — pack id + digest. */
function runKey(r: { readonly packId: string; readonly digest: string }): string {
  return `${r.packId}:${r.digest}`;
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
        <span className="text-[10px] uppercase tracking-section text-console-muted">
          {title}
        </span>
        {subtitle ? (
          <span className="text-[10px] text-console-muted">{subtitle}</span>
        ) : null}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}
