import { z } from "zod";
import { IsoTimestampSchema } from "./common.js";
import { DecisionKindSchema } from "./decision.js";

/**
 * Command-risk aggregation schemas (ADR-134, follow-up to ADR-123/ADR-128).
 *
 * SECURITY — REDACTION BY CONSTRUCTION: command-risk audit records carry the
 * RAW command string in `DecisionBasis.detail.command` (guards.ts:876/903/933),
 * and that string routinely contains live secrets/credentials (the credential
 * rules fire on exactly the commands most likely to embed tokens — `echo
 * $AWS_SECRET_…`, `cat ~/.aws/credentials`). NONE of these schemas carry a
 * `command` field (nor `matchedRuleIds`, `sanitized`, or any free-text detail).
 * Because the tRPC procedures gate output through `.output(<schema>)`, even a
 * buggy handler physically cannot serialize command text past the Zod gate.
 * Only the closed-enum `category` + `disposition` and integer counts cross the
 * wire.
 */

/**
 * Closed command-risk category enum. Mirrors the kernel's `CommandRiskCategory`
 * (primitives/command-classify.ts) MINUS `"safe"` — safe commands produce no
 * basis and are never bucketed. Widening this enum requires a governed kernel
 * change to ADR-123's category set (closed; max cardinality 3).
 */
export const CommandRiskCategorySchema = z.enum(["destructive", "credential", "network"]);
export type CommandRiskCategory = z.infer<typeof CommandRiskCategorySchema>;

/**
 * Closed command-risk disposition enum. One value per guard path, named for the
 * kernel `CommandClassification.disposition` it derives from:
 *   - `refuse`  ← `validation.command_blocked` (REFUSE / irrecoverable)
 *   - `rewrite` ← `validation.command_flag_stripped` | `command_sanitized`
 *                 (sanitizing REWRITE, taint preserved)
 *   - `confirm` ← `business.rule_satisfied` with `rule: "command_risk_confirm"`
 *                 (REQUEST_CONFIRMATION — cross-links the Approval Center)
 * Closed; max cardinality 3.
 */
export const CommandRiskDispositionSchema = z.enum(["refuse", "rewrite", "confirm"]);
export type CommandRiskDisposition = z.infer<typeof CommandRiskDispositionSchema>;

/**
 * Input for `governance.commandRisk` — aggregates command-risk dispositions over
 * an inclusive `[since, until]` window.
 *
 * - `since` required ISO-8601 lower bound (`at >= since`).
 * - `until` optional inclusive upper bound; handler resolves "now" via its
 *   injected clock when omitted (same convention as piiClassificationStats).
 * - `packId` optional filter (reserved; counts are basis-derived and
 *   pack-agnostic).
 */
export const CommandRiskQuerySchema = z.object({
  since: IsoTimestampSchema,
  until: IsoTimestampSchema.optional(),
  packId: z.string().optional(),
});
export type CommandRiskQuery = z.infer<typeof CommandRiskQuerySchema>;

/** One `(category × disposition)` count bucket. Max 3×3 = 9, fully bounded. */
export const CommandRiskBucketSchema = z.object({
  category: CommandRiskCategorySchema,
  disposition: CommandRiskDispositionSchema,
  count: z.number().int().nonnegative(),
});
export type CommandRiskBucket = z.infer<typeof CommandRiskBucketSchema>;

export const CommandRiskResultSchema = z.object({
  buckets: z.array(CommandRiskBucketSchema),
});
export type CommandRiskResult = z.infer<typeof CommandRiskResultSchema>;

/**
 * Input for `governance.commandRiskEvents` (ADR-134) — event-level drill-down of
 * command-risk dispositions over an inclusive `[since, until]` window, with an
 * optional category/disposition filter and a result cap.
 */
export const CommandRiskEventsQuerySchema = z.object({
  since: IsoTimestampSchema,
  until: IsoTimestampSchema.optional(),
  category: CommandRiskCategorySchema.optional(),
  disposition: CommandRiskDispositionSchema.optional(),
  packId: z.string().optional(),
  /** Max events to return (handler caps at 500). */
  limit: z.number().int().positive().max(500).optional(),
});
export type CommandRiskEventsQuery = z.infer<typeof CommandRiskEventsQuerySchema>;

/**
 * One command-risk disposition event — a single (record × command basis)
 * occurrence. Carries ONLY non-sensitive metadata to support an operator
 * drill-down (link to the Decision Detail by `intentHash`). It NEVER includes
 * the raw command, the sanitized command, the stripped flags, or the matched
 * rule ids — the command text is tainted (untrusted, LLM-proposed, may contain
 * secrets) and must never leave the kernel into this surface.
 */
export const CommandRiskEventSchema = z.object({
  intentHash: z.string(),
  at: IsoTimestampSchema,
  intentKind: z.string(),
  decisionKind: DecisionKindSchema,
  category: CommandRiskCategorySchema,
  disposition: CommandRiskDispositionSchema,
});
export type CommandRiskEvent = z.infer<typeof CommandRiskEventSchema>;

export const CommandRiskEventsResultSchema = z.object({
  events: z.array(CommandRiskEventSchema),
  /** True when the window held more matching events than `limit`. */
  truncated: z.boolean(),
});
export type CommandRiskEventsResult = z.infer<typeof CommandRiskEventsResultSchema>;
