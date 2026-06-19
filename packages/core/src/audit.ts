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
  type RecordedAggregateSnapshot,
  type RecordedAuthoritySnapshot,
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
 *   - `budget_satisfied` — predecessor was a REQUEST_CONFIRMATION; a standing,
 *     human-granted, bounded budget (capabilities-as-budgets, 025) satisfied the
 *     ask-first threshold for THIS bounded substitution (the impure shell burned
 *     down one unit of the grant atomically before asserting it), so the kernel
 *     substituted EXECUTE. Distinct from `confirmation_resolved` (a per-intent
 *     user receipt): a budget is a single-use-counted standing pre-authorization
 *     for a CLASS of intents up to a declared limit. This record links the
 *     budget-satisfied EXECUTE back to the original REQUEST_CONFIRMATION audit
 *     row; `token` carries the grant's `budgetId` for the forensic trail.
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
  | "budget_satisfied"
  | "lgpd_scrub";

/**
 * Budget grant (025 — capabilities-as-budgets) data contract.
 *
 * A budget is a human-granted, BOUNDED, STANDING pre-authorization that lets a
 * CLASS of intents (`intentKind`) satisfy the "ask first" threshold up to a
 * declared `limit` within a rolling `windowSeconds`, WITHOUT a per-intent
 * confirmation receipt. It is the §B "human-granted bounded **budget**" form of
 * a capability (index §G) — distinct from a single-use capability token (022):
 * a budget METERS N substitutions against a limit (atomic increment-and-check),
 * whereas a capability BURNS a single token.
 *
 * **Authority & determinism (§D).** The grant is recorded snapshot data the
 * impure shell injects into the ONE kernel decision (mirroring
 * `confirmationReceipt`). The kernel does NOT verify or count it — the shell
 * owns burn-down integrity and only asserts a grant AFTER a successful atomic
 * decrement (the `evalIncrCheck` Lua primitive). The kernel only substitutes
 * EXECUTE for the threshold-style outcome (exactly as the confirmation-receipt
 * override does), appends a `budget:satisfied` basis, and derives a
 * `budget_satisfied` supersession — never weakening any state/taint/auth/
 * business guard (§C monotonicity; §D #2 closed algebra). Recorded into the
 * audit trail via the appended basis (in `decision_basis`) and the supersession
 * link, so the decision stays REPLAYABLE.
 */
