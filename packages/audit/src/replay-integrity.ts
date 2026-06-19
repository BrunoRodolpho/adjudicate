/**
 * `replayWithIntegrity` — replay + tamper-detection in one pass.
 *
 * The existing `replay()` only re-runs adjudication and compares
 * decisions. It does NOT check:
 *
 *   - whether the stored AuditRecord's `auditHash` is intact (tamper
 *     detection), or
 *   - whether the envelope's `intentHash` is consistent with the
 *     canonical hash of its fields (envelope integrity).
 *
 * `replayWithIntegrity` does both. It is the recommended path for
 * governance-grade replay where the operator wants ONE report covering
 * both "is the decision reproducible?" (replay) and "is the stored
 * record intact?" (integrity).
 *
 * The two paths are independent — a record can have:
 *   - matched decision + intact hash → fully verified
 *   - matched decision + tampered hash → policy reproduced but the
 *     stored record was modified; investigate immediately
 *   - mismatched decision + intact hash → policy drift (most likely a
 *     legitimate Pack update); root-cause via `mismatches`
 *   - mismatched decision + tampered hash → both axes failed; treat as
 *     a hostile incident
 *
 * Pre-v4 records (no `auditHash`) report `{ verified: null, reason:
 * "missing_hash" }` in `integrity` — the replay axis still runs.
 */

import type { AuditRecord, AuditSignature, AuditSigner } from "@adjudicate/core";
import {
  auditSignaturePreimage,
  AUDIT_HASHBIND_ALG,
  classify,
  deriveIntentHash,
  sha256Canonical,
  timingSafeHexEqual,
  verifyAuditRecord,
  type AuditRecordVerification,
  type ReplayMismatch,
} from "@adjudicate/core";
// Shared declaration: imported for local use here and re-exported below so
// the historical `import { Adjudicator } from ".../replay-integrity.js"`
// path keeps working while there is a single source of truth.
import type { Adjudicator } from "./adjudicator.js";

export type { Adjudicator } from "./adjudicator.js";

export interface IntegrityFailure {
  readonly intentHash: string;
  readonly kind:
    | "AUDIT_HASH_TAMPERED"
    | "INTENT_HASH_MISMATCH"
    // 092: the auditHash is intact but a PRESENT signature does not verify (a
    // forged hash-bind value or a rejected asymmetric signature). Distinct from
    // AUDIT_HASH_TAMPERED so an operator can tell "the bytes were modified" from
    // "the bytes are intact but the signature is not authentic".
    | "AUDIT_SIGNATURE_INVALID"
    // 093: the inter-record HASH CHAIN is broken — a record's `prevAuditHash`
    // does not equal the immediately-preceding record's `auditHash` in the same
    // stream. Distinct from AUDIT_HASH_TAMPERED (each record's OWN bytes can be
    // intact) — what is detected here is a DELETED or REORDERED record: the
    // surviving successor's chain link no longer points at its true predecessor.
    // `detail.stored` carries the record's `prevAuditHash`; `detail.derived`
    // carries the predecessor's actual `auditHash` (the value the link should be).
    | "AUDIT_CHAIN_BROKEN";
  readonly detail: {
    readonly stored: string;
    readonly derived: string;
  };
}

export interface ReplayIntegrityReport {
  readonly total: number;
  /** Records where BOTH replay and integrity passed. */
  readonly matched: number;
  /** Replay-axis mismatches (decision-kind / basis-drift / refusal-code). */
  readonly mismatches: readonly ReplayMismatch[];
  /** Integrity-axis failures (audit-hash tamper or intent-hash mismatch). */
  readonly integrityFailures: readonly IntegrityFailure[];
  /**
   * Pre-v4 records lacked auditHash. Recorded separately so adopters can
   * track migration progress without false-positives from legacy rows.
   */
  readonly preV4Records: number;
}

/**
 * Run replay and integrity verification across the record set. The
 * order within the record array is preserved; the report aggregates by
 * axis (matched / mismatches / integrityFailures) and is otherwise
 * deterministic given identical inputs.
 *
 * Adjudicator may be the same closure used by `replay()` — it MUST be
 * deterministic and side-effect-free.
 */
