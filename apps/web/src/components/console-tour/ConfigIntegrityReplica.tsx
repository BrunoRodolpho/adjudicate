"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ConsoleChrome } from "@/components/console-kit/chrome/ConsoleChrome";
import { ChartReveal } from "./ChartReveal";
import { TimelineChart } from "@/components/console-kit/charts/TimelineChart";
import type { Band } from "@/components/console-kit/charts/types";
import { SR_ONLY } from "@/components/console-kit/charts/BarDistribution";
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
 * ConfigIntegrityReplica — a faithful replica of the operator console's
 * Configuration Integrity surface (ADR-131), mirroring
 * apps/console/src/app/integrity/page.tsx.
 *
 * CLIENT component. Interactivity is local React state over the committed
 * {@link INTEGRITY_REPLICA_FIXTURE} ONLY — no clock, RNG, network, or admin/DB
 * access; every value is a fixed literal so the surface renders
 * deterministically. It renders inside {@link ConsoleChrome} (the reviewed
 * honesty boundary — the standing "Illustrative replica · sample data" label is
 * non-removable) over the same panels as the real console:
 *
 *   A. Active seals  — a SELECTABLE per-pack table: pack, seal status
 *                      (verified/drift), truncated computed digest, signature
 *                      disposition. Each row is an `aria-selected` button-cell,
 *                      keyboard-operable. Selecting a row drives panel B.
 *   B. Selected seal detail — the chosen seal's structured violations (digest
 *                      mismatch / signature failed / …) with the
 *                      kill.SEAL_MISMATCH audit-linkage chip, or a verified
 *                      confirmation when the seal has no violations. DEFAULTS to
 *                      the drifting / violating seal.
 *   C. Kill switch   — the activation-timeline stability band + roll-up tiles +
 *                      a {@link TimelineChart} of activations-by-source, tinted by
 *                      the stability band.
 *
 * All hashes are placeholders and all signatures are illustrative labels (never
 * real digests or key material). apps/web reads no DATABASE_URL/REDIS_URL/admin
 * token and fetches no /api/admin or SSE. Engage/restore controls live on the
 * real operator console only; this replica is read-only.
 */

const VIOLATION_KIND_LABEL: Record<string, string> = {
  digest_mismatch: "Digest mismatch",
  signature_failed: "Signature failed",
  signature_missing: "Signature missing",
  policy_error: "Policy error",
};

/**
 * Plain-language impact of each violation kind, surfaced as the badge's
 * accessible label + tooltip so the "why it matters" lands without operator
 * jargon (AUDIT a11y/content).
 */
