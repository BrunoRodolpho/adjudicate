// PostgresSink — durable governance trail in Postgres.
//
// Implements `AuditSink` from @adjudicate/audit. Adopters supply a Postgres
// query executor that runs an INSERT against the `intent_audit` table.
// Framework-agnostic — works with any Postgres client (pg, postgres.js,
// Prisma's $executeRaw, etc.) via the simple `executeInsert` interface.
//
// Schema: see ./schema.ts and ./migrations/001-create-intent-audit.sql.

import type { AuditRecord } from "@adjudicate/core";
import type { AuditSink } from "@adjudicate/audit";

/**
 * Minimal Postgres-write interface. Adopters wrap their existing Postgres
 * client (pg, postgres.js, Prisma) into this shape.
 *
 * INSERT shape:
 *   INSERT INTO intent_audit
 *     (intent_hash, session_id, kind, principal, taint, decision_kind,
 *      refusal_kind, refusal_code, decision_basis, resource_version,
 *      envelope_jsonb, decision_jsonb, recorded_at, duration_ms, partition_month,
 *      record_version, plan_jsonb, nonce, supersedes_jsonb, policy_version,
 *      kernel_version, audit_hash, signature_jsonb, kernel_identity_jsonb)
 *   VALUES ($1...$24)
 *   ON CONFLICT (intent_hash, recorded_at) DO NOTHING
 *
 * Adopters MUST insert every column above. Omitting the v2/v3/v4 columns
 * (record_version through kernel_identity_jsonb) silently discards the
 * tamper-evidence binding and supersession chain — verifyAuditRecord then
 * returns missing_hash on read-back.
 */
export interface PostgresWriter {
  insertAudit(row: IntentAuditRow): Promise<void>;
}

/** Shape of one row in the `intent_audit` table. */
export interface IntentAuditRow {
  readonly intent_hash: string;
  readonly session_id: string;
  readonly kind: string;
  readonly principal: "llm" | "user" | "system";
  readonly taint: "SYSTEM" | "TRUSTED" | "UNTRUSTED";
  readonly decision_kind: string;
  readonly refusal_kind: string | null;
  readonly refusal_code: string | null;
  readonly decision_basis: string[]; // jsonb-castable array of "category:code"
  readonly resource_version: string | null;
  readonly envelope_jsonb: string; // pre-serialized JSON
  readonly decision_jsonb: string; // pre-serialized JSON
  readonly recorded_at: string; // ISO-8601
  readonly duration_ms: number;
  readonly partition_month: string; // "2026-04" — for partition routing
  /**
   * Audit record schema version (1-4). Carried alongside the row so the
   * replay reader can branch without parsing JSON. v1 rows that predate this
   * column may be NULL — the reader treats NULL as v1.
   */
  readonly record_version: 1 | 2 | 3 | 4;
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
    decision_basis: record.decision_basis.map((b) => `${b.category}:${b.code}`),
    resource_version: record.resourceVersion ?? null,
    envelope_jsonb: JSON.stringify(record.envelope),
    decision_jsonb: JSON.stringify(record.decision),
    recorded_at: record.at,
    duration_ms: record.durationMs,
    partition_month: partition,
    record_version: record.version,
    plan_jsonb: record.plan ? JSON.stringify(record.plan) : null,
    // T8: extract nonce from the envelope (v2+). v1 rows had no nonce
    // field; mappers reading historical rows see NULL here.
    nonce:
      typeof (record.envelope as { nonce?: unknown }).nonce === "string"
        ? (record.envelope as { nonce: string }).nonce
        : null,
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
  };
}

/**
 * Compute the partition month string for a given ISO-8601 timestamp.
 * Returns "YYYY-MM". Used by the Postgres partitioning scheme — see
 * migrations/001-create-intent-audit.sql.
 */
export function partitionMonthOf(isoTimestamp: string): string {
  // Extract the year-month portion of the ISO-8601 string. "2026-04-23T..."
  // returns "2026-04". We avoid Date object construction so this works
  // identically across timezones.
  const match = isoTimestamp.match(/^(\d{4})-(\d{2})/);
  if (!match) {
    // Fallback: use UTC date conversion. ISO without a leading YYYY-MM is
    // unusual but defensively handled.
    const d = new Date(isoTimestamp);
    const yyyy = d.getUTCFullYear().toString().padStart(4, "0");
    const mm = (d.getUTCMonth() + 1).toString().padStart(2, "0");
    return `${yyyy}-${mm}`;
  }
  return `${match[1]}-${match[2]}`;
}
