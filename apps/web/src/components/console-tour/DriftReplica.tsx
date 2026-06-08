import { ConsoleChrome } from "@/components/console-kit/chrome/ConsoleChrome";
import { DataTable, type DataTableColumn } from "@/components/console-kit/a11y";
import { TimelineChart } from "@/components/console-kit/charts";
import {
  DRIFT_REPLICA,
  DRIFT_SIGNAL_LABEL,
  driftSeverityBand,
  type DriftSeverityBand,
} from "@/lib/drift-replica";
import { cn } from "@/lib/cn";

/**
 * DriftReplica — a focused, static replica of the operator console's
 * behavioral-drift surface (ADR-132), mirroring apps/console/src/app/drift.
 *
 * SERVER component. It renders inside {@link ConsoleChrome} (the reviewed
 * honesty boundary — the standing "Illustrative replica · sample data" label is
 * non-removable) and shows the three operator sub-views over a representative
 * window, all driven by the committed `DRIFT_REPLICA` fixture:
 *
 *   A. Active drifts — the flattened statistical-drift (TVD) alert list:
 *      dimension, signal type, severity band (magnitude / threshold), and the
 *      baseline → recent observation counts. Sorted high → low by severity.
 *   B. Dimensions — per-dimension TVD + alert count; TVD highlighted amber at
 *      or over threshold.
 *   C. Timeline — the max-TVD-over-time series rendered as a {@link TimelineChart}
 *      so a spike is legible as new / sustained.
 *
 * There is no clock, no RNG, no network, and no admin/DB access in this path —
 * the data is fixed literals, so the surface renders identically everywhere.
 * SAFETY: only closed dimension NAMES + signal-type enum + aggregate counts are
 * shown — never a category value or a baseline/recent category map.
 */

const SEVERITY_THEME: Record<
  DriftSeverityBand,
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

const ACTIVE_COLUMNS: readonly DataTableColumn[] = [
  { key: "dimension", header: "Dimension" },
  { key: "signal", header: "Signal" },
  { key: "severity", header: "Severity" },
  { key: "counts", header: "Baseline → Recent", align: "right" },
];

const DIMENSION_COLUMNS: readonly DataTableColumn[] = [
  { key: "dimension", header: "Dimension" },
  { key: "tvd", header: "TVD", align: "right" },
  { key: "alerts", header: "Alerts", align: "right" },
];

export function DriftReplica({ className }: { readonly className?: string }) {
  const { alertThreshold, baselineWindow, recentWindow, totalObserved } =
    DRIFT_REPLICA;

  // Active-drift rows, sorted by severity (magnitude / threshold) high → low.
  const activeAlerts = [...DRIFT_REPLICA.alerts].sort((a, b) => {
    const ra = a.threshold > 0 ? a.magnitude / a.threshold : a.magnitude;
    const rb = b.threshold > 0 ? b.magnitude / b.threshold : b.magnitude;
    return rb - ra;
  });

  const activeRows = activeAlerts.map((a, i) => {
    const theme = SEVERITY_THEME[driftSeverityBand(a.magnitude, a.threshold)];
    return {
      _key: `${a.dimension}:${a.signal}:${i}`,
      dimension: <span className="font-medium text-console-ink">{a.dimension}</span>,
      signal: (
        <span className="text-console-muted">
          {DRIFT_SIGNAL_LABEL[a.signal]}
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
          <span className="tabular-nums text-console-faint">
            {a.magnitude.toFixed(2)}
          </span>
        </span>
      ),
      counts: (
        <span className="tabular-nums text-console-muted">
          {a.baselineCount} → {a.recentCount}
        </span>
      ),
    };
  });

  // Per-dimension TVD summary rows.
  const dimensionRows = DRIFT_REPLICA.dimensions.map((d) => ({
    _key: d.dimension,
    dimension: <span className="font-medium text-console-ink">{d.dimension}</span>,
    tvd: (
      <span
        className={cn(
          "tabular-nums",
          d.tvd >= alertThreshold && alertThreshold > 0
            ? "text-amber-300"
            : "text-console-ink",
        )}
      >
        {d.tvd.toFixed(2)}
      </span>
    ),
    alerts: (
      <span
        className={cn(
          "tabular-nums",
          d.alertCount > 0 ? "text-red-300" : "text-console-muted",
        )}
      >
        {d.alertCount}
      </span>
    ),
  }));

  // Max-TVD timeline → chart points + severity band over the whole series.
  const points = DRIFT_REPLICA.timeline.map((e) => ({ t: e.at, value: e.maxTvd }));
  const maxTvd = points.reduce((m, p) => Math.max(m, p.value), 0);
  const timelineBand: "ok" | "warn" | "crit" =
    maxTvd >= 0.5 ? "crit" : maxTvd > 0 ? "warn" : "ok";

  return (
    <ConsoleChrome caption="drift · localhost:5180" className={className}>
      <div className="flex flex-col gap-4">
        {/* A. Active drifts · statistical (TVD). */}
        <Panel
          title="Active drifts · statistical (TVD)"
          subtitle="governance.behavioralDrift"
          testId="drift-active"
        >
          <DataTable
            caption="Active statistical-drift alerts across the tracked dimensions"
            columns={ACTIVE_COLUMNS}
            rows={activeRows}
            getRowKey={(row, i) => String(row._key ?? i)}
            emptyMessage="No active drift — distributions are within threshold."
          />
        </Panel>

        {/* B. Dimensions · per-dimension TVD. */}
        <Panel
          title="Dimensions · per-dimension TVD"
          subtitle={`${totalObserved.toLocaleString()} observed · baseline ${baselineWindow} / recent ${recentWindow} · threshold ${alertThreshold}`}
          testId="drift-dimensions"
        >
          <DataTable
            caption="Total-variation distance and alert count per tracked dimension"
            columns={DIMENSION_COLUMNS}
            rows={dimensionRows}
            getRowKey={(row, i) => String(row._key ?? i)}
          />
        </Panel>

        {/* C. Timeline · max TVD over time. */}
        <Panel
          title="Timeline · max TVD over time"
          subtitle="governance.driftHistory"
          testId="drift-timeline"
        >
          <div className="flex flex-col gap-2" data-testid="drift-timeline-chart">
            <TimelineChart
              title="Max TVD per recorded snapshot"
              points={points}
              band={timelineBand}
              yFormat={(n) => n.toFixed(2)}
            />
          </div>
        </Panel>
      </div>
    </ConsoleChrome>
  );
}

/** Bordered console-panel section matching the operator drift screen's panels. */
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
