/**
 * Taint — provenance lattice for payloads crossing the LLM boundary.
 *
 * v1.0 is payload-level: the envelope carries one Taint representing the
 * worst-trust field anywhere in its payload. See docs/taint.md for the
 * migration path to field-level taint (TaintedValue<T>) in v1.1.
 *
 * Ordering: SYSTEM > TRUSTED > UNTRUSTED
 * Merge (meet): lowest trust wins, always.
 */

export type Taint = "SYSTEM" | "TRUSTED" | "UNTRUSTED";

/**
 * Origin — the harness-stamped provenance *source* axis (041).
 *
 * A SECOND provenance axis, orthogonal to `Taint`. `Taint` answers "how
 * trusted is this payload's content?"; `Origin` answers "where did the
 * proposal *come from*?" — distinguishing "the user asked for this" from
 * "retrieved/external data instructed this," a distinction the single
 * `taint` axis cannot make.
 *
 * Closed union mirroring the glossary's contaminating source axis
 * (000_index.md §G):
 *   - `"Human"`        — a person directly authored the proposal.
 *   - `"Retrieved"`    — content pulled from a store/RAG/document fed back in.
 *   - `"ExternalAPI"`  — a third-party API/tool result fed back in.
 *   - `"LLM"`          — the model itself proposed the bytes (default for
 *                        LLM-derived envelopes at the harness boundary).
 *   - `"System"`       — a first-party system event (webhook, scheduled job).
 *
 * Additive like `Taint` — new sources land MINOR.
 *
 * **Contaminating (per 000_index.md §G):** once untrusted-origin data enters
 * context, subsequent LLM intents inherit it. NOTE: 041 only *stamps and
 * hashes* this axis — it is consulted by NO guard. The contaminating
 * propagation GATE that consumes `origin` is plan 042; do not gate on it here.
 */
export type Origin = "Human" | "Retrieved" | "ExternalAPI" | "LLM" | "System";

/**
 * The default `Origin` for an LLM-derived envelope. The single harness site
 * where LLM-proposed `tool_use` bytes become an envelope stamps `"LLM"`;
 * `buildEnvelope` defaults to this so existing call sites that pre-date the
 * origin axis hash with a stable, explicit source rather than `undefined`.
 */
export const DEFAULT_ORIGIN: Origin = "LLM";

/** Internal rank — higher number = more trust. */
const RANK: Readonly<Record<Taint, number>> = {
  SYSTEM: 3,
  TRUSTED: 2,
  UNTRUSTED: 1,
};

/**
 * Public read-side helper — exposes the trust rank of a Taint value.
 * Used by `withBasisAudit` to detect REWRITE taint regression
 * (rewritten.taint having higher rank than the envelope's taint).
 * Not the merge primitive — `mergeTaint` is the lattice meet.
 */
export function taintRank(t: Taint): number {
  return RANK[t];
}

/** Lattice meet: lowest trust wins. Monotonic: never raises trust. */
export function mergeTaint(a: Taint, b: Taint): Taint {
  return RANK[a] <= RANK[b] ? a : b;
}

/** Policy interface — adopters declare the minimum taint level per intent kind. */
export interface TaintPolicy {
  minimumFor(intentKind: string): Taint;
}

/**
 * Gate: may a payload with the given taint propose an intent of this kind?
 *
 * Returns true when the payload's taint rank is at least as high as the policy's
 * minimum for the intent kind. Policy-declared minimum of UNTRUSTED (rank 1) is
 * always satisfied.
 *
 * Adopters MUST call this once per envelope against envelope.taint. Do not fan
 * out to payload fields yourself — when v1.1 ships field-level taint, this
 * signature gains precision transparently. Never bake "payload is UNTRUSTED"
 * into your own policy logic.
 */
export function canPropose(
  taint: Taint,
  intentKind: string,
  policy: TaintPolicy,
): boolean {
  const required = policy.minimumFor(intentKind);
  return RANK[taint] >= RANK[required];
}

/**
 * Reduce a list of taints to their lattice meet. Used when constructing a
 * payload-level taint from multiple sources. Empty list defaults to SYSTEM
 * (nothing untrusted present).
 */
export function meetAll(taints: readonly Taint[]): Taint {
  if (taints.length === 0) return "SYSTEM";
  return taints.reduce((acc, t) => mergeTaint(acc, t));
}

// ── Field-level taint (v1.1 — IBX-IGE P1-l) ─────────────────────────────────

/**
 * A wrapped value that carries its own provenance taint. Use this on payload
 * fields where mixed provenance is meaningful — e.g., a checkout payload that
 * mixes a SYSTEM-trusted catalog price with an UNTRUSTED user note.
 *
 * Adopters who continue to use plain (untyped) payload fields get
 * envelope-level taint as before; field-level taint is opt-in per field.
 */
export interface TaintedValue<T> {
  readonly value: T;
  readonly taint: Taint;
}

export function tainted<T>(value: T, taint: Taint): TaintedValue<T> {
  return { value, taint };
}

export function isTaintedValue(v: unknown): v is TaintedValue<unknown> {
  return (
    v !== null &&
    typeof v === "object" &&
    "value" in v &&
    "taint" in v &&
    ((v as { taint: unknown }).taint === "SYSTEM" ||
      (v as { taint: unknown }).taint === "TRUSTED" ||
      (v as { taint: unknown }).taint === "UNTRUSTED")
  );
}

/**
 * Walk a payload and collect every TaintedValue's taint. Plain values are
 * skipped. The result is the lattice meet of every tainted field. Useful for
 * computing an envelope-level taint that summarises a mixed-provenance
 * payload.
 */
export function collectFieldTaints(payload: unknown): Taint[] {
  const out: Taint[] = [];
  walk(payload, out);
  return out;
}

function walk(value: unknown, out: Taint[]): void {
  if (isTaintedValue(value)) {
    out.push(value.taint);
    walk(value.value, out);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) walk(v, out);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      walk(v, out);
    }
  }
}

/**
 * Field-level canPropose: walks the payload, collects every TaintedValue's
 * taint, takes the meet, and applies the same minimum-trust check as the
 * envelope-level signature. When no TaintedValue is present anywhere in the
 * payload, falls back to the envelope-level taint argument.
 */
export function canProposeFieldLevel(
  envelopeTaint: Taint,
  intentKind: string,
  policy: TaintPolicy,
  payload: unknown,
): boolean {
  const fieldTaints = collectFieldTaints(payload);
  // If no field-level taint is present, behave exactly as envelope-level.
  if (fieldTaints.length === 0) {
    return canPropose(envelopeTaint, intentKind, policy);
  }
  // Otherwise the effective taint is the meet of envelope + every field.
  const effective = meetAll([envelopeTaint, ...fieldTaints]);
  return canPropose(effective, intentKind, policy);
}
