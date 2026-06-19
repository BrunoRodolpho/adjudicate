import { z } from "zod";
import { AuditRecordSchema, AuditRecordVerificationSchema } from "./audit.js";
import { DecisionKindSchema } from "./decision.js";
import { TaintSchema } from "./envelope.js";
import { IntentHashSchema, IsoTimestampSchema } from "./common.js";

/**
 * Wire schemas for the `audit.query` request and response.
 *
 * Six-outcome filtering is enforced by `decisionKind: DecisionKindSchema`
 * — Zod rejects anything outside the six kernel-defined kinds at the wire,
 * before the bad input reaches `AuditStore`. A request with
 * `decisionKind: "ALLOW"` returns a Zod parse error, never an empty result.
 *
 * Single-value per filter field for Phase 1.5a. Multi-select arrives in a
 * later pass when the console URL parser supports comma-separated values.
 *
 * Boundary convention (APIReviewer-003): every `since`/`until` time window
 * across the audit read surface uses INCLUSIVE bounds `[since, until]` — a
 * record qualifies when `since <= at <= until`. This is the single canonical
 * convention at every read surface: `audit.query`, `outcomeDistribution`,
 * `decisionAccuracy`, `guardFireStats`, and the CLI `export` command. The
 * admin-sdk in-memory store is the reference implementation; Postgres adapters
 * and the CLI filter match it.
 */

export const AuditQuerySchema = z.object({
  intentKind: z.string().optional(),
  decisionKind: DecisionKindSchema.optional(),
  refusalCode: z.string().optional(),
  taint: TaintSchema.optional(),
  intentHash: IntentHashSchema.optional(),
  /** ISO-8601 inclusive lower bound on `AuditRecord.at`. See module boundary convention. */
  since: IsoTimestampSchema.optional(),
  /** ISO-8601 inclusive upper bound on `AuditRecord.at`. See module boundary convention. */
  until: IsoTimestampSchema.optional(),
  /** Forward-compat slot. The in-memory store ignores it; Postgres impls use it. */
  cursor: z.string().optional(),
  /**
   * Optional tenant scope (AuthReviewer-004). When supplied, the AuditStore
   * implementation MUST filter records to this tenant. The route handler
   * resolves this from `ctx.actor` (e.g. `actor.tenantId`) or from an explicit
   * query parameter. Implementations that do not support multi-tenancy may
   * ignore this field; implementations that do MUST NOT return cross-tenant
   * records.
   */
  tenantScope: z.string().optional(),
  limit: z.number().int().min(1).max(500).default(100),
});

export const AuditQueryResultSchema = z.object({
  records: z.array(AuditRecordSchema).readonly(),
  nextCursor: z.string().optional(),
  /**
   * 092 — verify-on-read verdicts, ALIGNED BY INDEX with `records` (so
   * `verifications[i]` is the verdict for `records[i]`). OPTIONAL + additive: a
   * store that does not verify on read (the in-memory reference) simply omits it,
   * and existing consumers ignore it. The Postgres cold-store read path
   * (`createPostgresAuditStore`) populates it by running `verifyAuditRecord` over
   * each row so the admin UI can flag tampered / forged-signature records rather
   * than rendering them as authoritative (§C: reads only ADD friction).
   *
   * Length invariant: when present, `verifications.length === records.length`.
   */
  verifications: z.array(AuditRecordVerificationSchema).readonly().optional(),
  /**
   * 093 — inter-record HASH-CHAIN continuity over the returned records, grouped
   * per stream (session). OPTIONAL + additive: surfaced by the admin handler so
   * the console can render "chain intact" vs "N broken links" alongside the
   * per-record tamper verdicts. A `break` is a record whose `prevAuditHash` does
   * not equal the immediately-preceding record's `auditHash` in the same stream
   * (a deleted / reordered record) — distinct from a per-record tamper. The
   * window is read-order-scoped (out-of-window predecessors are not flagged), so
   * this is a continuity SIGNAL for the rendered page, not a global proof.
   */
  chainIntegrity: z
    .object({
      /** Records that carried a chain link checkable against an in-window predecessor. */
      checked: z.number().int(),
      /** Records whose chain link did NOT match their in-window predecessor. */
      breaks: z.array(
        z.object({
          intentHash: IntentHashSchema,
          /** The link the record claims. */
          prevAuditHash: z.string(),
          /** The in-window predecessor's actual auditHash. */
          predecessorAuditHash: z.string(),
        }),
      ).readonly(),
    })
    .optional(),
});

export type AuditQuery = z.infer<typeof AuditQuerySchema>;
export type AuditQueryResult = z.infer<typeof AuditQueryResultSchema>;
