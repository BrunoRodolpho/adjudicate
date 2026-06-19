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
import { DEFAULT_ORIGIN, type Origin, type Taint } from "./taint.js";
import { timingSafeHexEqual } from "./timing-safe.js";

export const INTENT_ENVELOPE_VERSION = 2 as const;
export type IntentEnvelopeVersion = typeof INTENT_ENVELOPE_VERSION;

/**
 * Per-kind resource references (031) — the envelope's authorization slot.
 *
 * A closed map from a role name (`"owner"`, `"account"`, `"tenant"`,
 * `"resource"`, …) to the resource identifier the kind operates on. This is
 * the field the kernel needs to bind the proposing actor against the resource
 * in the payload, closing the IDOR root cause: `IntentActor` is provenance-only
 * (`principal`/`sessionId`/`attestation`) and carries NO owner/tenant/resource
 * slot, so until v3 the kernel could never compare actor to payload.
 *
 * The shape is constrained per-kind by the host: each `kind` declares which
 * resource refs it requires (e.g. `pix.charge.refund` requires
 * `{ account: ... }`). 031 only adds the SLOT and binds it into `intentHash`;
 * the authority predicate that reads it is plan 034 and the authority-graph
 * resolver is 032/033 — no guard consults `resourceRefs` in 031.
 *
 * **Canonical-drop-safe (031 §3 / §7).** Optional and ABSENT by default, the
 * same mechanism as `IntentActor.attestation`: an envelope WITHOUT
 * `resourceRefs` (or with it explicitly `undefined`) is canonical-JSON-dropped
 * from the `intentHash` pre-image, so it hashes IDENTICALLY to its post-041
 * value. Only envelopes that actually CARRY resource-refs get a new hash —
 * existing no-resource-refs golden/replay vectors stay byte-stable.
 */
export type ResourceRefs = Readonly<Record<string, string>>;

/**
 * Authority-graph relationship kinds (032, index §G):
 * `owns` / `joint` / `advisor` / `custodian`. Closed union — a new
 * relationship lands MINOR (additive). This is the EDGE LABEL between a
 * principal and a resource, NOT the envelope's provenance `IntentActor.principal`
 * (`"llm" | "user" | "system"`); those are orthogonal axes.
 *
 *   - `owns`      — the principal is the sole owner of the resource (full authority).
 *   - `joint`     — shared ownership (one of several owners; each authoritative).
 *   - `advisor`   — read/recommend authority only; cannot authorize a mutation.
 *   - `custodian` — manages the resource on an owner's behalf within limits.
 */
export type AuthorityRelationship = "owns" | "joint" | "advisor" | "custodian";

/**
 * What a single authority edge PERMITS: a closed set of action names plus
 * optional deterministic per-action limits (e.g. an amount ceiling). The limits
 * map is purely descriptive snapshot DATA the resolver returns as a FACT — it
 * is NOT a decision and NOT a threshold the resolver enforces; a later limit
 * guard (05x) or authority guard (034) consumes it. All values are
 * canonical-JSON-safe finite numbers so the snapshot hashes via
 * `@adjudicate/canonical` (032 T3) and replays bit-identically (invariant #5).
 */
export interface AuthorityPermits {
  /** Action names this edge authorizes (e.g. `"pix.charge.refund"`). */
  readonly actions: readonly string[];
  /**
   * Optional deterministic per-limit ceilings (e.g. `{ amountCentavos: 50000 }`).
   * Finite numbers only — non-finite values throw at canonicalization
   * (RFC 8785 §3.2.2.3) exactly like any other hashed field. Absent ⇒ no limit
   * is declared by this edge (the FACT carries "unlimited-by-this-edge", which a
   * downstream guard interprets — the resolver never authorizes).
   */
  readonly limits?: Readonly<Record<string, number>>;
}

/**
 * One directed edge of the authority graph:
 * `principal —relationship→ resource —permits→ {actions, limits}` (index §G).
 *
 * `principal` and `resource` are stable identity STRINGS (e.g. `"user_42"`,
 * `"acct_7"`) — the same identifiers a kind's `resourceRefs` carries — so the
 * resolver can bind the envelope's declared owner/resource to an edge. This is
 * the binding `IntentActor` cannot express today (provenance-only).
 */
export interface AuthorityEdge {
  readonly principal: string;
  readonly relationship: AuthorityRelationship;
  readonly resource: string;
  readonly permits: AuthorityPermits;
}

