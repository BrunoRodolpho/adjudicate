"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AsyncBoundary, EmptyState } from "@/components/ui";
import { BarDistribution } from "@/components/charts";
import { DataTable, type DataTableColumn } from "@/components/a11y";
import { useCommandRisk } from "@/hooks/useCommandRisk";
import {
  useCommandRiskEvents,
  type CommandRiskCategory,
  type CommandRiskDisposition,
} from "@/hooks/useCommandRiskEvents";
import { decisionTheme } from "@/lib/decision-theme";
import { formatRelative, truncateHash } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * Command Risk (ADR-134, ADR-123) — operator surface for command-risk
 * dispositions emitted by `createCommandRiskGuard`.
 *
 * SECURITY — NO COMMAND TEXT, EVER. The guard threads the RAW command string
 * (which routinely embeds live secrets) into the audit detail, but this page is
 * built entirely on the `governance.commandRisk` aggregate + the
 * `governance.commandRiskEvents` drill-down, BOTH of which carry only the
 * closed-enum category/disposition (+ counts, + non-sensitive event metadata).
 * Neither the bar chart, the disposition totals, nor the blocked-commands list
 * has any field that could carry command text — redaction is by construction at
 * the wire, so this UI cannot leak a command even if it tried.
 *
 * Three regions, each wrapped in <AsyncBoundary>:
 *   1. Risk distribution by category — a <BarDistribution> of total dispositions
 *      per category, summed across dispositions from the aggregate.
 *   2. Disposition totals + a CONFIRM-queue cross-link to the Approval Center
 *      (commands routed to REQUEST_CONFIRMATION live there).
 *   3. Blocked-commands list — the per-event drill-down filtered to the `refuse`
 *      disposition, each row linking to the Decision Detail. Redacted by
 *      construction: NO command column.
 */

/** Fixed seven-day lookback window. */
const WINDOW_DAYS = 7;
const CATEGORIES = ["destructive", "credential", "network"] as const;

type CategoryFilter = CommandRiskCategory | "all";

const CATEGORY_OPTIONS: readonly CategoryFilter[] = [
  "all",
  "destructive",
  "credential",
  "network",
];

