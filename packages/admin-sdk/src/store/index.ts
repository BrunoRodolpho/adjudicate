import type { AuditRecord } from "@adjudicate/core";
import type { AuditQuery, AuditQueryResult } from "../schemas/query.js";

/**
 * Adopter-implemented contract for reading audit records.
 *
 * Reference implementations:
 *   - `createInMemoryAuditStore`     (this package; tests + console dev)
 *   - `createPostgresAuditStore`     (`@adjudicate/audit-postgres-store`; future)
 *   - <adopter-supplied>             (Kafka archive, BigQuery, S3-cold, ...)
 *
 * Implementations MUST:
 *   - Return records newest-first by `at` (ISO-8601 string sort = chronological).
 *   - Honor `query.limit` exactly. The schema caps it at 500.
 *   - Apply all provided filter fields with AND semantics.
 *   - Surface persistence failures by throwing — the SDK converts to a
 *     tRPC INTERNAL_SERVER_ERROR with safe message.
 *
 * Implementations MUST NOT:
 *   - Mutate records.
 *   - Re-validate against Zod (the SDK already validated input).
 *   - Return records that don't match the filter (validation is single-pass).
 */
export interface AuditStore {
  query(query: AuditQuery): Promise<AuditQueryResult>;
  getByIntentHash(intentHash: string): Promise<AuditRecord | null>;
}

export interface InMemoryAuditStoreOptions {
  readonly records: readonly AuditRecord[];
}

/**
 * Reference in-memory `AuditStore`. Drives this package's tests and
 * the console's dev mode. Adopters with real persistence should implement
 * `AuditStore` directly against their store; this is the read-by-example.
 *
 * Records are sorted newest-first at construction; `query` filters and
 * truncates to `limit`. AND-semantic filter composition: every provided
 * filter field must match for the record to be included.
 */
export function createInMemoryAuditStore(
  opts: InMemoryAuditStoreOptions,
): AuditStore {
  const sorted = [...opts.records].sort((a, b) => (a.at < b.at ? 1 : -1));

  const matchesFilter = (r: AuditRecord, q: AuditQuery): boolean => {
    if (q.intentKind && r.envelope.kind !== q.intentKind) return false;
    if (q.decisionKind && r.decision.kind !== q.decisionKind) return false;
    if (q.refusalCode) {
      if (r.decision.kind !== "REFUSE") return false;
      if (r.decision.refusal.code !== q.refusalCode) return false;
    }
    if (q.taint && r.envelope.taint !== q.taint) return false;
    if (q.intentHash && r.intentHash !== q.intentHash) return false;
    if (q.since && r.at < q.since) return false;
    if (q.until && r.at > q.until) return false;
    return true;
  };

  return {
    async query(q: AuditQuery): Promise<AuditQueryResult> {
      const filtered = sorted.filter((r) => matchesFilter(r, q));
      return { records: filtered.slice(0, q.limit) };
    },
    async getByIntentHash(intentHash: string): Promise<AuditRecord | null> {
      return sorted.find((r) => r.intentHash === intentHash) ?? null;
    },
  };
}