/**
 * The authority-graph SNAPSHOT (032, index §B/§D/§G): an IMMUTABLE set of
 * edges injected into the kernel decision as state/deps — never a decision
 * layer. It is recorded into audit for replay (invariant #5) and the resolver
 * NEVER mutates it.
 *
 * **NOT part of `intentHashInput`.** The graph rides as injected state, not as
 * an envelope field — adding it here changes NO envelope hash (the
 * `intentHashInput` pre-image and `EXPECTED_ENVELOPE_KEYS` are byte-identical to
 * their post-031 value). Co-located in `envelope.ts` only so the resource-binding
 * axis sits next to `IntentActor`/`ResourceRefs`; it is content-addressed
 * SEPARATELY via the 032 T3 snapshot serializer.
 */
export interface AuthorityGraph {
  readonly edges: readonly AuthorityEdge[];
}

/**
 * The RECORDED authority-graph snapshot (033, index §B/§D-5): the immutable
 * `AuthorityGraph` that was INJECTED into one kernel decision, paired with its
 * content-address so the decision is REPLAYABLE (re-run the pure kernel over the
 * recorded inputs → bit-identical decision, invariant #5).
 *
 * **Injected state, never a hashed envelope field (033 §3, invariant #4).** This
 * is NOT part of the envelope and NOT in the `intentHashInput` pre-image — the
 * graph rides into the decision as injected `state`/deps (because `Guard<K,P,S>`
 * is `(envelope, state)` — `kernel/policy.ts`), so adding this type changes NO
 * envelope hash (the `intentHashInput` pre-image and `EXPECTED_ENVELOPE_KEYS`
 * stay byte-identical to their post-031 value). It is content-addressed
 * SEPARATELY via the 032 snapshot serializer (`hashAuthorityGraph`, RFC 8785 /
 * JCS through `@adjudicate/canonical`) and recorded onto the audit record so the
 * recorded snapshot replays bit-identically (033 T4/T5).
 *
 *   - `graph`        — the exact injected `AuthorityGraph` snapshot (immutable).
 *   - `snapshotHash` — `hashAuthorityGraph(graph)`: sha256 over the canonical
 *                      snapshot. Lets a replay/audit reader detect a tampered or
 *                      drifted recorded graph WITHOUT re-canonicalizing, and lets
 *                      the audit record's tamper-evidence bind the snapshot
 *                      identity.
 *
 * 033 only INJECTS + RECORDS this snapshot; the authority GUARD that consults it
 * is plan 034 and AC-007 is 035 — no guard reads it here.
 */
export interface RecordedAuthoritySnapshot {
  readonly graph: AuthorityGraph;
  readonly snapshotHash: string;
}

/**
 * The aggregate/limit SNAPSHOT (052, index §B/§D/§G): an IMMUTABLE view of the
 * cumulative/velocity counters the multi-horizon limit guards decide against —
 * "how much of this resource has already been committed in this window?". Like
 * the authority graph (032/033), it is an INJECTED snapshot, never a decision
 * layer: the impure shell computes it (by reading the durable counting
 * substrate — `GuardFireStats` + the additive Postgres upsert), then passes it
 * READ-ONLY to the one kernel decision. The kernel NEVER refetches, mutates, or
 * timestamps it (index §D, constitutional inv. 5: clock/ledger from `deps`).
 *
 * **NOT part of `intentHashInput`.** The aggregate snapshot rides as injected
 * state, not as an envelope field — adding this type changes NO envelope hash
 * (the `intentHashInput` pre-image and `EXPECTED_ENVELOPE_KEYS` stay
 * byte-identical, exactly like 032/033). Co-located here only so the
 * multi-horizon limit axis sits next to the other injected snapshots; it is
 * content-addressed SEPARATELY via the 052 snapshot serializer
 * (`hashAggregateSnapshot`, RFC 8785 / JCS via `@adjudicate/canonical`).
 *
 *   - `windows` — the per-(resource, horizon) counter view the kernel reads. The
 *     key is an opaque adopter string (e.g. `"acct_7|daily"`); the value is the
 *     already-committed aggregate for that window. Computed in the shell from the
 *     coalesced counting substrate (delta-write + additive upsert), so it is
 *     bit-stable for a given substrate state.
 *   - `at`      — the ISO-8601 wall-clock the shell sampled the counters at,
 *     supplied by the shell's `clock` (NOT read by the kernel). Recorded for
 *     replay provenance; never enters a guard's arithmetic.
 */
