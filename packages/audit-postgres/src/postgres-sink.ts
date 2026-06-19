// PostgresSink — durable governance trail in Postgres.
//
// Implements `AuditSink` from @adjudicate/audit. Adopters supply a Postgres
// query executor that runs an INSERT against the `intent_audit` table.
// Framework-agnostic — works with any Postgres client (pg, postgres.js,
// Prisma's $executeRaw, etc.) via the simple `executeInsert` interface.
//
// Schema: see ./schema.ts and ./migrations/001-create-intent-audit.sql.

import type {
  AuditRecord,
  Decision,
  IntentActor,
  RefusalKind,
  Taint,
} from "@adjudicate/core";
import type { AuditSink } from "@adjudicate/audit";

/**
 * Minimal Postgres-write interface. Adopters wrap their existing Postgres
 * client (pg, postgres.js, Prisma) into this shape.
 *
 * The reference INSERT statement is exported as `INSERT_AUDIT_SQL` (single
 * source of truth for the row shape), with `auditInsertParams(row)` producing
 * the bound `$1...$28` parameter array in matching column order. A typical
 * `pg`-backed writer is:
 *
 *   insertAudit: (row) => pool.query(INSERT_AUDIT_SQL, [...auditInsertParams(row)])
 *
 * Adopters MUST insert every column. Omitting the v2/v3/v4 columns
 * (record_version through signature_jsonb) silently discards the
 * tamper-evidence binding and supersession chain — verifyAuditRecord then
 * returns missing_hash on read-back. Using the exported const + params helper
 * keeps the column set complete and in sync by construction.
 */
export interface PostgresWriter {
  insertAudit(row: IntentAuditRow): Promise<void>;
}

/** Shape of one row in the `intent_audit` table. */
export interface IntentAuditRow {
  readonly intent_hash: string;
  readonly session_id: string;
  readonly kind: string;
  readonly principal: IntentActor["principal"];
  readonly taint: Taint;
  readonly decision_kind: Decision["kind"];
  readonly refusal_kind: RefusalKind | null;
  readonly refusal_code: string | null;
  readonly decision_basis: string[]; // jsonb-castable array of "category:code"
  readonly resource_version: string | null;
  readonly envelope_jsonb: string; // pre-serialized JSON
  readonly decision_jsonb: string; // pre-serialized JSON
  readonly recorded_at: string; // ISO-8601
  readonly duration_ms: number;
  readonly partition_month: string; // "2026-04" — for partition routing
  /**
   * Audit record schema version (1-5). Carried alongside the row so the
   * replay reader can branch without parsing JSON. v1 rows that predate this
   * column may be NULL — the reader treats NULL as v1. Migration
   * `010-add-v5-metadata.sql` widens the CHECK constraint to admit 5.
   */
  readonly record_version: 1 | 2 | 3 | 4 | 5;
  /**
   * v2+ optional plan snapshot, pre-serialized JSON. NULL when the audit
   * record carries no plan field. Migration `002-add-plan-jsonb.sql` adds
   * the underlying column.
   */
  readonly plan_jsonb: string | null;
  /**
   * T8: envelope nonce for v2+ records. NULL for pre-T8 v1 rows; the
   * `legacyV1ToV2` replay reader synthesizes nonce from createdAt for
   * those. Migration `003-add-nonce.sql` adds the underlying column.
   */
  readonly nonce: string | null;
  /**
   * v3+ optional supersession link, pre-serialized JSON. NULL when the
   * audit record carries no supersedes field. Migration
   * `005-add-supersedes.sql` adds the underlying column.
   */
  readonly supersedes_jsonb: string | null;
  /**
   * v3+ optional kernel build identity `{ id, version }`, pre-serialized
   * JSON. Part of the v4 `auditHash` pre-image, so it MUST round-trip or
   * verifyAuditRecord reports false-positive tampering. Migration
   * `008-add-v4-fields.sql` adds the underlying column.
   */
  readonly kernel_identity_jsonb: string | null;
  /**
   * v4+ optional Pack semantic version at adjudication time. NULL when the
   * record carries no policyVersion. Migration `008-add-v4-fields.sql`.
   */
  readonly policy_version: string | null;
  /**
   * v4+ optional @adjudicate/core version that produced the record. NULL
   * when absent. Migration `008-add-v4-fields.sql`.
   */
  readonly kernel_version: string | null;
  /**
   * v4+ tamper-evidence hash — `sha256Canonical(record \ { auditHash,
   * signature })`. NULL for pre-v4 records. Migration
   * `008-add-v4-fields.sql`. Dropping this on write/read defeats
   * verifyAuditRecord end-to-end.
   */
  readonly audit_hash: string | null;
  /**
   * v4+ optional cryptographic signature `{ keyId, alg, value }` over the
   * auditHash, pre-serialized JSON. NULL when no AuditSigner is configured.
   * Migration `008-add-v4-fields.sql`.
   */
  readonly signature_jsonb: string | null;
  /**
   * v5+ optional governance/observability metadata (e.g. a hallucination
   * score), pre-serialized JSON. NULL when the record carries no metadata.
   * EXCLUDED from the auditHash pre-image (ADR-124), so attaching it post-hoc
   * never invalidates tamper-evidence and a NULL on older rows is correct.
   * Migration `010-add-v5-metadata.sql` adds the underlying column.
   */
  readonly metadata_jsonb: string | null;
  /**
   * 093 — the inter-record hash-chain link: the `auditHash` of the immediately-
   * preceding record in the same stream (the per-stream cryptographic tip). NULL
   * for genesis records and pre-093 rows. EXCLUDED from the auditHash pre-image
   * (like signature/metadata), so a NULL on older rows is correct and threading
   * it never affects tamper-evidence. Migration `012-add-prev-audit-hash.sql`.
   */
  readonly prev_audit_hash: string | null;
  /**
   * 033 read-path completion (093 / 092-F1). The RECORDED authority-graph
   * snapshot the decision was injected with, pre-serialized JSON. NULL when the
   * record injected no snapshot. IS part of the auditHash pre-image — dropping it
   * on write/read makes a snapshot-bearing record FALSE-tamper on 092 verify-on-
   * read. Migration `012-add-prev-audit-hash.sql`.
   */
  readonly authority_snapshot_jsonb: string | null;
  /**
   * 052 read-path completion (093 / 092-F1). The RECORDED aggregate/limit
   * snapshot the decision was injected with, pre-serialized JSON. NULL when the
   * record injected no snapshot. IS part of the auditHash pre-image — same
   * false-tamper hazard as authority_snapshot_jsonb if dropped. Migration
   * `012-add-prev-audit-hash.sql`.
   */
  readonly aggregate_snapshot_jsonb: string | null;
}

