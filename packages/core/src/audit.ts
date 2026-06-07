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
import { timingSafeHexEqual } from "./timing-safe.js";
import {
  buildEnvelope,
  deriveIntentHash,
  type IntentEnvelope,
} from "./envelope.js";
import type { Decision } from "./decision.js";
import type { DecisionBasis } from "./basis-codes.js";

export const AUDIT_RECORD_VERSION = 5 as const;
export type AuditRecordVersion = 1 | 2 | 3 | 4 | 5;

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
 *   - `lgpd_scrub` — per-surface anonymization continuation. The predecessor
 *     is the originating LGPD/GDPR scrub envelope; this record links a
 *     downstream surface scrub (OrderProjection, ConversationMessage,
 *     LoyaltyAccount, etc.) back to the customer-anonymize root so the
 *     audit reader can reconstruct the full scrub fan-out from a single
 *     `predecessorIntentHash`.
 */
export type SupersessionReason =
  | "confirmation_resolved"
  | "defer_resumed"
  | "rewrite_executed"
  | "replay"
  | "lgpd_scrub";

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
  /**
   * Optional, v4+. Pack's semantic version at the time of adjudication.
   * Plumbed from Pack.version on the policy the kernel was given.
   * Replay-against-historical-policy uses this to resolve the correct
   * Pack module via `PackRegistry.resolve(packId, policyVersion)`.
   */
  readonly policyVersion?: string;
  /**
   * Optional, v4+. Adjudicate kernel version that produced this record.
   * Distinct from `kernelIdentity.version` which identifies the kernel
   * BUILD; this identifies the @adjudicate/core package version.
   */
  readonly kernelVersion?: string;
  /**
   * Optional, v4+. `sha256Canonical(canonical(record \ { auditHash,
   * signature }))`. Binds envelope + decision + basis + supersession
   * into one tamper-evident token. Verifiers re-derive and compare.
   */
  readonly auditHash?: string;
  /**
   * Optional, v4+. Cryptographic signature over `auditHash`. Pluggable
   * AuditSigner injects KMS/HSM signing in production; OSS adopters
   * leave the field absent (auditHash alone gives tamper detection;
   * the signature adds non-repudiation).
   */
  readonly signature?: {
    readonly keyId: string;
    readonly alg: string;
    readonly value: string;
  };
  /**
   * Optional, v5+. Adopter-attached governance/observability metadata
   * (e.g. `hallucination_score`). **EXCLUDED from the `auditHash` pre-image**
   * (like `signature`) — hallucination scoring is post-hoc/async, so attaching
   * metadata after emission must NOT invalidate tamper-evidence. Never read by
   * `adjudicate()`; never enters `intentHash`.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface BuildAuditInput {
  /** Optional, v5+. Governance/observability metadata; excluded from auditHash. */
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly envelope: IntentEnvelope;
  readonly decision: Decision;
  readonly durationMs: number;
  readonly resourceVersion?: string;
  readonly at?: string;
  /**
   * Optional plan snapshot. When provided, `planFingerprint` is computed
   * automatically from `visibleReadTools` + `allowedIntents`.
   */
  readonly plan?: Omit<AuditPlanSnapshot, "planFingerprint">;
  /**
   * Optional predecessor link (v3+). When present, the resulting AuditRecord
   * carries the same value under `supersedes`.
   */
  readonly supersedes?: Supersession;
  /**
   * Optional Pack version (v4+). Adopters wire from Pack.version (PackV1).
   */
  readonly policyVersion?: string;
  /**
   * Optional kernel version (v4+). Typically the @adjudicate/core package
   * version that produced the decision.
   */
  readonly kernelVersion?: string;
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
        planFingerprint: sha256Canonical({
          visibleReadTools: input.plan.visibleReadTools,
          allowedIntents: input.plan.allowedIntents,
        }),
      }
    : undefined;
  const baseRecord: Omit<AuditRecord, "auditHash"> = {
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
    ...(input.policyVersion !== undefined
      ? { policyVersion: input.policyVersion }
      : {}),
    ...(input.kernelVersion !== undefined
      ? { kernelVersion: input.kernelVersion }
      : {}),
  };
  // v4 auditHash: sha256 over canonical(record \ { auditHash, signature,
  // metadata }). Binds envelope + decision + basis + supersession into one
  // tamper-evident token. `metadata` (v5+) is EXCLUDED so post-hoc/async
  // attachment does not invalidate the hash. Verifiers strip the same fields.
  const auditHash = sha256Canonical(baseRecord);
  return {
    ...baseRecord,
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    auditHash,
  };
}

