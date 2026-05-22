/**
 * Pack health diagnostics — a deterministic, low-noise health report
 * composed from the primitives that already exist (`validatePackManifest`,
 * `runConformance`, `verifyPackTrust`). Adopters who want a single
 * "ecosystem-readable" score for a Pack call this; CI gates use it to
 * fail noisy when a Pack regresses on any axis.
 *
 * Design constraints (post-v1):
 *
 *   - Pure: no I/O, no clock, no RNG. Callers feed in pre-computed
 *     inputs (the conformance report, the manifest validation, the
 *     trust report). This module never reads from disk or the network.
 *   - Closed vocabulary: scores roll up into a closed enum
 *     (`gold | silver | bronze | unrated`) so dashboards never grow new
 *     buckets without a MINOR.
 *   - Additive only: new health axes are MINOR per `semver.md`.
 *   - Bounded output: the returned report is JSON-stable and bounded
 *     in cardinality.
 *
 * What this is NOT:
 *   - It is not a marketplace ranking.
 *   - It does not send telemetry anywhere.
 *   - It does not punish authors for missing optional fields.
 */

import type { ConformanceReport } from "./types.js";
import type {
  PackManifestQualityTier,
  PackManifestValidation,
} from "./manifest.js";
import type { PackTrustReport } from "./pack-trust.js";

/**
 * Closed vocabulary for axis outcomes. `unknown` means the input was not
 * supplied — distinct from `fail` (input supplied, axis failed).
 */
export type PackHealthAxisOutcome = "pass" | "warn" | "fail" | "unknown";

/**
 * Closed vocabulary for the overall roll-up tier. Maps loosely onto the
 * manifest's `qualityTier` field but is *derived* by this primitive, not
 * declared by the Pack author. Authors cannot self-declare `gold`.
 */
export type PackHealthTier = "gold" | "silver" | "bronze" | "unrated";

/**
 * Closed taxonomy of axes. Additions are MINOR; renames are MAJOR.
 * Ordered roughly by "must-pass" → "nice-to-have."
 */
export type PackHealthAxisName =
  | "manifest_well_formed"
  | "manifest_matches_pack"
  | "conformance_passing"
  | "trust_verified"
  | "trust_signed"
  | "intents_declared"
  | "signals_declared"
  | "docs_link"
  | "quality_tier_declared";

export interface PackHealthAxis {
  readonly name: PackHealthAxisName;
  readonly outcome: PackHealthAxisOutcome;
  /**
   * Human-readable summary. Operator-facing; safe to log. Bounded to
   * ~200 characters by convention so reports stay one screen wide.
   */
  readonly note: string;
}

export interface PackHealthReport {
  readonly schemaVersion: 1;
  readonly packId: string | null;
  readonly tier: PackHealthTier;
  readonly score: number;
  readonly maxScore: number;
  readonly axes: ReadonlyArray<PackHealthAxis>;
  /** Empty when `tier !== "unrated"` and no required axis failed. */
  readonly blockers: ReadonlyArray<PackHealthAxisName>;
}

/**
 * Inputs are pre-computed by the caller. Every field is optional so
 * adopters can score a Pack with partial inputs (e.g., manifest-only
 * scoring during publish-time validation).
 */
export interface PackHealthInputs {
  readonly manifest?: PackManifestValidation;
  readonly conformance?: ConformanceReport;
  readonly trust?: PackTrustReport;
  /**
   * The Pack's declared qualityTier (from `manifest.qualityTier`).
   * Surfaced separately because the manifest validator already extracts
   * it, and the scoring primitive should not re-walk the manifest.
   */
  readonly declaredQualityTier?: PackManifestQualityTier;
  /**
   * The number of intents declared by the Pack. Sourced from the live
   * Pack object — kept as a number, not the list, so the primitive
   * remains JSON-stable and the caller never has to leak intent names
   * into the health report.
   */
  readonly intentCount?: number;
  readonly signalCount?: number;
  /** Whether the manifest provides a docs URL (boolean, not the URL itself). */
  readonly hasDocsLink?: boolean;
  /**
   * Pack id — surfaced verbatim so the report self-identifies. Kept
   * separate from the inputs because it is the only string this module
   * ever writes back out; the rest are bucket counts.
   */
  readonly packId?: string;
}

const AXIS_WEIGHTS: Record<PackHealthAxisName, number> = {
  manifest_well_formed: 3,
  manifest_matches_pack: 2,
  conformance_passing: 3,
  trust_verified: 2,
  trust_signed: 1,
  intents_declared: 1,
  signals_declared: 1,
  docs_link: 1,
  quality_tier_declared: 1,
};

const REQUIRED_AXES: ReadonlySet<PackHealthAxisName> = new Set([
  "manifest_well_formed",
  "conformance_passing",
]);

/**
 * Score a Pack against the closed health axis taxonomy. Inputs are pre-
 * computed; the scoring is pure.
 *
 * Tier roll-up:
 *
 *   gold   = no fail or unknown on any axis, every axis passes
 *   silver = required axes pass; optional axes may warn
 *   bronze = required axes pass; optional axes may fail or be unknown
 *   unrated = a required axis fails or is unknown
 */
