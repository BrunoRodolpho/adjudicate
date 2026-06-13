import { z } from "zod";

/**
 * Wire schemas for the Adjutant operator surface (task 13).
 *
 * Incident rows JOIN the IncidentProjection's remediation status over the
 * adopter's IncidentState metadata; proposals are the RemediationProposalStore
 * read-model (the internal envelope is NEVER shipped). Approvals reuse
 * `schemas/approval.ts`.
 *
 * DETERMINISM: telemetry/coordination read-models, outside the determinism
 * boundary — never a kernel input.
 */

export const RemediationDispositionSchema = z.enum(["SAFE", "REVIEW", "MANUAL"]);
export type RemediationDispositionParsed = z.infer<typeof RemediationDispositionSchema>;

export const PendingActionSchema = z.object({
  kind: z.enum(["review", "escalation", "defer"]),
  prompt: z.string().optional(),
  reason: z.string().optional(),
  signal: z.string().optional(),
  timeoutMs: z.number().int().nonnegative().optional(),
});

export const IncidentDependencySchema = z.object({
  service: z.string(),
  status: z.enum(["up", "down", "degraded"]),
});

export const IncidentRowSchema = z.object({
  incidentId: z.string(),
  severity: z.enum(["sev1", "sev2", "sev3", "sev4"]),
  status: z.enum(["open", "investigating", "remediating", "resolved", "escalated"]),
  dependencies: z.array(IncidentDependencySchema),
  /** Last remediation disposition, when this incident has been handled. */
  lastDisposition: RemediationDispositionSchema.optional(),
  executed: z.boolean(),
  pending: PendingActionSchema.nullable(),
  updatedAt: z.string(),
});
export type IncidentRowParsed = z.infer<typeof IncidentRowSchema>;

export const IncidentListQuerySchema = z.object({
  status: z.string().optional(),
  limit: z.number().int().positive().max(500).optional(),
});
export type IncidentListQuery = z.infer<typeof IncidentListQuerySchema>;

export const RemediationProposalStatusSchema = z.enum([
  "executed",
  "pending_review",
  "pending_escalation",
  "declined",
  "refused",
  "deferred",
]);

export const RemediationProposalSchema = z.object({
  proposalId: z.string(),
  incidentId: z.string(),
  action: z.string(),
  blastRadius: z.number().int().nonnegative(),
  disposition: RemediationDispositionSchema,
  status: RemediationProposalStatusSchema,
  approvalToken: z.string().optional(),
  intentHash: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RemediationProposalParsed = z.infer<typeof RemediationProposalSchema>;

export const ProposalListQuerySchema = z.object({
  incidentId: z.string().optional(),
  status: z.string().optional(),
  limit: z.number().int().positive().max(500).optional(),
});
export type ProposalListQuery = z.infer<typeof ProposalListQuerySchema>;