export function replayWithIntegrity(
  records: readonly AuditRecord[],
  adjudicator: Adjudicator,
): ReplayIntegrityReport {
  const mismatches: ReplayMismatch[] = [];
  const integrityFailures: IntegrityFailure[] = [];
  let matched = 0;
  let preV4 = 0;

  // 093 — per-stream chain cursor. A "stream" is a session
  // (`envelope.actor.sessionId`): records within a session form an inter-record
  // hash chain via `prevAuditHash`. The cursor maps each stream to the
  // `auditHash` of the LAST record seen for that stream (in input order). When a
  // record carries a `prevAuditHash`, it MUST equal the cursor's value — a
  // mismatch means a record was DELETED or REORDERED between this record and its
  // recorded predecessor. The first record of a stream (genesis) has no
  // `prevAuditHash` and is exempt.
  const chainTip = new Map<string, string | undefined>();

  for (const record of records) {
    // Integrity axis 1: envelope intentHash. Re-derive via the single
    // authoritative `deriveIntentHash` from @adjudicate/core so the recipe
    // (version, kind, payload, nonce, actor, taint) can never drift from the
    // kernel's own derivation.
    const derivedEnvHash = deriveIntentHash(record.envelope);
    const intentHashOk = derivedEnvHash === record.envelope.intentHash;
    if (!intentHashOk) {
      integrityFailures.push({
        intentHash: record.intentHash,
        kind: "INTENT_HASH_MISMATCH",
        detail: { stored: record.envelope.intentHash, derived: derivedEnvHash },
      });
    }

    // Integrity axis 2: audit record auditHash + signature (092). A single
    // verdict now covers both the tamper axis (auditHash) and the authenticity
    // axis (signature). The `invalid_signature` outcome carries `keyId`/`alg`
    // (not stored/derived hashes), so it maps to a distinct IntegrityFailure
    // kind reflecting the keyId/alg in the detail rather than two hashes.
    let auditHashOk = true;
    const auditVerification: AuditRecordVerification = verifyAuditRecord(record);
    if (auditVerification.verified === false) {
      auditHashOk = false;
      if (auditVerification.reason === "invalid_signature") {
        integrityFailures.push({
          intentHash: record.intentHash,
          kind: "AUDIT_SIGNATURE_INVALID",
          detail: {
            // The signature axis has no derived/stored hash pair to report; carry
            // the offending key id + alg so an operator can locate the key.
            stored: auditVerification.keyId,
            derived: auditVerification.alg,
          },
        });
      } else {
        // "tampered" (auditHash mismatch) or "envelope_intent_mismatch" — both
        // carry the stored/derived hash pair.
        integrityFailures.push({
          intentHash: record.intentHash,
          kind: "AUDIT_HASH_TAMPERED",
          detail: {
            stored: auditVerification.stored,
            derived: auditVerification.derived,
          },
        });
      }
    } else if (auditVerification.verified === null) {
      preV4++;
      // Don't penalize matched count for legacy records — the replay
      // axis still gets a chance to confirm or refute.
    }

    // Integrity axis 3 (093): inter-record HASH CHAIN continuity. Compare this
    // record's `prevAuditHash` to the per-stream cursor (the immediately-
    // preceding record's `auditHash`). A genesis record (no `prevAuditHash`) is
    // exempt — it legitimately opens a stream. A non-genesis record whose link
    // does NOT match the cursor signals a deleted/reordered record: the chain is
    // broken. This is ORTHOGONAL to the auditHash axis — each record's own bytes
    // can be intact while the chain between them is broken (the attack the
    // logical `predecessorIntentHash` link could not detect).
    const stream = record.envelope?.actor?.sessionId;
    let chainOk = true;
    const prevLink = record.prevAuditHash;
    if (stream !== undefined && prevLink !== undefined) {
      const expectedTip = chainTip.get(stream);
      // `expectedTip` is undefined when this stream had no prior record in the
      // input window (e.g. a partial window starting mid-chain) — that is NOT a
      // detectable break here (the predecessor is simply out of window), so only
      // flag when there IS a prior record AND it disagrees with the link.
      if (expectedTip !== undefined && !timingSafeHexEqual(prevLink, expectedTip)) {
        chainOk = false;
        integrityFailures.push({
          intentHash: record.intentHash,
          kind: "AUDIT_CHAIN_BROKEN",
          detail: { stored: prevLink, derived: expectedTip },
        });
      }
    }
    // Advance the cursor to THIS record's auditHash (the tip for the next record
    // in the stream). A record with no auditHash (pre-v4) leaves the tip
    // undefined so a downstream v4 successor's link cannot false-match.
    if (stream !== undefined) {
      chainTip.set(stream, record.auditHash);
    }

    // Replay axis.
    const expected = record.decision;
    const actual = adjudicator(record);
    const mismatch = classify(record.intentHash, expected, actual);
    if (mismatch === null && intentHashOk && auditHashOk && chainOk) {
      matched++;
    } else if (mismatch !== null) {
      mismatches.push(mismatch);
    }
  }

  return {
    total: records.length,
    matched,
    mismatches,
    integrityFailures,
    preV4Records: preV4,
  };
}