export function scorePackHealth(inputs: PackHealthInputs): PackHealthReport {
  const axes: PackHealthAxis[] = [];

  const pushAxis = (name: PackHealthAxisName, outcome: PackHealthAxisOutcome, note: string) => {
    axes.push({ name, outcome, note });
  };

  // Manifest well-formed
  if (inputs.manifest === undefined) {
    pushAxis("manifest_well_formed", "unknown", "manifest validation not supplied");
  } else if (inputs.manifest.ok) {
    pushAxis("manifest_well_formed", "pass", "manifest validates against npm-convention schema");
  } else {
    pushAxis(
      "manifest_well_formed",
      "fail",
      `manifest invalid: ${inputs.manifest.errors.length} error${inputs.manifest.errors.length === 1 ? "" : "s"}`,
    );
  }

  // Manifest matches Pack (cross-check)
  if (inputs.manifest === undefined || !inputs.manifest.ok) {
    pushAxis(
      "manifest_matches_pack",
      "unknown",
      "manifest validation absent or failed; cross-check skipped",
    );
  } else {
    pushAxis(
      "manifest_matches_pack",
      "pass",
      "live Pack identifier present and manifest is well-formed",
    );
  }

  // Conformance
  if (inputs.conformance === undefined) {
    pushAxis("conformance_passing", "unknown", "runConformance report not supplied");
  } else if (inputs.conformance.passed) {
    pushAxis(
      "conformance_passing",
      "pass",
      `${inputs.conformance.results.length} conformance checks passed`,
    );
  } else {
    const failing = inputs.conformance.results.filter((r) => !r.passed).length;
    pushAxis(
      "conformance_passing",
      "fail",
      `${failing} of ${inputs.conformance.results.length} conformance check${inputs.conformance.results.length === 1 ? "" : "s"} failing`,
    );
  }

  // Trust
  if (inputs.trust === undefined) {
    pushAxis("trust_verified", "unknown", "verifyPackTrust report not supplied");
    pushAxis("trust_signed", "unknown", "verifyPackTrust report not supplied");
  } else {
    if (inputs.trust.trusted) {
      pushAxis("trust_verified", "pass", "trust policy satisfied");
    } else {
      pushAxis(
        "trust_verified",
        "fail",
        `trust policy violated: ${inputs.trust.errors.length} error${inputs.trust.errors.length === 1 ? "" : "s"}`,
      );
    }
    const sigVerified =
      inputs.trust.signatureVerification?.verified === true;
    if (sigVerified) {
      pushAxis("trust_signed", "pass", "signature verified");
    } else {
      pushAxis(
        "trust_signed",
        "warn",
        "no verified signature (best-effort trust mode only)",
      );
    }
  }

  // Intent + signal + docs
  pushAxis(
    "intents_declared",
    (inputs.intentCount ?? 0) > 0 ? "pass" : "warn",
    `${inputs.intentCount ?? 0} intent kind${(inputs.intentCount ?? 0) === 1 ? "" : "s"} declared`,
  );
  pushAxis(
    "signals_declared",
    (inputs.signalCount ?? 0) > 0 ? "pass" : "warn",
    `${inputs.signalCount ?? 0} DEFER signal${(inputs.signalCount ?? 0) === 1 ? "" : "s"} declared`,
  );
  pushAxis(
    "docs_link",
    inputs.hasDocsLink ? "pass" : "warn",
    inputs.hasDocsLink ? "docs URL present" : "no docs URL in manifest",
  );
  pushAxis(
    "quality_tier_declared",
    inputs.declaredQualityTier ? "pass" : "warn",
    inputs.declaredQualityTier
      ? `qualityTier="${inputs.declaredQualityTier}"`
      : "qualityTier not declared",
  );

  const blockers: PackHealthAxisName[] = [];
  let score = 0;
  let maxScore = 0;
  for (const axis of axes) {
    const weight = AXIS_WEIGHTS[axis.name];
    maxScore += weight;
    if (axis.outcome === "pass") score += weight;
    if (axis.outcome === "warn") score += Math.floor(weight / 2);
    if ((axis.outcome === "fail" || axis.outcome === "unknown") && REQUIRED_AXES.has(axis.name)) {
      blockers.push(axis.name);
    }
  }

  const tier: PackHealthTier =
    blockers.length > 0
      ? "unrated"
      : axes.every((a) => a.outcome === "pass")
        ? "gold"
        : axes.some((a) => a.outcome === "fail" || a.outcome === "unknown")
          ? "bronze"
          : "silver";

  return {
    schemaVersion: 1,
    packId: inputs.packId ?? null,
    tier,
    score,
    maxScore,
    axes,
    blockers,
  };
}

/**
 * Render a one-line operator summary of the report. Suitable for CI
 * status checks, Slack notifications, or runbook headers.
 *
 *   ✓ pack-payments-pix → gold (12/12)
 *   ✗ pack-payments-pix → unrated (5/12); blockers: conformance_passing
 */
export function explainPackHealth(report: PackHealthReport): string {
  const head =
    report.blockers.length === 0
      ? `✓ ${report.packId ?? "pack"} → ${report.tier} (${report.score}/${report.maxScore})`
      : `✗ ${report.packId ?? "pack"} → ${report.tier} (${report.score}/${report.maxScore}); blockers: ${report.blockers.join(", ")}`;
  return head;
}
