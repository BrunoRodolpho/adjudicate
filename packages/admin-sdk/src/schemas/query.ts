import { z } from "zod";
import { AuditRecordSchema } from "./audit.js";
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
});

export type AuditQuery = z.infer<typeof AuditQuerySchema>;
export type AuditQueryResult = z.infer<typeof AuditQueryResultSchema>;
