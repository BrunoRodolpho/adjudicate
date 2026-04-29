import { z } from "zod";

/**
 * Emergency-status state vocabulary.
 *
 * NORMAL    — kernel operates per its declared policies. Default.
 * DENY_ALL  — every intent is REFUSEd with `kill_switch_active`.
 *             Matches the kernel's existing `setKillSwitch(true, reason)`
 *             semantics in @adjudicate/audit. No bypass mode is shipped:
 *             the framework's whole thesis is that the LLM proposes and
 *             the kernel disposes; a "let everything through" switch
 *             would be architecturally hostile.
 *
 * Phase 2a is global only — pack-level overrides require a kernel API
 * change (separate ADR) and ship in a follow-up pass.
 */
export const EmergencyStatusSchema = z.enum(["NORMAL", "DENY_ALL"]);

/**
 * Operator identity. Resolved at the route handler from
 * `x-adjudicate-actor-id` (required) and `x-adjudicate-actor-name`
 * (optional) headers populated by the adopter's auth middleware.
 */
export const ActorSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().optional(),
});

export const EmergencyStateSchema = z.object({
  status: EmergencyStatusSchema,
  reason: z.string(),
  toggledAt: z.string(),
  toggledBy: ActorSchema,
});

/**
 * One operator action — separate from `AuditRecord` because human-
 * initiated state changes have a fundamentally different shape from
 * automated kernel decisions: no envelope, no Decision, no PolicyBundle.
 * Stored in `EmergencyStateStore`, not `AuditStore`.
 */
export const GovernanceEventSchema = z.object({
  id: z.string(),
  at: z.string(),
  kind: z.literal("emergency.update"),
  actor: ActorSchema,
  previousStatus: EmergencyStatusSchema,
  newStatus: EmergencyStatusSchema,
  reason: z.string(),
});

/**
 * Mutation input.
 *
 * `confirmationPhrase` MUST equal `newStatus` exactly (case-sensitive).
 * The `.refine` enforces this at the schema layer so a malformed request
 * is rejected by Zod before the handler sees it — tRPC converts the
 * Zod error to a BAD_REQUEST automatically.
 *
 * The console UI surfaces this as a "Type DENY_ALL to confirm" input;
 * the schema exists so that bypassing the UI (raw HTTP, scripts) cannot
 * skip the confirmation gate.
 */
export const EmergencyUpdateInputSchema = z
  .object({
    newStatus: EmergencyStatusSchema,
    reason: z.string().min(10).max(500),
    confirmationPhrase: z.string(),
  })
  .refine((data) => data.confirmationPhrase === data.newStatus, {
    message:
      "confirmationPhrase must equal newStatus exactly (case-sensitive)",
    path: ["confirmationPhrase"],
  });

export const EmergencyHistoryQuerySchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
});

export type EmergencyStatus = z.infer<typeof EmergencyStatusSchema>;
export type Actor = z.infer<typeof ActorSchema>;
export type EmergencyState = z.infer<typeof EmergencyStateSchema>;
export type GovernanceEvent = z.infer<typeof GovernanceEventSchema>;
export type EmergencyUpdateInput = z.infer<typeof EmergencyUpdateInputSchema>;
export type EmergencyHistoryQuery = z.infer<typeof EmergencyHistoryQuerySchema>;