/**
 * Attach/merge governance metadata onto an already-built record (v5+, ADR-124),
 * for the truly-async case (a groundedness score computed after emission). Pure:
 * returns a new record; leaves `auditHash`/`signature`/`intentHash` untouched
 * (metadata is excluded from the auditHash pre-image, so the record still
 * verifies).
 */
export function attachAuditMetadata(
  record: AuditRecord,
  metadata: Readonly<Record<string, unknown>>,
): AuditRecord {
  return { ...record, metadata: { ...record.metadata, ...metadata } };
}

/**
 * Verify an AuditRecord's tamper-evident hash.
 *
 * Re-derives `sha256Canonical(record \ { auditHash, signature })` and
 * compares to the stored `auditHash`. Returns:
 *   - `{ verified: true }` — hash matches; record is intact
 *   - `{ verified: false, reason: "tampered", derived, stored }` — hash
 *      mismatch; the stored record was modified after build
 *   - `{ verified: null, reason: "missing_hash" }` — pre-v4 record;
 *      verification not applicable
 *
 * Pure function. No I/O. Verifies tamper-evidence only — non-repudiation
 * (signature verification) is a separate concern via a pluggable verifier.
 */
export type AuditRecordVerification =
  | { readonly verified: true }
  | {
      readonly verified: false;
      readonly reason: "tampered";
      readonly derived: string;
      readonly stored: string;
    }
  | {
      // CryptoReviewer-006 / LogicReviewer-012: the stored envelope.intentHash
      // does not re-derive from the envelope's content-addressed fields — the
      // record was built with a forged or drifted envelope hash. Distinct from
      // "tampered" (which is the v4 auditHash over the whole record).
      readonly verified: false;
      readonly reason: "envelope_intent_mismatch";
      readonly derived: string;
      readonly stored: string;
    }
  | { readonly verified: null; readonly reason: "missing_hash" };

export function verifyAuditRecord(
  record: AuditRecord,
): AuditRecordVerification {
  // Envelope self-consistency (CryptoReviewer-006 / LogicReviewer-012):
  // re-derive `envelope.intentHash` from the envelope's content-addressed
  // fields (version, kind, payload, nonce, actor, taint) and compare. This is
  // independent of the v4 `auditHash` (which binds the whole record): it catches
  // a record built with a forged or drifted envelope hash even when the
  // surrounding auditHash is itself valid, and applies to pre-v4 records too
  // (envelope.intentHash predates v4). `deriveIntentHash` is the single source
  // of truth shared with `buildEnvelope`, so the recipe can never drift.
  // timingSafeHexEqual is boolean-identical to `===` and never throws.
  //
  // A malformed record carrying no envelope at all (e.g. a defensive `{}` probe
  // the fail-safe bridges feed in) cannot be envelope-verified — skip straight
  // to the auditHash check, which fails it safe as missing_hash.
  if (record.envelope != null) {
    const derivedIntent = deriveIntentHash(record.envelope);
    if (!timingSafeHexEqual(derivedIntent, record.envelope.intentHash)) {
      return {
        verified: false,
        reason: "envelope_intent_mismatch",
        derived: derivedIntent,
        stored: record.envelope.intentHash,
      };
    }
  }
  if (record.auditHash === undefined) {
    return { verified: null, reason: "missing_hash" };
  }
  // Strip the auditHash + signature + metadata fields from the record before
  // re-deriving (the hash was computed over the record sans these fields).
  const { auditHash: stored, signature: _signature, metadata: _metadata, ...rest } = record;
  const derived = sha256Canonical(rest);
  // Constant-time compare (P3-CRYPTO-TIMINGSAFE): a `!==` string compare
  // short-circuits on the first differing hex char, leaking via timing how
  // many leading digits of a forged auditHash matched. timingSafeHexEqual is
  // boolean-identical to `===` for all inputs and never throws.
  if (!timingSafeHexEqual(derived, stored)) {
    return { verified: false, reason: "tampered", derived, stored };
  }
  return { verified: true };
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
  // Faithful-replay guard (CryptoReviewer-006 / LogicReviewer-012): the
  // reconstructed envelope's intentHash MUST match the stored
  // `envelope.intentHash`. A mismatch means the audit record's envelope hash was
  // forged or drifted from its content — replaying it would silently adjudicate
  // a different envelope than the stored hash claims. Refuse rather than hand
  // back an inconsistent envelope. (The sole non-test caller, cli replay, already
  // try/catches and surfaces the throw as a per-record replay error.)
  if (!timingSafeHexEqual(env.intentHash, record.envelope.intentHash)) {
    throw new Error(
      `replayEnvelopeFromAudit: envelope_intent_mismatch — reconstructed ` +
        `intentHash ${env.intentHash} does not match stored ` +
        `${record.envelope.intentHash}`,
    );
  }
  return env;
}