export interface AggregateSnapshot {
  readonly windows: Readonly<Record<string, number>>;
  readonly at: string;
}

/**
 * The RECORDED aggregate snapshot (052, index §B/§D-5): the immutable
 * `AggregateSnapshot` that was INJECTED into one kernel decision, paired with its
 * content-address so the decision is REPLAYABLE (re-run the pure kernel over the
 * recorded inputs → bit-identical decision, invariant #5). Mirrors
 * `RecordedAuthoritySnapshot` (033) exactly.
 *
 * **Injected state, never a hashed envelope field (052 §3, invariant #4).** This
 * is NOT part of the envelope and NOT in the `intentHashInput` pre-image — the
 * snapshot rides into the decision as injected `state`/deps, so adding this type
 * changes NO envelope hash. It is content-addressed SEPARATELY via the 052
 * snapshot serializer (`hashAggregateSnapshot`, RFC 8785 / JCS through
 * `@adjudicate/canonical`) and recorded onto the audit record so the recorded
 * snapshot replays bit-identically (052 T2/T6).
 *
 *   - `snapshot`     — the exact injected `AggregateSnapshot` (immutable).
 *   - `snapshotHash` — `hashAggregateSnapshot(snapshot)`: sha256 over the
 *                      canonical snapshot. Lets a replay/audit reader detect a
 *                      tampered/drifted recorded snapshot WITHOUT
 *                      re-canonicalizing, and binds the snapshot identity into
 *                      the audit record's tamper-evidence.
 *
 * 052 only INJECTS + RECORDS this snapshot and OWNS the counting substrate it is
 * computed from; the velocity/limit GUARDS that consult it are 051 (which
 * CONSUMES the substrate read-only) — no guard reads it here (§C monotonicity:
 * an aggregate/limit signal may only RAISE friction, never authorize EXECUTE).
 */
export interface RecordedAggregateSnapshot {
  readonly snapshot: AggregateSnapshot;
  readonly snapshotHash: string;
}

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
  /**
   * Harness-stamped provenance *source* axis (041). Orthogonal to `taint`:
   * `taint` is how trusted the content is, `origin` is where the proposal
   * came from (Human / Retrieved / ExternalAPI / LLM / System). Part of the
   * `intentHash` pre-image so the LLM cannot post-hoc flip the declared
   * origin (§D #4). Stamped, hashed, but consulted by NO guard in 041 — the
   * contaminating propagation gate that reads it is plan 042.
   */
  readonly origin: Origin;
  /**
   * Per-kind resource references (031) — the envelope's authorization slot.
   * Optional and canonical-drop-safe: when absent it is dropped from the
   * `intentHash` pre-image (mirroring `actor.attestation`), so a v2/post-041
   * envelope without resource-refs hashes IDENTICALLY to a v3 envelope with the
   * field explicitly `undefined`. Present resource-refs ARE bound into
   * `intentHash` (§D #4) so the LLM cannot post-hoc flip the declared owner.
   * Read by no guard in 031 — the authority predicate is plan 034.
   */
  readonly resourceRefs?: ResourceRefs;
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
  /**
   * Harness-stamped provenance source axis (041). Optional at the call
   * site — defaults to `DEFAULT_ORIGIN` (`"LLM"`) so callers that pre-date
   * the origin axis still build a fully-formed v2 envelope. Always present
   * in the constructed envelope and always part of the `intentHash`
   * pre-image. The harness loop stamps a concrete literal at the single
   * LLM-bytes site.
   */
  readonly origin?: Origin;
  /**
   * Per-kind resource references (031). Optional at the call site AND in the
   * constructed envelope — UNLIKE `origin` (which is always-present), this is
   * canonical-drop-safe: omitting it produces an envelope with NO `resourceRefs`
   * key, which hashes identically to the post-041 no-refs value. Supply it only
   * for kinds that carry an authorization target; the kernel binds whatever you
   * pass into `intentHash`.
   */
  readonly resourceRefs?: ResourceRefs;
}

