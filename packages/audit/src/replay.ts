/**
 * Replay harness — re-run a stored AuditRecord[] through adjudicate() and
 * confirm the decisions reproduce. The core invariant behind the framework's
 * governance claim: "anything that happened can be reproduced
 * deterministically."
 *
 * Comparison rule (T2):
 *
 *   1. Different `decision.kind` → DECISION_KIND mismatch.
 *   2. Same kind, same flat-set of `category:code` basis strings → matched.
 *   3. Same kind, different basis flat-set → BASIS_DRIFT mismatch.
 *      `basisDelta` carries the symmetric difference (missing/extra).
 *   4. Both REFUSE, same kind, same basis flat-set, but `refusal.code`
 *      differs → REFUSAL_CODE_DRIFT mismatch.
 *
 * Flat-set semantics: order is ignored, `basis.detail` is ignored. Matches
 * the on-disk shape of `Postgres.intent_audit.decision_basis` (text[]
 * column of "category:code" strings).
 *
 * Consumers pass in an adjudicator that has closed over the correct policy
 * for each record's intent kind. The replay does NOT re-run side effects —
 * it only re-adjudicates.
 */

import type { AuditRecord, Decision, DecisionBasis } from "@adjudicate/core";

export type ReplayMismatchKind =
  | "DECISION_KIND"
  | "BASIS_DRIFT"
  | "REFUSAL_CODE_DRIFT";

export interface ReplayBasisDelta {
  /** Codes present in `expected.basis` but absent from `actual.basis`. */
  readonly missing: readonly string[];
  /** Codes present in `actual.basis` but absent from `expected.basis`. */
  readonly extra: readonly string[];
}

export interface ReplayMismatch {
  readonly intentHash: string;
  readonly kind: ReplayMismatchKind;
  readonly expected: Decision;
  readonly actual: Decision;
  /** Populated when `kind === "BASIS_DRIFT"`. */
  readonly basisDelta?: ReplayBasisDelta;
}

export interface ReplayReport {
  readonly total: number;
  readonly matched: number;
  readonly mismatches: readonly ReplayMismatch[];
}

export type Adjudicator = (record: AuditRecord) => Decision;

/**
 * Re-adjudicate every record and classify divergences.
 *
 * `report.matched === report.total` is now a meaningfully stronger
 * statement than before: it means every record matches both the
 * decision kind and the basis flat-set. Refusal-code drift is surfaced
 * separately so the runbook can page on it without false-positives from
 * cosmetic basis-detail rewordings.
 */
export function replay(
  records: readonly AuditRecord[],
  adjudicator: Adjudicator,
): ReplayReport {
  const mismatches: ReplayMismatch[] = [];
  let matched = 0;

  for (const record of records) {
    const expected = record.decision;
    const actual = adjudicator(record);
    const mismatch = classify(record.intentHash, expected, actual);
    if (mismatch === null) {
      matched++;
    } else {
      mismatches.push(mismatch);
    }
  }

  return { total: records.length, matched, mismatches };
}

/**
 * Pure classifier — null when the two Decisions match, otherwise a
 * structured `ReplayMismatch`. Exported so adopters can write their own
 * cross-record audits without re-implementing the rule.
 */
export function classify(
  intentHash: string,
  expected: Decision,
  actual: Decision,
): ReplayMismatch | null {
  if (expected.kind !== actual.kind) {
    return { intentHash, kind: "DECISION_KIND", expected, actual };
  }

  const expectedFlat = flattenBasis(expected.basis);
  const actualFlat = flattenBasis(actual.basis);
  const delta = symmetricDifference(expectedFlat, actualFlat);

  if (delta.missing.length > 0 || delta.extra.length > 0) {
    return {
      intentHash,
      kind: "BASIS_DRIFT",
      expected,
      actual,
      basisDelta: delta,
    };
  }

  if (
    expected.kind === "REFUSE" &&
    actual.kind === "REFUSE" &&
    expected.refusal.code !== actual.refusal.code
  ) {
    return { intentHash, kind: "REFUSAL_CODE_DRIFT", expected, actual };
  }

  return null;
}

function flattenBasis(basis: readonly DecisionBasis[]): string[] {
  return basis.map((b) => `${b.category}:${b.code}`);
}

function symmetricDifference(
  a: readonly string[],
  b: readonly string[],
): ReplayBasisDelta {
  const aSet = new Set(a);
  const bSet = new Set(b);
  const missing: string[] = [];
  const extra: string[] = [];
  for (const x of aSet) {
    if (!bSet.has(x)) missing.push(x);
  }
  for (const x of bSet) {
    if (!aSet.has(x)) extra.push(x);
  }
  // Sort for determinism in test assertions and audit-report stability.
  missing.sort();
  extra.sort();
  return { missing, extra };
}
