/**
 * The REGISTRY-DIFF lint (Plan 1 Phase 4 / W6; inv.17 soundness-monotonicity) —
 * the mechanical guard that distinguishes an ADDITIVE catalog extension from a
 * RELAXATION. A registry/table change is SAFE (additive) only if it moves the
 * catalog toward MORE-restrictive (or is a pure addition that can only SHRINK what
 * renders); any change that LOOSENS a gate is a RELAXATION and must be rejected by
 * the build unless explicitly waived. This is the artifact the round-2 review named
 * as missing — without it, "additive extension" and "silent relaxation" are
 * indistinguishable.
 *
 * The safety DIRECTION is encoded PER FIELD (each `classify*` below). The lint
 * returns one `DiffFinding` per detected change, tagged `ADDITIVE` or `RELAXATION`;
 * `assertNoRelaxation` throws on any `RELAXATION` (the build failure).
 *
 * DISCLAIM (liveness-monotonicity): every hardening can only REDUCE what renders,
 * so there is deliberately NO check asserting that the renderable set does not
 * shrink. The lint guards SOUNDNESS-monotonicity (a change can only make the system
 * say LESS), never liveness. A removal is treated as a RELAXATION-class change
 * requiring a waiver (a dropped constraint is a catalog regression to review), even
 * though default-deny would render it safe — the conservative posture.
 *
 * PURE & self-contained — no clock/RNG/IO, no kernel-downstream import (SDD §R
 * kernel purity: `adjudicate → claustrum → ibatexas`, never backward).
 */

import type {
  ConsistencyConstraint,
  ConsistencyRelation,
} from "./consistency.js";
import type {
  EvidenceRequirement,
  FalsifierDeclaration,
  FreshnessPolicy,
} from "./evidence-requirement.js";
import { sourceIntegrityRank } from "./evidence-requirement.js";

// ─────────────────────────────────────────────────────────────────────────
// The classification + finding shape
// ─────────────────────────────────────────────────────────────────────────

/** A catalog change is either an ADDITIVE (safe) extension or a RELAXATION. */
export type DiffClassification = "ADDITIVE" | "RELAXATION";

/** One detected catalog change, classified with a legible, non-propositional detail. */
export interface DiffFinding {
  readonly kind: DiffClassification;
  readonly detail: string;
}

/**
 * Throw if ANY finding is a `RELAXATION` (the build failure; W6). The message
 * lists every relaxation so a catalog regression is legible. ADDITIVE findings
 * pass silently. Pure: deterministic over the findings.
 */
