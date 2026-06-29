/**
 * The §5 soundness validator — `claimAllowed`, the PURE function that decides
 * whether a single claim is `VALIDATED` (SDD §E; v1.1 §5; SDD §J.1). This is THE
 * soundness heart of the claims runtime: a claim may reach the renderer (P1)
 * **iff** every §5 conjunct holds against the per-turn Evidence Ledger.
 *
 * The predicate is transcribed VERBATIM from SDD §E / v1.1 §5 — each conjunct is
 * one §5 line, derived not re-invented (SDD zero-drift contract; §P misreadings
 * refused). It is **NOT** `Owner==Verified AND age<=TruthBudget` (the §P
 * misreading): ownership is ONE conjunct (C1), freshness is PER-EVIDENCE per
 * `e.freshnessPolicy` (not the turn-level Truth Budget — that is §L, a different
 * mechanism), and integrity/provenance/presence/non-emptiness/(action) outcome
 * are independent conjuncts.
 *
 * Kernel-abstract & PURE: every repo-specific capability is INJECTED via `deps`
 * (ownership resolution, action-outcome confirmation). This module implements no
 * repo ownership and no clock — `now` is injected so `fresh(e)` over a cacheable
 * ttl stays deterministic. No kernel-downstream import (SDD §R kernel purity:
 * `adjudicate → claustrum → ibatexas`, never backward); no clock/RNG/IO.
 *
 * The full registry claim TYPES (the 37-row vocabulary, registry §6) are OUT of
 * scope here (deferred — SDD §Q scope guard): this validator operates on a
 * MINIMAL kernel claim shape sufficient for the §5 predicate.
 */

import type { EvidenceLedger } from "./evidence-ledger.js";
import type { EvidenceEntry } from "./evidence-ledger.js";
import type {
  EvidenceRequirement,
  FalsifierDeclaration,
  SourceIntegrity,
} from "./evidence-requirement.js";
import {
  assertFalsifierDeclaration,
  isFalsifierComplete,
  meetsSourceIntegrityFloor,
} from "./evidence-requirement.js";
import { sameValue } from "./value-equality.js";
import type { ClaimVerdict } from "./verdict.js";

// ─────────────────────────────────────────────────────────────────────────
// The minimal kernel claim shape — sufficient for §5, registry types deferred
// ─────────────────────────────────────────────────────────────────────────

/**
 * The kind of claim the §5 predicate is validating (SDD §E C4; v1.1 §5):
 *
 *   - `"read_claim"`   — a statement backed by READ evidence; C4 does not apply.
 *   - `"action_claim"` — a statement that an ACTION happened; C4 (outcome
 *                        confirmed) is an ADDITIONAL required conjunct.
 *
 * This is the kernel-abstract `c.kind` of §5, not a registry type name.
 */
export type ClaimKind = "read_claim" | "action_claim";

/**
 * A binding of one `EvidenceRequirement.key` to the concrete RESOURCE that
 * requirement's ownership check is about (SDD §E C1: `owns(actor, e.resource)`).
 * The §5 predicate is kernel-abstract — it does NOT know what a "resource" is;
 * it only passes `(actor, resource)` to the injected `deps.owns`. The claim
 * supplies the per-key resource via this map so that `ownershipPolicy:
 * "required"` evidence can be owner-checked without this module knowing any
 * repo's resource model.
 *
 * A `required`-ownership requirement whose key has NO binding here (an absent or
 * `undefined` resource) is the §J.2 "no owner attribution" case: it must NOT
 * validate — "no owner" ≠ "any owner" → `REFUSED` (Inv 2). It is NOT silently
 * treated as ownerless/public.
 */
export type ResourceBindings = Readonly<Record<string, unknown>>;

/**
 * C6 VALUE-BINDING (SDD §5 C6; Theorem S precondition (a-value)) — the optional
 * declaration that a claim's RENDERED `value` is bound to a specific evidence
 * entry's value, so the number/string the customer eventually sees cannot be a
 * model confabulation that merely rode the surplus channel through a claim that
 * validated on present∧fresh∧owned∧integrity∧provenance.
 *
 *   - `key`  — the `EvidenceRequirement.key` whose ledger value licenses this
 *              claim's `value`. It MUST be one of the claim's `requiredEvidence`
 *              keys so presence/freshness/provenance/integrity are already gated
 *              by the §5 ∀ before C6 compares the value (the binding only adds the
 *              value-equality conjunct on top of an already-validated key).
 *   - `path` — OPTIONAL projection into BOTH the claim's `value` and the bound
 *              entry's `value` before comparison (e.g. `["open"]` to bind the
 *              `open` field of a STORE_OPEN_NOW value object to the schedule
 *              entry's `open` field). Absent ⟹ compare the whole values.
 *
 * Additive + OPTIONAL on `MinimalClaim`: a claim that declares no `valueBinding`
 * is unaffected by C6 (fail-safe no-op — §5 is value-agnostic for it, exactly as
 * before W6). W5 declares bindings per registry type.
 */
