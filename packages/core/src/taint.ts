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

/**
 * 042 — the subset of `Origin` that is *contaminating*: an untrusted datum
 * pulled from a store/RAG/document (`"Retrieved"`) or a third-party API/tool
 * result (`"ExternalAPI"`) fed back into the model's context. Once such a datum
 * enters a session, subsequent LLM-proposed intents in that session inherit the
 * untrusted taint rather than re-entering the loop byte-identical to a
 * user-induced proposal (000_index.md §G "contaminating").
 *
 * `"Human"`/`"System"` are first-party trusted sources; `"LLM"` is the model's
 * own proposal — none are a contaminating *data* source on their own.
 */
const CONTAMINATING_ORIGINS: ReadonlySet<Origin> = new Set<Origin>([
  "Retrieved",
  "ExternalAPI",
]);

/**
 * 042 — is this `Origin` a contaminating data source? Pure predicate over the
 * closed union. Used by the harness shell to detect when an untrusted-origin
 * datum enters the session, and (read-only) by the kernel taint gate to
 * attribute a sub-minimum refusal to propagation vs. a bare declared-untrusted
 * proposal. Adding it here keeps the contamination definition single-sourced.
 */
export function isContaminatingOrigin(origin: Origin): boolean {
  return CONTAMINATING_ORIGINS.has(origin);
}

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
  /**
   * 043 — OPTIONAL origin-aware branch. When present and it returns `true` for
   * an intent kind, that kind may NOT be proposed from a *contaminating* origin
   * (`Retrieved` / `ExternalAPI` — per `isContaminatingOrigin`) even when the
   * taint trust rank alone (`minimumFor`) would otherwise clear the gate.
   *
   * This closes the laundering gap the single `minimumFor` axis cannot see: a
   * mutating intent whose declared minimum is UNTRUSTED satisfies `canPropose`
   * (`1 >= 1`, always-pass) regardless of where the proposal came from — so a
   * `READ`→inject→intent path re-enters byte-identical to a user-induced intent.
   * Declaring the kind origin-required raises the effective minimum for the
   * contaminated case, turning that always-pass into a REFUSE (attributed to
   * `taint:propagation_violation`).
   *
   * **Default-absent is byte-identical to pre-043.** A policy that does not
   * implement this method gates EXACTLY as before — the origin branch is opt-in
   * per adopter (the §7 dark-ship flag), so default packs and every existing
   * `{ minimumFor }` policy are unaffected.
   *
   * **Monotonic (§C / invariant #7).** The branch can ONLY add friction: it is
   * consulted *after* `canPropose` already passed, and can only flip a pass to a
   * refuse — never the reverse. It NEVER lowers the trust-rank minimum and NEVER
   * authorizes a proposal `canPropose` rejects.
   */
  requiresUncontaminatedOrigin?(intentKind: string): boolean;
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
 * 043 — origin-aware gate. The single taint-gate call the kernel makes, evolved
 * to consult the harness-stamped `origin` provenance axis (041) WITHOUT a new
 * guard phase or any IO. Semantics, in order:
 *
 *   1. The trust-rank floor is unchanged: if `canPropose(taint, kind, policy)`
 *      is `false`, this is `false`. The origin branch NEVER authorizes a
 *      proposal the rank gate already rejects (monotonic — never more permissive
 *      than `canPropose`, §C / invariant #7).
 *   2. The origin branch only ever ADDS friction: when the rank gate passed but
 *      the policy declares this `kind` origin-required
 *      (`requiresUncontaminatedOrigin(kind) === true`) AND the proposal carries
 *      a CONTAMINATING origin (`isContaminatingOrigin(origin)`), the effective
 *      minimum is raised and the gate REFUSEs (returns `false`).
 *
 * **Byte-identical to `canPropose` when the branch is dormant.** A policy that
 * does not implement `requiresUncontaminatedOrigin` (or returns `false` for the
 * kind), or a non-contaminating origin, falls straight through to the
 * `canPropose` result — so default packs and every existing `{ minimumFor }`
 * policy behave exactly as pre-043.
 *
 * Pure: a function of `(taint, kind, origin, policy)` only — no clock, RNG, or
 * IO. The kernel calls this once per envelope at the existing taint gate.
 */
export function canProposeWithOrigin(
  taint: Taint,
  intentKind: string,
  origin: Origin,
  policy: TaintPolicy,
): boolean {
  // (1) Trust-rank floor — identical to the pre-043 gate. The origin branch can
  //     never relax this; a rank failure is a refusal regardless of origin.
  if (!canPropose(taint, intentKind, policy)) return false;
  // (2) Origin branch (opt-in, friction-only). Dormant unless the policy
  //     declares the kind origin-required.
  if (
    typeof policy.requiresUncontaminatedOrigin === "function" &&
    policy.requiresUncontaminatedOrigin(intentKind) &&
    isContaminatingOrigin(origin)
  ) {
    return false;
  }
  return true;
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

// ── Session contamination (042) ─────────────────────────────────────────────

/**
 * 042 — the per-session contamination flag.
 *
 * Set in the impure harness shell when an untrusted-origin datum (per
 * `isContaminatingOrigin`) enters the session context. Once set, it lowers the
 * taint of every subsequently minted LLM intent envelope via the lattice meet
 * (`applySessionContamination`) so the kernel's existing `canPropose` gate sees
 * the contaminated taint — without adding a new kernel guard phase or any IO.
 *
 * Contract (000_index.md §C #7 / invariant #7 monotonicity):
 *   - Contamination is **monotonic**: it can only *lower* trust, never raise it.
 *     `taint` is the meet of every contaminating datum that entered (UNTRUSTED
 *     once any untrusted datum has, since that is the floor of the lattice).
 *   - The flag carries the contaminating `origin` so a contamination-lowered
 *     refusal can be attributed (`taint:propagation_violation`) rather than
 *     mistaken for a bare declared-untrusted proposal.
 *   - Clearing the flag requires an adopter-authenticated signal on the same
 *     path as `resume()` — never an LLM-controlled action. There is no helper
 *     here that raises trust; constructing a *cleared* session is simply not
 *     carrying a flag (`undefined`).
 */
export interface SessionContamination {
  /** Lattice meet of every contaminating datum that entered the session. */
  readonly taint: Taint;
  /** The contaminating source that first lowered the session (audit attribution). */
  readonly origin: Origin;
}

/**
 * 042 — fold a session contamination flag into a freshly-declared taint at the
 * envelope-minting seam. Pure lattice meet: the minted taint is the LOWER of
 * the declared taint and the contamination taint, so contamination can only add
 * friction, never remove it (§C). When no flag is present (`undefined`) the
 * declared taint passes through unchanged — the non-contaminated path is
 * byte-identical to pre-042 behavior.
 *
 * Folded BEFORE the envelope is hashed so the contaminated taint is inside the
 * `intentHash` pre-image (invariant #4): an LLM cannot post-hoc flip it.
 */
export function applySessionContamination(
  declaredTaint: Taint,
  flag: SessionContamination | undefined,
): Taint {
  if (flag === undefined) return declaredTaint;
  return mergeTaint(declaredTaint, flag.taint);
}

/**
 * 042 — fold a newly-observed contaminating datum into the running session
 * contamination flag, monotonically. Given the prior flag (or `undefined` for a
 * clean session) and the origin/taint of an incoming datum, returns the updated
 * flag when the datum is contaminating, else the prior flag unchanged.
 *
 * Monotonic by construction: the resulting `taint` is the meet of the prior
 * contamination taint and the datum's taint (lowest trust wins), so a session
 * can never become *more* trusted by ingesting more data. A non-contaminating
 * origin (`Human`/`System`/`LLM`) leaves the flag untouched — trusted sources
 * do not contaminate.
 */
export function contaminateSession(
  prior: SessionContamination | undefined,
  datum: { readonly origin: Origin; readonly taint: Taint },
): SessionContamination | undefined {
  if (!isContaminatingOrigin(datum.origin)) return prior;
  if (prior === undefined) {
    return { taint: datum.taint, origin: datum.origin };
  }
  return {
    taint: mergeTaint(prior.taint, datum.taint),
    // Preserve the FIRST contaminating origin as the attribution anchor; the
    // taint is what tightens monotonically.
    origin: prior.origin,
  };
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
