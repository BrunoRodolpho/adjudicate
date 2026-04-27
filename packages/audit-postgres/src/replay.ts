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
} from "@adjudicate/core";
import type { IntentAuditRow } from "./postgres-sink.js";

export interface AuditQueryWindow {
  readonly fromIso: string;
  readonly toIso: string;
  readonly intentKind?: string;
  readonly limit?: number;
}

export interface AuditQuery {
  /**
   * Return rows whose `recorded_at` falls within [fromIso, toIso). Optional
   * filter by `intentKind`. Limit caps the result set; adopters may stream
   * via repeated calls if needed.
   */
  fetchRows(window: AuditQueryWindow): Promise<readonly IntentAuditRow[]>;
}

/**
 * Reconstruct an AuditRecord from a stored row. Inverse of recordToRow().
 * The envelope and decision are JSON-deserialized; `decision_basis` is
 * regenerated from the flattened "category:code" strings (the basis detail
 * is preserved inside `decision_jsonb`, so the deserialized Decision carries
 * the full structured basis).
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
  const version: AuditRecordVersion = row.record_version === 2 ? 2 : 1;
  const plan: AuditPlanSnapshot | undefined =
    version === 2 && row.plan_jsonb
      ? (JSON.parse(row.plan_jsonb) as AuditPlanSnapshot)
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
  };
}

/**
 * Read a window of audit rows and return them as AuditRecord[] suitable for
 * `replay()` from @adjudicate/audit.
 */
export async function readAuditWindow(
  query: AuditQuery,
  window: AuditQueryWindow,
): Promise<AuditRecord[]> {
  const rows = await query.fetchRows(window);
  return rows.map(rowToRecord);
}
