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
 *
 * The `classify` function + `ReplayMismatch*` types live in
 * `@adjudicate/core/replay-classify` (operating on pure core types). They
 * are re-exported here so the existing public surface (`import { classify
 * } from "@adjudicate/audit"`) keeps working.
 */

import type { AuditRecord, Decision } from "@adjudicate/core";
import { classify } from "@adjudicate/core";

export {
  classify,
  type ReplayBasisDelta,
  type ReplayMismatch,
  type ReplayMismatchKind,
} from "@adjudicate/core";

export interface ReplayReport {
  readonly total: number;
  readonly matched: number;
  readonly mismatches: readonly import("@adjudicate/core").ReplayMismatch[];
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
  const mismatches: import("@adjudicate/core").ReplayMismatch[] = [];
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
