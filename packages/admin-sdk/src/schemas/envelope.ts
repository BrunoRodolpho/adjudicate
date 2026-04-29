import { z } from "zod";
import type { IntentActor, IntentEnvelope, Taint } from "@adjudicate/core";

/**
 * Wire-side schemas for `IntentEnvelope`, `IntentActor`, and `Taint`.
 *
 * Mirror the canonical types in `packages/core/src/envelope.ts` and
 * `packages/core/src/taint.ts`. Drift is caught by:
 *   1. The `_coreToSchema` / `_schemaToCore` build-time guards at the
 *      bottom of this file.
 *   2. The runtime roundtrip test at `tests/schemas-roundtrip.test.ts`.
 *   3. Workspace CI running `pnpm -r test`.
 */

export const TaintSchema = z.enum(["SYSTEM", "TRUSTED", "UNTRUSTED"]);

export const IntentActorSchema = z.object({
  principal: z.enum(["llm", "user", "system"]),
  sessionId: z.string(),
});

export const IntentEnvelopeSchema = z.object({
  version: z.literal(2),
  kind: z.string(),
  payload: z.unknown(),
  /** ISO-8601 wall-clock timestamp. Metadata only; not part of intentHash. */
  createdAt: z.string(),
  /** Adopter-supplied idempotency key. Hash input. */
  nonce: z.string(),
  actor: IntentActorSchema,
  taint: TaintSchema,
  /** sha256(canonical(envelope minus intentHash)). Computed by buildEnvelope. */
  intentHash: z.string(),
});

// ─── Build-time drift guards ────────────────────────────────────────────────
// If you see a compile error in either function body, the Zod schema and
// the kernel type have drifted. Fix the schema; do not edit the kernel
// here.

const _taintCoreToSchema = (x: Taint): z.infer<typeof TaintSchema> => x;
const _taintSchemaToCore = (x: z.infer<typeof TaintSchema>): Taint => x;

const _actorCoreToSchema = (x: IntentActor): z.infer<typeof IntentActorSchema> => x;
const _actorSchemaToCore = (x: z.infer<typeof IntentActorSchema>): IntentActor => x;

const _envelopeCoreToSchema = (
  x: IntentEnvelope,
): z.infer<typeof IntentEnvelopeSchema> => x;
const _envelopeSchemaToCore = (
  x: z.infer<typeof IntentEnvelopeSchema>,
): IntentEnvelope => x;

void [
  _taintCoreToSchema,
  _taintSchemaToCore,
  _actorCoreToSchema,
  _actorSchemaToCore,
  _envelopeCoreToSchema,
  _envelopeSchemaToCore,
];
