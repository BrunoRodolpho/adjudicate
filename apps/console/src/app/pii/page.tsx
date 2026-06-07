"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AsyncBoundary, EmptyState } from "@/components/ui";
import { BarDistribution } from "@/components/charts";
import { DataTable, type DataTableColumn } from "@/components/a11y";
import {
  usePiiEvents,
  type PiiDisposition,
  type PiiSensitivityLevel,
} from "@/hooks/usePiiEvents";
import { usePiiClassification } from "@/hooks/usePiiClassification";
import { decisionTheme } from "@/lib/decision-theme";
import { formatRelative, truncateHash } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * PII Events (ADR-129) — operator drill-down into data-classification
 * dispositions.
 *
 * Three async regions, each wrapped in <AsyncBoundary>:
 *
 *   1. Sensitivity-class breakdown — a <BarDistribution> of total detections
 *      per sensitivity tier, summed across dispositions from the aggregate
 *      `piiClassificationStats`.
 *   2. Redacted-vs-blocked summary — the two disposition totals, also from
 *      the aggregate stats.
 *   3. Event-level table — individual disposition events from `piiEvents`,
 *      each row linking to the Decision Detail (`/decisions/<intentHash>`).
 *      Carries only non-sensitive metadata; redacted values never appear.
 *
 * Sensitivity and disposition filters flow into the `piiEvents` query args
 * (the React Query key includes them, so a change refetches). The aggregate
 * panels are unfiltered — they always show the full window's distribution as
 * context for the filtered table.
 */

/** Fixed seven-day lookback window. */
const WINDOW_DAYS = 7;
const SEVERITY_TIERS = ["low", "medium", "high", "critical"] as const;

type SensitivityFilter = PiiSensitivityLevel | "all";
type DispositionFilter = PiiDisposition | "all";

const SENSITIVITY_OPTIONS: readonly SensitivityFilter[] = [
  "all",
  "low",
  "medium",
  "high",
  "critical",
];
const DISPOSITION_OPTIONS: readonly DispositionFilter[] = [
  "all",
  "redacted",
  "blocked",
];

const TABLE_COLUMNS: readonly DataTableColumn[] = [
  { key: "at", header: "Time" },
  { key: "intentKind", header: "Intent kind" },
  { key: "decision", header: "Decision" },
  { key: "sensitivity", header: "Sensitivity" },
  { key: "disposition", header: "Disposition" },
];

/** Compute the ISO timestamp for `days` before now (client-side date math). */
function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export default function PiiEventsPage() {
  // `since` is computed once per mount; the query window is the last 7 days.
  const since = useMemo(() => isoDaysAgo(WINDOW_DAYS), []);

  const [sensitivity, setSensitivity] = useState<SensitivityFilter>("all");
  const [disposition, setDisposition] = useState<DispositionFilter>("all");

  const stats = usePiiClassification({ since });
  const events = usePiiEvents({
    since,
    ...(sensitivity !== "all" ? { sensitivityLevel: sensitivity } : {}),
    ...(disposition !== "all" ? { disposition } : {}),
  });

  // Sum every (tier × disposition) bucket into one count per sensitivity tier.
  const tierBars = useMemo(() => {
    const byTier = new Map<string, number>();
    for (const tier of SEVERITY_TIERS) byTier.set(tier, 0);
    for (const b of stats.data?.buckets ?? []) {
      byTier.set(
        b.sensitivityLevel,
        (byTier.get(b.sensitivityLevel) ?? 0) + b.count,
      );
    }
    return SEVERITY_TIERS.map((tier) => ({
      label: tier,
      value: byTier.get(tier) ?? 0,
    }));
  }, [stats.data?.buckets]);

  const dispositionTotals = useMemo(() => {
    let redacted = 0;
    let blocked = 0;
    for (const b of stats.data?.buckets ?? []) {
      if (b.disposition === "redacted") redacted += b.count;
      else blocked += b.count;
    }
    return { redacted, blocked };
  }, [stats.data?.buckets]);

  const statsEmpty =
    (stats.data?.buckets.length ?? 0) === 0 ||
    tierBars.every((b) => b.value === 0);

  const rows = useMemo(
    () =>
      (events.data?.events ?? []).map((e) => ({
        _key: `${e.intentHash}:${e.at}:${e.disposition}`,
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
        sensitivity: (
          <span className="uppercase tracking-section text-muted">
            {e.sensitivityLevel}
          </span>
        ),
        disposition: (
          <span
            className={cn(
              "uppercase tracking-section",
              e.disposition === "blocked" ? "text-red-300" : "text-muted",
            )}
            title={truncateHash(e.intentHash)}
          >
            {e.disposition}
          </span>
        ),
      })),
    [events.data?.events],
  );

  const eventsEmpty = (events.data?.events.length ?? 0) === 0;

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between border-b border-edge pb-3">
        <h1 className="text-[10px] uppercase tracking-section text-muted">
          PII Events · Data-classification dispositions
        </h1>
        <span className="text-[10px] text-faint">
          ADR-129 · last {WINDOW_DAYS}d
        </span>
      </header>

      {/* Aggregate context: sensitivity breakdown + disposition totals. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-sm border border-edge bg-panel/40 p-3">
          <AsyncBoundary
            isLoading={stats.isLoading}
            isError={stats.isError}
            isEmpty={statsEmpty}
            emptyFallback={
              <EmptyState title="No PII detections in this window." />
            }
            errorMessage="Data-classification stats unavailable."
          >
            <BarDistribution
              title="Detections by sensitivity"
              data={tierBars}
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
              <EmptyState title="No PII detections in this window." />
            }
            errorMessage="Data-classification stats unavailable."
          >
            <dl className="grid grid-cols-2 gap-2" data-testid="disposition-totals">
              <SummaryStat
                label="Redacted"
                value={dispositionTotals.redacted}
              />
              <SummaryStat
                label="Blocked"
                value={dispositionTotals.blocked}
                emphasize={dispositionTotals.blocked > 0}
              />
            </dl>
          </AsyncBoundary>
        </section>
      </div>

      {/* Filters. */}
      <section className="flex flex-wrap items-end gap-4">
        <FilterControl
          label="Sensitivity"
          name="sensitivity"
          value={sensitivity}
          options={SENSITIVITY_OPTIONS}
          onChange={(v) => setSensitivity(v as SensitivityFilter)}
        />
        <FilterControl
          label="Disposition"
          name="disposition"
          value={disposition}
          options={DISPOSITION_OPTIONS}
          onChange={(v) => setDisposition(v as DispositionFilter)}
        />
      </section>

      {/* Event-level table. */}
      <section className="flex flex-col gap-2">
        <header className="flex items-baseline justify-between">
          <h2 className="text-[10px] uppercase tracking-section text-faint">
            Disposition events
          </h2>
          {events.data?.truncated ? (
            <span
              data-testid="truncated-note"
              className="text-[10px] italic text-amber-300"
            >
              Results truncated — narrow the window or filters to see all events.
            </span>
          ) : null}
        </header>
        <AsyncBoundary
          isLoading={events.isLoading}
          isError={events.isError}
          isEmpty={eventsEmpty}
          emptyFallback={
            <EmptyState title="No PII events match these filters." />
          }
          errorMessage="PII events unavailable. An authenticated operator is required."
        >
          <DataTable
            caption="Data-classification disposition events"
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
  const id = `pii-filter-${name}`;
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
