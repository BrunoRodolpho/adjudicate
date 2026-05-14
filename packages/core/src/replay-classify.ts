/**
 * Cross-record Decision classifier — the kernel-side rule used by the
 * replay harness and the admin-SDK's replay procedure. Lives in core
 * (not in `@adjudicate/audit`) because:
 *
 *   1. It operates on `Decision` + `DecisionBasis` — pure core types.
 *   2. Both `@adjudicate/audit` (in `replay()`) and `@adjudicate/admin-sdk`
 *      (in `replay.run`) need it. Keeping it in audit forced admin-sdk
 *      to depend on audit at runtime, which closed the cycle with
 *      audit's type-only `import type` from admin-sdk.
 *
 * The classifier returns `null` when the two Decisions match, otherwise a
 * structured `ReplayMismatch` describing the first axis of divergence
 * (DECISION_KIND > BASIS_DRIFT > REFUSAL_CODE_DRIFT).
 */

import type { Decision } from "./decision.js";
import type { DecisionBasis } from "./basis-codes.js";

export type ReplayMismatchKind =
  | "DECISION_KIND"
  | "BASIS_DRIFT"
  | "REFUSAL_CODE_DRIFT";

export interface ReplayBasisDelta {
  readonly missing: readonly string[];
  readonly extra: readonly string[];
}

export interface ReplayMismatch {
  readonly intentHash: string;
  readonly kind: ReplayMismatchKind;
  readonly expected: Decision;
  readonly actual: Decision;
  readonly basisDelta?: ReplayBasisDelta;
}

/**
 * Pure classifier — `null` when the two Decisions match, otherwise a
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
