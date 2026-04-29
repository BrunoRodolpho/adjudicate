import { z } from "zod";
import type { Decision, DecisionKind } from "@adjudicate/core";
import { DecisionBasisSchema } from "./basis.js";
import { IntentEnvelopeSchema } from "./envelope.js";
import { RefusalSchema } from "./refusal.js";

/**
 * Wire-side schemas for `DecisionKind` and `Decision`.
 *
 * `Decision` is a discriminated union over six kinds — the framework's
 * distinguishing claim made explicit:
 *   EXECUTE, REFUSE, ESCALATE, REQUEST_CONFIRMATION, DEFER, REWRITE.
 *
 * `z.discriminatedUnion("kind", [...])` (vs. plain `z.union`) gives:
 *   - O(1) parse dispatch on the discriminator
 *   - surgical error messages naming the failing branch, not "no union member matched"
 */

export const DecisionKindSchema = z.enum([
  "EXECUTE",
  "REFUSE",
  "ESCALATE",
  "REQUEST_CONFIRMATION",
  "DEFER",
  "REWRITE",
]);

const BasisArray = z.array(DecisionBasisSchema).readonly();

const DecisionExecuteSchema = z.object({
  kind: z.literal("EXECUTE"),
  basis: BasisArray,
});

const DecisionRefuseSchema = z.object({
  kind: z.literal("REFUSE"),
  refusal: RefusalSchema,
  basis: BasisArray,
});

const DecisionEscalateSchema = z.object({
  kind: z.literal("ESCALATE"),
  to: z.enum(["human", "supervisor"]),
  reason: z.string(),
  basis: BasisArray,
});

const DecisionRequestConfirmationSchema = z.object({
  kind: z.literal("REQUEST_CONFIRMATION"),
  prompt: z.string(),
  basis: BasisArray,
});

const DecisionDeferSchema = z.object({
  kind: z.literal("DEFER"),
  signal: z.string(),
  timeoutMs: z.number().int().nonnegative(),
  basis: BasisArray,
});

const DecisionRewriteSchema = z.object({
  kind: z.literal("REWRITE"),
  rewritten: IntentEnvelopeSchema,
  reason: z.string(),
  basis: BasisArray,
});

export const DecisionSchema = z.discriminatedUnion("kind", [
  DecisionExecuteSchema,
  DecisionRefuseSchema,
  DecisionEscalateSchema,
  DecisionRequestConfirmationSchema,
  DecisionDeferSchema,
  DecisionRewriteSchema,
]);

// ─── Build-time drift guards ────────────────────────────────────────────────
// `DecisionKind` is bidirectional — the union of literal strings is closed
// on both sides. Adding a 7th kind to core breaks `_kindCoreToSchema`;
// renaming a kind in this file breaks `_kindSchemaToCore`.
//
// `Decision` itself is one-directional (core → schema only). The schema's
// `basis` field has `code: string`, while core's `DecisionBasis<C>` has
// the narrow per-category `BasisCode<C>` union. Wide-to-narrow assignment
// fails — the schema is intentionally looser on the basis vocabulary
// (kernel's `withBasisAudit` validates basis codes at emission, not at
// the wire). The schema-to-core direction is therefore not assertable;
// runtime parse + cast at the call site is the contract.

const _kindCoreToSchema = (
  x: DecisionKind,
): z.infer<typeof DecisionKindSchema> => x;
const _kindSchemaToCore = (
  x: z.infer<typeof DecisionKindSchema>,
): DecisionKind => x;

const _decisionCoreToSchema = (
  x: Decision,
): z.infer<typeof DecisionSchema> => x;

void [_kindCoreToSchema, _kindSchemaToCore, _decisionCoreToSchema];