/**
 * Quick boolean check — useful for CI gates that only need to know "did
 * any axis fail?" without parsing the full report.
 */
export function isReplayIntegrityClean(report: ReplayIntegrityReport): boolean {
  return (
    report.mismatches.length === 0 && report.integrityFailures.length === 0
  );
}

// ── 093 — External signed checkpoint over the chain tip ──────────────────────
//
// The inter-record `prevAuditHash` chain makes deletion/reorder of an INTERIOR
// record detectable (a surviving successor's link no longer matches its
// predecessor). But truncating the TAIL of a chain (deleting the last N records,
// link and all) leaves the surviving prefix internally consistent — there is no
// surviving successor to dangle. The EXTERNAL signed checkpoint closes that gap:
// it is a periodic, signed anchor over the chain tip `(sequence, tipAuditHash,
// count)`. A deleted suffix no longer reproduces the last signed checkpoint's tip
// or count, and the signature prevents an attacker from forging a fresh
// checkpoint to match the truncated set (they lack the signing key).
//
// The checkpoint reuses the SAME `AuditSignature` shape and `AuditSigner`
// contract wired in by 092 (`{ keyId, alg, value }`), signed over a versioned
// canonical pre-image. The hash-bind leg is verifiable here (pure-JS,
// browser-safe); asymmetric (ed25519) checkpoints defer to an injected verifier,
// exactly like `verifyAuditRecord`.

/** Versioned pre-image tag for an audit-chain checkpoint signature (093). */
export const AUDIT_CHECKPOINT_PREIMAGE_VERSION =
  "adjudicate-audit-checkpoint-v1" as const;

/**
 * An externally-signed anchor over an audit-chain segment tip (093).
 *   - `sequence`     — caller-supplied monotonic checkpoint index (which
 *                      checkpoint in the series this is). Bound into the
 *                      signature so a checkpoint cannot be replayed at another
 *                      sequence position.
 *   - `tipAuditHash` — the `auditHash` of the LAST record in the checkpointed
 *                      segment (the chain tip). `null` for an empty segment.
 *   - `count`        — the number of records in the checkpointed segment. With
 *                      `tipAuditHash`, this is what a deleted tail can no longer
 *                      reproduce.
 *   - `signature`    — `AuditSignature` over `auditCheckpointPreimage(...)`,
 *                      produced by the 092 signer.
 */
export interface AuditCheckpoint {
  readonly sequence: number;
  readonly tipAuditHash: string | null;
  readonly count: number;
  readonly signature: AuditSignature;
}

/**
 * Build the versioned canonical pre-image STRING a checkpoint signer signs and
 * `verifyAuditCheckpoint` re-derives — a version tag line followed by the
 * `sha256Canonical` of `(sequence, tipAuditHash, count)`. Pure: no I/O, no clock,
 * no `node:crypto`. Browser-safe (mirrors `auditSignaturePreimage`).
 */
export function auditCheckpointPreimage(
  sequence: number,
  tipAuditHash: string | null,
  count: number,
): string {
  const bodyHash = sha256Canonical({ sequence, tipAuditHash, count });
  return `${AUDIT_CHECKPOINT_PREIMAGE_VERSION}\n${bodyHash}`;
}

/**
 * Compute the chain tip + count over a record segment. The tip is the
 * `auditHash` of the LAST record (input order is the chain order); `null` when
 * the segment is empty or the last record predates v4 (no auditHash).
 */
function chainTipOf(records: readonly AuditRecord[]): {
  tipAuditHash: string | null;
  count: number;
} {
  const last = records[records.length - 1];
  return {
    tipAuditHash: last?.auditHash ?? null,
    count: records.length,
  };
}

/**
 * Emit a signed checkpoint over a record segment's chain tip (093 / T4). The
 * impure shell calls this periodically (e.g. every N records or on a cadence)
 * with the 092 `AuditSigner` to produce the external anchor. A THROWING signer
 * propagates — the shell treats it as FAIL-CLOSED (no unsigned checkpoint), per
 * §D inv. 6 (mirrors `buildAuditRecord`'s signer contract).
 *
 * Pure aside from the injected signer: deterministic given identical records +
 * sequence + signer.
 */
