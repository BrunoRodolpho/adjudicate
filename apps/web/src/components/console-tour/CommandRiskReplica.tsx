"use client";

import { useMemo, useState } from "react";
import type { AuditRecord } from "@adjudicate/core";
import { ConsoleChrome } from "@/components/console-kit/chrome/ConsoleChrome";
import { ChartReveal } from "./ChartReveal";
import { BarDistribution } from "@/components/console-kit/charts/BarDistribution";
import type { SeriesPoint } from "@/components/console-kit/charts/types";
import { DataTable } from "@/components/console-kit/a11y/DataTable";
import type { DataTableColumn } from "@/components/console-kit/a11y/DataTable";
import { decisionTheme } from "@/components/console-kit/decision-theme";
import { projectCommandRiskTransparency } from "@/lib/command-risk-transparency";
import { COMMAND_RISK_TRANSPARENCY_SAMPLE } from "@/lib/transparency-fixtures";
import { CONSOLE_REPLICA_RECORDS } from "@/lib/console-replica-records";
import { cn } from "@/lib/cn";

/**
 * CommandRiskReplica — a static replica of the operator console's Command Risk
 * surface (ADR-134, ADR-123): the shell-command-risk dispositions emitted by
 * `createCommandRiskGuard`.
 *
 * CLIENT component (interactivity = local React state over the committed
 * fixtures only — no network, no clock, no RNG). Rendered inside
 * {@link ConsoleChrome} (the reviewed honesty boundary — the standing
 * "Illustrative replica · sample data" label is non-removable). Three regions
 * over committed sample fixtures:
 *
 *   1. Risk distribution by category — a {@link BarDistribution} of counts per
 *      category, from the aggregate-only `command-risk-transparency` projection.
 *      A segmented category filter (All / destructive / credential / network)
 *      emphasises the matching bar and scopes the blocked-commands table.
 *   2. Disposition totals — blocked / rewritten / confirm tallies, derived from
 *      the command-risk sample records. Totals are the FULL-window tallies and
 *      are unaffected by the filter (they describe the whole sample).
 *   3. Blocked-commands table — the refuse-disposition drill-down, showing ONLY
 *      timestamp + intent kind + decision + category, filtered to the chosen
 *      category.
 *
 * SECURITY — NO COMMAND TEXT, EVER. The real guard threads the RAW command
 * string (which routinely embeds live secrets) and the matched rule ids (which
 * telegraph attack construction) into its audit detail. This replica is built
 * entirely on (a) the `command-risk-transparency` aggregate (category + count
 * only) and (b) the closed-enum `category` carried in the sample records' basis
 * detail. NEITHER the chart, the totals, nor the blocked-commands table has any
 * field that could carry command text or a rule id — redaction is by
 * construction, so this UI cannot leak a command even if it tried. The category
 * filter only ever reads the same closed-enum `category` — it CANNOT introduce a
 * command-text column in any state. No clock, no RNG, no network, no admin/DB
 * access — fixed literals only.
 */

/** Closed-enum command-risk disposition. */
type CommandRiskDisposition = "refuse" | "rewrite" | "confirm";

/**
 * Category filter selection. `"all"` plus the three command-risk categories the
 * replica surfaces. Closed enum — the control can never select anything that
 * carries command text.
 */
type CategoryFilter = "all" | "destructive" | "credential" | "network";

/** Segmented-control options, in display order (severity-ish, mirrors chart). */
const CATEGORY_FILTERS: ReadonlyArray<{
  readonly value: CategoryFilter;
  readonly label: string;
}> = [
  { value: "all", label: "All" },
  { value: "destructive", label: "Destructive" },
  { value: "credential", label: "Credential" },
  { value: "network", label: "Network" },
];

/** Map an AuditRecord decision kind to a command-risk disposition (or none). */
function dispositionFor(
  kind: AuditRecord["decision"]["kind"],
): CommandRiskDisposition | undefined {
  if (kind === "REFUSE") return "refuse";
  if (kind === "REWRITE") return "rewrite";
  if (kind === "REQUEST_CONFIRMATION") return "confirm";
  return undefined;
}

