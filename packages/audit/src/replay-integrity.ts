/**
 * `replayWithIntegrity` — replay + tamper-detection in one pass.
 *
 * The existing `replay()` only re-runs adjudication and compares
 * decisions. It does NOT check:
 *
 *   - whether the stored AuditRecord's `auditHash` is intact (tamper
 *     detection), or
 *   - whether the envelope's `intentHash` is consistent with the
 *     canonical hash of its fields (envelope integrity).
 *
 * `replayWithIntegrity` does both. It is the recommended path for
 * governance-grade replay where the operator wants ONE report covering
 * both "is the decision reproducible?" (replay) and "is the stored
 * record intact?" (integrity).
 *
 * The two paths are independent — a record can have:
 *   - matched decision + intact hash → fully verified
 *   - matched decision + tampered hash → policy reproduced but the
 *     stored record was modified; investigate immediately
 *   - mismatched decision + intact hash → policy drift (most likely a
 *     legitimate Pack update); root-cause via `mismatches`
 *   - mismatched decision + tampered hash → both axes failed; treat as
 *     a hostile incident
 *
 * Pre-v4 records (no `auditHash`) report `{ verified: null, reason:
 * "missing_hash" }` in `integrity` — the replay axis still runs.
 */

import type { AuditRecord, Decision } from "@adjudicate/core";
import {
  classify,
  sha256Canonical,
  verifyAuditRecord,
  type AuditRecordVerification,
  type ReplayMismatch,
} from "@adjudicate/core";

export interface IntegrityFailure {
  readonly intentHash: string;
  readonly kind: "AUDIT_HASH_TAMPERED" | "INTENT_HASH_MISMATCH";
  readonly detail: {
    readonly stored: string;
    readonly derived: string;
  };
}

export interface ReplayIntegrityReport {
  readonly total: number;
  /** Records where BOTH replay and integrity passed. */
  readonly matched: number;
  /** Replay-axis mismatches (decision-kind / basis-drift / refusal-code). */
  readonly mismatches: readonly ReplayMismatch[];
  /** Integrity-axis failures (audit-hash tamper or intent-hash mismatch). */
  readonly integrityFailures: readonly IntegrityFailure[];
  /**
   * Pre-v4 records lacked auditHash. Recorded separately so adopters can
   * track migration progress without false-positives from legacy rows.
   */
  readonly preV4Records: number;
}

export type Adjudicator = (record: AuditRecord) => Decision;

/**
 * Re-derive `sha256Canonical` over the envelope's hash-input subset and
 * compare to the stored `intentHash`. This catches an envelope where
 * payload/actor/nonce/taint was modified after the audit was written.
 *
 * Mirrors `packages/core/src/hash.ts` recipe: envelope fields included
 * in the hash are `{version, kind, payload, nonce, actor, taint}`.
 * `createdAt` is excluded by design.
 */
function deriveEnvelopeIntentHash(envelope: AuditRecord["envelope"]): string {
  return sha256Canonical({
    version: envelope.version,
    kind: envelope.kind,
    payload: envelope.payload,
    nonce: envelope.nonce,
    actor: envelope.actor,
    taint: envelope.taint,
  });
}

/**
 * Run replay and integrity verification across the record set. The
 * order within the record array is preserved; the report aggregates by
 * axis (matched / mismatches / integrityFailures) and is otherwise
 * deterministic given identical inputs.
 *
 * Adjudicator may be the same closure used by `replay()` — it MUST be
 * deterministic and side-effect-free.
 */
export function replayWithIntegrity(
  records: readonly AuditRecord[],
  adjudicator: Adjudicator,
): ReplayIntegrityReport {
  const mismatches: ReplayMismatch[] = [];
  const integrityFailures: IntegrityFailure[] = [];
  let matched = 0;
  let preV4 = 0;

  for (const record of records) {
    // Integrity axis 1: envelope intentHash.
    const derivedEnvHash = deriveEnvelopeIntentHash(record.envelope);
    const intentHashOk = derivedEnvHash === record.envelope.intentHash;
    if (!intentHashOk) {
      integrityFailures.push({
        intentHash: record.intentHash,
        kind: "INTENT_HASH_MISMATCH",
        detail: { stored: record.envelope.intentHash, derived: derivedEnvHash },
      });
    }

    // Integrity axis 2: audit record auditHash.
    let auditHashOk = true;
    const auditVerification: AuditRecordVerification = verifyAuditRecord(record);
    if (auditVerification.verified === false) {
      auditHashOk = false;
      integrityFailures.push({
        intentHash: record.intentHash,
        kind: "AUDIT_HASH_TAMPERED",
        detail: {
          stored: auditVerification.stored,
          derived: auditVerification.derived,
        },
      });
    } else if (auditVerification.verified === null) {
      preV4++;
      // Don't penalize matched count for legacy records — the replay
      // axis still gets a chance to confirm or refute.
    }

    // Replay axis.
    const expected = record.decision;
    const actual = adjudicator(record);
    const mismatch = classify(record.intentHash, expected, actual);
    if (mismatch === null && intentHashOk && auditHashOk) {
      matched++;
    } else if (mismatch !== null) {
      mismatches.push(mismatch);
    }
  }

  return {
    total: records.length,
    matched,
    mismatches,
    integrityFailures,
    preV4Records: preV4,
  };
}

/**
 * Quick boolean check — useful for CI gates that only need to know "did
 * any axis fail?" without parsing the full report.
 */
export function isReplayIntegrityClean(report: ReplayIntegrityReport): boolean {
  return (
    report.mismatches.length === 0 && report.integrityFailures.length === 0
  );
}
