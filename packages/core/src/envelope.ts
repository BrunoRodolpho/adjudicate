/**
 * IntentEnvelope — the canonical mutation proposal.
 *
 * Every state-mutating action in an adjudicate-based system crosses the
 * kernel as an IntentEnvelope. The LLM proposes; the kernel disposes.
 * The envelope carries identity, provenance, version, and a replay key
 * — it is the single load-bearing contract that audit records reference,
 * the kernel decides on, and the ledger deduplicates by.
 *
 * **Schema v2 (T8):** `nonce` is the load-bearing idempotency key, NOT
 * `createdAt`. Pre-T8 the hash included `createdAt`, which created a
 * silent foot-gun: an adopter rebuilding an envelope on retry without
 * preserving `createdAt` produced a different `intentHash` and the
 * Execution Ledger could not dedupe. v2 separates them — `nonce` is
 * adopter-supplied and idempotency-bearing, `createdAt` is descriptive
 * metadata that does not feed the hash.
 *
 * v1 envelopes (with `version: 1` or no `nonce`) are REFUSEd at runtime
 * with `schema_version_unsupported`. Pre-v2 audit rows replay via
 * `legacyV1ToV2` in `@adjudicate/audit-postgres`, which synthesizes a
 * nonce from the v1 `createdAt` so historical replay reproduces the
 * same intentHash without the foot-gun.
 */

import { sha256Canonical } from "./hash.js";
import type { Taint } from "./taint.js";

export const INTENT_ENVELOPE_VERSION = 2 as const;
export type IntentEnvelopeVersion = typeof INTENT_ENVELOPE_VERSION;

export interface IntentActor {
  readonly principal: "llm" | "user" | "system";
  readonly sessionId: string;
}

export interface IntentEnvelope<K extends string = string, P = unknown> {
  readonly version: IntentEnvelopeVersion;
  readonly kind: K;
  readonly payload: P;
  /** ISO-8601 wall-clock timestamp. Metadata only — NOT part of the hash. */
  readonly createdAt: string;
  /**
   * Adopter-supplied idempotency key. Part of the `intentHash`. Two retries
   * of the same logical action MUST share the same `nonce` for ledger
   * dedup to work; first attempts use a fresh value (typically
   * `crypto.randomUUID()`).
   */
  readonly nonce: string;
  readonly actor: IntentActor;
  readonly taint: Taint;
  /** sha256 of canonical(envelope minus intentHash). Computed once at construction. */
  readonly intentHash: string;
}

export interface BuildEnvelopeInput<K extends string, P> {
  readonly kind: K;
  readonly payload: P;
  readonly actor: IntentActor;
  readonly taint: Taint;
  /**
   * Idempotency key. **Required.** First attempts pass `crypto.randomUUID()`.
   * Retries pass the SAME value as the original attempt — typically the
   * adopter persists the envelope (or just the nonce) at first dispatch
   * and reuses on retry.
   *
   * Foot-gun pre-T8: `createdAt` was the hash input. Adopters who rebuilt
   * envelopes from scratch on retry produced a new hash and silently
   * broke ledger dedup. v2 makes the idempotency key explicit and
   * separate from descriptive metadata.
   */
  readonly nonce: string;
  /**
   * ISO-8601 wall-clock timestamp. Defaults to `new Date().toISOString()`.
   * Metadata only — NOT part of the `intentHash`. Adopters can vary
   * `createdAt` freely on retry without affecting dedup.
   */
  readonly createdAt?: string;
}

/**
 * Construct a fully-formed IntentEnvelope with a computed intentHash.
 * Hash is derived from `(version, kind, payload, nonce, actor, taint)` —
 * NOT `createdAt`. Reconstructing an envelope from its fields with the
 * same `nonce` produces the same hash regardless of `createdAt`.
 */
export function buildEnvelope<K extends string, P>(
  input: BuildEnvelopeInput<K, P>,
): IntentEnvelope<K, P> {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const hashInput = {
    version: INTENT_ENVELOPE_VERSION,
    kind: input.kind,
    payload: input.payload,
    nonce: input.nonce,
    actor: input.actor,
    taint: input.taint,
  };
  const intentHash = sha256Canonical(hashInput);
  return {
    version: INTENT_ENVELOPE_VERSION,
    kind: input.kind,
    payload: input.payload,
    createdAt,
    nonce: input.nonce,
    actor: input.actor,
    taint: input.taint,
    intentHash,
  };
}

/**
 * Narrow an unknown value to an IntentEnvelope of the current version.
 * Consumed by the schema-version invariant test and by adjudicate() before
 * it inspects payload fields.
 */
export function isIntentEnvelope(value: unknown): value is IntentEnvelope {
  if (value === null || typeof value !== "object") return false;
  const v = value as Partial<IntentEnvelope>;
  return (
    v.version === INTENT_ENVELOPE_VERSION &&
    typeof v.kind === "string" &&
    typeof v.createdAt === "string" &&
    typeof v.nonce === "string" &&
    typeof v.intentHash === "string" &&
    v.actor !== undefined &&
    typeof v.actor.principal === "string" &&
    typeof v.actor.sessionId === "string" &&
    (v.taint === "SYSTEM" || v.taint === "TRUSTED" || v.taint === "UNTRUSTED")
  );
}

/**
 * Returns true iff the value has a recognizable envelope shape but an
 * unsupported version field. Used by the kernel to emit a SECURITY refusal
 * with code "schema_version_unsupported" rather than crashing.
 */
export function hasUnknownEnvelopeVersion(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  const v = value as { version?: unknown };
  return (
    v.version !== undefined &&
    v.version !== INTENT_ENVELOPE_VERSION &&
    typeof v.version === "number"
  );
}
