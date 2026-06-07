"use client";

import { useMemo } from "react";
import { AsyncBoundary, EmptyState } from "@/components/ui";
import { DataTable, type DataTableColumn } from "@/components/a11y";
import { TimelineChart } from "@/components/charts";
import { useBehavioralDrift, useDriftTimeline } from "@/hooks/useDrift";
import { DriftPanel } from "@/components/dashboard/DriftPanel";
import { cn } from "@/lib/cn";

/**
 * Drift (ADR-132) — the unified operator surface that reconciles the two
 * previously-split drift signals into one screen with clearly-labelled
 * sub-views. It answers an operator's three questions in one place:
 *
 *   A. Active Drifts — current statistical (TVD) alerts across the tracked
 *                      dimensions, with a severity band = magnitude / threshold
 *                      (governance.behavioralDrift). Sorted high -> low.
 *   B. Dimensions    — per-dimension TVD + alert count (governance.behavioralDrift),
 *                      TVD highlighted amber at/over threshold.
 *   C. Timeline      — the bounded TVD/alert time-series rendered as a
 *                      <TimelineChart> (governance.driftHistory) so a spike is
 *                      legible as new / recovering / sustained.
 *
 * Plus an explicitly-labelled OPERATIONAL sub-view embedding the existing
 * integrity-code DriftPanel — a distinct signal (refusal-code counts), never
 * conflated with the statistical signal above.
 *
 * Statistical (TVD) vs Operational (integrity codes) is labelled at every
 * boundary so the two are never confused. All values render as inert text.
 */

type Snapshot = NonNullable<ReturnType<typeof useBehavioralDrift>["data"]>;
type SnapshotAlert = Snapshot["dimensions"][number]["alerts"][number];

type SeverityBand = "ok" | "elevated" | "high";

const SEVERITY_THEME: Record<
  SeverityBand,
  { label: string; chip: string; band: "ok" | "warn" | "crit" }
> = {
  ok: { label: "OK", chip: "border-emerald-400/40 text-emerald-300", band: "ok" },
  elevated: {
    label: "Elevated",
    chip: "border-amber-400/40 text-amber-300",
    band: "warn",
  },
  high: { label: "High", chip: "border-red-400/50 text-red-300", band: "crit" },
};

const SIGNAL_LABEL: Record<string, string> = {
  distribution_shift: "Distribution shift",
  new_category: "New category",
  proportion_spike: "Proportion spike",
};

/** Severity band from magnitude relative to threshold (color-independent). */
export function severityBand(magnitude: number, threshold: number): SeverityBand {
  if (threshold <= 0) return magnitude > 0 ? "high" : "ok";
  const ratio = magnitude / threshold;
  if (ratio >= 2) return "high";
  if (ratio >= 1) return "elevated";
  return "ok";
}

const ACTIVE_COLUMNS: readonly DataTableColumn[] = [
  { key: "dimension", header: "Dimension" },
  { key: "signal", header: "Signal" },
  { key: "severity", header: "Severity" },
  { key: "category", header: "Category" },
  { key: "counts", header: "Baseline → Recent", align: "right" },
];

const DIMENSION_COLUMNS: readonly DataTableColumn[] = [
  { key: "dimension", header: "Dimension" },
  { key: "tvd", header: "TVD", align: "right" },
  { key: "alerts", header: "Alerts", align: "right" },
];

