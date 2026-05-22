/**
 * Operational survivability snapshots — deterministic, portable,
 * archival-safe exports of operational state.
 *
 * Purpose: give an operator (or future investigator) a single JSON blob
 * that captures the *operational reality* of an adjudicate deployment at
 * a point in time. The blob is consumed by triage, handoff, and
 * post-incident forensics. It is also the format archived for long-term
 * operational continuity.
 *
 * Three snapshot kinds:
 *
 *   - `OperationalSnapshot` — point-in-time deployment state. Combines
 *     the kill-switch summary, replay-drift trend, supersession-chain
 *     report, and audit-sink health metrics. Loadable offline.
 *
 *   - `IncidentBundle` — a window of audit records plus the
 *     replay-with-integrity report and the operational snapshot at
 *     incident start. Sufficient to reproduce an incident on a triage
 *     machine.
 *
 *   - `OperatorHandoff` — the dump an outgoing operator gives an
 *     incoming operator. Combines the operational snapshot with the
 *     deployment configuration and contact information.
 *
 * Determinism: every function in this module is pure. Snapshots build
 * from caller-supplied inputs; no clock, no RNG, no I/O. The same
 * inputs produce the same output bytes. This is the property that
 * makes the bundles diffable, archivable, and replayable.
 *
 * Portability: snapshots are plain JSON with no class instances, no
 * Date objects, no Symbols. They round-trip cleanly through
 * `JSON.stringify` / `JSON.parse`.
 *
 * Low-dependency: this module imports only from `@adjudicate/core` and
 * its sibling modules in `@adjudicate/audit`. No external runtime
 * dependency.
 */

import type { AuditRecord } from "@adjudicate/core";
import { sha256Canonical } from "@adjudicate/core";
import type { ReplayIntegrityReport } from "./replay-integrity.js";
import type { ReplayDriftReport } from "./replay-drift.js";
import type { SupersessionChainReport } from "./supersession-chain.js";
import type { KillSwitchTimelineReport } from "./kill-switch-timeline.js";

// ─── Closed vocabulary ─────────────────────────────────────────────────────

export type SnapshotSchemaVersion = 1;
export const OPERATIONAL_SNAPSHOT_SCHEMA_VERSION: SnapshotSchemaVersion = 1;

export type SinkHealthStatus = "healthy" | "degraded" | "failing" | "unknown";

export type DeploymentMode = "single_replica" | "multi_replica" | "unknown";

// ─── Sink health summary (caller-supplied) ────────────────────────────────

export interface SinkHealthSummary {
  readonly status: SinkHealthStatus;
  /** Records emitted in the observation window. */
  readonly emitted: number;
  /** Records that failed to emit (after retries). */
  readonly failed: number;
  /** Records currently in the spill buffer (persistent-buffered-sink). */
  readonly spillDepth: number;
  /** Caller-supplied note (e.g., the underlying sink kind). */
  readonly note?: string;
}

// ─── Ledger stats (caller-supplied) ──────────────────────────────────────

export interface LedgerStatsSummary {
  /** Lookups that found a fresh slot (decision proceeded). */
  readonly fresh: number;
  /** Lookups that hit an existing record (replay suppressed). */
  readonly hit: number;
  /** Lookups that failed (transport error). */
  readonly errors: number;
  /** Hit rate (`hit / (fresh + hit + errors)`), pre-computed for the report. */
  readonly hitRate: number;
}

// ─── Kill-switch state ───────────────────────────────────────────────────

export interface KillSwitchSnapshot {
  /** Current state at snapshot time. */
  readonly state: "active" | "normal";
  /** ISO timestamp of the last transition (caller-supplied). */
  readonly lastTransitionAt?: string;
  /** Timeline analyser report. */
  readonly timeline: KillSwitchTimelineReport;
}

// ─── Deployment identity ─────────────────────────────────────────────────