export interface PostgresSinkOptions {
  readonly writer: PostgresWriter;
  /**
   * Optional onError callback for caller-side observability. The sink emits
   * the error to this callback before rethrowing — so a circuit breaker or
   * a Sentry breadcrumb can fire upstream.
   */
  readonly onError?: (err: Error, record: AuditRecord) => void;
}

export function createPostgresSink(opts: PostgresSinkOptions): AuditSink {
  return {
    async emit(record: AuditRecord) {
      const row = recordToRow(record);
      try {
        await opts.writer.insertAudit(row);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        opts.onError?.(error, record);
        throw error;
      }
    },
  };
}

/**
 * Map an AuditRecord to the flat IntentAuditRow shape. Keeps the mapping
 * pure and exported so adopters can write their own backfill scripts that
 * produce identical rows from raw event streams.
 *
 * v2+ records with `plan` populate `plan_jsonb`; v1 records (or v2 without
 * plan) leave it NULL.
 */
export function recordToRow(record: AuditRecord): IntentAuditRow {
  const partition = partitionMonthOf(record.at);
  const refusal =
    record.decision.kind === "REFUSE" ? record.decision.refusal : null;
  return {
    intent_hash: record.intentHash,
    session_id: record.envelope.actor.sessionId,
    kind: record.envelope.kind,
    principal: record.envelope.actor.principal,
    taint: record.envelope.taint,
    decision_kind: record.decision.kind,
    refusal_kind: refusal?.kind ?? null,
    refusal_code: refusal?.code ?? null,
    // decision_basis TEXT[] is a query-projection of decision.basis. Both carry the
    // same information; divergence is a writer bug. The canonical reader (rowToRecord)
    // reconstructs AuditRecord.decision_basis from decision_jsonb — the TEXT[] is
    // only for SQL-side filtering (WHERE 'category:code' = ANY(decision_basis)).
    decision_basis: record.decision_basis.map((b) => `${b.category}:${b.code}`),
    resource_version: record.resourceVersion ?? null,
    envelope_jsonb: JSON.stringify(record.envelope),
    decision_jsonb: JSON.stringify(record.decision),
    recorded_at: record.at,
    duration_ms: record.durationMs,
    partition_month: partition,
    record_version: record.version,
    plan_jsonb: record.plan ? JSON.stringify(record.plan) : null,
    // T8: nonce is required on IntentEnvelope (v2+). Written directly;
    // pre-v2 rows that lack the column see NULL via the DB default, but
    // any AuditRecord reaching this code carries a well-typed envelope.
    nonce: record.envelope.nonce,
    supersedes_jsonb: record.supersedes
      ? JSON.stringify(record.supersedes)
      : null,
    kernel_identity_jsonb: record.kernelIdentity
      ? JSON.stringify(record.kernelIdentity)
      : null,
    policy_version: record.policyVersion ?? null,
    kernel_version: record.kernelVersion ?? null,
    audit_hash: record.auditHash ?? null,
    signature_jsonb: record.signature ? JSON.stringify(record.signature) : null,
    metadata_jsonb: record.metadata ? JSON.stringify(record.metadata) : null,
    // 093: the inter-record chain link (NULL for genesis / pre-093 rows).
    prev_audit_hash: record.prevAuditHash ?? null,
    // 033/052 read-path completion: persist the recorded snapshots so a
    // snapshot-bearing record round-trips its auditHash pre-image intact (no
    // 092 verify-on-read false-tamper). NULL when the record injected none.
    authority_snapshot_jsonb: record.authoritySnapshot
      ? JSON.stringify(record.authoritySnapshot)
      : null,
    aggregate_snapshot_jsonb: record.aggregateSnapshot
      ? JSON.stringify(record.aggregateSnapshot)
      : null,
  };
}

