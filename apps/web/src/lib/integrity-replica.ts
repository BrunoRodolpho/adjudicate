/**
 * ILLUSTRATIVE operator-detail fixture for the /console/integrity replica
 * (ADR-131). NOT live production data.
 *
 * The PUBLIC transparency badge (`lib/integrity-transparency.ts`) is
 * aggregate-only by design: it carries just two seal counts + one closed
 * stability class, because the public surface must never publish digests,
 * signatures, reasons, actors, or kill-switch headlines.
 *
 * The /console/integrity REPLICA, by contrast, renders INSIDE the
 * {@link ConsoleChrome} honesty boundary — the standing "Illustrative replica ·
 * sample data" label makes it unmistakable that these are committed sample
 * fixtures, not a live operator surface. That lets the replica faithfully mirror
 * the *shape* of the real operator console (per-pack digest + signature + seal
 * status, structured violations, a kill-switch activation timeline with a
 * stability band) using values that are entirely synthetic.
 *
 * SECURITY / honesty invariants this fixture upholds:
 *   - Every value is a FIXED LITERAL. No `Date.now()`, no `Math.random()`, no
 *     env read, no clock. The replica renders byte-identically everywhere.
 *   - All hashes are illustrative 64-hex placeholders, not real config digests.
 *   - All signatures are short illustrative key-id labels, never real key
 *     material or signature bytes.
 *   - `apps/web` has no DATABASE_URL/REDIS_URL/admin token and fetches no
 *     /api/admin or SSE endpoint; this committed fixture is the only source.
 *
 * Shape mirrors apps/console/src/app/integrity/page.tsx: an active-seals table,
 * a seal-violations panel, and a kill-switch activation timeline (stability
 * class + roll-up counts + per-source buckets).
 */

/** Per-pack seal verification status — `verified` (sealed) or `drift`. */
export type SealStatus = "verified" | "drift";

/** Signature verification disposition for a seal report. */
export type SealSignatureStatus =
  | "verified"
  | "failed"
  | "not required"
  | "not supplied";

/** Closed-enum integrity violation kind — byte-equal to the console's set. */
export type SealViolationKind =
  | "digest_mismatch"
  | "signature_failed"
  | "signature_missing"
  | "policy_error";

/**
 * Closed-enum kill-switch stability class — byte-equal to
 * `KillSwitchStabilityClass` in transparency-fixtures.ts and the operator
 * console's `StabilityClass`.
 */
export type KillSwitchStability =
  | "stable"
  | "single_incident"
  | "recurring_incidents"
  | "storm";

/** One row in the active-seals table. */
export interface IntegritySealReplicaRow {
  readonly packId: string;
  readonly packVersion: string;
  readonly status: SealStatus;
  /** Illustrative 64-hex config digest (placeholder, never a real digest). */
  readonly computedDigest: string;
  readonly signature: SealSignatureStatus;
}

/** One structured integrity violation for a single pack. */
export interface IntegrityViolation {
  readonly kind: SealViolationKind;
  /** Human-readable, non-sensitive explanation. */
  readonly message: string;
  /** Set to "seal_mismatch" when this links to the kill.SEAL_MISMATCH basis. */
  readonly basisCode?: "seal_mismatch";
}

/** A pack that failed seal verification, with its violations. */
export interface IntegrityViolationGroup {
  readonly packId: string;
  readonly packVersion: string;
  readonly violations: readonly IntegrityViolation[];
}

/** Kill-switch activation roll-up — the deterministic timeline summary. */
export interface KillSwitchTimelineReplica {
  readonly stability: KillSwitchStability;
  /** One-line headline describing the activation posture. */
  readonly headline: string;
  readonly trips: number;
  readonly clears: number;
  readonly transitions: number;
  readonly maxTripDensity: number;
  /** Total milliseconds the kill switch was engaged across the window. */
  readonly activeDurationMs: number;
  readonly totalEvents: number;
  /** Activations grouped by source — the deterministic chart series. */
  readonly bySource: readonly { readonly source: string; readonly count: number }[];
}

/** Everything the /console/integrity replica renders, in one fixture. */
export interface IntegrityReplicaFixture {
  readonly seals: readonly IntegritySealReplicaRow[];
  readonly violations: readonly IntegrityViolationGroup[];
  readonly killSwitch: KillSwitchTimelineReplica;
}

/**
 * The committed illustrative integrity fixture. Posture is a deliberately
 * INSTRUCTIVE "mostly healthy with one drifting pack" snapshot: four packs seal
 * and verify, one pack (`pack-deployments-approval`) drifts — its computed
 * digest no longer matches the sealed digest — which feeds the violations panel
 * and a `single_incident` kill-switch stability band. This exercises every
 * branch of the replica (a drift row, a signature gap, a SEAL_MISMATCH linkage,
 * a non-trivial stability band) without advertising a crisis.
 */
export const INTEGRITY_REPLICA_FIXTURE: IntegrityReplicaFixture = {
  seals: [
    {
      packId: "pack-payments-pix",
      packVersion: "1.0.0",
      status: "verified",
      computedDigest: "a1" + "0".repeat(62),
      signature: "verified",
    },
    {
      packId: "pack-identity-kyc",
      packVersion: "2.1.0",
      status: "verified",
      computedDigest: "b2" + "0".repeat(62),
      signature: "verified",
    },
    {
      packId: "pack-deployments-approval",
      packVersion: "1.4.2",
      status: "drift",
      computedDigest: "c3" + "0".repeat(62),
      signature: "failed",
    },
    {
      packId: "pack-incident-response",
      packVersion: "1.2.0",
      status: "verified",
      computedDigest: "d4" + "0".repeat(62),
      signature: "verified",
    },
    {
      packId: "pack-access-governance",
      packVersion: "3.0.1",
      status: "verified",
      computedDigest: "e5" + "0".repeat(62),
      signature: "not required",
    },
  ],
  violations: [
    {
      packId: "pack-deployments-approval",
      packVersion: "1.4.2",
      violations: [
        {
          kind: "digest_mismatch",
          message:
            "Computed configuration digest does not match the sealed digest — the installed config has changed since it was sealed.",
          basisCode: "seal_mismatch",
        },
        {
          kind: "signature_failed",
          message:
            "Seal signature did not verify against the trusted signing key.",
        },
      ],
    },
  ],
  killSwitch: {
    stability: "single_incident",
    headline:
      "One kill-switch incident in the window — a single seal-mismatch trip, since cleared.",
    trips: 1,
    clears: 1,
    transitions: 2,
    maxTripDensity: 1,
    activeDurationMs: 414_000,
    totalEvents: 4,
    bySource: [
      { source: "seal_mismatch", count: 1 },
      { source: "operator", count: 2 },
      { source: "policy", count: 1 },
    ],
  },
};

/**
 * Format a millisecond duration as a compact `Xm Ys` / `Xs` string. Pure and
 * deterministic; mirrors the console's `formatDurationMs` for the engaged-time
 * stat. No clock access.
 */
export function formatDurationMs(ms: number): string {
  if (ms <= 0) return "0s";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}