export interface DeploymentIdentity {
  /** Caller-supplied opaque deployment id (e.g., cluster name + region). */
  readonly id: string;
  /** Kernel version in production (e.g., "1.0.0"). */
  readonly kernelVersion: string;
  /** Adopter-supplied environment label (e.g., "prod" / "staging"). */
  readonly environment: string;
  /** Multi- vs single-replica. */
  readonly mode: DeploymentMode;
  /** Replica count at snapshot time. */
  readonly replicaCount: number;
}

// ─── Replay machinery state ──────────────────────────────────────────────

export interface ReplaySnapshot {
  readonly drift: ReplayDriftReport;
  readonly integrity: ReplayIntegrityReport;
  readonly supersession: SupersessionChainReport;
}

// ─── OperationalSnapshot ─────────────────────────────────────────────────

export interface OperationalSnapshot {
  readonly schemaVersion: SnapshotSchemaVersion;
  /** ISO timestamp the snapshot was built (caller-supplied). */
  readonly at: string;
  readonly deployment: DeploymentIdentity;
  readonly sink: SinkHealthSummary;
  readonly ledger: LedgerStatsSummary;
  readonly killSwitch: KillSwitchSnapshot;
  readonly replay: ReplaySnapshot;
  /**
   * Deterministic hash over the canonical-JSON of the snapshot body
   * (every field above `digest`). Lets archivers detect tampering of
   * an archived snapshot without re-computing every nested field.
   */
  readonly digest: string;
}

export interface BuildOperationalSnapshotInput {
  readonly at: string;
  readonly deployment: DeploymentIdentity;
  readonly sink: SinkHealthSummary;
  readonly ledger: LedgerStatsSummary;
  readonly killSwitch: KillSwitchSnapshot;
  readonly replay: ReplaySnapshot;
}

/**
 * Build a deterministic operational snapshot.
 *
 * The result is a plain JSON value. Its `digest` field is the sha256
 * over the canonical-JSON of the rest of the snapshot. Re-running this
 * function on the same input produces byte-identical output.
 */
export function buildOperationalSnapshot(
  input: BuildOperationalSnapshotInput,
): OperationalSnapshot {
  const body = {
    schemaVersion: OPERATIONAL_SNAPSHOT_SCHEMA_VERSION,
    at: input.at,
    deployment: input.deployment,
    sink: input.sink,
    ledger: input.ledger,
    killSwitch: input.killSwitch,
    replay: input.replay,
  } as const;
  const digest = sha256Canonical(body);
  return { ...body, digest };
}

/**
 * Re-derive the digest from the snapshot body and confirm it matches
 * `snapshot.digest`. Returns true if intact, false if the snapshot was
 * mutated after construction.
 */
export function verifyOperationalSnapshot(
  snapshot: OperationalSnapshot,
): boolean {
  const body = {
    schemaVersion: snapshot.schemaVersion,
    at: snapshot.at,
    deployment: snapshot.deployment,
    sink: snapshot.sink,
    ledger: snapshot.ledger,
    killSwitch: snapshot.killSwitch,
    replay: snapshot.replay,
  } as const;
  return sha256Canonical(body) === snapshot.digest;
}

// ─── IncidentBundle ──────────────────────────────────────────────────────

export interface IncidentBundle {
  readonly schemaVersion: SnapshotSchemaVersion;
  /** Incident id — caller-supplied (e.g., "INC-2026-05-21-001"). */
  readonly incidentId: string;
  /** ISO timestamp of incident start (caller-supplied). */
  readonly startedAt: string;
  /** ISO timestamp of incident end (or "ongoing" sentinel). */
  readonly endedAt: string | "ongoing";
  /** Operator-supplied summary. */
  readonly headline: string;
  /** Operational snapshot captured at incident start. */
  readonly snapshotAtStart: OperationalSnapshot;
  /** Audit records in the incident window. */
  readonly records: readonly AuditRecord[];
  /** Replay-with-integrity report over `records`. */
  readonly integrity: ReplayIntegrityReport;
  /** Digest over the bundle body. */
  readonly digest: string;
}

export interface BuildIncidentBundleInput {
  readonly incidentId: string;
  readonly startedAt: string;
  readonly endedAt: string | "ongoing";
  readonly headline: string;
  readonly snapshotAtStart: OperationalSnapshot;
  readonly records: readonly AuditRecord[];
  readonly integrity: ReplayIntegrityReport;
}