export interface ValueBinding {
  readonly key: string;
  readonly path?: readonly (string | number)[];
}

/**
 * The minimal kernel claim the §5 predicate quantifies over (SDD §E; v1.1 §5).
 * The full registry claim types (registry §6) are deferred (SDD §Q scope guard);
 * this carries EXACTLY the fields §5 reads:
 *
 *   - `requiredEvidence`  — the `∀ e ∈ c.requiredEvidence` set (C0 demands it be
 *                           non-empty AND impose a real check).
 *   - `minSourceIntegrity`— the C2 floor each evidence's `sourceIntegrity` must
 *                           meet-or-exceed.
 *   - `kind`              — `read_claim | action_claim` (drives C4).
 *   - `actor`            — the subject of `owns(actor, e.resource)` (C1). Kept
 *                           `unknown` (kernel-abstract — the injected `deps.owns`
 *                           interprets it; this module never inspects it).
 *   - `resources`        — per-key `EvidenceRequirement.key → resource` bindings
 *                           for C1 (see `ResourceBindings`). Optional; an absent
 *                           binding for a `required` key is "no owner" → REFUSED.
 */
export interface MinimalClaim extends FalsifierDeclaration {
  readonly requiredEvidence: readonly EvidenceRequirement[];
  readonly minSourceIntegrity: SourceIntegrity;
  readonly kind: ClaimKind;
  readonly actor: unknown;
  readonly resources?: ResourceBindings;
  /**
   * C6 — the RENDERED value carried by this claim (the proposition the renderer
   * would fill). OPTIONAL: only inspected when `valueBinding` is declared (the
   * value-binding conjunct compares this against the bound evidence's value). When
   * `valueBinding` is absent, §5 stays value-agnostic and never reads this field.
   */
  readonly value?: unknown;
  /**
   * C6 value-binding (SDD §5 C6) — see {@link ValueBinding}. OPTIONAL; absent ⟹
   * C6 is a no-op for this claim (fail-safe default; W5 declares bindings).
   */
  readonly valueBinding?: ValueBinding;
}

// ─────────────────────────────────────────────────────────────────────────
// Injected capabilities — the repo-specific predicates §5 needs, kernel-abstract
// ─────────────────────────────────────────────────────────────────────────

/**
 * The PURE capabilities the §5 predicate injects (SDD §E). Implementing these is
 * the DOWNSTREAM packages' job (repo ownership models, action-outcome wiring);
 * this kernel module only CALLS them. Both must be pure (deterministic, no IO) so
 * `claimAllowed` stays a pure function.
 */
export interface SoundnessDeps {
  /**
   * The ownership VALIDATION predicate (SDD §E C1; Inv 2): does `actor` own
   * `resource`? Kernel-abstract — the repo (OrderProjection-join, owner-scoped
   * `getById`, …) decides; "ownership is a validation predicate, not read-auth"
   * (Inv 2). `claimAllowed` calls this ONLY when a requirement's
   * `ownershipPolicy === "required"` AND a concrete `resource` binding exists; a
   * `required` key with no binding is "no owner" and is REFUSED WITHOUT calling
   * `owns` (Inv 2: "no owner" ≠ "any owner").
   */
  readonly owns: (actor: unknown, resource: unknown) => boolean;
  /**
   * The action-outcome accessor (SDD §E C4; Inv 4): for an `action_claim`, did
   * the action's outcome CONFIRM — `EXECUTE ∧ dispatched=ok ∧ result.success ∧
   * (settlement, for money)`? Kernel-abstract — the repo derives it from this
   * turn's Action verdict + dispatch (NOT a read). Success ≠ session (Inv 4).
   * Called for ANY claim asserting an action outcome — `kind === "action_claim"`
   * OR any requirement with `freshnessPolicy === "action_outcome"` (C4's
   * broadened trigger; see `assertsActionOutcome` in `claimAllowed`). NOT called
   * for a pure read claim that carries no `action_outcome` requirement.
   */
  readonly outcomeConfirmed: (claim: MinimalClaim) => boolean;
  /**
   * The current time, epoch-millis, for the `cacheable` ttl staleness window
   * (`fresh(e)`). INJECTED (not read from a wall clock) so the predicate is pure and
   * `fresh(e)` is deterministic in tests. Required because `fresh(e)` for the
   * cacheable tier compares `now - entry.fetchedAt` against the ttl.
   */
  readonly now: number;
}

