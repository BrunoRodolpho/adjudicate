/**
 * Public configuration-integrity transparency projection (ADR-131, dual-app
 * strategy).
 *
 * `apps/web` is a PUBLIC, unauthenticated surface. Configuration integrity is
 * the MOST sensitive of the governance surfaces to publish: the operator console
 * shows per-pack digests, seal `errors[]`, signature detail, and kill-switch
 * `reason`/`actor`/`headline` — every one of which aids an attacker (digest =
 * config fingerprint; reasons/actors = incident narrative + operator identity;
 * headline embeds trip counts + engaged-seconds).
 *
 * `projectIntegrityTransparency` is therefore an AGGREGATE-ONLY projection. It
 * reads only the per-pack `verified` boolean (collapsing it to two counts) and
 * the single closed `killSwitchStability` class. It NEVER reads — and the output
 * type cannot carry — a digest, a reason, an actor, a headline, a pack version,
 * seal errors, or a signature value. This is the load-bearing safety property of
 * the public integrity badge.
 */

import type {
  ConfigIntegrityTransparencySample,
  KillSwitchStabilityClass,
} from "./transparency-fixtures";

/**
 * The public, sanitized integrity badge payload. This is the COMPLETE shape that
 * reaches the public page — an explicit allowlist of aggregates. No raw digest,
 * reason, actor, headline, per-pack detail, or signature ever appears here.
 */
export interface PublicIntegrityBadge {
  /** True only when every sealed pack verifies (`packsSealed === packsTotal`). */
  readonly allSealsVerified: boolean;
  /** Number of packs whose seal verifies. */
  readonly packsSealed: number;
  /** Total number of packs with a seal report. */
  readonly packsTotal: number;
  /** Closed-enum kill-switch stability class — no headline, counts, or detail. */
  readonly killSwitchStability: KillSwitchStabilityClass;
  /** Caller-supplied freshness stamp (the only wall-clock read, in app code). */
  readonly asOf: string;
}

/**
 * Project an illustrative integrity sample into its public, aggregate-only form.
 * Pure and deterministic over `(sample, asOf)`; no clock/RNG/I/O — `asOf` is
 * supplied by the caller so the function itself stays clock-free and testable.
 */
export function projectIntegrityTransparency(
  sample: ConfigIntegrityTransparencySample,
  asOf: string,
): PublicIntegrityBadge {
  const packsTotal = sample.seals.length;
  const packsSealed = sample.seals.filter((s) => s.verified).length;
  return {
    allSealsVerified: packsTotal > 0 && packsSealed === packsTotal,
    packsSealed,
    packsTotal,
    killSwitchStability: sample.killSwitchStability,
    asOf,
  };
}