export default function DriftPage() {
  const drift = useBehavioralDrift();
  const timeline = useDriftTimeline();

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between border-b border-edge pb-3">
        <h1 className="text-[10px] uppercase tracking-section text-muted">
          Drift · active · dimensions · timeline · operational
        </h1>
        <span className="text-[10px] text-faint">ADR-132</span>
      </header>

      <ActiveDriftsPanel
        isLoading={drift.isLoading}
        isError={drift.isError}
        snapshot={drift.data}
        onRetry={() => void drift.refetch()}
      />

      <DimensionsPanel
        isLoading={drift.isLoading}
        isError={drift.isError}
        snapshot={drift.data}
        onRetry={() => void drift.refetch()}
      />

      <TimelinePanel
        isLoading={timeline.isLoading}
        isError={timeline.isError}
        data={timeline.data}
        onRetry={() => void timeline.refetch()}
      />

      {/* OPERATIONAL sub-view — a DISTINCT signal (integrity refusal-code
          counts), never conflated with the statistical TVD signals above. */}
      <Panel
        title="Operational drift · integrity refusal codes"
        testId="drift-operational"
      >
        <p className="mb-2 text-[10px] text-faint">
          Operational (integrity) signal — counts of integrity-violation refusal
          codes. Distinct from the statistical (TVD) signals above.
        </p>
        <DriftPanel />
      </Panel>
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

function ActiveDriftsPanel({
  isLoading,
  isError,
  snapshot,
  onRetry,
}: {
  isLoading: boolean;
  isError: boolean;
  snapshot: Snapshot | undefined;
  onRetry: () => void;
}) {
  const alerts = useMemo(() => collectActiveAlerts(snapshot), [snapshot]);

  const rows = useMemo(
    () =>
      alerts.map((a, i) => {
        const band = severityBand(a.magnitude, a.threshold);
        const theme = SEVERITY_THEME[band];
        return {
          _key: `${a.dimension}:${a.signal}:${a.category ?? ""}:${i}`,
          dimension: <span className="font-medium text-ink">{a.dimension}</span>,
          signal: (
            <span className="text-muted">
              {SIGNAL_LABEL[a.signal] ?? a.signal}
            </span>
          ),
          severity: (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-[10px] uppercase tracking-section",
                theme.chip,
              )}
              aria-label={`Severity ${theme.label}, magnitude ${a.magnitude.toFixed(2)} vs threshold ${a.threshold.toFixed(2)}`}
            >
              {theme.label}
              <span className="tabular-nums text-faint">
                {a.magnitude.toFixed(2)}
              </span>
            </span>
          ),
          category: a.category ? (
            <code className="font-mono text-faint">{a.category}</code>
          ) : (
            <span className="text-faint">—</span>
          ),
          counts: (
            <span className="tabular-nums text-muted">
              {a.baselineCount} → {a.recentCount}
            </span>
          ),
        };
      }),
    [alerts],
  );

  const isEmpty = !isLoading && !isError && alerts.length === 0;

  return (
    <Panel
      title="Active drifts · statistical (TVD)"
      subtitle="governance.behavioralDrift"
      testId="drift-active"
    >
      <AsyncBoundary
        isLoading={isLoading}
        isError={isError}
        isEmpty={isEmpty}
        emptyFallback={
          <EmptyState
            title="No active drift. Distributions are within threshold."
            hint="This is the healthy state — no dimension has crossed its alert threshold."
          />
        }
        errorMessage="No behavioral-drift detector configured. Wire an @adjudicate/drift detector into the route handler context."
        onRetry={onRetry}
      >
        <DataTable
          caption="Active statistical-drift alerts across the tracked dimensions"
          columns={ACTIVE_COLUMNS}
          rows={rows}
          getRowKey={(row, i) => String(row._key ?? i)}
        />
      </AsyncBoundary>
    </Panel>
  );
}

