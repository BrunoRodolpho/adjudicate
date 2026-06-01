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
 *
 * **Wire format**: the JSON Schema (Draft 2020-12) for v2 envelopes lives
 * at `docs/specs/intent-envelope-v2.schema.json`. The canonical-JSON SHA-256
 * algorithm that produces `intentHash` is normatively specified at
 * `docs/specs/canonical-json-hash.md` — external (Rust/Go/Python)
 * implementations that conform to the spec produce byte-identical hashes.
 */

import { sha256Canonical } from "./hash.js";
import type { Taint } from "./taint.js";

export const INTENT_ENVELOPE_VERSION = 2 as const;
export type IntentEnvelopeVersion = typeof INTENT_ENVELOPE_VERSION;

export interface IntentActor {
  readonly principal: "llm" | "user" | "system";
  readonly sessionId: string;
  /**
   * Reserved seam for v0.2 actor attestation. v0.1 envelopes omit this
   * field — absent `attestation` is canonical-JSON-dropped and does NOT
   * alter the intentHash. A future policy slot (`Pack.verifyActorAttestation`)
   * will gate on this when the host supplies a verifier; until then the
   * field is a structural reservation so adopters can round-trip it through
   * audit records without a schema break.
   */
  readonly attestation?: {
    readonly keyId: string;
    readonly sig: string;
  };
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
 * The content-addressed fields that feed `intentHash` (v2 recipe):
 * `(version, kind, payload, nonce, actor, taint)`. `createdAt` is descriptive
 * metadata and is deliberately excluded. Single source of truth so
 * `buildEnvelope` (construction) and `deriveIntentHash` (kernel verification)
 * can never drift — a divergence between the two would silently break ledger
 * dedup and let forged hashes through.
 */
function intentHashInput<K extends string, P>(e: {
  readonly version: IntentEnvelopeVersion;
  readonly kind: K;
  readonly payload: P;
  readonly nonce: string;
  readonly actor: IntentActor;
  readonly taint: Taint;
}): Record<string, unknown> {
  return {
    version: e.version,
    kind: e.kind,
    payload: e.payload,
    nonce: e.nonce,
    actor: e.actor,
    taint: e.taint,
  };
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
  const intentHash = sha256Canonical(
    intentHashInput({
      version: INTENT_ENVELOPE_VERSION,
      kind: input.kind,
      payload: input.payload,
      nonce: input.nonce,
      actor: input.actor,
      taint: input.taint,
    }),
  );
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
 * Re-derive the content-addressed `intentHash` for an existing envelope.
 *
 * The kernel calls this to VERIFY that `envelope.intentHash` actually matches
 * the canonical content — content-addressing is only meaningful if the hash is
 * verified, not trusted. Adopters who build envelopes via `buildEnvelope` get a
 * matching hash for free; a forged or drifted hash is caught by the kernel and
 * refused with `schema:intent_hash_mismatch`.
 */
export function deriveIntentHash(envelope: IntentEnvelope): string {
  return sha256Canonical(intentHashInput(envelope));
}

/**
 * The exactly-eight documented top-level envelope fields. `isIntentEnvelope`
 * rejects any object whose key set is not precisely this set, mirroring
 * `additionalProperties: false` in `docs/specs/intent-envelope-v2.schema.json`.
 * Module-level so the guard does not reallocate the Set on every call.
 */
const EXPECTED_ENVELOPE_KEYS = new Set([
  "version",
  "kind",
  "payload",
  "createdAt",
  "nonce",
  "actor",
  "taint",
  "intentHash",
]);

/**
 * Narrow an unknown value to an IntentEnvelope of the current version.
 * Consumed by the schema-version invariant test and by adjudicate() before
 * it inspects payload fields.
 */
export function isIntentEnvelope(value: unknown): value is IntentEnvelope {
  if (value === null || typeof value !== "object") return false;
  // Reject extras AND missing fields (spec: additionalProperties:false on
  // intent-envelope-v2.schema.json). An accepted envelope carrying an extra
  // key would otherwise hash differently (canonicalize iterates all entries),
  // silently breaking retry dedup.
  const keys = Object.keys(value as object);
  if (
    keys.length !== EXPECTED_ENVELOPE_KEYS.size ||
    keys.some((k) => !EXPECTED_ENVELOPE_KEYS.has(k))
  ) {
    return false;
  }
  const v = value as Partial<IntentEnvelope>;
  return (
    v.version === INTENT_ENVELOPE_VERSION &&
    typeof v.kind === "string" &&
    typeof v.createdAt === "string" &&
    typeof v.nonce === "string" &&
    typeof v.intentHash === "string" &&
    v.actor !== undefined &&
    (v.actor.principal === "llm" ||
      v.actor.principal === "user" ||
      v.actor.principal === "system") &&
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