// ─────────────────────────────────────────────────────────────────────────
// The three-valued mapping — registry §5 / SDD §K, verbatim
// ─────────────────────────────────────────────────────────────────────────
//
// A FAILED conjunct NEVER yields VALIDATED (the HARD invariant, SDD §J.1 / §R).
// Which non-VALIDATED verdict it yields is fixed by registry §5 / §K:
//
//   REFUSED  (evidence CONTRADICTS, ownership DENIED, or NO BACKING — "never
//             asserted"):
//     · C0 vacuous     — empty / all-not_applicable requirement set: a claim
//                        with NO real backing must never auto-assert → REFUSED
//                        (no-backing; the ∀-over-∅ vacuous-true bug).
//     · C1 ownership   — `required` ∧ ¬owns(actor, resource): ownership DENIED.
//     · C1 no-owner    — `required` ∧ no resource binding: "no owner" ≠ "any
//                        owner" (Inv 2) → REFUSED.
//     · C3 untrusted   — an `UNTRUSTED_DATA` entry may NEVER be the validating
//                        value (Inv 3): a contradicting/poisoned origin → REFUSED.
//     · C3 provenance  — `first_party_only` violated by a non-first-party origin
//                        → REFUSED (no first-party backing).
//     · C4 outcome     — a claim ASSERTING an action outcome (an `action_claim`,
//                        OR any claim with an `action_outcome` requirement) whose
//                        outcome is NOT confirmed: asserting a non-happening is a
//                        contradiction → REFUSED (the PURCHASE_COMPLETED
//                        confabulation guard, registry §6).
//
//   UNKNOWN  (MISSING / NOT-FOUND / STALE → "honest ignorance + offer; not a
//             failure"):
//     · presence       — absent / error / conflict (the ledger's non-present
//                        states all resolve UNKNOWN, Inv 7 / H3).
//     · freshness      — stale cacheable (fetchedAt beyond ttl), or a
//                        `must_read_this_turn` served from `sourceMode: "cache"`
//                        (the §G/§R cache-masquerade: a value we cannot prove is
//                        live this turn is "not read" → UNKNOWN, not a concrete).
//     · C2 integrity   — below the `minSourceIntegrity` floor (e.g. a free-text
//                        "sem alérgenos" under a `structured` floor — registry §6
//                        MENU_ITEM_ALLERGENS): we LACK adequate evidence → UNKNOWN.
//
// Precedence: REFUSED-class failures dominate UNKNOWN-class ones within a single
// evidence (a contradiction/denial is strictly worse than mere absence), and a
// REFUSED on ANY evidence makes the whole claim REFUSED. This keeps the claim's
// verdict the SAFEST (most-restrictive) of its evidences' verdicts.

/** Internal: the per-evidence outcome of evaluating the §5 conjuncts. */
type EvidenceVerdict = "PASS" | "UNKNOWN" | "REFUSED";

// ─────────────────────────────────────────────────────────────────────────
// fresh(e) — the per-evidence freshness conjunct, per e.freshnessPolicy (§E)
// ─────────────────────────────────────────────────────────────────────────

/**
 * `fresh(e)` per `e.freshnessPolicy` (SDD §E; v1.1 §5; §G) — does this present
 * entry satisfy its freshness policy? Returns an `EvidenceVerdict`:
 *
 *   - `"static"`              — never stale → PASS.
 *   - `cacheable(ttl)`        — PASS iff `now - fetchedAt <= ttl` (a finite ttl).
 *                               `ttl: "reindex_bound"` is NOT a wall-clock window
 *                               (it is floored by reindex lag, registry §6), so
 *                               this validator does not stale it on the clock →
 *                               PASS (a tighter reindex check is a later §O
 *                               refinement, not a §5 clock comparison). STALE →
 *                               UNKNOWN (missing/stale, registry §5).
 *   - `"must_read_this_turn"` — REQUIRES `entry.sourceMode === "live"` (§G; §R
 *                               hard error). A `"cache"` entry is a cache
 *                               masquerade — we cannot prove it was read live
 *                               this turn → UNKNOWN (not a concrete value).
 *   - `"action_outcome"`      — freshness for an action is the OUTCOME conjunct
 *                               (C4), checked at the claim level (the broadened
 *                               `assertsActionOutcome` trigger in `claimAllowed`),
 *                               not here over a read entry → PASS at the
 *                               per-evidence stage. Staleness is not the axis for
 *                               an action outcome; C4 is.
 *
 * Pure: `now` is supplied by the caller; no clock read.
 */
