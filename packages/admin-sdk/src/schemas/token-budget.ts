import { z } from "zod";
import { IsoTimestampSchema } from "./common.js";

/**
 * Wire schema for token-budget telemetry (ADR-120). Per-session cumulative
 * token consumption vs the configured budget, fed by the adapter's
 * `onTokenUsage` hook into an adopter-supplied store.
 */
export const TokenBudgetQuerySchema = z.object({
  since: IsoTimestampSchema.optional(),
  sessionId: z.string().optional(),
});

export type TokenBudgetQuery = z.infer<typeof TokenBudgetQuerySchema>;

export const TokenBudgetSessionSchema = z.object({
  sessionId: z.string(),
  consumed: z.number().int().nonnegative(),
  budget: z.number().int().nonnegative().optional(),
  remaining: z.number().int().optional(),
});

export const TokenBudgetResultSchema = z.object({
  sessions: z.array(TokenBudgetSessionSchema),
  totalConsumed: z.number().int().nonnegative(),
});

export type TokenBudgetResult = z.infer<typeof TokenBudgetResultSchema>;
