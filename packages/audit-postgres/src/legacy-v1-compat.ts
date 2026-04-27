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
  type IntentEnvelope,
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
    readonly actor: { readonly principal: "llm" | "user" | "system"; readonly sessionId: string };
    readonly taint: Taint;
    readonly createdAt: string;
    readonly nonce?: string;
  };
  const nonce =
    typeof row.nonce === "string" && row.nonce.length > 0
      ? row.nonce
      : (stored.nonce ?? stored.createdAt);
  return buildEnvelope({
    kind: stored.kind,
    payload: stored.payload,
    actor: stored.actor,
    taint: stored.taint,
    nonce,
    createdAt: stored.createdAt,
  });
}