export interface BudgetGrant {
  /**
   * Opaque, stable identifier of the standing grant (e.g. a UUID the operator
   * issued when authorizing the budget). Carried into `Supersession.token` for
   * the forensic trail; the audit reader can join budget-satisfied EXECUTEs by
   * `budgetId`.
   */
  readonly budgetId: string;
  /**
   * The single intent KIND this grant pre-authorizes. The substitution fires
   * ONLY when `envelope.kind === budgetGrant.intentKind` (the §B class scope) —
   * a grant for kind A can never satisfy an intent of kind B.
   */
  readonly intentKind: string;
  /**
   * Declared ceiling: the maximum number of threshold substitutions the budget
   * authorizes within `windowSeconds`. The impure shell enforces it atomically
   * (`evalIncrCheck`); the kernel never reads it.
   */
  readonly limit: number;
  /**
   * Rolling window (seconds) the `limit` is metered over — the TTL the shell's
   * atomic counter expires under, after which the budget refills.
   */
  readonly windowSeconds: number;
}

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
 * Construct the `rewrite_executed` supersession link for the live REWRITE→EXECUTE
 * path (011/T3).
 *
 * When the kernel returns REWRITE and the rewritten envelope re-adjudicates to a
 * second-pass EXECUTE, the durable audit row is indexed by the EXECUTED
 * (rewritten) `intentHash` — NOT the original benign hash (see
 * `adjudicateAndAudit`). This helper builds the back-link that preserves the
 * original→rewritten provenance so the audit reader can follow the executed row
 * back to the proposal the kernel substituted.
 *
 *   - `originalIntentHash` — the original (pre-rewrite) envelope's intentHash,
 *     stored as `predecessorIntentHash`.
 *   - `at` — the wall-clock anchor of the rewrite/execution (the shell's clock),
 *     stored as `predecessorAt`.
 *
 * Pure: no I/O, no clock read of its own. The caller (the impure shell) supplies
 * the timestamp so the kernel stays deterministic/replayable.
 */
export function rewriteExecutedSupersession(
  originalIntentHash: string,
  at: string,
): Supersession {
  return {
    predecessorIntentHash: originalIntentHash,
    predecessorAt: at,
    reason: "rewrite_executed",
  };
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

/**
 * Cryptographic signature slot over an AuditRecord's `auditHash`. Shaped
 * IDENTICALLY to `CapabilitySignature` (`capability.ts`) so audit and capability
 * share one signature shape:
 *   - `keyId` — identifier of the signing key (e.g. a KMS key alias).
 *   - `alg`   — the signature algorithm. `"sha256-hashbind"` is the pure-JS,
 *               browser-safe HASH-BIND leg this package can both produce and
 *               verify; `"ed25519"` (or any asymmetric alg) is produced/verified
 *               node-side (`@adjudicate/approval-engine`) and is OPAQUE to core's
 *               browser-safe `verifyAuditRecord` (it never false-fails a record
 *               whose asymmetric signature it cannot check — see below).
 *   - `value` — the signature. For `"sha256-hashbind"` it is the
 *               `sha256Canonical` of the signature pre-image; for asymmetric algs
 *               it is the detached signature, base64-encoded.
 */
export interface AuditSignature {
  readonly keyId: string;
  readonly alg: string;
  readonly value: string;
}

/**
 * The hash-bind signature algorithm tag — the pure-JS, browser-safe leg that
 * `@adjudicate/core` can both MINT (`bindAuditSignature` / `hashBindAuditSigner`)
 * and VERIFY (`verifyAuditRecord`) with no `node:crypto` / no `Buffer`. The
 * value commits to a canonical pre-image over `(auditHash, keyId)`, so a
 * tampered `auditHash` or a signature moved to another record fails the
 * constant-time compare. The ASYMMETRIC (ed25519) signer/verifier lives in
 * `@adjudicate/approval-engine` and signs the SAME pre-image.
 */
export const AUDIT_HASHBIND_ALG = "sha256-hashbind" as const;

/**
 * Versioned pre-image tag for an audit-record signature — the first line of the
 * canonical string an AuditSigner signs and `verifyAuditRecord` re-derives
 * (mirrors `CAPABILITY_PREIMAGE_VERSION`, `capability.ts`). Versioned so the
 * format can evolve without ambiguity: a signature minted over v1 bytes can
 * never be presented against a v2 pre-image (the tag line differs → the hash
 * differs).
 */
export const AUDIT_SIGNATURE_PREIMAGE_VERSION =
  "adjudicate-audit-signature-v1" as const;

/**
 * Pluggable, impure-shell signer for audit records (092). Lives at the §D
 * shell boundary: the kernel `adjudicate()` stays pure and NEVER signs — the
 * shell calls `sign(auditHash)` AFTER `buildAuditRecord` has computed the
 * tamper-evident `auditHash`, and attaches the result to `record.signature`.
 *
 * `signature` is EXCLUDED from the `auditHash` pre-image (like `metadata`), so
 * post-hoc signing never invalidates the hash (the pre-image-exclusion
 * invariant, §7).
 *
 * Implementations:
 *   - `hashBindAuditSigner` (this package) — the pure-JS, browser-safe
 *     `"sha256-hashbind"` leg. Tamper-evident; NOT non-repudiation.
 *   - an ed25519 KMS/HSM signer (`@adjudicate/approval-engine`, node-side) — the
 *     asymmetric, non-repudiation leg.
 *
 * `sign` MUST be a pure function of `auditHash` (deterministic per key) so the
 * signed record stays replayable. It may THROW on a signing failure — the shell
 * treats a signer error as FAIL-CLOSED (aborts EXECUTE) per §D inv. 6.
 */
export interface AuditSigner {
  /** Identifier recorded into the signature slot (e.g. a KMS key alias). */
  readonly keyId: string;
  /** Produce the signature over the record's already-computed `auditHash`. */
  sign(auditHash: string): AuditSignature;
}

/**
 * Build the versioned canonical pre-image STRING an AuditSigner signs and
 * `verifyAuditRecord` re-derives — a version tag line followed by the
 * `sha256Canonical` of `(auditHash, keyId)`. Binding `keyId` means a signature
 * minted under one key id cannot be re-presented under another (the pre-image
 * differs). Pure: no I/O, no clock, no `node:crypto`. Browser-safe.
 */
export function auditSignaturePreimage(auditHash: string, keyId: string): string {
  const bodyHash = sha256Canonical({ auditHash, keyId });
  return `${AUDIT_SIGNATURE_PREIMAGE_VERSION}\n${bodyHash}`;
}

/**
 * Pure-JS, browser-safe hash-bind AuditSigner (mirrors `bindCapability`,
 * `capability.ts`). Its `value` is the `sha256Canonical` of the versioned
 * signature pre-image, so `verifyAuditRecord` can verify it anywhere without a
 * public key or `node:crypto`. Tamper-evident — NOT asymmetric non-repudiation
 * (for that, plug an ed25519 signer from `@adjudicate/approval-engine`).
 */
export function bindAuditSignature(
  auditHash: string,
  keyId: string,
): AuditSignature {
  return {
    keyId,
    alg: AUDIT_HASHBIND_ALG,
    value: sha256Canonical(auditSignaturePreimage(auditHash, keyId)),
  };
}

/**
 * Construct a pure-JS hash-bind `AuditSigner` for the given key id. The impure
 * shell injects this (or a node-side asymmetric signer) into the audit build
 * path so emitted records carry a real `signature`.
 */
export function hashBindAuditSigner(keyId: string): AuditSigner {
  return {
    keyId,
    sign: (auditHash: string): AuditSignature =>
      bindAuditSignature(auditHash, keyId),
  };
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
   *
   * **023 — stays PASSIVE.** The resource-binding plan is a HASH fence only
   * (re-derive `intentHash` + constant-time-compare at the executor seam); it
   * introduces NO signature producer and does NOT populate this slot. The
   * AuditSigner that ACTIVATES this field is plan 092
   * (`@adjudicate/approval-engine`), which lands right after 023 and OWNS it —
   * leaving the slot passive here is REQUIRED so 092 can activate it cleanly. The
   * bound envelope inputs (`envelope` incl. `payload` / `resourceRefs` / the
   * content-addressed `intentHash`) are already recorded on the AuditRecord, so
   * the kernel decision REPLAYS over the recorded bound inputs (§D #5) without
   * any signing.
   */
  readonly signature?: AuditSignature;
  /**
   * Optional (033). The RECORDED authority-graph snapshot the kernel decision
   * was INJECTED with — the immutable graph plus its content-address
   * (`hashAuthorityGraph`). Recorded here so the decision is REPLAYABLE: re-run
   * the pure kernel (`resolveOwnership` over `authorityGraphStoreFromRecorded`)
   * against this recorded snapshot and reproduce the byte-identical
   * `OwnershipFact` and therefore the byte-identical decision (index §D-5,
   * invariant #5).
   *
   * **IS in the `auditHash` pre-image** (unlike `signature`/`metadata`): the
   * recorded snapshot is a decision-relevant injected input (like
   * `policyVersion`/`kernelVersion`, 091), so binding it into the tamper-evident
   * hash is what makes the recorded inputs trustworthy for replay. Conditionally
   * spread by `buildAuditRecord` — ABSENT on records that injected no snapshot,
   * so those records hash byte-identically to their pre-033 value (no key, no
   * drift). NEVER read by `adjudicate()`; NEVER enters `intentHash` (the snapshot
   * rides injected state, not a hashed envelope field — invariant #4).
   */
  readonly authoritySnapshot?: RecordedAuthoritySnapshot;
  /**
   * Optional (052). The RECORDED aggregate/limit snapshot the kernel decision
   * was INJECTED with — the immutable `AggregateSnapshot` (per-window committed
   * aggregates + sample `at`) plus its content-address (`hashAggregateSnapshot`).
   * Recorded here so the decision is REPLAYABLE: re-run the pure kernel over the
   * recorded snapshot (`aggregateSnapshotFromRecorded`) and reproduce the
   * byte-identical decision (index §D-5, invariant #5). Mirrors `authoritySnapshot`
   * (033) exactly.
   *
   * **IS in the `auditHash` pre-image** (unlike `signature`/`metadata`): the
   * recorded snapshot is a decision-relevant injected input (like
   * `policyVersion`/`kernelVersion` (091) and `authoritySnapshot` (033)), so
   * binding it into the tamper-evident hash is what makes the recorded inputs
   * trustworthy for replay. Conditionally spread by `buildAuditRecord` — ABSENT
   * on records that injected no snapshot, so those records hash byte-identically
   * to their pre-052 value (no key, no drift). NEVER read by `adjudicate()`;
   * NEVER enters `intentHash` (the snapshot rides injected state, not a hashed
   * envelope field — invariant #4).
   */
  readonly aggregateSnapshot?: RecordedAggregateSnapshot;
  /**
   * Optional, v5+. Adopter-attached governance/observability metadata
   * (e.g. `hallucination_score`).
   *
   * **Cross-version contract:** a v5 record carrying metadata MUST be verified
   * by `@adjudicate/core` ≥ v5. A pre-v5 `verifyAuditRecord` does not strip
   * `metadata` from the pre-image, so it would re-derive a different hash and
   * FALSELY report the record as `tampered`. Records with no metadata are
   * cross-version safe. (Pinned by audit-record-v5.test.ts.)
   *
   * **EXCLUDED from the `auditHash` pre-image**
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
  /**
   * Optional (033). The RECORDED authority-graph snapshot the decision was
   * INJECTED with (graph + content-address). When supplied, the resulting
   * AuditRecord carries it under `authoritySnapshot` and binds it into the
   * `auditHash` pre-image so the recorded inputs are tamper-evident and the
   * decision replays bit-identically (§D-5). Omitting it spreads the field OUT
   * (no `undefined` key, hash-stable for non-injecting adopters).
   */
  readonly authoritySnapshot?: RecordedAuthoritySnapshot;
  /**
   * Optional (052). The RECORDED aggregate/limit snapshot the decision was
   * INJECTED with (snapshot + content-address). When supplied, the resulting
   * AuditRecord carries it under `aggregateSnapshot` and binds it into the
   * `auditHash` pre-image so the recorded inputs are tamper-evident and the
   * decision replays bit-identically (§D-5). Omitting it spreads the field OUT
   * (no `undefined` key, hash-stable for non-injecting adopters).
   */
  readonly aggregateSnapshot?: RecordedAggregateSnapshot;
  /**
   * Optional (092). Impure-shell signer. When supplied, `buildAuditRecord`
   * computes `auditHash` FIRST, then calls `signer.sign(auditHash)` and attaches
   * the result to `record.signature`. The signature is EXCLUDED from the
   * `auditHash` pre-image, so signing post-hoc never invalidates the hash. A
   * throwing signer propagates out of `buildAuditRecord` — the shell treats this
   * as FAIL-CLOSED (aborts EXECUTE rather than emitting an unsigned record, §D
   * inv. 6). Omitting it leaves `signature` absent (a valid, tamper-evident-only
   * record — the documented OSS contract).
   */
  readonly signer?: AuditSigner;
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
    // 033: bind the RECORDED authority snapshot into the pre-image so the
    // injected snapshot is tamper-evident and the decision replays bit-
    // identically (§D-5). Conditional spread keeps the field (and the hash)
    // byte-identical for records that injected no snapshot.
    ...(input.authoritySnapshot !== undefined
      ? { authoritySnapshot: input.authoritySnapshot }
      : {}),
    // 052: bind the RECORDED aggregate snapshot into the pre-image so the
    // injected snapshot is tamper-evident and the decision replays bit-
    // identically (§D-5). Conditional spread keeps the field (and the hash)
    // byte-identical for records that injected no snapshot.
    ...(input.aggregateSnapshot !== undefined
      ? { aggregateSnapshot: input.aggregateSnapshot }
      : {}),
  };
  // v4 auditHash: sha256 over canonical(record \ { auditHash, signature,
  // metadata }). Binds envelope + decision + basis + supersession into one
  // tamper-evident token. `metadata` (v5+) is EXCLUDED so post-hoc/async
  // attachment does not invalidate the hash. Verifiers strip the same fields.
  const auditHash = sha256Canonical(baseRecord);
  // 092: attach a real `signature` AFTER computing `auditHash`. `signature` is
  // EXCLUDED from the pre-image (the `sha256Canonical(baseRecord)` above does not
  // see it), so signing post-hoc never invalidates the hash — exactly like
  // `metadata`. A throwing signer propagates (FAIL-CLOSED: the shell aborts
  // EXECUTE rather than emitting an unsigned record). Omitting the signer leaves
  // the field absent: a valid, tamper-evident-only record (OSS contract).
  const signature: AuditSignature | undefined = input.signer
    ? input.signer.sign(auditHash)
    : undefined;
  return {
    ...baseRecord,
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    auditHash,
    ...(signature !== undefined ? { signature } : {}),
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
 * Re-derives `sha256Canonical(record \ { auditHash, signature, metadata })` and
 * compares to the stored `auditHash`, then (092) checks the `signature` leg when
 * one is present and verifiable. Returns:
 *   - `{ verified: true }` — hash matches AND any present signature verifies;
 *      record is intact and (if signed) authentic on the verifiable leg.
 *   - `{ verified: false, reason: "tampered", derived, stored }` — hash
 *      mismatch; the stored record was modified after build.
 *   - `{ verified: false, reason: "envelope_intent_mismatch", derived, stored }`
 *      — the stored `envelope.intentHash` does not re-derive from its content.
 *   - `{ verified: false, reason: "invalid_signature", keyId, alg }` (092) — the
 *      auditHash is intact but a PRESENT signature does not verify (a forged or
 *      moved signature). Layered ON TOP of the auditHash check: the tamper axis
 *      passes, the authenticity axis fails.
 *   - `{ verified: null, reason: "missing_hash" }` — pre-v4 record; verification
 *      not applicable.
 *
 * **Signature verification scope (092 / §D browser-safe boundary).**
 * `@adjudicate/core` is browser-bundled (no `node:crypto`), so this function can
 * only verify the pure-JS HASH-BIND leg (`alg: "sha256-hashbind"`,
 * `auditSignaturePreimage`). For an ASYMMETRIC signature (`alg: "ed25519"` etc.)
 * it does NOT attempt verification — it leaves that record `verified: true` on
 * the hash axis and defers asymmetric verification to the node-side verifier
 * (`@adjudicate/approval-engine`) supplied via `opts.verifySignature`. A caller
 * MAY inject `verifySignature` to verify asymmetric signatures here; it returns
 * `false` to flag an invalid one. This keeps core fail-SAFE: it never
 * false-fails a record whose signature it structurally cannot check.
 *
 * Pure function. No I/O.
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
  | {
      // 092: the auditHash is intact but a PRESENT signature does not verify —
      // a forged hash-bind value, or an asymmetric signature the injected
      // `verifySignature` rejected, or a signature moved to a different record.
      // Distinct from "tampered" (the auditHash axis passed).
      readonly verified: false;
      readonly reason: "invalid_signature";
      readonly keyId: string;
      readonly alg: string;
    }
  | { readonly verified: null; readonly reason: "missing_hash" };

/**
 * Optional verification knobs (092). `verifySignature` is the node-side
 * asymmetric verifier hook: when supplied, `verifyAuditRecord` uses it to verify
 * NON-hashbind (`alg !== "sha256-hashbind"`) signatures — a node caller passes
 * `@adjudicate/approval-engine`'s ed25519 verifier so the cold-store read path
 * can flag a forged asymmetric signature. Omitting it (the browser-safe default)
 * leaves asymmetric signatures unverified (record stays `verified: true` on the
 * hash axis). The hash-bind leg is ALWAYS verified regardless.
 */
export interface VerifyAuditRecordOptions {
  readonly verifySignature?: (
    auditHash: string,
    signature: AuditSignature,
  ) => boolean;
}

export function verifyAuditRecord(
  record: AuditRecord,
  opts?: VerifyAuditRecordOptions,
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
  // 092 — signature axis, layered ON TOP of the (now-passing) auditHash axis.
  // A record may legitimately carry NO signature (OSS contract) — that stays
  // verified:true. A present signature is checked on whichever leg core can:
  //   - hash-bind (`sha256-hashbind`): verified pure-JS, browser-safe, here.
  //   - asymmetric (ed25519, ...): verified ONLY if the caller injected
  //     `verifySignature`; otherwise left unverified (fail-SAFE — core cannot
  //     load a public key, so it never false-fails what it cannot check).
  const sig = record.signature;
  if (sig !== undefined) {
    if (sig.alg === AUDIT_HASHBIND_ALG) {
      // Re-derive the hash-bind value from the (verified) auditHash + keyId and
      // constant-time compare. A forged value, or a signature minted for a
      // different auditHash/keyId, re-derives a different hash and fails.
      const expected = sha256Canonical(
        auditSignaturePreimage(stored, sig.keyId),
      );
      if (!timingSafeHexEqual(sig.value, expected)) {
        return {
          verified: false,
          reason: "invalid_signature",
          keyId: sig.keyId,
          alg: sig.alg,
        };
      }
    } else if (opts?.verifySignature !== undefined) {
      // Asymmetric leg: defer to the injected node-side verifier (which holds
      // the public key). It binds `auditHash` so a signature cannot be moved to
      // another record. Returns false on any forged/cross-record/bad signature.
      if (!opts.verifySignature(stored, sig)) {
        return {
          verified: false,
          reason: "invalid_signature",
          keyId: sig.keyId,
          alg: sig.alg,
        };
      }
    }
    // else: asymmetric signature with no verifier injected → unverified, but the
    // record is intact on the hash axis. Fail-SAFE (never false-fail).
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