/**
 * Reference INSERT statement for the `intent_audit` table. Mirrors
 * `INSERT_GOVERNANCE_EVENT_SQL` in governance-log.ts — adopters wrap their
 * `pg`/`postgres.js`/Prisma client into a `PostgresWriter` whose
 * `insertAudit` runs this statement. Exposed as a constant so the SQL stays
 * in this package (single source of truth for the row shape), and so a
 * column-order test can pin it against `auditInsertParams`.
 *
 * Column order matches `recordToRow` / `auditInsertParams`. The 28 columns
 * span the base v1 schema (001) plus the additive v2/v3/v4/v5 migrations
 * (002 plan_jsonb, 003 nonce, 005 supersedes_jsonb, 008 kernel_identity_jsonb
 * / policy_version / kernel_version / audit_hash / signature_jsonb,
 * 010 metadata_jsonb, 012 prev_audit_hash / authority_snapshot_jsonb /
 * aggregate_snapshot_jsonb). Because the columns are named explicitly, physical
 * column order in Postgres is irrelevant — only this list and
 * `auditInsertParams` must agree.
 *
 * `ON CONFLICT (intent_hash, recorded_at) DO NOTHING` matches the table's
 * PRIMARY KEY (id, recorded_at) dedup intent at the (intent_hash, recorded_at)
 * grain — idempotent re-emit of the same record is a no-op.
 */
export const INSERT_AUDIT_SQL = `
  INSERT INTO intent_audit
    (intent_hash, session_id, kind, principal, taint, decision_kind,
     refusal_kind, refusal_code, decision_basis, resource_version,
     envelope_jsonb, decision_jsonb, recorded_at, duration_ms, partition_month,
     record_version, plan_jsonb, nonce, supersedes_jsonb, kernel_identity_jsonb,
     policy_version, kernel_version, audit_hash, signature_jsonb, metadata_jsonb,
     prev_audit_hash, authority_snapshot_jsonb, aggregate_snapshot_jsonb)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
  ON CONFLICT (intent_hash, recorded_at) DO NOTHING
`.replace(/\s+/g, " ").trim();

/**
 * Helper to convert an `IntentAuditRow` to the parameter array for
 * `INSERT_AUDIT_SQL`. Adopters use this to keep the column order in sync
 * with the SQL constant. Mirrors `governanceInsertParams`.
 */
export function auditInsertParams(row: IntentAuditRow): readonly unknown[] {
  return [
    row.intent_hash,
    row.session_id,
    row.kind,
    row.principal,
    row.taint,
    row.decision_kind,
    row.refusal_kind,
    row.refusal_code,
    row.decision_basis,
    row.resource_version,
    row.envelope_jsonb,
    row.decision_jsonb,
    row.recorded_at,
    row.duration_ms,
    row.partition_month,
    row.record_version,
    row.plan_jsonb,
    row.nonce,
    row.supersedes_jsonb,
    row.kernel_identity_jsonb,
    row.policy_version,
    row.kernel_version,
    row.audit_hash,
    row.signature_jsonb,
    row.metadata_jsonb,
    row.prev_audit_hash,
    row.authority_snapshot_jsonb,
    row.aggregate_snapshot_jsonb,
  ];
}

/**
 * Compute the partition month string for a given ISO-8601 timestamp.
 * Returns "YYYY-MM". Used by the Postgres partitioning scheme — see
 * migrations/001-create-intent-audit.sql.
 *
 * Throws on:
 *   - a string that does not begin with "YYYY-MM" (regex mismatch)
 *   - a string whose extracted month is outside 01-12
 * These represent malformed inputs that should never reach the sink for a
 * valid AuditRecord. Deterministic failure is preferable to a wall-clock
 * fallback that silently routes the row to the wrong partition table.
 */
export function partitionMonthOf(isoTimestamp: string): string {
  // Extract the year-month portion of the ISO-8601 string. "2026-04-23T..."
  // returns "2026-04". We avoid Date object construction so this works
  // identically across timezones.
  const match = isoTimestamp.match(/^(\d{4})-(\d{2})/);
  if (!match) {
    throw new Error(
      `partitionMonthOf: unparseable timestamp — expected ISO-8601 beginning with YYYY-MM, got: ${JSON.stringify(isoTimestamp)}`,
    );
  }
  const month = parseInt(match[2]!, 10);
  if (month < 1 || month > 12) {
    throw new Error(
      `partitionMonthOf: invalid month ${match[2]} in timestamp ${JSON.stringify(isoTimestamp)} — must be 01-12`,
    );
  }
  return `${match[1]}-${match[2]}`;
}
