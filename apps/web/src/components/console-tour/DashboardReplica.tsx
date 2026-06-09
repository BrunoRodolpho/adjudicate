import { cn } from "@/lib/cn";
import { ConsoleChrome } from "@/components/console-kit/chrome/ConsoleChrome";
import { ChartReveal } from "./ChartReveal";
import {
  OutcomeChart,
  OutcomeChartLegend,
} from "@/components/console-kit/charts/OutcomeChart";
import {
  DECISION_KIND_ORDER,
  decisionTheme,
} from "@/components/console-kit/decision-theme";
import {
  CONSOLE_REPLICA_DECISION_TOTAL,
  CONSOLE_REPLICA_OUTCOME_BUCKETS,
  CONSOLE_REPLICA_OUTCOME_TOTALS,
  CONSOLE_REPLICA_TOP_REFUSALS,
} from "@/lib/console-replica-dashboard";

/**
 * DashboardReplica — a focused, static replica of the operator console's
 * decision-outcome dashboard.
 *
 * SERVER component. It renders inside {@link ConsoleChrome} (the reviewed
 * honesty boundary — the standing "Illustrative replica · sample data" label is
 * non-removable), and shows three things over a representative window, all
 * driven by committed static fixtures in `lib/console-replica-dashboard`:
 *
 *  1. the stacked OutcomeChart of the six Decision kinds over time,
 *  2. a row of six decision-colored total StatTiles, and
 *  3. a compact "Top refusals" rollup.
 *
 * There is no clock, no RNG, no network, and no admin/DB access in this path —
 * the data is fixed literals, so the surface renders identically everywhere.
 */
export function DashboardReplica({ className }: { readonly className?: string }) {
  return (
    <ConsoleChrome caption="dashboard · localhost:5180" className={className}>
      <div className="flex flex-col gap-4">
        {/* Stacked outcome distribution. */}
        <section className="rounded-sm border border-console-edge bg-console-panel/40 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-section text-console-faint">
              Decisions over 24h · 2h buckets
            </span>
            <OutcomeChartLegend />
          </div>
          <ChartReveal>
            <OutcomeChart buckets={CONSOLE_REPLICA_OUTCOME_BUCKETS} />
          </ChartReveal>
        </section>

        {/* Six decision-total tiles, decision-colored. */}
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {DECISION_KIND_ORDER.map((kind) => {
            const t = decisionTheme[kind];
            return (
              <div
                key={kind}
                className={cn(
                  "flex flex-col gap-1 rounded-sm border px-3 py-2.5",
                  t.border,
                  t.bg,
                )}
              >
                <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-section text-console-faint">
                  <span
                    aria-hidden="true"
                    className={cn("h-1.5 w-1.5 rounded-full", t.dot)}
                  />
                  {t.label}
                </span>
                <span className={cn("font-mono text-2xl tabular-nums", t.fg)}>
                  {CONSOLE_REPLICA_OUTCOME_TOTALS[kind].toLocaleString()}
                </span>
              </div>
            );
          })}
        </section>

        {/* Window total + compact top-refusals rollup. */}
        <section className="grid gap-2 lg:grid-cols-3">
          <div className="flex flex-col gap-1 rounded-sm border border-console-edge bg-console-panel/40 px-3 py-3">
            <span className="font-mono text-3xl font-semibold tracking-tight tabular-nums text-console-ink">
              {CONSOLE_REPLICA_DECISION_TOTAL.toLocaleString()}
            </span>
            <span className="text-sm font-medium text-console-ink">
              Decisions adjudicated
            </span>
            <span className="text-xs leading-relaxed text-console-muted">
              Across the 24h window.
            </span>
          </div>

          <div className="rounded-sm border border-console-edge bg-console-panel/40 lg:col-span-2">
            <header className="flex flex-col gap-0.5 border-b border-console-edge px-3 py-1.5">
              <span className="text-[10px] uppercase tracking-section text-console-faint">
                Top refusals
              </span>
              <span className="text-[10px] leading-relaxed text-console-faint">
                The rejection codes the kernel cited most when it blocked an
                action — the recurring reasons worth reviewing first.
              </span>
            </header>
            <ul className="flex flex-col gap-1 px-3 py-2 text-[11px]">
              {CONSOLE_REPLICA_TOP_REFUSALS.map((r) => (
                <li
                  key={r.code}
                  className="flex items-center justify-between gap-3 rounded-sm border border-console-edge bg-console-canvas/40 px-2 py-1.5"
                >
                  <span className="flex min-w-0 flex-col">
                    <code
                      className="truncate text-console-ink"
                      title={`${r.code} — ${r.label}. A basis code the kernel cited when refusing an action.`}
                    >
                      {r.code}
                    </code>
                    <span className="truncate text-[10px] text-console-faint">
                      {r.label}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums text-console-muted">
                    {r.count.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </ConsoleChrome>
  );
}
