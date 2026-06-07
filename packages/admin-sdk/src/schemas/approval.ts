import { z } from "zod";
import { TaintSchema } from "./envelope.js";
import { IntentHashSchema } from "./common.js";
import { SupersessionReasonSchema } from "./audit.js";

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

// ─── Decision history (ADR-136, read-only) ──────────────────────────────────
//
// A durable projection of resolved/expired approvals. Where `approval.list`
// answers "what is pending right now", `approval.history` answers "what did we
// decide", backed by the persisted ApprovalRegistry projection. Read-only;
// requires an actor; never carries the envelope blob.

export const ApprovalHistoryQuerySchema = z.object({
  sessionId: z.string().optional(),
  // Reuse the CLOSED ApprovalStatusSchema — never widened. Omit to return all
  // non-pending (resolved/expired) entries.
  status: ApprovalStatusSchema.optional(),
  limit: z.number().int().min(1).max(500).default(100),
});

export type ApprovalHistoryQuery = z.infer<typeof ApprovalHistoryQuerySchema>;

export const ApprovalHistoryEntrySchema = z.object({
  token: z.string(),
  sessionId: z.string(),
  intentHash: z.string(),
  intentKind: z.string(),
  status: ApprovalStatusSchema,
  requestedAt: z.string(),
  resolvedAt: z.string().optional(),
  /**
   * The actor the resolution was ATTRIBUTED to. This is a CLAIM, not a proof:
   * it is sourced from the forgeable `x-adjudicate-actor-*` headers (the shared
   * console bearer token authenticates the console, not the human operator).
   * Treat `resolvedBy` as an attestation until real per-operator identity
   * (OIDC/Clerk) lands. See ADR-136 §"RBAC gap". The field name keeps the
   * provenance honest: it is who CLAIMED to resolve, not a verified principal.
   */
  resolvedBy: z
    .object({ id: z.string(), displayName: z.string().optional() })
    .optional(),
});

export type ApprovalHistoryEntry = z.infer<typeof ApprovalHistoryEntrySchema>;

export const ApprovalHistoryResultSchema = z.object({
  entries: z.array(ApprovalHistoryEntrySchema),
});

export type ApprovalHistoryResult = z.infer<typeof ApprovalHistoryResultSchema>;

// ─── Audit chain (ADR-136, read-only) ───────────────────────────────────────
//
// Joins an approval request → its resolution → the resumed-decision AuditRecord
// by walking the FROZEN core `AuditRecord.supersedes` lineage (reasons
// `confirmation_resolved` / `defer_resumed`). No new lineage taxonomy — the
// chain is reconstructed from existing audit links via `ctx.store`.

/** Closed enum — bounded cardinality (3). Never widened (widening = MAJOR). */
export const ApprovalChainStepKindSchema = z.enum([
  "requested",
  "resolved",
  "resumed",
]);

export type ApprovalChainStepKind = z.infer<typeof ApprovalChainStepKindSchema>;

export const ApprovalChainQuerySchema = z.object({
  intentHash: IntentHashSchema,
});

export type ApprovalChainQuery = z.infer<typeof ApprovalChainQuerySchema>;

export const ApprovalChainStepSchema = z.object({
  kind: ApprovalChainStepKindSchema,
  /** ISO timestamp sourced from the projection/ledger — never wall-clock. */
  at: z.string(),
  /** The intentHash of the AuditRecord backing this step (deep-link target). */
  intentHash: z.string().optional(),
  /** The frozen core supersession reason for ledger-backed steps. Reused, never widened. */
  supersedesReason: SupersessionReasonSchema.optional(),
  /** Confirmation/resume token PRESENCE only — never the token value. */
  tokenPresent: z.boolean(),
  status: ApprovalStatusSchema.optional(),
  /** Claimed actor (see ApprovalHistoryEntry.resolvedBy — forgeable until OIDC). */
  actor: z
    .object({ id: z.string(), displayName: z.string().optional() })
    .optional(),
});

export type ApprovalChainStep = z.infer<typeof ApprovalChainStepSchema>;

export const ApprovalChainResultSchema = z.object({
  /** Chronological ascending (requested → resolved → resumed). Length-bounded. */
  steps: z.array(ApprovalChainStepSchema),
});

export type ApprovalChainResult = z.infer<typeof ApprovalChainResultSchema>;
