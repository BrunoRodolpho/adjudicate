import { z } from "zod";
import type {
  AuthorityEdge,
  AuthorityGraph,
  AuthorityPermits,
  AuthorityRelationship,
  IntentActor,
  IntentEnvelope,
  Origin,
  RecordedAuthoritySnapshot,
  ResourceRefs,
  Taint,
} from "@adjudicate/core";
import { IntentHashSchema } from "./common.js";

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

/**
 * 041 — provenance SOURCE axis. Mirrors `Origin` in @adjudicate/core; part of
 * the intentHash recipe. Closed, contaminating enum.
 */
export const OriginSchema = z.enum([
  "Human",
  "Retrieved",
  "ExternalAPI",
  "LLM",
  "System",
]);

/**
 * 031 — per-kind resource references (the envelope's authorization slot).
 * Mirrors `ResourceRefs` in @adjudicate/core: a string→string map. OPTIONAL on
 * the envelope and canonical-drop-safe — bound into intentHash only when
 * present. Tolerated by the wire schema so old (no-refs) and new (with-refs)
 * envelopes both round-trip without a schema break.
 */
export const ResourceRefsSchema = z.record(z.string(), z.string());

export const IntentActorSchema = z.object({
  principal: z.enum(["llm", "user", "system"]),
  sessionId: z.string().min(1),
  /**
   * Reserved v0.2 actor-attestation seam (AuthReviewer-002). Optional and
   * absent on v0.1 envelopes; round-trips through audit records without a
   * schema break. Mirrors `IntentActor.attestation` in @adjudicate/core.
   */
  attestation: z
    .object({
      keyId: z.string(),
      sig: z.string(),
    })
    .optional(),
});

export const IntentEnvelopeSchema = z.object({
  version: z.literal(2),
  kind: z.string().min(1),
  payload: z.unknown(),
  /** ISO-8601 wall-clock timestamp. Metadata only; not part of intentHash. */
  createdAt: z.string(),
  /** Adopter-supplied idempotency key. Hash input. */
  nonce: z.string().min(1),
  actor: IntentActorSchema,
  taint: TaintSchema,
  /** 041 — harness-stamped provenance source axis; part of intentHash. */
  origin: OriginSchema,
  /**
   * 031 — per-kind resource references. Optional + canonical-drop-safe; bound
   * into intentHash only when present.
   */
  resourceRefs: ResourceRefsSchema.optional(),
  /** sha256(canonical(envelope minus intentHash)). Computed by buildEnvelope. */
  intentHash: IntentHashSchema,
});

/**
 * 032/033 — authority-graph relationship edge label. Mirrors
 * `AuthorityRelationship` in @adjudicate/core. Closed union.
 */
export const AuthorityRelationshipSchema = z.enum([
  "owns",
  "joint",
  "advisor",
  "custodian",
]);

/**
 * 032/033 — what one authority edge PERMITS. Mirrors `AuthorityPermits`. The
 * optional `limits` are finite snapshot numbers (the canonical encoder throws on
 * non-finite). Descriptive snapshot DATA — never a decision.
 */
export const AuthorityPermitsSchema = z.object({
  actions: z.array(z.string()).readonly(),
  limits: z.record(z.string(), z.number()).optional(),
});

/**
 * 032/033 — one directed authority edge
 * (`principal —relationship→ resource —permits→ {actions, limits}`). Mirrors
 * `AuthorityEdge`.
 */
export const AuthorityEdgeSchema = z.object({
  principal: z.string(),
  relationship: AuthorityRelationshipSchema,
  resource: z.string(),
  permits: AuthorityPermitsSchema,
});

/**
 * 032/033 — the authority-graph SNAPSHOT (immutable set of edges). Mirrors
 * `AuthorityGraph`. Injected into the kernel decision as state, recorded into
 * audit for replay — NOT an envelope field, NOT part of intentHash.
 */
export const AuthorityGraphSchema = z.object({
  edges: z.array(AuthorityEdgeSchema).readonly(),
});

