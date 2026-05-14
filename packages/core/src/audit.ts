/**
 * AuditRecord — the durable governance trail entry.
 *
 * Every Decision returned by adjudicate() must produce exactly one AuditRecord.
 * These records are emitted to @adjudicate/audit sinks (Console, NATS, Postgres)
 * and are the governance record of truth. The Execution Ledger is separate —
 * it handles hot-path dedup and is not authoritative for audit.
 *
 * Schema versioning:
 *   v1 — original shape (envelope + decision + basis + resourceVersion).
 *   v2 — adds optional `plan` snapshot capturing the CapabilityPlanner output
 *        at the time of the decision. `plan` is optional so v1-shaped records
 *        still validate against the v2 type and load via every reader.
 *   v3 — adds optional `supersedes` linking this record to a predecessor
 *        (REQUEST_CONFIRMATION resolved, DEFER resumed, REWRITE executed, or
 *        replayed). Optional so v1/v2-shaped records remain valid.
 *
 * Readers MUST branch on `record.version` when they need fields beyond v1.
 */

import { sha256Canonical } from "./hash.js";
import { buildEnvelope, type IntentEnvelope } from "./envelope.js";
import type { Decision } from "./decision.js";
import type { DecisionBasis } from "./basis-codes.js";

export const AUDIT_RECORD_VERSION = 3 as const;
export type AuditRecordVersion = 1 | 2 | 3;

/**
 * Why the current AuditRecord supersedes its predecessor.
 *
 *   - `confirmation_resolved` — predecessor was a REQUEST_CONFIRMATION; the
 *     LLM (or operator) supplied a confirmation receipt and the kernel
 *     re-adjudicated.
 *   - `defer_resumed` — predecessor was a DEFER; an external signal arrived
 *     and the kernel resumed.
 *   - `rewrite_executed` — predecessor was a REWRITE; the rewritten envelope
 *     was then adjudicated to an EXECUTE.
 *   - `replay` — re-adjudication from an audit row (replay harness or
 *     migration). The predecessor is the stored record.
 */
export type SupersessionReason =
  | "confirmation_resolved"
  | "defer_resumed"
  | "rewrite_executed"
  | "replay";

export interface Supersession {
  readonly predecessorIntentHash: string;
  readonly predecessorAt: string;
  readonly reason: SupersessionReason;
  /**
   * Optional opaque token carried by the supersession step. For
   * `confirmation_resolved` this is the confirmation receipt token; for
   * `defer_resumed` it is the resume token; left undefined otherwise.
   */
  readonly token?: string;
}

/**
 * Snapshot of the CapabilityPlanner output that produced this decision. Used
 * for governance traceability: "what did the LLM see at this turn?" and for
 * planFingerprint cross-correlation in the LearningSink.
 *
 * Shape mirrors `Plan` from `@adjudicate/core/llm` but is duplicated here so
 * the audit type does not depend on the LLM subpath.
 */
export interface AuditPlanSnapshot {
  readonly visibleReadTools: ReadonlyArray<string>;
  readonly allowedIntents: ReadonlyArray<string>;
  /**
   * Mirror of `Plan.forbiddenConcepts` — recorded in the audit row but
   * NOT included in `planFingerprint`.
   *
   * @deprecated v0.1.x — see `Plan.forbiddenConcepts`. Scheduled for
   * removal at v1.0. Existing audit rows continue to be readable; the
   * field is kept on this snapshot for back-compat with stored records.
   */
  readonly forbiddenConcepts: ReadonlyArray<string>;
  /**
   * sha256 of canonical({ visibleReadTools, allowedIntents }). Used by the
   * LearningSink to dedupe identical plans across many decisions, and by the
   * replay harness to detect planner drift.
   */
  readonly planFingerprint: string;
}

