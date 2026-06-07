// Replay reader — reads `intent_audit` rows back into AuditRecord instances
// for the replay harness. Inverse of recordToRow().
//
// Adopters supply a query function that returns rows; this module reconstructs
// AuditRecord objects so the standard `replay()` from @adjudicate/audit can
// re-adjudicate them.

import type {
  AuditPlanSnapshot,
  AuditRecord,
  AuditRecordVersion,
  Decision,
  IntentEnvelope,
  Supersession,
} from "@adjudicate/core";
import type { IntentAuditRow } from "./postgres-sink.js";

export interface AuditQueryFnWindow {
  readonly fromIso: string;
  readonly toIso: string;
  readonly intentKind?: string;
  readonly limit?: number;
}

export interface AuditQueryFn {
  /**
   * Return rows whose `recorded_at` falls within the inclusive window
   * [fromIso, toIso] (APIReviewer-003 boundary convention — both ends
   * inclusive, matching the admin-sdk audit query window). Optional filter by
   * `intentKind`. Limit caps the result set; adopters may stream via repeated
   * calls if needed.
   */
  fetchRows(window: AuditQueryFnWindow): Promise<readonly IntentAuditRow[]>;
}

/**
 * Reconstruct an AuditRecord from a stored row. Inverse of recordToRow().
 *
 * `decision_basis`: the TEXT[] column (`decision_basis`) is a query-optimized
 * projection (written by `recordToRow` as `category:code` strings for SQL-side
 * `WHERE … = ANY(decision_basis)` filtering). The reader reconstructs
 * `AuditRecord.decision_basis` from `decision_jsonb.basis`, NOT the TEXT[]
 * column — the JSONB carries the full structured `DecisionBasis[]` including
 * `detail`. If the TEXT[] and JSONB ever diverge (writer bug / malicious row),
 * this reader silently prefers JSONB. See `recordToRow` for the dual-encoding
 * invariant: TEXT[] must equal `decision.basis.map(b => "${b.category}:${b.code}")`.
 *
 * Version dispatch:
 *   - `record_version` NULL or 1 → v1 row (no plan field, no nonce).
 *   - `record_version = 2` → v2 row. `plan` populated from `plan_jsonb`
 *     when present. `nonce` populated from the row column or the stored
 *     envelope JSON (T8).
 *
 * For replay drift detection on v1 rows, use `legacyV1ToV2(row)` to
 * synthesize a v2 envelope from the historical createdAt — the original
 * `intentHash` does NOT reproduce (different recipe) but the Decision
 * does, so kind/basis comparison is meaningful.
 */
export function rowToRecord(row: IntentAuditRow): AuditRecord {
  const envelope = JSON.parse(row.envelope_jsonb) as IntentEnvelope;
  const decision = JSON.parse(row.decision_jsonb) as Decision;
  const version: AuditRecordVersion =
    row.record_version === 5
      ? 5
      : row.record_version === 4
        ? 4
        : row.record_version === 3
          ? 3
          : row.record_version === 2
            ? 2
            : 1;
  const plan: AuditPlanSnapshot | undefined =
    version >= 2 && row.plan_jsonb
      ? (JSON.parse(row.plan_jsonb) as AuditPlanSnapshot)
      : undefined;
  const supersedes: Supersession | undefined =
    version >= 3 && row.supersedes_jsonb
      ? (JSON.parse(row.supersedes_jsonb) as Supersession)
      : undefined;
  // v3+ kernelIdentity and v4+ policyVersion/kernelVersion are part of the
  // v4 auditHash pre-image. They MUST be reconstructed with the same
  // key-presence buildAuditRecord used (omit when absent, never `undefined`-
  // valued) or verifyAuditRecord re-derives a different hash and reports
  // false-positive tampering. auditHash + signature are excluded from the
  // pre-image by verifyAuditRecord, but auditHash is restored so verification
  // has a stored value to compare against.
  const kernelIdentity: NonNullable<AuditRecord["kernelIdentity"]> | undefined =
    version >= 3 && row.kernel_identity_jsonb
      ? (JSON.parse(row.kernel_identity_jsonb) as NonNullable<
          AuditRecord["kernelIdentity"]
        >)
      : undefined;
  const signature: NonNullable<AuditRecord["signature"]> | undefined =
    version >= 4 && row.signature_jsonb
      ? (JSON.parse(row.signature_jsonb) as NonNullable<
          AuditRecord["signature"]
        >)
      : undefined;
  return {
    version,
    intentHash: row.intent_hash,
    envelope,
    decision,
    decision_basis: decision.basis,
    resourceVersion: row.resource_version ?? undefined,
    at: row.recorded_at,
    durationMs: row.duration_ms,
    ...(plan !== undefined ? { plan } : {}),
    ...(supersedes !== undefined ? { supersedes } : {}),
    ...(kernelIdentity !== undefined ? { kernelIdentity } : {}),
    ...(version >= 4 && row.policy_version != null
      ? { policyVersion: row.policy_version }
      : {}),
    ...(version >= 4 && row.kernel_version != null
      ? { kernelVersion: row.kernel_version }
      : {}),
    ...(version >= 4 && row.audit_hash != null
      ? { auditHash: row.audit_hash }
      : {}),
    ...(signature !== undefined ? { signature } : {}),
  };
}

/**
 * Read a window of audit rows and return them as AuditRecord[] suitable for
 * `replay()` from @adjudicate/audit.
 */
export async function readAuditWindow(
  query: AuditQueryFn,
  window: AuditQueryFnWindow,
): Promise<AuditRecord[]> {
  const rows = await query.fetchRows(window);
  return rows.map(rowToRecord);
}
