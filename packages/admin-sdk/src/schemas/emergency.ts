import { z } from "zod";
import { IntentHashSchema } from "./common.js";

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
 * `x-adjudicate-actor-id` (required), `x-adjudicate-actor-name`
 * (optional), and `x-adjudicate-actor-tenant` (optional) headers populated by
 * the adopter's auth middleware.
 *
 * `tenantId` (ADR-135) is the minimal, ADDITIVE-OPTIONAL multi-tenant
 * dimension. It realizes the pre-existing `AuditQuerySchema.tenantScope`
 * convention (documented as resolved "from `ctx.actor` (e.g. `actor.tenantId`)")
 * with a real field. Single-tenant adopters omit it entirely. Tenant isolation
 * is still enforced by the adopter's auth middleware + the store's tenant
 * filter — `extractActor` does NOT authenticate (a publicly-mounted route lets a
 * caller forge this header; see the deployment runbook).
 */
export const ActorSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().optional(),
  tenantId: z.string().min(1).optional(),
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

// ─── 114 — Escalate / recommend surface (escalate-only, rate-limited) ────────
//
// The Adjudicant (Inspector-General) OBSERVER plane is permitted exactly ONE
// friction-monotone write: it can RAISE an escalation/recommendation against an
// audited decision. It can NEVER authorize, weaken, lower a threshold, override
// a refusal, or mint an EXECUTE. This is the wire-level realization of §C/§D
// inv.7 monotonicity for a non-deterministic (operator) component: the surface
// emits friction-INCREASING FACTS only — never a `Decision`.
//
// The recommendation vocabulary is closed and friction-only by construction —
// the SAME design as `EmergencyStatusSchema` ("No allow-all/bypass status"):
//
//   pause    — recommend a hold / freeze pending review (highest friction).
//   review   — recommend human review of the decision (manual scrutiny).
//   escalate — recommend escalation to a higher authority / incident process.
//
// There is DELIBERATELY no `allow` / `bypass` / `override` / `lower-threshold` /
// `EXECUTE` value. A raw-HTTP caller cannot smuggle a friction-decreasing
// recommendation past the UI because the enum itself admits none — exactly as
// the emergency status enum cannot express a "let everything through" mode.
export const EscalateRecommendationSchema = z.enum([
  "pause",
  "review",
  "escalate",
]);

/**
 * Escalate-mutation input.
 *
 * `intentHash` keys the escalation to a real audited decision (resolved
 * read-only via `AuditStore.getByIntentHash` — the surface READS but never
 * mutates the audit record). `recommendation` is the friction-only verb.
 * `reason` is a mandatory operator justification (same 10..500 rigor as the
 * emergency-update reason — an escalation without a stated basis is governance
 * noise).
 */
export const EscalateInputSchema = z.object({
  intentHash: IntentHashSchema,
  recommendation: EscalateRecommendationSchema,
  reason: z.string().min(10).max(500),
});

/**
 * A recorded escalation/recommendation FACT — the output of the escalate
 * mutation. It is explicitly NOT a `Decision` (no `decision` field, no kernel
 * outcome): the closed 6-outcome Decision algebra (§D inv.2) is untouched. The
 * `raisedBy` actor is a CLAIM until real per-operator identity (OIDC) — the
 * same posture as `approval.resolve`'s `resolvedBy`.
 */
export const RecordedEscalationSchema = z.object({
  id: z.string().min(1),
  at: z.string(),
  kind: z.literal("escalation.raised"),
  intentHash: IntentHashSchema,
  recommendation: EscalateRecommendationSchema,
  reason: z.string(),
  raisedBy: ActorSchema,
});

export type EscalateRecommendation = z.infer<
  typeof EscalateRecommendationSchema
>;
export type EscalateInput = z.infer<typeof EscalateInputSchema>;
export type RecordedEscalation = z.infer<typeof RecordedEscalationSchema>;

export type EmergencyStatus = z.infer<typeof EmergencyStatusSchema>;
export type Actor = z.infer<typeof ActorSchema>;
export type EmergencyState = z.infer<typeof EmergencyStateSchema>;
export type GovernanceEvent = z.infer<typeof GovernanceEventSchema>;
export type EmergencyUpdateInput = z.infer<typeof EmergencyUpdateInputSchema>;
export type EmergencyHistoryQuery = z.infer<typeof EmergencyHistoryQuerySchema>;