export function assertNoRelaxation(findings: readonly DiffFinding[]): void {
  const relaxations = findings.filter((f) => f.kind === "RELAXATION");
  if (relaxations.length > 0) {
    throw new Error(
      "registry-diff: RELAXATION detected (requires an explicit waiver) — " +
        relaxations.map((r) => r.detail).join("; "),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Consistency table diff
// ─────────────────────────────────────────────────────────────────────────

/** Canonical, order-independent key for an unordered type-pair (NUL separator). */
function pairKey(typeA: string, typeB: string): string {
  return typeA <= typeB ? `${typeA}\x00${typeB}` : `${typeB}\x00${typeA}`;
}

/**
 * Classify a CONSISTENCY-TABLE diff (W6). Safety direction:
 *   - Add a NEW pair → ADDITIVE iff `MUTUAL_EXCLUSION` (more-restrictive); adding
 *     it as `COMPATIBLE`/`IMPLICATION` newly PERMITS a co-render that was
 *     default-deny ESCALATE → RELAXATION.
 *   - Change an existing pair `MUTUAL_EXCLUSION → COMPATIBLE/IMPLICATION` →
 *     RELAXATION; the reverse (→ `MUTUAL_EXCLUSION`) → ADDITIVE.
 *   - REMOVE a pair → RELAXATION (a dropped constraint needs a waiver).
 * Pure.
 */
export function classifyConsistencyTableDiff(
  before: readonly ConsistencyConstraint[],
  after: readonly ConsistencyConstraint[],
): readonly DiffFinding[] {
  const findings: DiffFinding[] = [];
  const beforeByPair = new Map<string, ConsistencyRelation>();
  for (const c of before) beforeByPair.set(pairKey(c.typeA, c.typeB), c.relation);
  const afterByPair = new Map<string, ConsistencyRelation>();
  for (const c of after) afterByPair.set(pairKey(c.typeA, c.typeB), c.relation);

  const isPermissive = (r: ConsistencyRelation): boolean =>
    r === "COMPATIBLE" || r === "IMPLICATION";

  for (const [key, rel] of afterByPair) {
    const prior = beforeByPair.get(key);
    if (prior === undefined) {
      // New pair: additive only if it is the restrictive MUTUAL_EXCLUSION.
      findings.push(
        rel === "MUTUAL_EXCLUSION"
          ? { kind: "ADDITIVE", detail: `added MUTUAL_EXCLUSION pair {${key}}` }
          : {
              kind: "RELAXATION",
              detail: `added permissive ${rel} pair {${key}} (was default-deny ESCALATE)`,
            },
      );
      continue;
    }
    if (prior === rel) continue;
    // Changed relation: MUTUAL_EXCLUSION → permissive is a relaxation.
    if (prior === "MUTUAL_EXCLUSION" && isPermissive(rel)) {
      findings.push({
        kind: "RELAXATION",
        detail: `pair {${key}} changed MUTUAL_EXCLUSION → ${rel}`,
      });
    } else {
      findings.push({
        kind: "ADDITIVE",
        detail: `pair {${key}} changed ${prior} → ${rel}`,
      });
    }
  }

  for (const key of beforeByPair.keys()) {
    if (!afterByPair.has(key)) {
      findings.push({
        kind: "RELAXATION",
        detail: `removed constraint pair {${key}}`,
      });
    }
  }

  return findings;
}

// ─────────────────────────────────────────────────────────────────────────
// EvidenceRequirement diff (per key — before/after of the SAME requirement)
// ─────────────────────────────────────────────────────────────────────────

/** Strictness rank of a freshness policy (higher = tighter). action_outcome ≈ live. */
function freshnessRank(p: FreshnessPolicy): number {
  if (p === "static") return 0;
  if (typeof p === "object" && p.kind === "cacheable") return 1;
  if (p === "must_read_this_turn") return 2;
  return 2; // action_outcome — as strict as must_read_this_turn (not a stale axis).
}

/**
 * The cacheable ttl — a finite-number WINDOW or the symbolic `"reindex_bound"` — else
 * undefined (the policy is not cacheable). Returns the RAW ttl (NOT numeric-only) so a
 * change to/from the symbolic `reindex_bound` stays VISIBLE to the diff and is never
 * silently dropped (F5).
 */
function cacheableTtl(p: FreshnessPolicy): number | "reindex_bound" | undefined {
  return typeof p === "object" && p.kind === "cacheable" ? p.ttl : undefined;
}

/**
 * Classify an EVIDENCE-REQUIREMENT diff (W6) for ONE requirement (same key).
 * Safety direction (each may only TIGHTEN):
 *   - `minSourceIntegrity` (read via `sourceIntegrityRank`) may only RISE.
 *   - `ownershipPolicy` may only go `not_applicable → required`.
 *   - freshness may only tighten (`static → cacheable → must_read_this_turn`);
 *     a `cacheable` ttl may only SHRINK.
 *   - `provenancePolicy` may only go `preserve → first_party_only`.
 * Any loosening → `RELAXATION`. NOTE `sourceIntegrity` here is the requirement's
 * declared CHANNEL — compared as part of the C2 floor via the claim's
 * `minSourceIntegrity`; a requirement whose declared channel WEAKENS is flagged.
 * Pure.
 */
export function classifyEvidenceRequirementDiff(
  before: EvidenceRequirement,
  after: EvidenceRequirement,
): readonly DiffFinding[] {
  const findings: DiffFinding[] = [];
  const key = after.key;

  // sourceIntegrity (declared channel) may only RISE in rank.
  const beforeRank = sourceIntegrityRank(before.sourceIntegrity);
  const afterRank = sourceIntegrityRank(after.sourceIntegrity);
  if (afterRank < beforeRank) {
    findings.push({
      kind: "RELAXATION",
      detail: `[${key}] sourceIntegrity weakened ${before.sourceIntegrity} → ${after.sourceIntegrity}`,
    });
  } else if (afterRank > beforeRank) {
    findings.push({
      kind: "ADDITIVE",
      detail: `[${key}] sourceIntegrity raised ${before.sourceIntegrity} → ${after.sourceIntegrity}`,
    });
  }

  // ownershipPolicy may only go not_applicable → required.
  if (before.ownershipPolicy === "required" && after.ownershipPolicy === "not_applicable") {
    findings.push({
      kind: "RELAXATION",
      detail: `[${key}] ownershipPolicy weakened required → not_applicable`,
    });
  } else if (before.ownershipPolicy === "not_applicable" && after.ownershipPolicy === "required") {
    findings.push({ kind: "ADDITIVE", detail: `[${key}] ownershipPolicy tightened to required` });
  }

  // freshness may only tighten; a cacheable ttl may only shrink.
  const bf = freshnessRank(before.freshnessPolicy);
  const af = freshnessRank(after.freshnessPolicy);
  if (af < bf) {
    findings.push({
      kind: "RELAXATION",
      detail: `[${key}] freshness loosened (rank ${bf} → ${af})`,
    });
  } else if (af > bf) {
    findings.push({ kind: "ADDITIVE", detail: `[${key}] freshness tightened (rank ${bf} → ${af})` });
  } else {
    // Same freshness RANK. For the cacheable tier the ttl WINDOW is the safety axis:
    // a wider window loosens staleness. Only a numeric→numeric comparison is PROVABLE.
    // A change to/from the symbolic `reindex_bound` (a reindex-lag floor, NOT a
    // wall-clock window) cannot be proven non-loosening, so it must NOT be silently
    // dropped — classify it conservatively as RELAXATION-class (F5; the lint's
    // un-provable bucket, per its own doc). `reindex_bound → reindex_bound` (no change)
    // and a numeric-equal ttl both fall through to no finding.
    const bt = cacheableTtl(before.freshnessPolicy);
    const at = cacheableTtl(after.freshnessPolicy);
    if (bt !== undefined && at !== undefined && bt !== at) {
      if (typeof bt === "number" && typeof at === "number") {
        findings.push(
          at > bt
            ? { kind: "RELAXATION", detail: `[${key}] cacheable ttl widened ${bt} → ${at}` }
            : { kind: "ADDITIVE", detail: `[${key}] cacheable ttl shrank ${bt} → ${at}` },
        );
      } else {
        findings.push({
          kind: "RELAXATION",
          detail: `[${key}] cacheable ttl changed ${String(bt)} → ${String(at)} — not provably non-loosening (reindex_bound)`,
        });
      }
    }
  }

  // provenancePolicy may only go preserve → first_party_only.
  if (before.provenancePolicy === "first_party_only" && after.provenancePolicy === "preserve") {
    findings.push({
      kind: "RELAXATION",
      detail: `[${key}] provenancePolicy weakened first_party_only → preserve`,
    });
  } else if (before.provenancePolicy === "preserve" && after.provenancePolicy === "first_party_only") {
    findings.push({ kind: "ADDITIVE", detail: `[${key}] provenancePolicy tightened to first_party_only` });
  }

  return findings;
}

// ─────────────────────────────────────────────────────────────────────────
// Falsifier-declaration diff
// ─────────────────────────────────────────────────────────────────────────

/** The set of falsifier keys a declaration enumerates. */
function falsifierKeys(decl: FalsifierDeclaration): ReadonlySet<string> {
  return new Set((decl.falsifiers ?? []).map((f) => f.key));
}

/**
 * Classify a FALSIFIER-DECLARATION diff (W6). Safety direction:
 *   - `falsifierComplete` may only go `false → true`; `true → false` → RELAXATION.
 *   - a falsifier may only be ADDED; REMOVING one → RELAXATION (the type can now
 *     VALIDATE in a state a dropped falsifier would have contradicted).
 * Pure.
 */
export function classifyFalsifierDiff(
  before: FalsifierDeclaration,
  after: FalsifierDeclaration,
): readonly DiffFinding[] {
  const findings: DiffFinding[] = [];

  if (before.falsifierComplete === true && after.falsifierComplete !== true) {
    findings.push({
      kind: "RELAXATION",
      detail: "falsifierComplete weakened true → false",
    });
  } else if (before.falsifierComplete !== true && after.falsifierComplete === true) {
    findings.push({ kind: "ADDITIVE", detail: "falsifierComplete tightened to true" });
  }

  const beforeKeys = falsifierKeys(before);
  const afterKeys = falsifierKeys(after);
  for (const k of beforeKeys) {
    if (!afterKeys.has(k)) {
      findings.push({ kind: "RELAXATION", detail: `removed falsifier "${k}"` });
    }
  }
  for (const k of afterKeys) {
    if (!beforeKeys.has(k)) {
      findings.push({ kind: "ADDITIVE", detail: `added falsifier "${k}"` });
    }
  }

  return findings;
}
