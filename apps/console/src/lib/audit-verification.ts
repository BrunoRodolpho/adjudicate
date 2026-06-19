/**
 * 092 — verify-on-read decorator for the console's `AuditStore`.
 *
 * The Postgres cold-store (`createPostgresAuditStore`) already runs
 * `verifyAuditRecord` over every returned row and populates
 * `AuditQueryResult.verifications` (index-aligned with `records`). The reference
 * in-memory store (`createInMemoryAuditStore`) does NOT verify on read, so the
 * console's Explorer would render mock rows with no tamper / signature verdict.
 *
 * `withVerifyOnRead` wraps ANY `AuditStore` so the list read surface always
 * carries per-record verdicts the admin UI can render. It is IDEMPOTENT: if the
 * inner store already populated `verifications` (Postgres), it is passed through
 * unchanged; only when absent are verdicts computed here. Per §C this read only
 * ADDS friction (surfaces tamper/forgery) — it never drops, reorders, or
 * rewrites a record. `verifyAuditRecord` is pure / no-I/O, so the cost is bounded
 * per row.
 */
import {
  verifyAuditRecord,
  type AuditRecord,
  type AuditRecordVerification,
} from "@adjudicate/core";
import type { AuditQuery, AuditQueryResult, AuditStore } from "@adjudicate/admin-sdk";

export function withVerifyOnRead(store: AuditStore): AuditStore {
  return {
    async query(q: AuditQuery): Promise<AuditQueryResult> {
      const result = await store.query(q);
      // Idempotent: a store that already verified on read (Postgres) keeps its
      // verdicts; only fill them in when the inner store omitted them.
      if (result.verifications !== undefined) return result;
      // `AuditQueryResult.records` is the WIRE-inferred AuditRecord (its
      // `decision_basis`/`DecisionBasis` is widened on `code: string` vs core's
      // narrow union — the documented one-directional core→schema drift in
      // admin-sdk's audit schema). At runtime these ARE core AuditRecords (the
      // store builds them via core), so re-narrow for the pure verifier.
      const verifications: AuditRecordVerification[] = result.records.map((r) =>
        verifyAuditRecord(r as unknown as AuditRecord),
      );
      return { ...result, verifications };
    },
    // getByIntentHash is unchanged — the single-record path returns a bare
    // AuditRecord per the store contract; its consumers (replay, approval-chain)
    // re-verify independently. The list `query` above is the surfacing surface.
    getByIntentHash: store.getByIntentHash.bind(store),
  };
}