/**
 * Extract the closed-enum command-risk category from a record's decision basis.
 * The sample records carry it as `basis.detail.category` (e.g.
 * `{ category: "destructive" }`) — the ONLY command-risk datum that is ever read,
 * never the raw command. Returns `undefined` for non-command records.
 */
function categoryFor(record: AuditRecord): string | undefined {
  for (const b of record.decision.basis) {
    const detail = b.detail;
    if (detail && typeof detail["category"] === "string") {
      return detail["category"] as string;
    }
  }
  return undefined;
}

/** A command-risk record is a `shell.exec` intent carrying a category basis. */
function isCommandRiskRecord(record: AuditRecord): boolean {
  return record.envelope.kind === "shell.exec" && categoryFor(record) !== undefined;
}

/** Per-category text accent for the category cell. */
const CATEGORY_STYLE: Record<string, string> = {
  destructive: "text-red-300",
  credential: "text-fuchsia-300",
  network: "text-amber-300",
};

const TABLE_COLUMNS: readonly DataTableColumn[] = [
  { key: "at", header: "Time" },
  { key: "intentKind", header: "Intent kind" },
  { key: "decision", header: "Decision" },
  { key: "category", header: "Category" },
];

export function CommandRiskReplica({
  className,
}: {
  readonly className?: string;
}) {
  // Selected category filter — local client state over the committed fixtures
  // only. Closed enum, so it can never select anything that carries command text.
  const [filter, setFilter] = useState<CategoryFilter>("all");

  // Region 1 — category distribution from the aggregate-only public projection.
  // The public buckets carry only `category` + a cohort-floored count: `value`
  // is the chart-safe number (small cohorts lifted to the floor so a bar can't
  // reveal an exact small value), `display` is the honest "<5" / "N" label. We
  // chart `value` and format the legend with `display` so a censored bucket
  // reads "<5" rather than its floored bar height. Filter-independent → memoised.
  const { categoryBars, categoryDisplay, activeBarLabel } = useMemo(() => {
    const buckets = projectCommandRiskTransparency(
      COMMAND_RISK_TRANSPARENCY_SAMPLE,
    )
      // Drop the always-zero `safe` category — it carries no audit basis.
      .filter((b) => b.category !== "safe");
    return {
      categoryBars: buckets.map(
        (b): SeriesPoint => ({ label: b.categoryLabel, value: b.value }),
      ),
      categoryDisplay: new Map<number, string>(
        buckets.map((b) => [b.value, b.display]),
      ),
      // Map the selected filter back to its chart label so we can mark its row.
      activeBarLabel: new Map<CategoryFilter, string>(
        buckets.map((b) => [b.category as CategoryFilter, b.categoryLabel]),
      ),
    };
  }, []);

  // Regions 2 & 3 — derived from the committed command-risk sample records. We
  // read ONLY the decision kind (→ disposition), the closed-enum category, the
  // intent kind, and the timestamp. Never the command text. Filter-independent.
  const { dispositionTotals, blockedRecords } = useMemo(() => {
    const commandRecords = CONSOLE_REPLICA_RECORDS.filter(isCommandRiskRecord);

    const totals: Record<CommandRiskDisposition, number> = {
      refuse: 0,
      rewrite: 0,
      confirm: 0,
    };
    for (const r of commandRecords) {
      const d = dispositionFor(r.decision.kind);
      if (d) totals[d] += 1;
    }

    // The blocked-commands list is the `refuse`-disposition drill-down, newest
    // first. NO command column — redacted by construction.
    const blocked = commandRecords
      .filter((r) => dispositionFor(r.decision.kind) === "refuse")
      .slice()
      .sort((a, b) => b.at.localeCompare(a.at));

    return { dispositionTotals: totals, blockedRecords: blocked };
  }, []);

  // Scope the blocked-commands table to the chosen category. The filter reads
  // the SAME closed-enum `category` as the column — it cannot add command text.
  const visibleRecords =
    filter === "all"
      ? blockedRecords
      : blockedRecords.filter((r) => categoryFor(r) === filter);

  // The label of the currently emphasised bar (none when "all" is selected).
  const emphasisedBarLabel =
    filter === "all" ? undefined : activeBarLabel.get(filter);

  const rows = visibleRecords.map((r) => {
    const category = categoryFor(r) ?? "—";
    const token = decisionTheme[r.decision.kind];
    return {
      _key: `${r.intentHash}:${r.at}:${category}`,
      at: (
        <time title={r.at} className="tabular-nums text-console-muted">
          {formatClock(r.at)}
        </time>
      ),
      intentKind: <span className="text-console-ink">{r.envelope.kind}</span>,
      decision: (
        <span className={cn("tabular-nums", token.fg)}>{token.label}</span>
      ),
      category: (
        <span
          className={cn(
            "uppercase tracking-section",
            CATEGORY_STYLE[category] ?? "text-console-muted",
          )}
        >
          {category}
        </span>
      ),
    } satisfies Record<string, React.ReactNode> & { _key: string };
  });

  return (
    <ConsoleChrome caption="command-risk · localhost:5180" className={className}>
      <div className="flex flex-col gap-4">
        <header className="flex items-baseline justify-between border-b border-console-edge pb-3">
          <h2 className="text-[10px] uppercase tracking-section text-console-muted">
            Command Risk · Shell-command dispositions
          </h2>
          <span className="text-[10px] text-console-faint">
            ADR-134 · ADR-123
          </span>
        </header>

        {/* Category filter — segmented control. Scopes the blocked-commands
            table and emphasises the matching bar. Closed-enum selection, so it
            can never surface command text in any state. */}
        <div
          role="radiogroup"
          aria-label="Filter blocked commands by category"
          data-testid="command-risk-filter"
          className="flex flex-wrap items-center gap-1.5"
        >
          <span className="mr-1 text-[10px] uppercase tracking-section text-console-faint">
            Category
          </span>
          {CATEGORY_FILTERS.map((opt) => {
            const active = filter === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setFilter(opt.value)}
                data-active={active ? "true" : undefined}
                className={cn(
                  "rounded-sm border px-2 py-1 text-[10px] font-medium uppercase tracking-wide",
                  "motion-safe:transition-colors",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400/60",
                  active
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    : "border-console-edge bg-console-panel text-console-muted hover:bg-console-edge/40",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Aggregate context: category distribution + disposition totals. */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section
            className={cn(
              "rounded-sm border bg-console-panel/40 p-3",
              "motion-safe:transition-colors",
              emphasisedBarLabel
                ? "border-emerald-500/40 ring-1 ring-inset ring-emerald-500/20"
                : "border-console-edge",
            )}
            // The shared BarDistribution owns its bars, so we emphasise the
            // active category by dimming the non-matching legend rows + bars via
            // a data attribute on this wrapper (chart-safe: counts only, never
            // command text). The full distribution is always charted.
            data-emphasis={emphasisedBarLabel ?? undefined}
          >
            <ChartReveal
              className={cn(
                emphasisedBarLabel &&
                  "[&_svg_g:not([data-active])]:opacity-30 [&_li:not([data-active])]:opacity-40 motion-safe:[&_svg_g]:transition-opacity motion-safe:[&_li]:transition-opacity",
              )}
            >
              <BarDistribution
                title="Risk distribution by category"
                data={categoryBars}
                activeLabel={emphasisedBarLabel}
                valueFormat={(n) => categoryDisplay.get(n) ?? n.toLocaleString()}
              />
            </ChartReveal>
            {emphasisedBarLabel ? (
              <p
                className="mt-1 text-[10px] uppercase tracking-section text-emerald-300"
                data-testid="command-risk-bar-emphasis"
                aria-live="polite"
              >
                ▸ Emphasising {emphasisedBarLabel}
              </p>
            ) : null}
          </section>

          <section className="rounded-sm border border-console-edge bg-console-panel/40 p-3">
            <header className="mb-2 text-[10px] uppercase tracking-section text-console-faint">
              Disposition totals
            </header>
            <dl
              className="grid grid-cols-3 gap-2"
              data-testid="disposition-totals"
            >
              <SummaryStat
                label="Blocked"
                value={dispositionTotals.refuse}
                emphasize={dispositionTotals.refuse > 0}
                hint="Blocked: the command was refused entirely and never ran."
              />
              <SummaryStat
                label="Rewritten"
                value={dispositionTotals.rewrite}
                hint="Rewritten: the command was modified to a safer form before it ran."
              />
              <SummaryStat
                label="Confirm"
                value={dispositionTotals.confirm}
                hint="Confirm: the command was routed to a human for approval before running."
              />
            </dl>
            {/* CONFIRM-queue cross-link: commands routed to
                REQUEST_CONFIRMATION are reviewed in the Approval Center. */}
            <p
              className="mt-3 text-[11px] text-console-muted"
              data-testid="confirm-queue-crosslink"
            >
              <span className="tabular-nums text-sky-300">
                {dispositionTotals.confirm}
              </span>{" "}
              command{dispositionTotals.confirm === 1 ? "" : "s"} routed to
              confirmation — reviewed in the Approval Center replica.
            </p>
          </section>
        </div>

        {/* Blocked-commands list — refuse-disposition drill-down. NO command. */}
        <section className="flex flex-col gap-2">
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[10px] uppercase tracking-section text-console-faint">
              Blocked commands
              <span
                className="ml-2 tabular-nums text-console-faint"
                data-testid="blocked-count"
                aria-live="polite"
              >
                {filter === "all"
                  ? `${visibleRecords.length} total`
                  : `${visibleRecords.length} in ${filter}`}
              </span>
            </h3>
            <span className="text-[10px] italic text-console-faint">
              Command text is never shown — redacted by construction.
            </span>
          </header>
          <ChartReveal>
            <DataTable
              caption={
                filter === "all"
                  ? "Blocked command-risk dispositions"
                  : `Blocked command-risk dispositions — ${filter} category`
              }
              columns={TABLE_COLUMNS}
              rows={rows}
              getRowKey={(row, i) => String(row["_key"] ?? i)}
              emptyMessage={
                filter === "all"
                  ? "No blocked commands in this window."
                  : `No blocked ${filter} commands in this window.`
              }
            />
          </ChartReveal>
        </section>
      </div>
    </ConsoleChrome>
  );
}

/** A single disposition tally, optionally emphasised (red) when non-zero. */
function SummaryStat({
  label,
  value,
  emphasize = false,
  hint,
}: {
  readonly label: string;
  readonly value: number;
  readonly emphasize?: boolean;
  /** Plain-language meaning of the disposition (surfaced as a tooltip). */
  readonly hint?: string;
}) {
  return (
    <div
      className="flex flex-col gap-0.5 rounded-sm border border-console-edge bg-console-canvas/40 px-3 py-2"
      title={hint}
    >
      <dt className="text-[10px] uppercase tracking-section text-console-faint">
        {label}
      </dt>
      <dd
        className={cn(
          "text-lg tabular-nums",
          emphasize ? "text-red-300" : "text-console-ink",
        )}
      >
        {value.toLocaleString()}
      </dd>
    </div>
  );
}

/**
 * Render the fixed ISO timestamp as a stable `HH:MM:SS` clock (UTC). Fixtures
 * carry FIXED literal timestamps, so we format an absolute, deterministic clock
 * rather than a wall-clock "x ago" — the replica must not call a live time
 * source, and SSR/CSR must agree.
 */
function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(
    d.getUTCSeconds(),
  )}`;
}
