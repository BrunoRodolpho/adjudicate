import { z } from "zod";
import { AuditRecordSchema } from "./audit.js";
import { DecisionKindSchema } from "./decision.js";
import { TaintSchema } from "./envelope.js";

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
 */

export const AuditQuerySchema = z.object({
  intentKind: z.string().optional(),
  decisionKind: DecisionKindSchema.optional(),
  refusalCode: z.string().optional(),
  taint: TaintSchema.optional(),
  intentHash: z.string().optional(),
  /** ISO-8601 inclusive lower bound on `AuditRecord.at`. */
  since: z.string().datetime().optional(),
  /** ISO-8601 inclusive upper bound on `AuditRecord.at`. */
  until: z.string().datetime().optional(),
  /** Forward-compat slot. The in-memory store ignores it; Postgres impls use it. */
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(500).default(100),
});

export const AuditQueryResultSchema = z.object({
  records: z.array(AuditRecordSchema).readonly(),
  nextCursor: z.string().optional(),
});

export type AuditQuery = z.infer<typeof AuditQuerySchema>;
export type AuditQueryResult = z.infer<typeof AuditQueryResultSchema>;
