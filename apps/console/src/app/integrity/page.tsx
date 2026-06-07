"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AsyncBoundary, EmptyState } from "@/components/ui";
import { DataTable, type DataTableColumn } from "@/components/a11y";
import { TimelineChart } from "@/components/charts";
import {
  useConfigSealStatusAll,
  useKillSwitchTimeline,
} from "@/hooks/useConfigIntegrity";
import { EmergencyHistoryList } from "@/components/control/EmergencyHistoryList";
import { truncateHash, formatDurationMs } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * Configuration Integrity (ADR-131) — a unified operator surface that answers
 * three questions in one screen:
 *
 *   A. Active seals  — which installed packs are sealed & verifying right now
 *                      (governance.configSealStatusAll → per-pack DataTable).
 *   B. Violations    — structured integrity failures derived from the reports
 *                      (digest mismatch / signature failed / signature missing /
 *                      policy error), with kill.SEAL_MISMATCH linkage.
 *   C. Kill switch   — the activation-timeline stability class + roll-up from
 *                      governance.killSwitchTimeline, plus the raw governance
 *                      event log. Engage/restore controls stay on /control.
 *
 * References ADR-114 (kill switch), ADR-121 (config seal). All values render as
 * inert text; no dangerouslySetInnerHTML.
 */

type SealEntry = NonNullable<
  ReturnType<typeof useConfigSealStatusAll>["data"]
>["entries"][number];

type StabilityClass =
  | "stable"
  | "single_incident"
  | "recurring_incidents"
  | "storm";

const SEAL_COLUMNS: readonly DataTableColumn[] = [
  { key: "pack", header: "Pack" },
  { key: "status", header: "Status" },
  { key: "digest", header: "Digest" },
  { key: "signature", header: "Signature" },
];

const VIOLATION_KIND_LABEL: Record<string, string> = {
  digest_mismatch: "Digest mismatch",
  signature_failed: "Signature failed",
  signature_missing: "Signature missing",
  policy_error: "Policy error",
};

const STABILITY_THEME: Record<
  StabilityClass,
  { label: string; chip: string; band: "ok" | "warn" | "crit"; pulse?: boolean }
> = {
  stable: { label: "Stable", chip: "border-emerald-400/40 text-emerald-300", band: "ok" },
  single_incident: { label: "Single incident", chip: "border-amber-400/40 text-amber-300", band: "warn" },
  recurring_incidents: { label: "Recurring incidents", chip: "border-orange-400/40 text-orange-300", band: "warn" },
  storm: { label: "Storm", chip: "border-red-400/50 text-red-300", band: "crit", pulse: true },
};

function signatureLabel(sig: SealEntry["report"]["signatureVerification"]): string {
  if (sig.verified === true) return "verified";
  if (sig.verified === false) return "failed";
  return sig.reason === "not_required" ? "not required" : "not supplied";
}

export default function ConfigurationIntegrityPage() {
  const seals = useConfigSealStatusAll();
  const timeline = useKillSwitchTimeline();

  const entries = seals.data?.entries ?? [];
  const sealsEmpty = entries.length === 0;

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between border-b border-edge pb-3">
        <h1 className="text-[10px] uppercase tracking-section text-muted">
          Configuration Integrity · seals · violations · kill-switch stability
        </h1>
        <span className="text-[10px] text-faint">ADR-131</span>
      </header>

      {/* Panel A — Active seals (multi-pack). */}
      <ActiveSealsPanel
        isLoading={seals.isLoading}
        isError={seals.isError}
        isEmpty={sealsEmpty}
        entries={entries}
        onRetry={() => void seals.refetch()}
      />

      {/* Panel B — Seal violations. */}
      <SealViolationsPanel
        isLoading={seals.isLoading}
        isError={seals.isError}
        isEmpty={sealsEmpty}
        entries={entries}
        onRetry={() => void seals.refetch()}
      />

      {/* Panel C — Kill-switch activation timeline. */}
      <KillSwitchTimelinePanel
        isLoading={timeline.isLoading}
        isError={timeline.isError}
        report={timeline.data}
        onRetry={() => void timeline.refetch()}
      />
    </div>
  );
}

