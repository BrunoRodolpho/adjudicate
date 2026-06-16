import { z } from "zod";

/** One persisted LLM-call trace (tRPC output shape). Mirrors TurnTraceCall. */
export const TurnTraceCallSchema = z.object({
  turnId: z.string(),
  callIndex: z.number().int(),
  conversationId: z.string(),
  intentHash: z.string().nullable(),
  model: z.string(),
  temperature: z.number(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  promptManifest: z.array(z.string()).readonly(),
  completion: z.string(),
  durationMs: z.number().int(),
  recordedAt: z.string(),
  schemaVersion: z.number().int().nullable(),
});

export type TurnTraceCallDTO = z.infer<typeof TurnTraceCallSchema>;

export const TurnTraceListSchema = z.object({
  calls: z.array(TurnTraceCallSchema),
});

export const TraceByTurnQuerySchema = z.object({
  turnId: z.string().min(1).max(256),
});

export const TraceByConversationQuerySchema = z.object({
  conversationId: z.string().min(1).max(256),
  limit: z.number().int().min(1).max(500).optional(),
});