function DimensionsPanel({
  isLoading,
  isError,
  snapshot,
  onRetry,
}: {
  isLoading: boolean;
  isError: boolean;
  snapshot: Snapshot | undefined;
  onRetry: () => void;
}) {
  const threshold = snapshot?.alertThreshold ?? 0;
  const rows = useMemo(
    () =>
      (snapshot?.dimensions ?? []).map((d) => ({
        _key: d.dimension,
        dimension: <span className="font-medium text-ink">{d.dimension}</span>,
        tvd: (
          <span
            className={cn(
              "tabular-nums",
              d.tvd >= threshold && threshold > 0 ? "text-amber-300" : "text-ink",
            )}
          >
            {d.tvd.toFixed(2)}
          </span>
        ),
        alerts: (
          <span
            className={cn(
              "tabular-nums",
              d.alerts.length > 0 ? "text-red-300" : "text-muted",
            )}
          >
            {d.alerts.length}
          </span>
        ),
      })),
    [snapshot?.dimensions, threshold],
  );

  const insufficient =
    snapshot != null && snapshot.totalObserved < snapshot.baselineWindow;
  const isEmpty =
    !isLoading && !isError && (snapshot == null || snapshot.dimensions.length === 0);

  return (
    <Panel
      title="Dimensions · per-dimension TVD"
      subtitle={
        snapshot
          ? `${snapshot.totalObserved} observed · baseline ${snapshot.baselineWindow} / recent ${snapshot.recentWindow} · threshold ${snapshot.alertThreshold}`
          : "governance.behavioralDrift"
      }
      testId="drift-dimensions"
    >
      <AsyncBoundary
        isLoading={isLoading}
        isError={isError}
        isEmpty={isEmpty}
        emptyFallback={
          <EmptyState
            title={
              insufficient
                ? "Insufficient observations for a baseline comparison."
                : "No dimensions tracked."
            }
          />
        }
        errorMessage="No behavioral-drift detector configured. Wire an @adjudicate/drift detector into the route handler context."
        onRetry={onRetry}
      >
        <DataTable
          caption="Total-variation distance and alert count per tracked dimension"
          columns={DIMENSION_COLUMNS}
          rows={rows}
          getRowKey={(row, i) => String(row._key ?? i)}
        />
      </AsyncBoundary>
    </Panel>
  );
}

type TimelineResult = NonNullable<ReturnType<typeof useDriftTimeline>["data"]>;

function TimelinePanel({
  isLoading,
  isError,
  data,
  onRetry,
}: {
  isLoading: boolean;
  isError: boolean;
  data: TimelineResult | undefined;
  onRetry: () => void;
}) {
  const points = useMemo(
    () =>
      (data?.entries ?? []).map((e) => ({
        t: e.at,
        value: e.maxTvd,
      })),
    [data?.entries],
  );

  const band = useMemo<"ok" | "warn" | "crit">(() => {
    const maxTvd = points.reduce((m, p) => Math.max(m, p.value), 0);
    if (maxTvd >= 0.5) return "crit";
    if (maxTvd > 0) return "warn";
    return "ok";
  }, [points]);

  const isEmpty = !isLoading && !isError && (data?.count ?? 0) === 0;

  return (
    <Panel
      title="Timeline · max TVD over time"
      subtitle="governance.driftHistory"
      testId="drift-timeline"
    >
      <AsyncBoundary
        isLoading={isLoading}
        isError={isError}
        isEmpty={isEmpty}
        emptyFallback={
          <EmptyState title="No drift history yet — snapshots accumulate as audit events arrive." />
        }
        errorMessage="Failed to load drift history."
        onRetry={onRetry}
      >
        {data ? (
          <div className="flex flex-col gap-2" data-testid="drift-timeline-chart">
            <TimelineChart
              title="Max TVD per recorded snapshot"
              points={points}
              band={band}
              yFormat={(n) => n.toFixed(2)}
            />
            {data.dropped > 0 ? (
              <p className="text-[10px] text-faint" data-testid="drift-timeline-truncated">
                History truncated — {data.dropped} older snapshot
                {data.dropped === 1 ? "" : "s"} evicted (capacity {data.capacity}).
              </p>
            ) : null}
          </div>
        ) : null}
      </AsyncBoundary>
    </Panel>
  );
}

/**
 * Flatten the snapshot's per-dimension alerts into a single active-drift list,
 * sorted by severity (magnitude / threshold) high -> low. Pure over the input.
 */
function collectActiveAlerts(
  snapshot: Snapshot | undefined,
): SnapshotAlert[] {
  if (!snapshot) return [];
  const alerts = snapshot.dimensions.flatMap((d) => d.alerts);
  return [...alerts].sort((a, b) => {
    const ra = a.threshold > 0 ? a.magnitude / a.threshold : a.magnitude;
    const rb = b.threshold > 0 ? b.magnitude / b.threshold : b.magnitude;
    return rb - ra;
  });
}
