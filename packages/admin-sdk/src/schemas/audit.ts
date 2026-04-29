import { z } from "zod";
import type { AuditPlanSnapshot, AuditRecord } from "@adjudicate/core";
import { DecisionBasisSchema } from "./basis.js";
import { DecisionSchema } from "./decision.js";
import { IntentEnvelopeSchema } from "./envelope.js";

/**
 * Wire-side schemas for `AuditPlanSnapshot` and `AuditRecord`.
 *
 * `version` is `1 | 2` — readers MUST branch on it before accessing
 * v2-only fields (`plan`). The kernel emits v2 today; v1-shaped records
 * still validate against this schema with `plan` undefined.
 */

export const AuditPlanSnapshotSchema = z.object({
  visibleReadTools: z.array(z.string()).readonly(),
  allowedIntents: z.array(z.string()).readonly(),
  forbiddenConcepts: z.array(z.string()).readonly(),
  /** sha256(canonical({visibleReadTools, allowedIntents})). Dedup key. */
  planFingerprint: z.string(),
});

export const AuditRecordSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  intentHash: z.string(),
  envelope: IntentEnvelopeSchema,
  decision: DecisionSchema,
  decision_basis: z.array(DecisionBasisSchema).readonly(),
  resourceVersion: z.string().optional(),
  /** ISO-8601 decision timestamp. */
  at: z.string(),
  durationMs: z.number(),
  plan: AuditPlanSnapshotSchema.optional(),
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