export interface AuditRecord {
  readonly version: AuditRecordVersion;
  readonly intentHash: string;
  readonly envelope: IntentEnvelope;
  readonly decision: Decision;
  readonly decision_basis: readonly DecisionBasis[];
  /** Populated after successful execution — e.g. order.version post-apply. */
  readonly resourceVersion?: string;
  readonly at: string; // ISO-8601
  readonly durationMs: number;
  /** Optional, v2+. Present iff the adopter passed plan to buildAuditRecord. */
  readonly plan?: AuditPlanSnapshot;
  /**
   * Optional, v3+. Present when this record continues a prior adjudication
   * (confirmation resolved, defer resumed, rewrite executed, or replay). The
   * link is by `predecessorIntentHash` — the audit reader can follow it back
   * to the originating record.
   */
  readonly supersedes?: Supersession;
  /**
   * Optional, v3+. Identifier + version of the kernel that produced the
   * decision. Plumbed through `RuntimeContext.kernelIdentity` when the
   * adopter configures one. Attestation bytes are reserved for v0.2 — the
   * audit row only carries the public `(id, version)` pair.
   */
  readonly kernelIdentity?: { readonly id: string; readonly version: string };
}

export interface BuildAuditInput {
  readonly envelope: IntentEnvelope;
  readonly decision: Decision;
  readonly durationMs: number;
  readonly resourceVersion?: string;
  readonly at?: string;
  /**
   * Optional plan snapshot. When provided, `planFingerprint` is computed
   * automatically from `visibleReadTools` + `allowedIntents` (the security-
   * sensitive fields). `forbiddenConcepts` is recorded but not hashed.
   */
  readonly plan?: Omit<AuditPlanSnapshot, "planFingerprint">;
  /**
   * Optional predecessor link (v3+). When present, the resulting AuditRecord
   * carries the same value under `supersedes`.
   */
  readonly supersedes?: Supersession;
  /**
   * Optional `(id, version)` of the kernel build producing the decision
   * (v3+). When supplied, the resulting AuditRecord carries the same shape
   * under `kernelIdentity`. Attestation bytes are reserved for v0.2.
   */
  readonly kernelIdentity?: { readonly id: string; readonly version: string };
}

export function buildAuditRecord(input: BuildAuditInput): AuditRecord {
  const plan: AuditPlanSnapshot | undefined = input.plan
    ? {
        visibleReadTools: input.plan.visibleReadTools,
        allowedIntents: input.plan.allowedIntents,
        forbiddenConcepts: input.plan.forbiddenConcepts,
        planFingerprint: sha256Canonical({
          visibleReadTools: input.plan.visibleReadTools,
          allowedIntents: input.plan.allowedIntents,
        }),
      }
    : undefined;
  return {
    version: AUDIT_RECORD_VERSION,
    intentHash: input.envelope.intentHash,
    envelope: input.envelope,
    decision: input.decision,
    decision_basis: input.decision.basis,
    ...(input.resourceVersion !== undefined
      ? { resourceVersion: input.resourceVersion }
      : {}),
    at: input.at ?? new Date().toISOString(),
    durationMs: input.durationMs,
    ...(plan !== undefined ? { plan } : {}),
    ...(input.supersedes !== undefined ? { supersedes: input.supersedes } : {}),
    ...(input.kernelIdentity !== undefined
      ? { kernelIdentity: input.kernelIdentity }
      : {}),
  };
}

/**
 * Reconstruct a deterministic IntentEnvelope from a stored AuditRecord.
 *
 * Use this when an adopter needs to replay an envelope from durable storage
 * (e.g., the Postgres replay reader) — it preserves the original `createdAt`
 * exactly, which is critical for the intentHash invariant. Adopters that
 * rebuild envelopes from raw inputs without preserving createdAt produce a
 * different intentHash and silently break ledger dedup; this helper avoids
 * the foot-gun.
 *
 * The resulting envelope is byte-identical to the one originally adjudicated
 * — its intentHash matches the audit record's intentHash.
 */
export function replayEnvelopeFromAudit(record: AuditRecord): IntentEnvelope {
  const env = buildEnvelope({
    kind: record.envelope.kind,
    payload: record.envelope.payload,
    actor: record.envelope.actor,
    taint: record.envelope.taint,
    // T8: envelopes are v2; the nonce is the load-bearing idempotency key.
    // For pre-T8 audit records that lack nonce, fall back to createdAt
    // (the closest stand-in available; equivalent to legacyV1ToV2's
    // synthesized nonce).
    nonce: record.envelope.nonce ?? record.envelope.createdAt,
    createdAt: record.envelope.createdAt,
  });
  return env;
}