/**
 * The content-addressed fields that feed `intentHash` (v2 recipe, 041):
 * `(version, kind, payload, nonce, actor, taint, origin)`. `createdAt` is
 * descriptive metadata and is deliberately excluded. Single source of truth
 * so `buildEnvelope` (construction) and `deriveIntentHash` (kernel
 * verification) can never drift — a divergence between the two would
 * silently break ledger dedup and let forged hashes through.
 *
 * **041 — `origin` is ALWAYS-PRESENT in the pre-image.** It is not
 * canonical-drop-conditional: every envelope hashes its `origin` (defaulting
 * to `DEFAULT_ORIGIN` at construction), so an LLM cannot post-hoc flip the
 * declared source (§D #4) and replay stays byte-identical over recorded
 * inputs (§D #5). This DOES change every post-041 envelope hash relative to
 * the pre-041 6-field recipe — authorized by plan 041 §7 ("adding `origin`
 * to the `intentHash` pre-image changes every envelope hash; … no
 * cross-version persistence of pre-041 hashes is in scope").
 */
/**
 * **031 — `resourceRefs` is CANONICAL-DROP-SAFE in the pre-image.** UNLIKE
 * `origin`, it is NOT always-present: it is emitted into the pre-image object
 * only as `e.resourceRefs`, which is `undefined` for any envelope built
 * without it. `canonicalize` (@adjudicate/canonical) filters `undefined`
 * properties BEFORE hashing, so the `resourceRefs` key vanishes from the
 * canonical JSON exactly as `attestation` does — a no-resource-refs envelope
 * hashes IDENTICALLY to its post-041 value (the existing golden + replay
 * vectors stay byte-stable, including the replay-longevity corpus). Only an
 * envelope that actually CARRIES resource-refs binds them into `intentHash`,
 * making the declared owner tamper-evident (§D #4).
 */
function intentHashInput<K extends string, P>(e: {
  readonly version: IntentEnvelopeVersion;
  readonly kind: K;
  readonly payload: P;
  readonly nonce: string;
  readonly actor: IntentActor;
  readonly taint: Taint;
  readonly origin: Origin;
  readonly resourceRefs?: ResourceRefs;
}): Record<string, unknown> {
  return {
    version: e.version,
    kind: e.kind,
    payload: e.payload,
    nonce: e.nonce,
    actor: e.actor,
    taint: e.taint,
    origin: e.origin,
    // Canonical-drop-safe (031): when undefined, canonicalize() omits the key
    // entirely → byte-identical to the post-041 no-resource-refs pre-image.
    resourceRefs: e.resourceRefs,
  };
}

/**
 * Construct a fully-formed IntentEnvelope with a computed intentHash.
 * Hash is derived from `(version, kind, payload, nonce, actor, taint,
 * origin[, resourceRefs])` — NOT `createdAt`. Reconstructing an envelope from
 * its fields with the same `nonce`, `origin`, and `resourceRefs` produces the
 * same hash regardless of `createdAt`. `origin` defaults to `DEFAULT_ORIGIN`
 * (`"LLM"`) when omitted; `resourceRefs` (031) is NOT defaulted — when omitted
 * it is canonical-dropped, so a no-refs envelope hashes identically to its
 * post-041 value and the `resourceRefs` key is absent from the result.
 */