function freshnessVerdict(
  requirement: EvidenceRequirement,
  entry: EvidenceEntry,
  now: number,
): EvidenceVerdict {
  const policy = requirement.freshnessPolicy;

  if (policy === "static") return "PASS";
  if (policy === "action_outcome") return "PASS"; // C4 handles it at claim level.

  if (policy === "must_read_this_turn") {
    // §G / §R hard rule: a must_read_this_turn evidence validated from a cache
    // row is a cache masquerade. We cannot prove it is live this turn → UNKNOWN
    // (missing/stale), never a concrete validating value.
    return entry.sourceMode === "live" ? "PASS" : "UNKNOWN";
  }

  // cacheable: PASS iff within ttl. reindex_bound is not a wall-clock window.
  if (policy.ttl === "reindex_bound") return "PASS";
  const age = now - entry.fetchedAt;
  // Fresh ⟺ `0 <= age <= ttl` (§G: staleness is `now - fetchedAt`). Stale (age
  // strictly beyond ttl) → UNKNOWN (stale, registry §5). A NEGATIVE age —
  // `fetchedAt` in the FUTURE (clock skew, or a future-stamped / tampered entry)
  // — is NOT fresh: a value cannot be fresher than "now" (§G), so the lower bound
  // `age >= 0` rejects it → UNKNOWN, never a free pass. (Pairs with claustrum's
  // per-turn clock, its realistic trigger.)
  return age >= 0 && age <= policy.ttl ? "PASS" : "UNKNOWN";
}

// ─────────────────────────────────────────────────────────────────────────
// provenanceOK(e) — the C3 provenance conjunct, per e.provenancePolicy (§E)
// ─────────────────────────────────────────────────────────────────────────

/**
 * `provenanceOK(e)` per `e.provenancePolicy` (SDD §E C3; Inv 3) over a PRESENT
 * entry. Two HARD rules:
 *
 *   - **UNTRUSTED never validates (Inv 3):** if EITHER the entry's `taint` OR its
 *     `originProvenance` is `UNTRUSTED_DATA`, the entry may NEVER be the
 *     validating value → `REFUSED`. This holds under BOTH provenance policies —
 *     `originProvenance` "survives persistence" (§G), so an UNTRUSTED-origin row
 *     stays UNTRUSTED across reads and never washes to TRUSTED.
 *   - **first_party_only:** the origin must be first-party. A non-UNTRUSTED entry
 *     under `first_party_only` whose origin is not first-party → `REFUSED` (no
 *     first-party backing). The ledger's `originProvenance` is the 3-value
 *     `OriginProvenance` axis (§G / §J.3); the first-party signal is
 *     `originProvenance === "FIRST_PARTY"`, so a `TRUSTED_THIRD_PARTY` origin does
 *     NOT satisfy it (Inv 3: a trusted third party is NOT first-party). This makes
 *     `first_party_only` strictly STRONGER than `preserve`, which imposes no
 *     first-party demand beyond the untrusted-never-validates rule.
 *
 * Returns `PASS` | `REFUSED` — a provenance failure is a no-backing/contradiction
 * class, never mere absence, so it is `REFUSED`, not `UNKNOWN` (registry §5).
 */
function provenanceVerdict(
  requirement: EvidenceRequirement,
  entry: EvidenceEntry,
): EvidenceVerdict {
  // Inv 3 — UNTRUSTED_DATA may NEVER be the validating value, under ANY policy.
  // Both axes are checked: the read-layer trust (`taint`) AND the persisted
  // origin (`originProvenance`, which survives persistence). Either being
  // UNTRUSTED poisons the value → REFUSED.
  if (entry.taint === "UNTRUSTED_DATA") return "REFUSED";
  if (entry.originProvenance === "UNTRUSTED_DATA") return "REFUSED";

  if (requirement.provenancePolicy === "first_party_only") {
    // first_party_only: only first-party-origin evidence validates. The ledger's
    // 3-value origin axis (§G / §J.3) signals first-party as FIRST_PARTY; anything
    // else — including a TRUSTED_THIRD_PARTY origin, and an absent/unlabeled one
    // (fail-closed) — is not provably first-party → REFUSED (no first-party
    // backing). This is strictly stronger than `preserve`.
    return entry.originProvenance === "FIRST_PARTY" ? "PASS" : "REFUSED";
  }

  // preserve: the untrusted-never-validates rule above is the whole gate.
  return "PASS";
}

