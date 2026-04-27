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
 *
 * Readers MUST branch on `record.version` when they need fields beyond v1.
 */

import { sha256Canonical } from "./hash.js";
import { buildEnvelope, type IntentEnvelope } from "./envelope.js";
import type { Decision } from "./decision.js";
import type { DecisionBasis } from "./basis-codes.js";

export const AUDIT_RECORD_VERSION = 2 as const;
export type AuditRecordVersion = 1 | 2;

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