function Panel({
  title,
  children,
  testId,
}: {
  title: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section
      className="rounded-sm border border-edge bg-panel/40"
      data-testid={testId}
    >
      <header className="border-b border-edge px-3 py-1.5 text-[10px] uppercase tracking-section text-faint">
        {title}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

function ActiveSealsPanel({
  isLoading,
  isError,
  isEmpty,
  entries,
  onRetry,
}: {
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  entries: readonly SealEntry[];
  onRetry: () => void;
}) {
  const rows = useMemo(
    () =>
      entries.map((e) => ({
        _key: e.packId,
        pack: (
          <span className="font-medium text-ink">
            {e.packId}
            {e.packVersion ? (
              <span className="text-faint">@{e.packVersion}</span>
            ) : null}
          </span>
        ),
        status: (
          <span
            className={cn(
              "inline-flex items-center gap-1",
              e.report.verified ? "text-emerald-300" : "text-red-300",
            )}
          >
            <span aria-hidden>{e.report.verified ? "✓" : "✗"}</span>
            {e.report.verified ? "Sealed" : "Drift"}
          </span>
        ),
        digest: (
          <code
            className="font-mono text-faint"
            title={e.report.computedDigest}
          >
            {truncateHash(e.report.computedDigest)}
          </code>
        ),
        signature: (
          <span className="text-muted">{signatureLabel(e.report.signatureVerification)}</span>
        ),
      })),
    [entries],
  );

  return (
    <Panel title="Active seals" testId="integrity-seals">
      <AsyncBoundary
        isLoading={isLoading}
        isError={isError}
        isEmpty={isEmpty}
        emptyFallback={
          <EmptyState
            title="No config seals configured."
            hint="Verify each installed pack via verifyConfigSeal and wire ctx.configSealReports in the admin route handler."
          />
        }
        errorMessage="Config-seal status unavailable."
        onRetry={onRetry}
      >
        <DataTable
          caption="Per-pack configuration-seal verification status"
          columns={SEAL_COLUMNS}
          rows={rows}
          getRowKey={(row, i) => String(row._key ?? i)}
        />
      </AsyncBoundary>
    </Panel>
  );
}

function SealViolationsPanel({
  isLoading,
  isError,
  isEmpty,
  entries,
  onRetry,
}: {
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  entries: readonly SealEntry[];
  onRetry: () => void;
}) {
  const withViolations = useMemo(
    () => entries.filter((e) => e.violations.length > 0),
    [entries],
  );

  return (
    <Panel title="Seal violations" testId="integrity-violations">
      <AsyncBoundary
        isLoading={isLoading}
        isError={isError}
        isEmpty={isEmpty}
        emptyFallback={
          <EmptyState
            title="No config seals configured."
            hint="Wire ctx.configSealReports in the admin route handler."
          />
        }
        errorMessage="Seal violations unavailable."
        onRetry={onRetry}
      >
        {withViolations.length === 0 ? (
          <p
            className="text-[11px] text-emerald-300"
            data-testid="integrity-violations-empty"
          >
            No integrity violations — all installed packs verify.
          </p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="integrity-violations-list">
            {withViolations.map((e) => (
              <li
                key={e.packId}
                className="rounded-sm border border-edge bg-canvas px-2.5 py-2 text-[11px]"
              >
                <span className="font-medium text-ink">
                  {e.packId}
                  {e.packVersion ? (
                    <span className="text-faint">@{e.packVersion}</span>
                  ) : null}
                </span>
                <ul className="mt-1 flex flex-col gap-1.5">
                  {e.violations.map((v, i) => (
                    <li key={`${v.kind}:${i}`} className="flex flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="rounded-sm border border-red-400/40 px-1.5 py-0.5 text-[10px] uppercase tracking-section text-red-300">
                          {VIOLATION_KIND_LABEL[v.kind] ?? v.kind}
                        </span>
                        {v.basisCode === "seal_mismatch" ? (
                          <Link
                            href="/?basis=seal_mismatch"
                            className="text-[10px] uppercase tracking-section text-sky-300 hover:text-sky-200"
                          >
                            View audit linkage →
                          </Link>
                        ) : null}
                      </span>
                      <span className="text-muted" title={v.message}>
                        {v.message}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </AsyncBoundary>
    </Panel>
  );
}

type TimelineReport = NonNullable<
  ReturnType<typeof useKillSwitchTimeline>["data"]
>;

function KillSwitchTimelinePanel({
  isLoading,
  isError,
  report,
  onRetry,
}: {
  isLoading: boolean;
  isError: boolean;
  report: TimelineReport | undefined;
  onRetry: () => void;
}) {
  return (
    <Panel title="Kill-switch activation timeline" testId="integrity-timeline">
      <AsyncBoundary
        isLoading={isLoading}
        isError={isError}
        isEmpty={false}
        errorMessage="Kill-switch timeline unavailable — showing the raw event log below."
        onRetry={onRetry}
      >
        {report ? <TimelineSummary report={report} /> : null}
      </AsyncBoundary>

      {/* The raw governance event log degrades gracefully — it renders even when
          the timeline roll-up fails (separate query). */}
      <div className="mt-3 border-t border-edge pt-3">
        <EmergencyHistoryList />
        <p className="mt-2 text-[10px] text-faint">
          Engage / restore the kill switch from{" "}
          <Link href="/control" className="text-sky-300 hover:text-sky-200">
            Control
          </Link>
          .
        </p>
      </div>
    </Panel>
  );
}

function TimelineSummary({ report }: { report: TimelineReport }) {
  const theme = STABILITY_THEME[report.stability as StabilityClass];
  // One illustrative point per source bucket so the chart has a deterministic
  // series; the headline + tiles carry the precise figures.
  const points = useMemo(
    () =>
      Object.entries(report.bySource).map(([source, count]) => ({
        t: source,
        value: count,
      })),
    [report.bySource],
  );

  return (
    <div className="flex flex-col gap-3" data-testid="integrity-timeline-summary">
      <div className="flex flex-wrap items-center gap-2">
        <span
          data-testid="integrity-stability-badge"
          aria-label={`Kill-switch stability: ${theme.label}. ${report.headline}`}
          className={cn(
            "rounded-sm border px-2 py-0.5 text-[10px] uppercase tracking-section",
            theme.chip,
            theme.pulse ? "animate-pulse" : "",
          )}
        >
          {theme.label}
        </span>
        <span className="text-[11px] text-muted">{report.headline}</span>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] sm:grid-cols-5">
        <Stat label="Trips" value={String(report.trips)} />
        <Stat label="Clears" value={String(report.clears)} />
        <Stat label="Transitions" value={String(report.transitions)} />
        <Stat label="Max density" value={String(report.maxTripDensity)} />
        <Stat label="Engaged" value={formatDurationMs(report.activeDurationMs)} />
      </dl>

      {report.totalEvents > 0 ? (
        <TimelineChart
          title="Activations by source"
          points={points}
          band={theme.band}
          yFormat={(n) => n.toLocaleString()}
        />
      ) : (
        <p className="text-[11px] italic text-faint">
          Kill switch never engaged — no activations recorded.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-sm border border-edge/50 px-2 py-1">
      <dt className="text-[10px] uppercase tracking-section text-faint">{label}</dt>
      <dd className="tabular-nums text-ink">{value}</dd>
    </div>
  );
}