/**
 * 033 — the RECORDED authority snapshot surfaced on the audit record: the
 * immutable injected `graph` plus its content-address (`hashAuthorityGraph`).
 * Mirrors `RecordedAuthoritySnapshot` in @adjudicate/core. Recorded so the
 * decision replays bit-identically (§D-5, invariant #5). OPTIONAL on the audit
 * record — absent for decisions that injected no snapshot (hash-stable).
 */
export const RecordedAuthoritySnapshotSchema = z.object({
  graph: AuthorityGraphSchema,
  snapshotHash: z.string(),
});

// ─── Build-time drift guards ────────────────────────────────────────────────
// If you see a compile error in either function body, the Zod schema and
// the kernel type have drifted. Fix the schema; do not edit the kernel
// here.

const _taintCoreToSchema = (x: Taint): z.infer<typeof TaintSchema> => x;
const _taintSchemaToCore = (x: z.infer<typeof TaintSchema>): Taint => x;

const _originCoreToSchema = (x: Origin): z.infer<typeof OriginSchema> => x;
const _originSchemaToCore = (x: z.infer<typeof OriginSchema>): Origin => x;

const _resourceRefsCoreToSchema = (
  x: ResourceRefs,
): z.infer<typeof ResourceRefsSchema> => x;
const _resourceRefsSchemaToCore = (
  x: z.infer<typeof ResourceRefsSchema>,
): ResourceRefs => x;

const _actorCoreToSchema = (x: IntentActor): z.infer<typeof IntentActorSchema> => x;
const _actorSchemaToCore = (x: z.infer<typeof IntentActorSchema>): IntentActor => x;

const _envelopeCoreToSchema = (
  x: IntentEnvelope,
): z.infer<typeof IntentEnvelopeSchema> => x;
const _envelopeSchemaToCore = (
  x: z.infer<typeof IntentEnvelopeSchema>,
): IntentEnvelope => x;

// 032/033 — authority-graph + recorded-snapshot drift guards. Bidirectional:
// every field is a primitive / closed enum / string→string|number map, so the
// schema and the core type are structurally interchangeable.
const _authorityRelationshipCoreToSchema = (
  x: AuthorityRelationship,
): z.infer<typeof AuthorityRelationshipSchema> => x;
const _authorityRelationshipSchemaToCore = (
  x: z.infer<typeof AuthorityRelationshipSchema>,
): AuthorityRelationship => x;
const _authorityPermitsCoreToSchema = (
  x: AuthorityPermits,
): z.infer<typeof AuthorityPermitsSchema> => x;
const _authorityEdgeCoreToSchema = (
  x: AuthorityEdge,
): z.infer<typeof AuthorityEdgeSchema> => x;
const _authorityGraphCoreToSchema = (
  x: AuthorityGraph,
): z.infer<typeof AuthorityGraphSchema> => x;
const _recordedAuthoritySnapshotCoreToSchema = (
  x: RecordedAuthoritySnapshot,
): z.infer<typeof RecordedAuthoritySnapshotSchema> => x;
const _recordedAuthoritySnapshotSchemaToCore = (
  x: z.infer<typeof RecordedAuthoritySnapshotSchema>,
): RecordedAuthoritySnapshot => x;

void [
  _taintCoreToSchema,
  _taintSchemaToCore,
  _originCoreToSchema,
  _originSchemaToCore,
  _resourceRefsCoreToSchema,
  _resourceRefsSchemaToCore,
  _actorCoreToSchema,
  _actorSchemaToCore,
  _envelopeCoreToSchema,
  _envelopeSchemaToCore,
  _authorityRelationshipCoreToSchema,
  _authorityRelationshipSchemaToCore,
  _authorityPermitsCoreToSchema,
  _authorityEdgeCoreToSchema,
  _authorityGraphCoreToSchema,
  _recordedAuthoritySnapshotCoreToSchema,
  _recordedAuthoritySnapshotSchemaToCore,
];