export function buildIncidentBundle(
  input: BuildIncidentBundleInput,
): IncidentBundle {
  const body = {
    schemaVersion: OPERATIONAL_SNAPSHOT_SCHEMA_VERSION,
    incidentId: input.incidentId,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    headline: input.headline,
    snapshotAtStart: input.snapshotAtStart,
    records: input.records,
    integrity: input.integrity,
  } as const;
  const digest = sha256Canonical(body);
  return { ...body, digest };
}

export function verifyIncidentBundle(bundle: IncidentBundle): boolean {
  const body = {
    schemaVersion: bundle.schemaVersion,
    incidentId: bundle.incidentId,
    startedAt: bundle.startedAt,
    endedAt: bundle.endedAt,
    headline: bundle.headline,
    snapshotAtStart: bundle.snapshotAtStart,
    records: bundle.records,
    integrity: bundle.integrity,
  } as const;
  return sha256Canonical(body) === bundle.digest;
}

// ─── OperatorHandoff ─────────────────────────────────────────────────────

export interface DeploymentConfigSummary {
  /** The `verifyParkedHash` mode (`warn` | `strict` | `off`). */
  readonly verifyParkedHashMode: "warn" | "strict" | "off";
  /** The kill-switch pollMs (v2). */
  readonly killSwitchPollMs: number;
  /** Pack trust mode (per CLI's `pack verify`). */
  readonly packTrustMode: "none" | "best_effort" | "require_fingerprint" | "require_signature";
  /** Whether `replay-drift` daily job is deployed. */
  readonly replayDriftJobDeployed: boolean;
  /** Whether `AuditEventBus` fan-out is deployed. */
  readonly auditEventBusDeployed: boolean;
  /** Whether `audit-postgres` is the durable sink. */
  readonly durableSinkKind: "postgres" | "nats" | "buffered_inmemory" | "console_only" | "other";
}

export interface OperatorHandoff {
  readonly schemaVersion: SnapshotSchemaVersion;
  /** ISO timestamp of handoff. */
  readonly at: string;
  /** Outgoing operator identifier (e.g., name or team). */
  readonly outgoing: string;
  /** Incoming operator identifier. */
  readonly incoming: string;
  /** Operational snapshot. */
  readonly snapshot: OperationalSnapshot;
  /** Configuration summary. */
  readonly config: DeploymentConfigSummary;
  /** Open-issue summary (caller-supplied). */
  readonly openIssues: readonly string[];
  /** Pointers to runbooks/contacts (caller-supplied). */
  readonly references: readonly { readonly label: string; readonly value: string }[];
  /** Digest over the handoff body. */
  readonly digest: string;
}

export interface BuildOperatorHandoffInput {
  readonly at: string;
  readonly outgoing: string;
  readonly incoming: string;
  readonly snapshot: OperationalSnapshot;
  readonly config: DeploymentConfigSummary;
  readonly openIssues: readonly string[];
  readonly references: readonly { readonly label: string; readonly value: string }[];
}

export function buildOperatorHandoff(
  input: BuildOperatorHandoffInput,
): OperatorHandoff {
  const body = {
    schemaVersion: OPERATIONAL_SNAPSHOT_SCHEMA_VERSION,
    at: input.at,
    outgoing: input.outgoing,
    incoming: input.incoming,
    snapshot: input.snapshot,
    config: input.config,
    openIssues: input.openIssues,
    references: input.references,
  } as const;
  const digest = sha256Canonical(body);
  return { ...body, digest };
}

export function verifyOperatorHandoff(handoff: OperatorHandoff): boolean {
  const body = {
    schemaVersion: handoff.schemaVersion,
    at: handoff.at,
    outgoing: handoff.outgoing,
    incoming: handoff.incoming,
    snapshot: handoff.snapshot,
    config: handoff.config,
    openIssues: handoff.openIssues,
    references: handoff.references,
  } as const;
  return sha256Canonical(body) === handoff.digest;
}
