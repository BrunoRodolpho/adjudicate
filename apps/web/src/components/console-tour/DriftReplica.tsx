"use client";

import { useMemo, useState } from "react";
import { ConsoleChrome } from "@/components/console-kit/chrome/ConsoleChrome";
import { DataTable, type DataTableColumn } from "@/components/console-kit/a11y";
import { TimelineChart } from "@/components/console-kit/charts";
import {
  DRIFT_REPLICA,
  DRIFT_SIGNAL_LABEL,
  driftSeverityBand,
  type DriftSeverityBand,
} from "@/lib/drift-replica";
import type { DriftDimensionName } from "@/lib/transparency-fixtures";
import { cn } from "@/lib/cn";

/**
 * DriftReplica — a focused replica of the operator console's behavioral-drift
 * surface (ADR-132), mirroring apps/console/src/app/drift.
 *
 * CLIENT component. Interactivity is local React state over the committed
 * `DRIFT_REPLICA` fixture ONLY — there is no clock, RNG, network, or admin/DB
 * access in this path; every value is a fixed literal, so the surface renders
 * deterministically. It renders inside {@link ConsoleChrome} (the reviewed
 * honesty boundary — the standing "Illustrative replica · sample data" label is
 * non-removable) and shows the operator sub-views over a representative window:
 *
 *   A. Dimension selector — one chip per tracked drift dimension (TVD + alert
 *      count on the chip), defaulting to the highest-TVD dimension. The chosen
 *      dimension is the focus for the timeline (C) and the active-alert filter
 *      (B). Selection is `aria-pressed` button state, keyboard-operable.
 *   B. Active drifts — the flattened statistical-drift (TVD) alert list,
 *      FILTERED to the selected dimension: signal type, severity band
 *      (magnitude / threshold), and the baseline → recent observation counts.
 *   C. Timeline — the selected dimension's TVD-over-time series rendered as a
 *      {@link TimelineChart}, so a spike is legible as new / sustained.
 *
 * The per-dimension series is derived PURELY from the committed cross-dimension
 * max-TVD timeline, scaled to the dimension's current TVD — no data is invented
 * and the highest-TVD dimension reproduces the committed max-TVD shape exactly.
 *
 * SAFETY: only closed dimension NAMES + the signal-type enum + aggregate counts
 * are shown — never a category value or a baseline/recent category map.
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

/** Round to 2dp so derived series values stay stable and compact. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function DriftReplica({ className }: { readonly className?: string }) {
  const { alertThreshold, baselineWindow, recentWindow, totalObserved } =
    DRIFT_REPLICA;

  // The dimensions in fixed (committed) order, plus the highest-TVD dimension
  // which is the default focus — derived once, deterministically.
  const dimensions = DRIFT_REPLICA.dimensions;
  const defaultDimension = useMemo<DriftDimensionName>(() => {
    let top = dimensions[0]!;
    for (const d of dimensions) if (d.tvd > top.tvd) top = d;
    return top.dimension;
  }, [dimensions]);

  const [selected, setSelected] =
    useState<DriftDimensionName>(defaultDimension);

  const selectedDimension =
    dimensions.find((d) => d.dimension === selected) ?? dimensions[0]!;

  // The committed cross-dimension max-TVD series (its peak is the largest TVD
  // across all dimensions — i.e. the highest-TVD dimension's current TVD).
  const seriesPeak = useMemo(
    () => DRIFT_REPLICA.timeline.reduce((m, e) => Math.max(m, e.maxTvd), 0),
    [],
  );

  // B. Active-drift rows filtered to the selected dimension, sorted by severity
  // (magnitude / threshold) high → low.
  const activeRows = useMemo(() => {
    const filtered = DRIFT_REPLICA.alerts.filter(
      (a) => a.dimension === selected,
    );
    const sorted = [...filtered].sort((a, b) => {
      const ra = a.threshold > 0 ? a.magnitude / a.threshold : a.magnitude;
      const rb = b.threshold > 0 ? b.magnitude / b.threshold : b.magnitude;
      return rb - ra;
    });
    return sorted.map((a, i) => {
      const theme = SEVERITY_THEME[driftSeverityBand(a.magnitude, a.threshold)];
      return {
        _key: `${a.dimension}:${a.signal}:${i}`,
        dimension: (
          <span className="font-medium text-console-ink">{a.dimension}</span>
        ),
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
  }, [selected]);

  // C. The selected dimension's TVD-over-time series, derived PURELY by scaling
  // the committed cross-dimension max-TVD shape to the dimension's current TVD.
  // When the dimension IS the peak driver its scale is 1 and the committed
  // series is reproduced exactly. No data is invented.
  const points = useMemo(() => {
    const scale =
      seriesPeak > 0 ? selectedDimension.tvd / seriesPeak : 0;
    return DRIFT_REPLICA.timeline.map((e) => ({
      t: e.at,
      value: round2(e.maxTvd * scale),
    }));
  }, [selectedDimension, seriesPeak]);

  const maxTvd = points.reduce((m, p) => Math.max(m, p.value), 0);
  const timelineBand: "ok" | "warn" | "crit" =
    maxTvd >= 0.5 ? "crit" : maxTvd >= alertThreshold ? "warn" : "ok";

  return (
    <ConsoleChrome caption="drift · localhost:5180" className={className}>
      <div className="flex flex-col gap-4">
        {/* A. Dimension selector — chips, one per tracked drift dimension. */}
        <Panel
          title="Dimensions · per-dimension TVD"
          subtitle={`${totalObserved.toLocaleString()} observed · baseline ${baselineWindow} / recent ${recentWindow} · threshold ${alertThreshold}`}
          testId="drift-dimensions"
        >
          <div
            role="group"
            aria-label="Select a drift dimension to focus"
            className="flex flex-wrap gap-2"
          >
            {dimensions.map((d) => {
              const active = d.dimension === selected;
              const elevated = d.tvd >= alertThreshold && alertThreshold > 0;
              return (
                <button
                  key={d.dimension}
                  type="button"
                  onClick={() => setSelected(d.dimension)}
                  aria-pressed={active}
                  data-dimension={d.dimension}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-sm border px-2 py-1 text-[11px] transition-colors",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400/60",
                    active
                      ? "border-emerald-500/50 bg-emerald-500/10 text-console-ink"
                      : "border-console-edge bg-console-panel/40 text-console-muted hover:bg-console-edge/40",
                  )}
                >
                  <span className="font-medium">{d.dimension}</span>
                  <span
                    className={cn(
                      "tabular-nums",
                      elevated ? "text-amber-300" : "text-console-faint",
                    )}
                  >
                    TVD {d.tvd.toFixed(2)}
                  </span>
                  <span
                    className={cn(
                      "tabular-nums",
                      d.alertCount > 0 ? "text-red-300" : "text-console-faint",
                    )}
                    aria-label={`${d.alertCount} active ${d.alertCount === 1 ? "alert" : "alerts"}`}
                  >
                    {d.alertCount > 0 ? `${d.alertCount}⚑` : "—"}
                  </span>
                </button>
              );
            })}
          </div>
        </Panel>

        {/* B. Active drifts · filtered to the selected dimension. */}
        <Panel
          title={`Active drifts · ${selected} · statistical (TVD)`}
          subtitle="governance.behavioralDrift"
          testId="drift-active"
        >
          <DataTable
            caption={`Active statistical-drift alerts for ${selected}`}
            columns={ACTIVE_COLUMNS}
            rows={activeRows}
            getRowKey={(row, i) => String(row._key ?? i)}
            emptyMessage={`No active drift for ${selected} — its distribution is within threshold.`}
          />
        </Panel>

        {/* C. Timeline · selected dimension's TVD over time. */}
        <Panel
          title={`Timeline · ${selected} TVD over time`}
          subtitle="governance.driftHistory"
          testId="drift-timeline"
        >
          <div className="flex flex-col gap-2" data-testid="drift-timeline-chart">
            <TimelineChart
              title={`${selected} TVD per recorded snapshot`}
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
