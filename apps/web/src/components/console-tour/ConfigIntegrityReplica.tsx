import type { ReactNode } from "react";
import Link from "next/link";
import { ConsoleChrome } from "@/components/console-kit/chrome/ConsoleChrome";
import { DataTable, type DataTableColumn } from "@/components/console-kit/a11y/DataTable";
import { TimelineChart } from "@/components/console-kit/charts/TimelineChart";
import type { Band } from "@/components/console-kit/charts/types";
import {
  INTEGRITY_REPLICA_FIXTURE,
  formatDurationMs,
  type IntegritySealReplicaRow,
  type IntegrityViolationGroup,
  type KillSwitchStability,
  type KillSwitchTimelineReplica,
} from "@/lib/integrity-replica";
import { cn } from "@/lib/cn";

/**
 * ConfigIntegrityReplica — a faithful, STATIC replica of the operator console's
 * Configuration Integrity surface (ADR-131), mirroring
 * apps/console/src/app/integrity/page.tsx.
 *
 * SERVER component. It renders inside {@link ConsoleChrome} (the reviewed
 * honesty boundary — the standing "Illustrative replica · sample data" label is
 * non-removable) over the same three panels as the real console:
 *
 *   A. Active seals  — per-pack DataTable: pack, seal status (verified/drift),
 *                      truncated computed digest, signature disposition.
 *   B. Violations    — structured integrity failures (digest mismatch /
 *                      signature failed / …) with the kill.SEAL_MISMATCH
 *                      audit-linkage chip.
 *   C. Kill switch   — the activation-timeline stability band + roll-up tiles +
 *                      a {@link TimelineChart} of activations-by-source, tinted by
 *                      the stability band.
 *
 * The only data ever rendered is the committed, clearly-illustrative
 * {@link INTEGRITY_REPLICA_FIXTURE}. All hashes are placeholders and all
 * signatures are illustrative labels (never real digests or key material). There
 * is no clock, RNG, network, or admin/DB access in this path — the data is fixed
 * literals, so the surface renders identically everywhere. Engage/restore
 * controls live on the real operator console only; this replica is read-only.
 */

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
  KillSwitchStability,
  { label: string; chip: string; band: Band }
> = {
  stable: { label: "Stable", chip: "border-emerald-400/40 text-emerald-300", band: "ok" },
  single_incident: {
    label: "Single incident",
    chip: "border-amber-400/40 text-amber-300",
    band: "warn",
  },
  recurring_incidents: {
    label: "Recurring incidents",
    chip: "border-orange-400/40 text-orange-300",
    band: "warn",
  },
  storm: { label: "Storm", chip: "border-red-400/50 text-red-300", band: "crit" },
};

