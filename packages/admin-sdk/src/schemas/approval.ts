import { z } from "zod";
import { TaintSchema } from "./envelope.js";

/** Wire schema for the approval engine's projections (ADR-122). */
export const ApprovalStatusSchema = z.enum(["pending", "approved", "declined", "expired"]);

export const ApprovalRequestSchema = z.object({
  token: z.string(),
  sessionId: z.string(),
  intentHash: z.string(),
  intentKind: z.string(),
  prompt: z.string(),
  taint: TaintSchema,
  channel: z.string(),
  channelRef: z.string().optional(),
  status: ApprovalStatusSchema,
  requestedAt: z.string(),
  resolvedAt: z.string().optional(),
  resolvedBy: z.object({ id: z.string(), displayName: z.string().optional() }).optional(),
});

export type ApprovalRequestParsed = z.infer<typeof ApprovalRequestSchema>;

export const ApprovalListQuerySchema = z.object({
  status: ApprovalStatusSchema.optional(),
  sessionId: z.string().optional(),
  limit: z.number().int().positive().optional(),
});

export const ApprovalResolveInputSchema = z.object({
  token: z.string(),
  accepted: z.boolean(),
  reason: z.string().optional(),
});

export type ApprovalResolveInput = z.infer<typeof ApprovalResolveInputSchema>;
