/**
 * Legacy v1 → v2 envelope compatibility for replay reads.
 *
 * Pre-T8 envelopes hashed `(version, kind, payload, createdAt, actor, taint)`.
 * v2 hashes `(version, kind, payload, nonce, actor, taint)`. Replay
 * harnesses reading historical rows need to reconstruct envelopes that
 * still produce the SAME intentHash the original kernel computed —
 * otherwise replay reports false-positive drift on every pre-T8 record.
 *
 * `legacyV1ToV2(row)` synthesizes a v2 envelope from a v1 row by:
 *   - reading the stored envelope_jsonb (which carries the original
 *     `createdAt` and lacks `nonce`).
 *   - using the original `createdAt` AS the nonce (the same string that
 *     the v1 hash used as its idempotency key, even if implicitly).
 *
 * The resulting v2 envelope has:
 *   - `version: 2`
 *   - `nonce` = original `createdAt`
 *   - same `kind`, `payload`, `actor`, `taint`, `createdAt`
 *   - a v2 hash recomputed over the v2 recipe.
 *
 * **Important:** the v1 row's `intent_hash` and the synthesized v2
 * envelope's `intentHash` will NOT match — they were computed from
 * different recipes. The replay harness must compare against the v1
 * `intent_hash` separately when reading pre-T8 rows; the v2 envelope is
 * only useful for re-running `adjudicate()` to detect Decision drift.
 */

import {
  buildEnvelope,
  type IntentActor,
  type IntentEnvelope,
  type ResourceRefs,
  type Taint,
} from "@adjudicate/core";
import type { IntentAuditRow } from "./postgres-sink.js";

/**
 * Promote a stored v1 row to a v2 envelope. The synthesized nonce is the
 * v1 row's original createdAt — the closest stand-in available.
 *
 * For a row that already has `nonce !== null` (a v2 row), this function
 * returns a faithful v2 envelope with the original nonce; for v1 rows
 * (record_version === 1 OR null OR `nonce === null`), it synthesizes.
 */
export function legacyV1ToV2(row: IntentAuditRow): IntentEnvelope {
  const stored = JSON.parse(row.envelope_jsonb) as {
    readonly kind: string;
    readonly payload: unknown;
    readonly actor: { readonly principal: IntentActor["principal"]; readonly sessionId: string };
    readonly taint: Taint;
    readonly createdAt: string;
    readonly nonce?: string;
    // 031 — v3 envelopes carry a per-kind resource-refs authorization slot.
    // Drop-safe: a v1/v2 row that never had it leaves this undefined, so the
    // reconstructed envelope omits the key and hashes exactly as before.
    readonly resourceRefs?: ResourceRefs;
  };
  const rowNonce =
    typeof row.nonce === "string" && row.nonce.length > 0 ? row.nonce : null;
  const storedNonce =
    typeof stored.nonce === "string" && stored.nonce.length > 0
      ? stored.nonce
      : null;
  // v2+ records MUST carry a real nonce — it is the hash input, not
  // descriptive metadata. A v2+ row reaching this helper with no usable
  // nonce (neither the row column nor the stored envelope JSON) is a
  // data-integrity violation: silently substituting `createdAt` (the v1
  // synthesis path) would forge a nonce the original kernel never hashed,
  // masking corruption rather than surfacing it. Fail loudly instead.
  // v1 rows (record_version 1 or NULL) legitimately lack a nonce and keep
  // the legacy createdAt fallback below.
  if (row.record_version >= 2 && rowNonce === null && storedNonce === null) {
    throw new Error(
      `legacyV1ToV2: v2+ row (record_version=${row.record_version}, intent_hash=${row.intent_hash}) is missing a nonce — ` +
        "both the nonce column and the stored envelope nonce are null/empty. " +
        "A v2+ record MUST carry the nonce it was hashed with; refusing to " +
        "synthesize one from createdAt (which would forge a hash input).",
    );
  }
  const nonce = rowNonce ?? storedNonce ?? stored.createdAt;
  return buildEnvelope({
    kind: stored.kind,
    payload: stored.payload,
    actor: stored.actor,
    taint: stored.taint,
    nonce,
    createdAt: stored.createdAt,
    // 031: thread resourceRefs through so a v3 row reconstructs faithfully.
    // Drop-safe — undefined for any v1/v2 row, leaving the recomputed hash
    // byte-identical to the pre-031 reconstruction.
    resourceRefs: stored.resourceRefs,
  });
}