export function buildEnvelope<K extends string, P>(
  input: BuildEnvelopeInput<K, P>,
): IntentEnvelope<K, P> {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const origin = input.origin ?? DEFAULT_ORIGIN;
  // 031: do NOT default resourceRefs — keep it undefined when omitted so it is
  // canonical-dropped from the pre-image (no hash drift for no-refs envelopes).
  const resourceRefs = input.resourceRefs;
  const intentHash = sha256Canonical(
    intentHashInput({
      version: INTENT_ENVELOPE_VERSION,
      kind: input.kind,
      payload: input.payload,
      nonce: input.nonce,
      actor: input.actor,
      taint: input.taint,
      origin,
      resourceRefs,
    }),
  );
  const envelope: IntentEnvelope<K, P> = {
    version: INTENT_ENVELOPE_VERSION,
    kind: input.kind,
    payload: input.payload,
    createdAt,
    nonce: input.nonce,
    actor: input.actor,
    taint: input.taint,
    origin,
    intentHash,
  };
  // Only attach the key when present so a no-refs envelope's key set stays
  // exactly the post-041 nine — `EXPECTED_ENVELOPE_KEYS` admits it but does not
  // require it (canonical-drop-safe parity with `attestation`).
  return resourceRefs === undefined
    ? envelope
    : { ...envelope, resourceRefs };
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
 * The documented top-level envelope fields. 041 added `origin`; 031 added the
 * OPTIONAL `resourceRefs` (canonical-drop-safe). `isIntentEnvelope` rejects any
 * object that is missing a REQUIRED key or carries a key outside this set,
 * mirroring `additionalProperties: false` in
 * `docs/specs/intent-envelope-v2.schema.json`. Module-level so the guard does
 * not reallocate the Set on every call.
 *
 * `REQUIRED_ENVELOPE_KEYS` are always-present (the nine post-041 fields);
 * `OPTIONAL_ENVELOPE_KEYS` (just `resourceRefs`) MAY be present. An envelope
 * with no resource-refs has exactly the nine required keys (so the key set is
 * byte-stable with post-041); one with resource-refs has ten.
 */
const REQUIRED_ENVELOPE_KEYS = [
  "version",
  "kind",
  "payload",
  "createdAt",
  "nonce",
  "actor",
  "taint",
  "origin",
  "intentHash",
] as const;
const OPTIONAL_ENVELOPE_KEYS = ["resourceRefs"] as const;
const EXPECTED_ENVELOPE_KEYS = new Set<string>([
  ...REQUIRED_ENVELOPE_KEYS,
  ...OPTIONAL_ENVELOPE_KEYS,
]);

/**
 * Narrow an unknown value to an IntentEnvelope of the current version.
 * Consumed by the schema-version invariant test and by adjudicate() before
 * it inspects payload fields.
 */
export function isIntentEnvelope(value: unknown): value is IntentEnvelope {
  if (value === null || typeof value !== "object") return false;
  // Reject extras (spec: additionalProperties:false on
  // intent-envelope-v2.schema.json) AND require every REQUIRED field. An
  // accepted envelope carrying an extra key would otherwise hash differently
  // (canonicalize iterates all entries), silently breaking retry dedup.
  // `resourceRefs` (031) is OPTIONAL — admitted but not required, so a no-refs
  // envelope (nine keys) and a with-refs envelope (ten keys) both validate.
  const keys = Object.keys(value as object);
  if (keys.some((k) => !EXPECTED_ENVELOPE_KEYS.has(k))) return false;
  if (!REQUIRED_ENVELOPE_KEYS.every((k) => keys.includes(k))) return false;
  const v = value as Partial<IntentEnvelope>;
  // If resourceRefs is present it MUST be a string→string map (drop-safe shape).
  if (v.resourceRefs !== undefined && !isResourceRefs(v.resourceRefs)) {
    return false;
  }
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
    (v.taint === "SYSTEM" || v.taint === "TRUSTED" || v.taint === "UNTRUSTED") &&
    (v.origin === "Human" ||
      v.origin === "Retrieved" ||
      v.origin === "ExternalAPI" ||
      v.origin === "LLM" ||
      v.origin === "System")
  );
}

/**
 * Structural guard for the 031 `resourceRefs` slot: a plain object whose every
 * value is a string (the resource identifier). Used by `isIntentEnvelope` to
 * keep the runtime allow-list aligned with the `ResourceRefs` type.
 */