/** Truncate a hash to `head…tail` for dense display. Pure, no deps. */
function truncateHash(hash: string, head = 6, tail = 4): string {
  if (hash.length <= head + tail + 1) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

export function ConfigIntegrityReplica({
  className,
}: {
  readonly className?: string;
}) {
  const { seals, violations, killSwitch } = INTEGRITY_REPLICA_FIXTURE;

  return (
    <ConsoleChrome caption="integrity · localhost:5180" className={className}>
      <div className="flex flex-col gap-4" data-testid="integrity-replica">
        <header className="flex items-baseline justify-between border-b border-console-edge pb-3">
          <h2 className="text-[10px] uppercase tracking-section text-console-muted">
            Configuration Integrity · seals · violations · kill-switch stability
          </h2>
          <span className="text-[10px] text-console-faint">ADR-131</span>
        </header>

        <ActiveSealsPanel seals={seals} />
        <SealViolationsPanel violations={violations} />
        <KillSwitchTimelinePanel report={killSwitch} />
      </div>
    </ConsoleChrome>
  );
}

function Panel({
  title,
  children,
  testId,
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly testId?: string;
}) {
  return (
    <section
      className="rounded-sm border border-console-edge bg-console-panel/40"
      data-testid={testId}
    >
      <header className="border-b border-console-edge px-3 py-1.5 text-[10px] uppercase tracking-section text-console-faint">
        {title}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

function ActiveSealsPanel({
  seals,
}: {
  readonly seals: readonly IntegritySealReplicaRow[];
}) {
  const rows = seals.map((e) => ({
    _key: e.packId,
    pack: (
      <span className="font-medium text-console-ink">
        {e.packId}
        <span className="text-console-faint">@{e.packVersion}</span>
      </span>
    ),
    status: (
      <span
        className={cn(
          "inline-flex items-center gap-1",
          e.status === "verified" ? "text-emerald-300" : "text-red-300",
        )}
      >
        <span aria-hidden="true">{e.status === "verified" ? "✓" : "✗"}</span>
        {e.status === "verified" ? "Sealed" : "Drift"}
      </span>
    ),
    digest: (
      <code className="font-mono text-console-faint" title={e.computedDigest}>
        {truncateHash(e.computedDigest)}
      </code>
    ),
    signature: <span className="text-console-muted">{e.signature}</span>,
  }));

  return (
    <Panel title="Active seals" testId="integrity-seals">
      <DataTable
        caption="Per-pack configuration-seal verification status"
        columns={SEAL_COLUMNS}
        rows={rows}
        getRowKey={(row, i) => String(row._key ?? i)}
      />
    </Panel>
  );
}

function SealViolationsPanel({
  violations,
}: {
  readonly violations: readonly IntegrityViolationGroup[];
}) {
  return (
    <Panel title="Seal violations" testId="integrity-violations">
      {violations.length === 0 ? (
        <p
          className="text-[11px] text-emerald-300"
          data-testid="integrity-violations-empty"
        >
          No integrity violations — all installed packs verify.
        </p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="integrity-violations-list">
          {violations.map((e) => (
            <li
              key={e.packId}
              className="rounded-sm border border-console-edge bg-console-canvas px-2.5 py-2 text-[11px]"
            >
              <span className="font-medium text-console-ink">
                {e.packId}
                <span className="text-console-faint">@{e.packVersion}</span>
              </span>
              <ul className="mt-1 flex flex-col gap-1.5">
                {e.violations.map((v, i) => (
                  <li key={`${v.kind}:${i}`} className="flex flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="rounded-sm border border-red-400/40 px-1.5 py-0.5 text-[10px] uppercase tracking-section text-red-300">
                        {VIOLATION_KIND_LABEL[v.kind] ?? v.kind}
                      </span>
                      {v.basisCode === "seal_mismatch" ? (
                        <span className="text-[10px] uppercase tracking-section text-sky-300">
                          basis · kill.SEAL_MISMATCH
                        </span>
                      ) : null}
                    </span>
                    <span className="text-console-muted">{v.message}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function KillSwitchTimelinePanel({
  report,
}: {
  readonly report: KillSwitchTimelineReplica;
}) {
  const theme = STABILITY_THEME[report.stability];
  // One illustrative point per source bucket so the chart has a deterministic
  // series; the headline + tiles carry the precise figures.
  const points = report.bySource.map((b) => ({ t: b.source, value: b.count }));

  return (
    <Panel title="Kill-switch activation timeline" testId="integrity-timeline">
      <div className="flex flex-col gap-3" data-testid="integrity-timeline-summary">
        <div className="flex flex-wrap items-center gap-2">
          <span
            data-testid="integrity-stability-badge"
            aria-label={`Kill-switch stability: ${theme.label}. ${report.headline}`}
            className={cn(
              "rounded-sm border px-2 py-0.5 text-[10px] uppercase tracking-section",
              theme.chip,
            )}
          >
            {theme.label}
          </span>
          <span className="text-[11px] text-console-muted">{report.headline}</span>
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
          <p className="text-[11px] italic text-console-faint">
            Kill switch never engaged — no activations recorded.
          </p>
        )}
      </div>

      <p className="mt-3 border-t border-console-edge pt-3 text-[10px] text-console-faint">
        Engage / restore the kill switch from the operator console's{" "}
        <Link href="/console" className="text-sky-300 hover:text-sky-200">
          Control
        </Link>{" "}
        surface. This replica is read-only.
      </p>
    </Panel>
  );
}

function Stat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-sm border border-console-edge/50 px-2 py-1">
      <dt className="text-[10px] uppercase tracking-section text-console-faint">
        {label}
      </dt>
      <dd className="tabular-nums text-console-ink">{value}</dd>
    </div>
  );
}