// ─────────────────────────────────────────────────────────────────────────
// Per-evidence evaluation — present ∧ fresh ∧ C1 ∧ C2 ∧ C3 (§E inner ∀ body)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Evaluate ONE evidence requirement against the ledger — the body of the §5
 * `∀ e ∈ c.requiredEvidence` (SDD §E; v1.1 §5). Returns the per-evidence
 * `EvidenceVerdict` (`PASS` | `UNKNOWN` | `REFUSED`).
 *
 * Order of the conjuncts mirrors §E: present(e) ∧ fresh(e) ∧ C1 ownership ∧ C2
 * integrity ∧ C3 provenance. REFUSED-class failures are surfaced even when an
 * UNKNOWN-class one is also present (a denial/contradiction is strictly worse
 * than absence), so the per-evidence verdict is the SAFEST applicable.
 */
function evaluateEvidence(
  claim: MinimalClaim,
  requirement: EvidenceRequirement,
  ledger: EvidenceLedger,
  deps: SoundnessDeps,
): EvidenceVerdict {
  // ── present(e) — the ledger must hold a non-absent, non-error, non-conflict
  // value for this key (§E C-baseline; Inv 7 / H3). absent/error/conflict all
  // resolve UNKNOWN (missing/not-found, registry §5).
  const resolution = ledger.resolve(requirement.key);
  if (resolution.state !== "present" || resolution.entry === undefined) {
    return "UNKNOWN";
  }
  const entry = resolution.entry;

  // ── C3 provenance — checked early because UNTRUSTED-never-validates (Inv 3) is
  // a REFUSED that must dominate any UNKNOWN-class failure on the same evidence:
  // a poisoned/untrusted value is "never asserted," not "honest ignorance."
  const provenance = provenanceVerdict(requirement, entry);
  if (provenance === "REFUSED") return "REFUSED";

  // ── C1 ownership (Inv 2) — a REFUSED class (ownership DENIED / no owner). Also
  // dominates UNKNOWN: a denial is "never asserted," not mere absence.
  if (requirement.ownershipPolicy === "required") {
    const resource = claim.resources?.[requirement.key];
    // "no owner attribution" — a required key with no concrete resource binding.
    // "no owner" ≠ "any owner" (Inv 2) → REFUSED. We do NOT call deps.owns with
    // an undefined resource (that would let a permissive owns() validate a
    // claim with no owner attribution).
    const hasBinding =
      claim.resources !== undefined &&
      Object.prototype.hasOwnProperty.call(claim.resources, requirement.key) &&
      resource !== undefined;
    if (!hasBinding) return "REFUSED";
    if (!deps.owns(claim.actor, resource)) return "REFUSED";
  }

  // ── fresh(e) per freshnessPolicy (§E) — an UNKNOWN class (stale / cache
  // masquerade → missing/stale, registry §5).
  const freshness = freshnessVerdict(requirement, entry, deps.now);
  if (freshness !== "PASS") return freshness; // "UNKNOWN"

  // ── C2 source-integrity floor (§E) — an UNKNOWN class (below floor → we lack
  // adequate evidence; a free_text under a structured floor → UNKNOWN, registry
  // §6 MENU_ITEM_ALLERGENS). `sourceIntegrity(e)` in §5 is the requirement's
  // DECLARED channel shape (`e.sourceIntegrity`, the field on EvidenceRequirement
  // — v1.1 §5 line 72), compared to the claim's `minSourceIntegrity` floor. The
  // ledger ENTRY carries no integrity axis by design (§G) — integrity is declared
  // per evidence, not re-measured per read. Reuses Q1 meetsSourceIntegrityFloor.
  if (
    !meetsSourceIntegrityFloor(requirement.sourceIntegrity, claim.minSourceIntegrity)
  ) {
    return "UNKNOWN";
  }

  return "PASS";
}

// ─────────────────────────────────────────────────────────────────────────
// C0 — no vacuous validation (SDD §E C0; §R hard compile error)
// ─────────────────────────────────────────────────────────────────────────

/**
 * C0 (SDD §E; §R hard compile error): the requirement set must be non-empty AND
 * impose a REAL check — an empty set, or one in which EVERY member imposes no
 * real check, never auto-VALIDATES (the ∀-over-∅ vacuous-true bug).
 *
 * "Imposes a real check" is read conservatively: an `EvidenceRequirement` always
 * imposes present(e) ∧ fresh(e) ∧ C2 integrity (and C3 untrusted-never), so any
 * NON-EMPTY set imposes a real check. The vacuous case C0 forbids is the EMPTY
 * set (∀ over ∅). The SDD's "all-not_applicable" phrasing concerns OWNERSHIP
 * (C1) being skipped — but those members still carry presence/freshness/
 * integrity/provenance conjuncts, so a non-empty all-`not_applicable` set is NOT
 * vacuous and legitimately validates a PUBLIC claim. Emptiness is the only
 * vacuity. Returns `false` (NOT satisfied) for the empty set.
 */