function isResourceRefs(value: unknown): value is ResourceRefs {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return Object.values(value as Record<string, unknown>).every(
    (v) => typeof v === "string",
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

/**
 * Nonce reconciliation (022 T3) — re-derive the nonce-bound `intentHash` for an
 * envelope and constant-time-compare it against a presented hash.
 *
 * The single-use capability burn store (022) redeems a capability bound to an
 * `intentHash` (which content-addresses `nonce` per §D #4). Before honoring a
 * burn, a caller must confirm the envelope it holds STILL re-derives to the
 * `intentHash` the capability was minted against — a different nonce (or any
 * tampered hashed field) yields a different hash and MUST be rejected.
 *
 * This deliberately REUSES the canonical `intentHash` recipe via
 * `deriveIntentHash` (the `intentHashInput` pre-image is NOT touched, so the
 * nonce binding and `createdAt` exclusion stay byte-identical, §D #4) and the
 * shared `sha256Canonical` (@adjudicate/canonical, never the conformance fork)
 * so a re-derivation is byte-identical to construction (§D #5 determinism).
 *
 * Fail-closed (§D #6 / index §C): the comparison runs through
 * `timingSafeHexEqual` — constant-time (no early-exit forgery oracle), returns
 * `false` (NEVER throws) on a non-string / length-mismatch / mismatch. A
 * mutated nonce, a presented hash that is not a 64-char hex string, or any
 * divergence yields `false`, so a burn keyed on this reconciliation cannot be
 * honored on a mismatch — no fail-open grant.
 *
 * Pure: no I/O, no clock, no `node:crypto`. Safe in the browser bundle (the
 * burn STORE that consumes this lives in the impure adapter-core shell, §D).
 */
export function reconcileNonceHash(
  envelope: IntentEnvelope,
  presentedHash: unknown,
): boolean {
  return timingSafeHexEqual(deriveIntentHash(envelope), presentedHash);
}

// ── 023 — resource-binding verifier (executor honors the signed payload) ─────

/**
 * Resource-binding verification policy (023 §3). Mirrors the parked-envelope
 * verifier's `verifyHash` dial (`packages/runtime/src/defer-resume.ts`) so the
 * two paths cannot drift in semantics:
 *   - `"strict"` (default) — a binding mismatch fail-closes the EXECUTE; the
 *     executor is NOT invoked (invariant #1, #6).
 *   - `"warn"` — a binding mismatch STILL fail-closes (the executor is never
 *     invoked on a mismatch — friction never decreases, §C); `warn` exists only
 *     as a staged-rollout dial parity with `defer-resume.ts`, but it does NOT
 *     weaken the gate.
 *   - `"off"` — no verification (revert/rollback dial; NOT recommended in
 *     production — restores the pre-023 executor seam exactly).
 */
export type ResourceBindingPolicy = "strict" | "warn" | "off";

export const DEFAULT_RESOURCE_BINDING_POLICY: ResourceBindingPolicy = "strict";

/**
 * Result of a resource-binding check:
 *   - `{ bound: true }` — the re-derived `intentHash` matches `envelope.intentHash`;
 *     the executor may honor this exact (kernel-bound) payload.
 *   - `{ bound: false, derived, stored }` — the re-derived hash does NOT match;
 *     the envelope's payload / resource-refs were swapped or tampered after the
 *     kernel decision (anti-IDOR / anti-resource-swap). Fail-closed: the executor
 *     MUST NOT be invoked.
 */
export type ResourceBindingResult =
  | { readonly bound: true }
  | { readonly bound: false; readonly derived: string; readonly stored: string };

/**
 * 023 — verify that an envelope's payload is bound to the kernel-decided
 * `intentHash` before the executor is invoked.
 *
 * The threat this closes (anti-IDOR / anti-resource-swap): the kernel decides
 * EXECUTE over one envelope, but the LLM (or any code between the decision and
 * the side effect) substitutes a DIFFERENT resource — swapping `payload` or
 * `resourceRefs` (031, the per-kind authorization target) to point at someone
 * else's account. Because `intentHash` content-addresses
 * `(version, kind, payload, nonce, actor, taint, origin, resourceRefs)` (§D #4),
 * a swapped resource re-derives a DIFFERENT hash. Re-deriving here and comparing
 * against the carried `envelope.intentHash` detects the swap fail-closed.
 *
 * **Reuse, do not fork (023 §3 / T4).** This deliberately calls the SAME
 * `deriveIntentHash` recipe `buildEnvelope` constructs with (the `intentHashInput`
 * pre-image is NOT touched, so the binding excludes `createdAt` and binds
 * resource-refs exactly as the parked-envelope verifier and the kernel's
 * step-1b gate do — invariant #4, #5). The constant-time comparator is
 * `timingSafeHexEqual` (no early-exit forgery oracle; returns `false`, never
 * throws, on a non-string / length mismatch — §D #6).
 *
 * **Determinism fence (§D #5).** Re-derivation excludes `createdAt` and reuses
 * `sha256Canonical` (@adjudicate/canonical), so a bound envelope replays
 * byte-identically; the check is observation-then-gate — it never rewrites the
 * payload nor weakens any other outcome.
 *
 * **`deriveIntentHash` can throw** on a non-canonicalizable payload (a non-finite
 * number, per RFC 8785 §3.2.2.3). That is caught and reported as `bound: false`
 * with an empty `derived` — a payload that cannot even be canonicalized cannot
 * be the kernel-bound one, so it fail-closes (no executor invocation).
 *
 * Pure: no I/O, no clock, no `node:crypto`. Browser-bundleable (the executor
 * seam that consumes this lives in the impure adapter-core shell, §D).
 */
export function verifyResourceBinding(
  envelope: IntentEnvelope,
): ResourceBindingResult {
  let derived: string;
  try {
    derived = deriveIntentHash(envelope);
  } catch {
    // A payload that cannot be canonicalized cannot match the kernel-bound hash.
    return { bound: false, derived: "", stored: envelope.intentHash };
  }
  if (!timingSafeHexEqual(derived, envelope.intentHash)) {
    return { bound: false, derived, stored: envelope.intentHash };
  }
  return { bound: true };
}