const CATEGORY_STYLE: Record<CommandRiskCategory, string> = {
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

/** Compute the ISO timestamp for `days` before now (client-side date math). */
function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export default function CommandRiskPage() {
  // `since` is computed once per mount; the query window is the last 7 days.
  const since = useMemo(() => isoDaysAgo(WINDOW_DAYS), []);

  const [category, setCategory] = useState<CategoryFilter>("all");

  const stats = useCommandRisk({ since });
  // The blocked-commands list is the `refuse`-disposition drill-down.
  const blocked = useCommandRiskEvents({
    since,
    disposition: "refuse",
    ...(category !== "all" ? { category } : {}),
  });

  // Sum every (category × disposition) bucket into one count per category.
  const categoryBars = useMemo(() => {
    const byCategory = new Map<string, number>();
    for (const c of CATEGORIES) byCategory.set(c, 0);
    for (const b of stats.data?.buckets ?? []) {
      byCategory.set(b.category, (byCategory.get(b.category) ?? 0) + b.count);
    }
    return CATEGORIES.map((c) => ({ label: c, value: byCategory.get(c) ?? 0 }));
  }, [stats.data?.buckets]);

  const dispositionTotals = useMemo(() => {
    const totals: Record<CommandRiskDisposition, number> = {
      refuse: 0,
      rewrite: 0,
      confirm: 0,
    };
    for (const b of stats.data?.buckets ?? []) {
      totals[b.disposition] += b.count;
    }
    return totals;
  }, [stats.data?.buckets]);

  const statsEmpty =
    (stats.data?.buckets.length ?? 0) === 0 ||
    categoryBars.every((b) => b.value === 0);

  const rows = useMemo(
    () =>
      (blocked.data?.events ?? []).map((e) => ({
        _key: `${e.intentHash}:${e.at}:${e.category}`,
        at: (
          <Link
            href={`/decisions/${e.intentHash}`}
            title={e.at}
            className="tabular-nums text-muted underline-offset-2 hover:text-ink hover:underline"
          >
            {formatRelative(e.at)}
          </Link>
        ),
        intentKind: <span className="text-ink">{e.intentKind}</span>,
        decision: (
          <span className={cn("tabular-nums", decisionTheme[e.decisionKind].fg)}>
            {decisionTheme[e.decisionKind].label}
          </span>
        ),
        category: (
          <span
            className={cn(
              "uppercase tracking-section",
              CATEGORY_STYLE[e.category] ?? "text-muted",
            )}
            title={truncateHash(e.intentHash)}
          >
            {e.category}
          </span>
        ),
      })),
    [blocked.data?.events],
  );

  const blockedEmpty = (blocked.data?.events.length ?? 0) === 0;

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between border-b border-edge pb-3">
        <h1 className="text-[10px] uppercase tracking-section text-muted">
          Command Risk · Shell-command dispositions
        </h1>
        <span className="text-[10px] text-faint">
          ADR-134 · ADR-123 · last {WINDOW_DAYS}d
        </span>
      </header>

      {/* Aggregate context: category distribution + disposition totals. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-sm border border-edge bg-panel/40 p-3">
          <AsyncBoundary
            isLoading={stats.isLoading}
            isError={stats.isError}
            isEmpty={statsEmpty}
            emptyFallback={
              <EmptyState title="No risky commands in this window." />
            }
            errorMessage="Command-risk stats unavailable."
          >
            <BarDistribution
              title="Risk distribution by category"
              data={categoryBars}
            />
          </AsyncBoundary>
        </section>

        <section className="rounded-sm border border-edge bg-panel/40 p-3">
          <header className="mb-2 text-[10px] uppercase tracking-section text-faint">
            Disposition totals
          </header>
          <AsyncBoundary
            isLoading={stats.isLoading}
            isError={stats.isError}
            isEmpty={statsEmpty}
            emptyFallback={
              <EmptyState title="No risky commands in this window." />
            }
            errorMessage="Command-risk stats unavailable."
          >
            <dl
              className="grid grid-cols-3 gap-2"
              data-testid="disposition-totals"
            >
              <SummaryStat
                label="Blocked"
                value={dispositionTotals.refuse}
                emphasize={dispositionTotals.refuse > 0}
              />
              <SummaryStat label="Rewritten" value={dispositionTotals.rewrite} />
              <SummaryStat label="Confirm" value={dispositionTotals.confirm} />
            </dl>
            {/* CONFIRM-queue cross-link: commands routed to
                REQUEST_CONFIRMATION are reviewed in the Approval Center. */}
            <p
              className="mt-3 text-[11px] text-muted"
              aria-live="polite"
              data-testid="confirm-queue-crosslink"
            >
              <span className="tabular-nums text-sky-300">
                {stats.isLoading ? "—" : dispositionTotals.confirm}
              </span>{" "}
              command{dispositionTotals.confirm === 1 ? "" : "s"} routed to
              confirmation —{" "}
              <Link
                href="/approvals"
                className="text-sky-300 underline-offset-2 hover:underline"
              >
                Open in Approval Center
              </Link>
              .
            </p>
          </AsyncBoundary>
        </section>
      </div>

      {/* Category filter for the blocked-commands list. */}
      <section className="flex flex-wrap items-end gap-4">
        <FilterControl
          label="Category"
          name="category"
          value={category}
          options={CATEGORY_OPTIONS}
          onChange={(v) => setCategory(v as CategoryFilter)}
        />
      </section>

      {/* Blocked-commands list — refuse-disposition drill-down. NO command. */}
      <section className="flex flex-col gap-2">
        <header className="flex items-baseline justify-between">
          <h2 className="text-[10px] uppercase tracking-section text-faint">
            Blocked commands
          </h2>
          <span className="text-[10px] italic text-faint">
            Command text is never shown — redacted by construction.
          </span>
        </header>
        <AsyncBoundary
          isLoading={blocked.isLoading}
          isError={blocked.isError}
          isEmpty={blockedEmpty}
          emptyFallback={
            <EmptyState title="No blocked commands in this window." />
          }
          errorMessage="Blocked commands unavailable. An authenticated operator is required."
        >
          <DataTable
            caption="Blocked command-risk dispositions"
            columns={TABLE_COLUMNS}
            rows={rows}
            getRowKey={(row, i) => String(row._key ?? i)}
          />
        </AsyncBoundary>
      </section>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: number;
  emphasize?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-sm border border-edge bg-canvas/40 px-3 py-2">
      <dt className="text-[10px] uppercase tracking-section text-faint">
        {label}
      </dt>
      <dd
        className={cn(
          "text-lg tabular-nums",
          emphasize ? "text-red-300" : "text-ink",
        )}
      >
        {value.toLocaleString()}
      </dd>
    </div>
  );
}

function FilterControl({
  label,
  name,
  value,
  options,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  options: readonly string[];
  onChange: (next: string) => void;
}) {
  const id = `command-risk-filter-${name}`;
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className="text-[10px] uppercase tracking-section text-faint"
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-sm border border-edge bg-canvas px-2 py-1 text-[11px] text-ink focus:border-ink/30 focus:outline-none"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt === "all" ? "All" : opt}
          </option>
        ))}
      </select>
    </div>
  );
}
