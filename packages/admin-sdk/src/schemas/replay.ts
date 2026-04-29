import { z } from "zod";
import type {
  ReplayMismatch,
  ReplayMismatchKind,
} from "@adjudicate/audit";
import { AuditRecordSchema } from "./audit.js";
import { DecisionSchema } from "./decision.js";

/**
 * Wire-side schemas for the replay verification surface.
 *
 * Mirror the existing types in `@adjudicate/audit/replay.ts` (`replay()`,
 * `classify()` already implement the diff logic). The Zod schemas are the
 * SDK-side wire contract — drift between the kernel-side classifier and
 * the SDK schema would silently corrupt the diff UI.
 *
 * Build-time guards at the bottom of this file pin the alignment:
 * `ReplayMismatchKind` is bidirectional (closed enum); `ReplayMismatch`
 * is one-directional (its embedded `Decision` schema is intentionally
 * looser on basis vocabulary — same asymmetry as decision.ts and
 * audit.ts).
 */

export const ReplayMismatchKindSchema = z.enum([
  "DECISION_KIND",
  "BASIS_DRIFT",
  "REFUSAL_CODE_DRIFT",
]);

export const ReplayBasisDeltaSchema = z.object({
  missing: z.array(z.string()).readonly(),
  extra: z.array(z.string()).readonly(),
});

export const ReplayMismatchSchema = z.object({
  intentHash: z.string(),
  kind: ReplayMismatchKindSchema,
  expected: DecisionSchema,
  actual: DecisionSchema,
  basisDelta: ReplayBasisDeltaSchema.optional(),
});

/** Honest indicator of state-retrieval fidelity. */
export const StateSourceSchema = z.enum(["synthetic", "adopter"]);

export const ReplayResultSchema = z.object({
  /** The historical record the operator asked to replay. */
  original: AuditRecordSchema,
  /** What the kernel produces TODAY, against the resolved state. */
  recomputed: DecisionSchema,
  /**
   * Structured diff. `null` when the recomputed Decision matches the
   * original on kind + basis flat-set + (for REFUSE) refusal code.
   */
  classification: ReplayMismatchSchema.nullable(),
  /**
   * Where the state came from. Operators interpreting the result MUST
   * read this — a "synthetic" replay can't distinguish policy regression
   * from state divergence.
   */
  stateSource: StateSourceSchema,
});

export type ReplayMismatchKindParsed = z.infer<typeof ReplayMismatchKindSchema>;
export type ReplayBasisDeltaParsed = z.infer<typeof ReplayBasisDeltaSchema>;
export type ReplayMismatchParsed = z.infer<typeof ReplayMismatchSchema>;
export type StateSource = z.infer<typeof StateSourceSchema>;
export type ReplayResult = z.infer<typeof ReplayResultSchema>;

// ─── Build-time drift guards ────────────────────────────────────────────────
// Bidirectional on ReplayMismatchKind (closed enum). One-directional on
// ReplayMismatch — schema's embedded Decision has wider basis.code than
// core's narrow per-category type. Same asymmetry as decision.ts.

const _kindCoreToSchema = (
  x: ReplayMismatchKind,
): z.infer<typeof ReplayMismatchKindSchema> => x;
const _kindSchemaToCore = (
  x: z.infer<typeof ReplayMismatchKindSchema>,
): ReplayMismatchKind => x;

const _mismatchCoreToSchema = (
  x: ReplayMismatch,
): z.infer<typeof ReplayMismatchSchema> => x;

void [_kindCoreToSchema, _kindSchemaToCore, _mismatchCoreToSchema];