const VIOLATION_KIND_IMPACT: Record<string, string> = {
  digest_mismatch:
    "Digest mismatch: the seal no longer matches the pack's content — the configuration changed since it was sealed.",
  signature_failed:
    "Signature failed: the seal's signature did not verify — its authenticity can't be trusted.",
  signature_missing:
    "Signature missing: the seal carries no signature, so its origin can't be attested.",
  policy_error:
    "Policy error: the sealed policy failed to load or evaluate cleanly.",
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

  // Default the selection to the drifting / violating seal so the detail panel
  // opens on the instructive case. Derived deterministically from the fixture:
  // prefer a pack that has violations, else the first drifting seal, else row 0.
  const defaultPackId = useMemo(() => {
    const violating = seals.find((s) =>
      violations.some((v) => v.packId === s.packId),
    );
    if (violating) return violating.packId;
    const drifting = seals.find((s) => s.status === "drift");
    return (drifting ?? seals[0])?.packId;
  }, [seals, violations]);

  const [selectedPackId, setSelectedPackId] = useState<string | undefined>(
    defaultPackId,
  );

  const selectedSeal =
    seals.find((s) => s.packId === selectedPackId) ?? seals[0];
  const selectedViolation = selectedSeal
    ? violations.find((v) => v.packId === selectedSeal.packId)
    : undefined;

  return (
    <ConsoleChrome caption="integrity · localhost:5180" className={className}>
      <div className="flex flex-col gap-4" data-testid="integrity-replica">
        <header className="flex items-baseline justify-between border-b border-console-edge pb-3">
          <h2 className="text-[10px] uppercase tracking-section text-console-muted">
            Configuration Integrity · seals · violations · kill-switch stability
          </h2>
          <span className="text-[10px] text-console-muted">ADR-131</span>
        </header>

        <ActiveSealsPanel
          seals={seals}
          selectedPackId={selectedSeal?.packId}
          onSelect={setSelectedPackId}
          hasViolations={(packId) =>
            violations.some((v) => v.packId === packId)
          }
        />
        <SelectedSealPanel seal={selectedSeal} violation={selectedViolation} />
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
      <header className="border-b border-console-edge px-3 py-1.5 text-[10px] uppercase tracking-section text-console-muted">
        {title}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

/**
 * Selectable active-seals table. Each row's leading cell is a `<button>` that
 * selects the seal; the row carries `aria-selected`, so the selection state is
 * keyboard-operable and announced. Table a11y semantics are preserved (caption,
 * `scope="col"` headers, `scope="row"` leading cell).
 */
function ActiveSealsPanel({
  seals,
  selectedPackId,
  onSelect,
  hasViolations,
}: {
  readonly seals: readonly IntegritySealReplicaRow[];
  readonly selectedPackId?: string;
  onSelect(packId: string): void;
  hasViolations(packId: string): boolean;
}) {
  return (
    <Panel title="Active seals" testId="integrity-seals">
      <ChartReveal className="overflow-auto rounded-sm border border-console-edge bg-console-panel/40">
        <table className="w-full border-collapse text-[11px]">
          <caption className={SR_ONLY}>
            Per-pack configuration-seal verification status — select a row to see
            its detail.
          </caption>
          <thead>
            <tr className="border-b border-console-edge">
              <Th>Pack</Th>
              <Th>Status</Th>
              <Th>Digest</Th>
              <Th>Signature</Th>
            </tr>
          </thead>
          <tbody>
            {seals.map((e) => {
              const selected = e.packId === selectedPackId;
              const flagged = hasViolations(e.packId);
              return (
                <tr
                  key={e.packId}
                  aria-selected={selected}
                  data-pack={e.packId}
                  data-selected={selected || undefined}
                  className={cn(
                    "border-b border-console-edge/50 last:border-0 transition-colors",
                    selected
                      ? "bg-emerald-500/5"
                      : "hover:bg-console-edge/30",
                  )}
                >
                  <th
                    scope="row"
                    className="p-0 text-left font-normal align-top"
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(e.packId)}
                      aria-pressed={selected}
                      className={cn(
                        "flex w-full items-center gap-1.5 px-3 py-1.5 text-left transition-colors",
                        "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-400/60",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "inline-block h-3 w-0.5 shrink-0 rounded-sm",
                          selected ? "bg-emerald-400" : "bg-transparent",
                        )}
                      />
                      <span className="font-medium text-console-ink">
                        {e.packId}
                        <span className="text-console-muted">
                          @{e.packVersion}
                        </span>
                      </span>
                      {flagged ? (
                        <span
                          className="rounded-sm border border-red-400/40 px-1 py-0.5 text-[9px] uppercase tracking-section text-red-300"
                          aria-label="has violations"
                        >
                          !
                        </span>
                      ) : null}
                    </button>
                  </th>
                  <td className="px-3 py-1.5 align-top">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1",
                        e.status === "verified"
                          ? "text-emerald-300"
                          : "text-red-300",
                      )}
                    >
                      <span aria-hidden="true">
                        {e.status === "verified" ? "✓" : "✗"}
                      </span>
                      {e.status === "verified" ? "Sealed" : "Drift"}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 align-top">
                    <code
                      className="font-mono text-console-muted"
                      title={e.computedDigest}
                    >
                      {truncateHash(e.computedDigest)}
                    </code>
                  </td>
                  <td className="px-3 py-1.5 align-top text-console-muted">
                    {e.signature}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ChartReveal>
    </Panel>
  );
}

/**
 * Detail panel for the SELECTED seal. Shows its structured violations (with the
 * kill.SEAL_MISMATCH linkage chip) when present, else a verified confirmation.
 */
function SelectedSealPanel({
  seal,
  violation,
}: {
  readonly seal: IntegritySealReplicaRow | undefined;
  readonly violation: IntegrityViolationGroup | undefined;
}) {
  if (!seal) {
    return (
      <Panel title="Selected seal" testId="integrity-detail">
        <p className="text-[11px] italic text-console-muted">
          No seal selected.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title={`Selected seal · ${seal.packId}@${seal.packVersion}`}
      testId="integrity-detail"
    >
      <div className="flex flex-col gap-3" data-pack={seal.packId}>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] sm:grid-cols-3">
          <Stat
            label="Status"
            value={seal.status === "verified" ? "Sealed" : "Drift"}
            tone={seal.status === "verified" ? "ok" : "crit"}
          />
          <Stat label="Signature" value={seal.signature} />
          <Stat label="Digest" value={truncateHash(seal.computedDigest)} mono />
        </dl>

        {violation && violation.violations.length > 0 ? (
          <div
            className="rounded-sm bg-console-canvas/60 px-2.5 py-2 text-[11px]"
            data-testid="integrity-violations-list"
          >
            <span className="text-[10px] uppercase tracking-section text-console-muted">
              Violations
            </span>
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {violation.violations.map((v, i) => (
                <li key={`${v.kind}:${i}`} className="flex flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span
                      className="rounded-sm border border-red-400/40 px-1.5 py-0.5 text-[10px] uppercase tracking-section text-red-300"
                      title={VIOLATION_KIND_IMPACT[v.kind]}
                      aria-label={
                        VIOLATION_KIND_IMPACT[v.kind] ??
                        VIOLATION_KIND_LABEL[v.kind] ??
                        v.kind
                      }
                    >
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
          </div>
        ) : (
          <p
            className="text-[11px] text-emerald-300"
            data-testid="integrity-violations-empty"
          >
            No integrity violations — this pack verifies.
          </p>
        )}
      </div>
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
          <ChartReveal>
            <TimelineChart
              title="Activations by source"
              points={points}
              band={theme.band}
              yFormat={(n) => n.toLocaleString()}
            />
          </ChartReveal>
        ) : (
          <p className="text-[11px] italic text-console-muted">
            Kill switch never engaged — no activations recorded.
          </p>
        )}
      </div>

      <p className="mt-3 border-t border-console-edge pt-3 text-[10px] text-console-muted">
        Engage / restore the kill switch from the operator console's{" "}
        <Link href="/console" className="text-sky-300 hover:text-sky-200">
          Control
        </Link>{" "}
        surface. This replica is read-only.
      </p>
    </Panel>
  );
}

/** Faint uppercase column header cell. */
function Th({ children }: { readonly children: ReactNode }) {
  return (
    <th
      scope="col"
      className="px-3 py-1.5 text-left text-[10px] font-normal uppercase tracking-section text-console-muted"
    >
      {children}
    </th>
  );
}

function Stat({
  label,
  value,
  tone,
  mono = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly tone?: "ok" | "crit";
  readonly mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 py-0.5">
      <dt className="text-[10px] uppercase tracking-section text-console-muted">
        {label}
      </dt>
      <dd
        className={cn(
          "tabular-nums",
          mono && "font-mono",
          tone === "ok"
            ? "text-emerald-300"
            : tone === "crit"
              ? "text-red-300"
              : "text-console-ink",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