function satisfiesNonVacuity(claim: MinimalClaim): boolean {
  return claim.requiredEvidence.length > 0;
}

// ─────────────────────────────────────────────────────────────────────────
// C6 value-binding (SDD §5 C6; Theorem S precondition (a-value))
// ─────────────────────────────────────────────────────────────────────────

/**
 * The CLOSED value-grammar C6 will compare over (SDD §5 C6): a JSON SCALAR —
 * `string | number | boolean | null`. C6 binds a single PROPOSITION field (a
 * store-open boolean, a status string, a price number), so the comparable
 * grammar is deliberately the scalars. A value OUTSIDE the grammar (an object,
 * an array, `undefined`, a `bigint`/`symbol`/function, or a projection that
 * missed its path) is NOT a single proposition value we can confidently equate →
 * C6 ABSTAINS on it (→ UNKNOWN, honest ignorance) rather than REFUSING or
 * silently passing. This keeps C6 demote-only and never over-claims a structural
 * blob as "the value matched".
 */
function withinValueGrammar(v: unknown): boolean {
  return (
    v === null ||
    typeof v === "string" ||
    typeof v === "number" ||
    typeof v === "boolean"
  );
}

/**
 * Project a value by an OPTIONAL `path` of own-property segments (SDD §5 C6).
 * Absent/empty path ⟹ the whole value. Any segment that is not an OWN property
 * of a non-null object short-circuits to `undefined` (which is outside the closed
 * grammar → C6 abstains). Pure; read-only own-property access (a non-own /
 * prototype key never resolves), so it cannot be fooled by `__proto__` etc.
 */
function projectValue(
  value: unknown,
  path: readonly (string | number)[] | undefined,
): unknown {
  if (path === undefined || path.length === 0) return value;
  let cur: unknown = value;
  for (const segment of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    const obj = cur as Record<PropertyKey, unknown>;
    if (!Object.prototype.hasOwnProperty.call(obj, segment)) return undefined;
    cur = obj[segment];
  }
  return cur;
}

/** The per-claim outcome of the C6 value-binding conjunct. */
type ValueBindingVerdict = "PASS" | "ABSTAIN" | "REFUSED";

/**
 * C6 — the value-binding conjunct (SDD §5 C6; Theorem S (a-value)). Given a claim
 * that DECLARES a `valueBinding`, require its rendered `value` to equal the bound
 * evidence entry's value (both projected by `path`), via the SAME canonical
 * `sameValue` comparator P2/H3 use (so the over-claim decision can never diverge
 * from the conflict decision). Three outcomes:
 *
 *   - **PASS**    — both projected sides are in the closed scalar grammar AND
 *                   `sameValue(claimSide, evidenceSide)` (the value is licensed by
 *                   its evidence).
 *   - **REFUSED** — both sides in-grammar but they DISAGREE: a value contradicting
 *                   its licensing evidence is an over-claim/confabulation (the C3
 *                   contradiction class) → it must DOMINATE like the other REFUSED
 *                   conjuncts, never UNKNOWN. This is the round-2 (a-value) catch:
 *                   a model-authored surplus value that does not match the ledger.
 *   - **ABSTAIN** — the bound key is not present, OR a projected side is OUTSIDE
 *                   the closed grammar: we cannot prove the binding holds → honest
 *                   ignorance (→ UNKNOWN), never a free pass.
 *
 * C6 is purely DEMOTE-ONLY: it can only turn an otherwise-VALIDATED claim into
 * UNKNOWN (abstain) or REFUSED (mismatch); it never promotes. A claim with no
 * `valueBinding` never reaches here (the caller skips C6).
 */
