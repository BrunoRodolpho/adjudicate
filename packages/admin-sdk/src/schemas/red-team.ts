import { z } from "zod";
import { DecisionKindSchema } from "./decision.js";

/**
 * Wire schema for a red-team report (ADR-118). Mirrors `@adjudicate/red-team`'s
 * `RedTeamReport` structurally so admin-sdk carries no dependency on that
 * package — the console computes the report and threads it into context.
 */
export const AttackVectorSchema = z.enum([
  "prompt_injection",
  "taint_escalation",
  "tool_scope_violation",
]);

export const RedTeamStatusSchema = z.enum(["defended", "escaped", "error"]);

export const RedTeamResultSchema = z.object({
  name: z.string(),
  vector: AttackVectorSchema,
  status: RedTeamStatusSchema,
  decision: DecisionKindSchema.optional(),
  basisCodes: z.array(z.string()).optional(),
  acceptable: z.array(DecisionKindSchema),
  error: z.string().optional(),
});

export const RedTeamSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  defended: z.number().int().nonnegative(),
  escaped: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  escapesByVector: z.object({
    prompt_injection: z.number().int().nonnegative(),
    taint_escalation: z.number().int().nonnegative(),
    tool_scope_violation: z.number().int().nonnegative(),
  }),
});

export const RedTeamReportSchema = z.object({
  pack: z.object({ id: z.string() }),
  results: z.array(RedTeamResultSchema),
  summary: RedTeamSummarySchema,
});

export type RedTeamReportParsed = z.infer<typeof RedTeamReportSchema>;
