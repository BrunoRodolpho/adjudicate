import { z } from "zod";
import type { AuditPlanSnapshot, AuditRecord } from "@adjudicate/core";
import { DecisionBasisSchema } from "./basis.js";
import { DecisionSchema } from "./decision.js";
import {
  IntentEnvelopeSchema,
  RecordedAggregateSnapshotSchema,
  RecordedAuthoritySnapshotSchema,
} from "./envelope.js";
import { IntentHashSchema, IsoTimestampSchema } from "./common.js";

/**
 * Wire-side schemas for `AuditPlanSnapshot` and `AuditRecord`.
 *
 * `version` is `1 | 2 | 3` — readers MUST branch on it before accessing
 * v2-only fields (`plan`) or v3-only fields (`supersedes`). The kernel
 * emits v3 today; v1/v2-shaped records still validate.
 */

export const AuditPlanSnapshotSchema = z.object({
  visibleReadTools: z.array(z.string()).readonly(),
  allowedIntents: z.array(z.string()).readonly(),
  /** sha256(canonical({visibleReadTools, allowedIntents})). Dedup key. */
  planFingerprint: z.string(),
});

/** v3 — predecessor link for confirmation_resolved / defer_resumed / rewrite_executed / replay / budget_satisfied / lgpd_scrub. */
export const SupersessionReasonSchema = z.enum([
  "confirmation_resolved",
  "defer_resumed",
  "rewrite_executed",
  "replay",
  // 025 — capabilities-as-budgets: a budget-satisfied EXECUTE supersedes the
  // REQUEST_CONFIRMATION it was substituted for.
  "budget_satisfied",
  "lgpd_scrub",
]);

export const SupersessionSchema = z.object({
  predecessorIntentHash: IntentHashSchema,
  predecessorAt: z.string(),
  reason: SupersessionReasonSchema,
  token: z.string().optional(),
  // 071-F1 — the bound (capability, approver, channel) tuple a
  // confirmation_resolved supersession links. IS part of the auditHash pre-image
  // (it is a recorded supersession field, unlike signature/metadata), so the wire
  // schema MUST carry it: dropping it on the read path makes a binding-bearing
  // record re-derive a different auditHash → 092 verify-on-read FALSELY flags it
  // tampered. Each sub-key is optional and the whole `binding` is optional, so a
  // confirmation with no binding stays byte-identical (hash-stable).
  binding: z
    .object({
      capability: z.string().optional(),
      approver: z.string().optional(),
      channel: z.string().optional(),
    })
    .optional(),
});

/**
 * 092 — per-record verification verdict from `verifyAuditRecord`. The cold-store
 * read path verifies each returned record and surfaces this alongside it so the
 * admin UI can render tamper / signature status. Mirrors the core
 * `AuditRecordVerification` discriminated union (audit.ts):
 *   - `{ verified: true }` — auditHash intact AND any present signature verifies.
 *   - `{ verified: false, reason: "tampered" | "envelope_intent_mismatch",
 *        derived, stored }` — the bytes were modified after build.
 *   - `{ verified: false, reason: "invalid_signature", keyId, alg }` — the bytes
 *        are intact but a present signature is not authentic.
 *   - `{ verified: null, reason: "missing_hash" }` — pre-v4 record (no auditHash).
 */
export const AuditRecordVerificationSchema = z.union([
  z.object({ verified: z.literal(true) }),
  z.object({
    verified: z.literal(false),
    reason: z.enum(["tampered", "envelope_intent_mismatch"]),
    derived: z.string(),
    stored: z.string(),
  }),
  z.object({
    verified: z.literal(false),
    reason: z.literal("invalid_signature"),
    keyId: z.string(),
    alg: z.string(),
  }),
  z.object({ verified: z.null(), reason: z.literal("missing_hash") }),
]);

export const AuditRecordSchema = z.object({
  version: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  intentHash: IntentHashSchema,
  envelope: IntentEnvelopeSchema,
  decision: DecisionSchema,
  decision_basis: z.array(DecisionBasisSchema).readonly(),
  resourceVersion: z.string().optional(),
  /** ISO-8601 decision timestamp. */
  at: IsoTimestampSchema,
  durationMs: z.number(),
  plan: AuditPlanSnapshotSchema.optional(),
  supersedes: SupersessionSchema.optional(),
  kernelIdentity: z
    .object({ id: z.string(), version: z.string() })
    .optional(),
  // v4+ additive fields
  policyVersion: z.string().optional(),
  kernelVersion: z.string().optional(),
  auditHash: z.string().optional(),
  signature: z
    .object({
      keyId: z.string(),
      alg: z.string(),
      value: z.string(),
    })
    .optional(),
  // 033 — the RECORDED authority snapshot the decision was injected with
  // (graph + content-address). OPTIONAL + IN the auditHash pre-image; absent for
  // decisions that injected no snapshot. Surfaced so recorded decisions expose
  // it for replay/inspection (§D-5, invariant #5).
  authoritySnapshot: RecordedAuthoritySnapshotSchema.optional(),
  // 052 — the RECORDED aggregate/limit snapshot the decision was injected with
  // (snapshot + content-address). OPTIONAL + IN the auditHash pre-image. MUST be
  // carried here: omitting it strips the field at the wire boundary and a
  // snapshot-bearing record re-derives a different auditHash → 092 verify-on-read
  // FALSELY flags it tampered (the 092-F1 read-path hazard 093 closes).
  aggregateSnapshot: RecordedAggregateSnapshotSchema.optional(),
  // v5+ additive: governance/observability metadata (e.g. hallucination_score).
  metadata: z.record(z.string(), z.unknown()).optional(),
  // 093 — the inter-record hash-chain link (the per-stream cryptographic tip).
  // EXCLUDED from the auditHash pre-image (like signature/metadata), so dropping
  // it would NOT false-tamper — but it is carried so the admin/console read path
  // can surface chain status. Absent for genesis / pre-093 records.
  prevAuditHash: z.string().optional(),
});

// ─── Build-time drift guards ────────────────────────────────────────────────
// `AuditPlanSnapshot` is bidirectional — both sides have plain string
// arrays and a hash string.
//
// `AuditRecord` is one-directional (core → schema only). Same reason as
// `Decision`: the embedded `decision_basis` and `decision.basis` arrays
// carry `DecisionBasis` which is narrow on `code` in core and wide on
// `code: string` in the schema. See decision.ts for the full reasoning.

const _planCoreToSchema = (
  x: AuditPlanSnapshot,
): z.infer<typeof AuditPlanSnapshotSchema> => x;
const _planSchemaToCore = (
  x: z.infer<typeof AuditPlanSnapshotSchema>,
): AuditPlanSnapshot => x;

const _recordCoreToSchema = (
  x: AuditRecord,
): z.infer<typeof AuditRecordSchema> => x;

void [_planCoreToSchema, _planSchemaToCore, _recordCoreToSchema];