function valueBindingVerdict(
  claim: MinimalClaim,
  binding: ValueBinding,
  ledger: EvidenceLedger,
): ValueBindingVerdict {
  const resolution = ledger.resolve(binding.key);
  // The bound key must be PRESENT (it is one of requiredEvidence, so the ∀ has
  // already gated presence/freshness/provenance; an absent/conflict/error key
  // already drove the claim to UNKNOWN/REFUSED). If it is not present, we cannot
  // compare → abstain (honest ignorance), never REFUSE on a missing value.
  if (resolution.state !== "present" || resolution.entry === undefined) {
    return "ABSTAIN";
  }

  const claimSide = projectValue(claim.value, binding.path);
  const evidenceSide = projectValue(resolution.entry.value, binding.path);

  // Closed value-grammar: only scalar PROPOSITION values are comparable. Outside
  // the grammar (object/array/undefined/missed-path) → abstain, never REFUSE or
  // silently pass a structural blob.
  if (!withinValueGrammar(claimSide) || !withinValueGrammar(evidenceSide)) {
    return "ABSTAIN";
  }

  // In-grammar: the rendered value is licensed IFF it equals the evidence value.
  // A mismatch is an over-claim (the model-authored surplus the binding exists to
  // catch) → REFUSED (dominates). Reuse the canonical sameValue (do NOT fork).
  return sameValue(claimSide, evidenceSide) ? "PASS" : "REFUSED";
}

// ─────────────────────────────────────────────────────────────────────────
// claimAllowed — THE §5 soundness predicate (SDD §E; v1.1 §5; §J.1)
// ─────────────────────────────────────────────────────────────────────────

/**
 * `CLAIM_ALLOWED(c)` — the §5 soundness predicate (SDD §E; v1.1 §5; §J.1),
 * returning the three-valued `ClaimVerdict`. A PURE function: same inputs ⟹ same
 * verdict; all repo specifics are injected via `deps`.
 *
 * A claim is `VALIDATED` **iff** ALL of these hold (each = one §E conjunct):
 *
 *   - **C0** `requiredEvidence ≠ ∅` — else `REFUSED` (no-backing; the ∀-over-∅
 *     vacuous-true bug is structurally impossible to VALIDATE).
 *   - **∀ e ∈ requiredEvidence:** `present(e) ∧ fresh(e) ∧ (ownershipPolicy ===
 *     "required" ⟹ owns(actor, e.resource)) ∧ sourceIntegrity(e) ≥
 *     minSourceIntegrity ∧ provenanceOK(e)`.
 *   - **C4** `assertsActionOutcome(claim) ⟹ outcomeConfirmed(claim)` — else
 *     REFUSED (asserting a non-happening is a contradiction; the confabulation
 *     guard). `assertsActionOutcome` is `kind === "action_claim"` OR any
 *     requirement with `freshnessPolicy === "action_outcome"` (a claim whose
 *     evidence IS this turn's Action verdict+dispatch asserts an action outcome
 *     regardless of `kind`).
 *   - **C6** `valueBinding ⟹ sameValue(value, evidence value)` — when the claim
 *     declares a value-binding, its RENDERED value must equal the bound evidence
 *     entry's value (the SAME canonical `sameValue` P2/H3 use). An in-grammar
 *     mismatch → REFUSED (an over-claim contradicting its licensing evidence —
 *     the round-2 (a-value) confabulation catch); an unprovable binding (bound key
 *     absent, or a value outside the closed scalar grammar) → UNKNOWN (abstain).
 *     OPTIONAL: a claim with no `valueBinding` is unaffected (fail-safe no-op).
 *   - **Falsifier-completeness** `falsifierComplete ∧ falsifiers ≠ ∅` — else the
 *     all-pass path is CAPPED to `UNKNOWN` (honest ignorance: we cannot prove no
 *     falsifier exists). A type defaults to UNKNOWN-only until W5 enumerates its
 *     falsifiers (fail-safe, demote-only). A `falsifierComplete: true` type with
 *     an empty `falsifiers[]` is the inconsistent lying case → §R hard THROW.
 *
 * The verdict is the SAFEST (most-restrictive) over all evidences:
 *   - any evidence REFUSED, OR a C0/C4 REFUSED            → `REFUSED`
 *   - else any evidence UNKNOWN                           → `UNKNOWN`
 *   - else (every conjunct PASSes)                        → `VALIDATED`
 *
 * The HARD invariant (SDD §J.1 / §R): a FAILED conjunct NEVER yields VALIDATED —
 * `VALIDATED` is returned ONLY on the all-pass path. Mapping of WHICH failure →
 * REFUSED vs UNKNOWN is per registry §5 (documented on the three-valued mapping
 * block above and on each branch).
 */