export function emitAuditCheckpoint(
  records: readonly AuditRecord[],
  signer: AuditSigner,
  sequence: number,
): AuditCheckpoint {
  const { tipAuditHash, count } = chainTipOf(records);
  const preimage = auditCheckpointPreimage(sequence, tipAuditHash, count);
  // The 092 signer signs an `auditHash` string; the checkpoint pre-image is the
  // analogous canonical string for the chain tip. `sign` takes a string, so we
  // hand it the checkpoint pre-image (NOT a record hash) — the value commits to
  // (sequence, tip, count).
  const signature = signer.sign(preimage);
  return { sequence, tipAuditHash, count, signature };
}

/**
 * The outcome of validating a checkpoint against a (possibly truncated) record
 * segment (093 / T4):
 *   - `{ valid: true }` — the segment reproduces the checkpoint's tip + count AND
 *      the signature is authentic (on the verifiable leg).
 *   - `{ valid: false, reason: "tip_mismatch" | "count_mismatch", ... }` — the
 *      segment no longer matches the signed anchor (the canonical deleted-tail /
 *      truncation signal).
 *   - `{ valid: false, reason: "invalid_signature" }` — the checkpoint's own
 *      signature does not verify (a forged anchor).
 */
export type AuditCheckpointVerification =
  | { readonly valid: true }
  | {
      readonly valid: false;
      readonly reason: "tip_mismatch";
      readonly expected: string | null;
      readonly actual: string | null;
    }
  | {
      readonly valid: false;
      readonly reason: "count_mismatch";
      readonly expected: number;
      readonly actual: number;
    }
  | { readonly valid: false; readonly reason: "invalid_signature" };

/** Optional asymmetric-signature verifier hook for checkpoints (mirrors `VerifyAuditRecordOptions`). */
export interface VerifyAuditCheckpointOptions {
  readonly verifySignature?: (
    preimage: string,
    signature: AuditSignature,
  ) => boolean;
}

/**
 * Validate a previously-signed checkpoint against the CURRENT record segment
 * (093 / T4). Recomputes the tip + count over `records` and compares to the
 * checkpoint, then verifies the checkpoint's signature.
 *
 * A deleted tail (truncation) makes the recomputed `(tip, count)` disagree with
 * the signed checkpoint → `tip_mismatch` / `count_mismatch`. The signature check
 * (hash-bind verified here; asymmetric via injected `verifySignature`) prevents a
 * forged checkpoint from matching the truncated set. Pure: no I/O.
 */
export function verifyAuditCheckpoint(
  records: readonly AuditRecord[],
  checkpoint: AuditCheckpoint,
  opts?: VerifyAuditCheckpointOptions,
): AuditCheckpointVerification {
  // 1. Signature authenticity FIRST — an unsigned/forged anchor is meaningless,
  // and a valid signature is what makes the (tip, count) comparison trustworthy.
  const sig = checkpoint.signature;
  const signedPreimage = auditCheckpointPreimage(
    checkpoint.sequence,
    checkpoint.tipAuditHash,
    checkpoint.count,
  );
  if (sig.alg === AUDIT_HASHBIND_ALG) {
    const expected = sha256Canonical(
      auditSignaturePreimage(signedPreimage, sig.keyId),
    );
    if (!timingSafeHexEqual(sig.value, expected)) {
      return { valid: false, reason: "invalid_signature" };
    }
  } else if (opts?.verifySignature !== undefined) {
    if (!opts.verifySignature(signedPreimage, sig)) {
      return { valid: false, reason: "invalid_signature" };
    }
  }
  // else: asymmetric signature with no verifier injected → unverified leg
  // (fail-SAFE; never false-fail what we structurally cannot check, mirroring
  // verifyAuditRecord). The tip/count comparison below still runs.

  // 2. Tip + count must reproduce. A deleted tail changes BOTH; we report the
  // first that differs (count is the cheaper, more legible signal).
  const { tipAuditHash, count } = chainTipOf(records);
  if (count !== checkpoint.count) {
    return {
      valid: false,
      reason: "count_mismatch",
      expected: checkpoint.count,
      actual: count,
    };
  }
  const tipMatches =
    tipAuditHash === null || checkpoint.tipAuditHash === null
      ? tipAuditHash === checkpoint.tipAuditHash
      : timingSafeHexEqual(tipAuditHash, checkpoint.tipAuditHash);
  if (!tipMatches) {
    return {
      valid: false,
      reason: "tip_mismatch",
      expected: checkpoint.tipAuditHash,
      actual: tipAuditHash,
    };
  }
  return { valid: true };
}