export function claimAllowed(
  claim: MinimalClaim,
  ledger: EvidenceLedger,
  deps: SoundnessDeps,
): ClaimVerdict {
  // ── §R falsifier-declaration guard (W6). A type with `falsifierComplete: true`
  // but no enumerated `falsifiers[]` is the inconsistent LYING case — a hard
  // build/registry-load error (fail-closed, throws). The SAFE-DEFAULT case (no
  // declaration) does NOT throw; it is forced UNKNOWN-only by the eligibility cap
  // at the VALIDATED path below. Checked FIRST so a malformed type never validates.
  assertFalsifierDeclaration(claim);

  // ── C0 — no vacuous validation (§E; §R hard error). An empty requirement set
  // has NO backing; it must never auto-VALIDATE the vacuous ∀. → REFUSED
  // (no-backing). This is checked FIRST so the ∀ below can never run over ∅.
  if (!satisfiesNonVacuity(claim)) return "REFUSED";

  // ── ∀ e ∈ requiredEvidence — accumulate the safest verdict. REFUSED on any
  // evidence dominates (short-circuits); an UNKNOWN is remembered but a later
  // REFUSED still overrides it.
  let sawUnknown = false;
  for (const requirement of claim.requiredEvidence) {
    const verdict = evaluateEvidence(claim, requirement, ledger, deps);
    if (verdict === "REFUSED") return "REFUSED"; // never asserted — dominates.
    if (verdict === "UNKNOWN") sawUnknown = true; // honest ignorance — remember.
  }

  // ── C4 — action-claim outcome (§E; Inv 4). For an action_claim the outcome
  // must be CONFIRMED (EXECUTE ∧ dispatched=ok ∧ result.success ∧ settlement for
  // money); an unconfirmed action asserts a non-happening → REFUSED (the
  // confabulation guard, registry §6 PURCHASE_COMPLETED). Checked even when an
  // evidence was UNKNOWN: a REFUSED outcome dominates.
  //
  // The trigger is BROADER than `kind === "action_claim"`: any claim whose
  // `requiredEvidence` includes an `action_outcome` requirement IS asserting an
  // action outcome (its evidence is "this turn's Action verdict + dispatch, not a
  // read" — §E / §G), so C4 must fire for it too. Otherwise a `read_claim` whose
  // requirement carries `freshnessPolicy: "action_outcome"` would validate WITHOUT
  // `outcomeConfirmed` — asserting an action outcome it never confirmed (the
  // freshness branch PASSes `action_outcome` precisely because staleness is not
  // its axis; C4 here, at the claim level, is what actually enforces it).
  const assertsActionOutcome =
    claim.kind === "action_claim" ||
    claim.requiredEvidence.some((e) => e.freshnessPolicy === "action_outcome");
  if (assertsActionOutcome && !deps.outcomeConfirmed(claim)) {
    return "REFUSED";
  }

  // ── C6 — value-binding (§5 C6; Theorem S (a-value)). When the claim DECLARES a
  // `valueBinding`, the rendered value must equal its licensing evidence value:
  //   · mismatch (in-grammar but unequal) → REFUSED (over-claim/confabulation,
  //     the C3 contradiction class — dominates, like the other REFUSED conjuncts);
  //   · abstain (bound key not present, or a side outside the closed scalar
  //     grammar) → UNKNOWN (honest ignorance — remembered, not a free pass).
  // Demote-only: with no `valueBinding` this is skipped (fail-safe no-op), so the
  // value-agnostic §5 behavior is byte-identical for every existing claim type.
  if (claim.valueBinding !== undefined) {
    const c6 = valueBindingVerdict(claim, claim.valueBinding, ledger);
    if (c6 === "REFUSED") return "REFUSED"; // over-claim — dominates.
    if (c6 === "ABSTAIN") sawUnknown = true; // cannot prove binding — honest ignorance.
  }

  // ── Any evidence UNKNOWN (and nothing REFUSED) → UNKNOWN (honest ignorance).
  if (sawUnknown) return "UNKNOWN";

  // ── Falsifier-completeness eligibility CAP (W6; inv.17). A claim reaches the
  // all-pass path here, but it may VALIDATE only if its type has enumerated HOW it
  // could be falsified (`falsifierComplete: true` ∧ a non-empty `falsifiers[]`).
  // Otherwise we cannot prove no falsifier exists → honest ignorance → UNKNOWN
  // (registry §5 missing/stale class). This is a verdict CAP, NOT a new REFUSED:
  // it only DEMOTES an otherwise-VALIDATED claim to UNKNOWN, never promotes —
  // preserving the safest-verdict monotonicity. A type defaults to UNKNOWN-only
  // until W5 declares its falsifiers (fail-safe; existing types keep compiling).
  if (!isFalsifierComplete(claim)) return "UNKNOWN";

  // ── All conjuncts PASS ∧ the type is falsifier-complete → VALIDATED. This is
  // the ONLY path to VALIDATED.
  return "VALIDATED";
}
