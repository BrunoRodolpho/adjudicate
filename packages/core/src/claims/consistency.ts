/**
 * The set-level CONSISTENCY gate — `checkConsistency`, the PURE function that
 * enforces **P2 Mutual Consistency** over a SET of claims (SDD §C P2; §D; §J.5;
 * v1.1 §4). This is the second, distinct gate of the claim lifecycle: per-claim
 * soundness (Q3 `claimAllowed`, P1) runs FIRST and feeds this gate the
 * **VALIDATED claim set**; this gate then proves the *set* is internally
 * consistent before render (SDD §D lifecycle).
 *
 *     Candidate Claims
 *           ↓  (P1) Soundness Validation   — per claim (Q3)
 *     Validated Claim Set
 *           ↓  (P2) Consistency Validation  — over the SET (THIS module)
 *     Renderable Claim Set  →  Renderer  →  Customer
 *
 * Consistency is **irreducibly a set property** (SDD §C P2; §D): two
 * individually-VALIDATED but jointly-impossible claims (e.g. `delivered` +
 * `ETA 45min` on the same order) are each sound, yet their *conjunction* is a
 * contradiction. It therefore CANNOT live in the per-claim validator — it is a
 * distinct gate.
 *
 * Four load-bearing rules transcribed from the spec (zero-drift; §P refused):
 *
 *   - **§D — only VALIDATED enter.** "Per-claim soundness runs before set
 *     consistency — an UNTRUSTED member must never enter or suppress the P2 set."
 *     A non-`VALIDATED` member (UNKNOWN / REFUSED / any non-validated verdict) is
 *     DROPPED before the gate runs: it neither enters the renderable set nor
 *     participates in any constraint that could suppress a valid same-subject
 *     claim.
 *   - **§D / v1.1 §4 — same-subject MUTUAL_EXCLUSION.** Two co-present members
 *     declared mutually-exclusive on the SAME subject force the conflicting
 *     members to UNKNOWN/ESCALATE — the gate **never renders both**.
 *   - **§O#1 — same-subject default-deny → ESCALATE.** P2 is "guaranteed
 *     *relative to declared constraints*." A same-subject co-render with NO
 *     declared relation (an un-modelled type-pair) defaults to **ESCALATE**, not
 *     a silent render. The un-declared case fails SAFE.
 *   - **§O#5 / Inv 6 — the gate's OWN output is PROPOSITION-FREE.** When the gate
 *     emits ESCALATE/UNKNOWN for a conflict or an un-modelled pair, its output
 *     MUST NOT re-assert the suppressed proposition: a suppression record carries
 *     ONLY the terminal + the conflicting TYPES + a non-propositional reason code
 *     — never the suppressed claim's `value` / factual content (the set-gate's
 *     own output must not re-leak what it just suppressed).
 *
 * Consistency is a SAME-SUBJECT property: claims about DIFFERENT subjects do not
 * constrain each other (an order's `delivered` says nothing about a *different*
 * order's ETA). The gate partitions by subject and evaluates relations only
 * within a partition.
 *
 * PURE & self-contained — no clock/RNG/IO, no kernel-downstream import (SDD §R
 * kernel purity: `adjudicate → claustrum → ibatexas`, never backward).
 */

import type { ClaimVerdict, TurnTerminal } from "./verdict.js";
import { sameValue } from "./value-equality.js";

// ─────────────────────────────────────────────────────────────────────────
// The consistency claim shape — what a SET member carries for P2 (SDD §D)
// ─────────────────────────────────────────────────────────────────────────

/**
 * One claim as the P2 set-gate sees it. DISTINCT from the §5 `MinimalClaim`
 * (soundness.ts): soundness quantifies over `requiredEvidence`; consistency
 * quantifies over `(subject, type)` identity across the SET. A claim arrives
 * here only AFTER soundness has assigned it a `verdict` (SDD §D).
 *
 *   - `subject` — the entity/resource identity the claim asserts ABOUT (e.g. an
 *                 orderId). Consistency is a SAME-SUBJECT property: two claims
 *                 constrain each other ONLY if their `subject` is equal. Kept
 *                 `string` so the partition key is value-comparable.
 *   - `type`    — the claim TYPE name (the registry vocabulary, e.g.
 *                 `"ORDER_FULFILLMENT_STAGE"`). The constraint table is keyed by
 *                 the unordered `{type, type}` pair within a subject.
 *   - `verdict` — the §5 soundness verdict (Q3). ONLY `"VALIDATED"` members enter
 *                 the P2 set (SDD §D); a non-validated member is dropped and may
 *                 never suppress a valid same-subject claim.
 *   - `value`   — the DOMAIN PROPOSITION the renderer would fill from this claim
 *                 (the factual content). It is carried so a RENDERED claim can be
 *                 filled — but it is the §O#5 / Inv 6 forbidden payload: the
 *                 gate's OWN suppression output must NEVER echo it. It is ALSO the
 *                 equality axis for same-`(subject, type)` idempotency: two members
 *                 of one `(subject, type)` are a consistent duplicate IFF their
 *                 `value`s are PROVABLY equal — otherwise they contradict. This is
 *                 an INTERNAL comparison only; the value is still never echoed out.
 */
export interface ConsistencyClaim {
  readonly subject: string;
  readonly type: string;
  readonly verdict: ClaimVerdict;
  readonly value: unknown;
}

// ─────────────────────────────────────────────────────────────────────────
// The declared same-subject constraint table (SDD §O#1; §D; v1.1 §4)
// ─────────────────────────────────────────────────────────────────────────

/**
 * The EXPLICIT relation between a co-renderable same-subject TYPE-PAIR (SDD §O#1;
 * §D). Every co-renderable same-subject pair MUST declare one of these; an
 * UN-declared pair is the §O#1 default-deny case (→ ESCALATE), NOT a fourth
 * silent relation.
 *
 *   - `MUTUAL_EXCLUSION` — the two types cannot BOTH be true of one subject
 *                          (e.g. `delivered` ⊥ `has-ETA`). Co-presence → suppress
 *                          both → UNKNOWN/ESCALATE; never render both (SDD §D).
 *   - `IMPLICATION`      — one type's truth ENTAILS the other's; they are
 *                          co-renderable (consistent), so both render.
 *   - `COMPATIBLE`       — the two types may co-occur freely; both render (no
 *                          over-blocking).
 */
export type ConsistencyRelation =
  | "MUTUAL_EXCLUSION"
  | "IMPLICATION"
  | "COMPATIBLE";

/**
 * The closed membership tuple for `ConsistencyRelation`, in spec order. Single
 * source of truth for the three declared relations.
 */
export const CONSISTENCY_RELATIONS: readonly ConsistencyRelation[] = [
  "MUTUAL_EXCLUSION",
  "IMPLICATION",
  "COMPATIBLE",
] as const;

/**
 * A single declared same-subject constraint: an unordered TYPE-PAIR `{typeA,
 * typeB}` and the EXPLICIT relation between them (SDD §O#1). The pair is
 * unordered — `{a, b}` and `{b, a}` denote the same constraint; the table lookup
 * canonicalises before matching so a declaration in either order is honoured.
 */
export interface ConsistencyConstraint {
  readonly typeA: string;
  readonly typeB: string;
  readonly relation: ConsistencyRelation;
}

/**
 * Canonical, order-independent key for an unordered type-pair. Sorting the two
 * type names makes `{a, b}` and `{b, a}` collide on one key, so a declaration in
 * either order matches a co-render in either order. The `\x00` (NUL, U+0000)
 * separator cannot appear in a type name, so distinct pairs never alias. It is
 * written as the source ESCAPE `\x00` — not an embedded raw NUL byte — so this
 * P2-gate file stays reviewable text (grep-able, prettier-safe, not a binary
 * blob); the runtime separator is identical either way.
 */
function pairKey(typeA: string, typeB: string): string {
  return typeA <= typeB
    ? `${typeA}\x00${typeB}`
    : `${typeB}\x00${typeA}`;
}

/**
 * The DECLARED same-subject constraint table (SDD §O#1; §D; v1.1 §4) — a small,
 * explicit, representative table. This is the kernel-foundation table (SDD §Q
 * scope guard: the full 37-row registry cross-product is downstream); it carries
 * the canonical exclusion plus one of each other relation so the gate's three
 * branches are all exercised:
 *
 *   - `ORDER_FULFILLMENT_STAGE` ⊥ `ORDER_ESTIMATED_ARRIVAL` — the canonical
 *     `delivered` ⊥ `has-ETA` exclusion (SDD §D / v1.1 §4): an order cannot be
 *     BOTH delivered AND have a live arrival estimate. (`MUTUAL_EXCLUSION`.)
 *   - `PURCHASE_COMPLETED` ⇒ `PAYMENT_SETTLED` — a completed purchase is
 *     co-renderable with its settlement; one entails the other.  (`IMPLICATION`.)
 *   - `ORDER_FULFILLMENT_STAGE` + `ORDER_MODIFIABLE` — a stage read and a
 *     modifiability read may co-occur freely.                    (`COMPATIBLE`.)
 *
 * Any same-subject co-render NOT in this table is un-modelled → §O#1 default-deny
 * → ESCALATE. The table is exhaustive ONLY relative to what it declares; that is
 * exactly why default-deny exists ("P2 is guaranteed *relative to declared
 * constraints*").
 */
export const DEFAULT_CONSISTENCY_TABLE: readonly ConsistencyConstraint[] = [
  {
    typeA: "ORDER_FULFILLMENT_STAGE",
    typeB: "ORDER_ESTIMATED_ARRIVAL",
    relation: "MUTUAL_EXCLUSION",
  },
  {
    typeA: "PURCHASE_COMPLETED",
    typeB: "PAYMENT_SETTLED",
    relation: "IMPLICATION",
  },
  {
    typeA: "ORDER_FULFILLMENT_STAGE",
    typeB: "ORDER_MODIFIABLE",
    relation: "COMPATIBLE",
  },
] as const;

/**
 * Build the order-independent lookup index from a constraint table. A duplicate
 * declaration of the same unordered pair is a table-authoring error and throws
 * (a pair must have ONE declared relation, not two) — surfaced at construction,
 * not silently last-write-wins. Pure.
 */
function indexTable(
  table: readonly ConsistencyConstraint[],
): ReadonlyMap<string, ConsistencyRelation> {
  const index = new Map<string, ConsistencyRelation>();
  for (const c of table) {
    const key = pairKey(c.typeA, c.typeB);
    const existing = index.get(key);
    if (existing !== undefined && existing !== c.relation) {
      throw new Error(
        `consistency table conflict: pair {${c.typeA}, ${c.typeB}} declared ` +
          `both ${existing} and ${c.relation} — a same-subject pair must have ` +
          `exactly one declared relation`,
      );
    }
    index.set(key, c.relation);
  }
  return index;
}

// ─────────────────────────────────────────────────────────────────────────
// Non-propositional reason codes (SDD §O#5 / Inv 6) — NO domain content
// ─────────────────────────────────────────────────────────────────────────

/**
 * The reason a member was SUPPRESSED — a CLOSED, non-propositional code set
 * (SDD §O#5 / Inv 6). A reason code names the *structural* cause (a relation
 * fired, or a pair was un-modelled); it asserts NOTHING about the order /
 * payment / restaurant. This is the only "why" the gate's output carries — it
 * never carries the suppressed claim's `value`.
 *
 *   - `MUTUAL_EXCLUSION_CONFLICT` — two same-subject members of DIFFERENT types
 *                                   are declared mutually exclusive and both were
 *                                   present.
 *   - `SAME_TYPE_VALUE_CONFLICT`  — two same-subject members of the SAME type
 *                                   carry contradictory (not provably-equal)
 *                                   values — one (subject, type) cannot render two
 *                                   conflicting propositions. (Names the type
 *                                   in conflict; never the suppressed value.)
 *   - `UNMODELLED_SAME_SUBJECT`   — a same-subject co-render with no declared
 *                                   relation (§O#1 default-deny).
 */
export type SuppressionReason =
  | "MUTUAL_EXCLUSION_CONFLICT"
  | "SAME_TYPE_VALUE_CONFLICT"
  | "UNMODELLED_SAME_SUBJECT";

/**
 * The closed membership tuple for `SuppressionReason`, in spec order.
 */
export const SUPPRESSION_REASONS: readonly SuppressionReason[] = [
  "MUTUAL_EXCLUSION_CONFLICT",
  "SAME_TYPE_VALUE_CONFLICT",
  "UNMODELLED_SAME_SUBJECT",
] as const;

/**
 * One PROPOSITION-FREE suppression record (SDD §O#5 / Inv 6). This is the gate's
 * OWN output for a suppressed member, and it is the §O#5 NEW_HOLE: it carries
 * ONLY structural identity, NEVER the suppressed proposition.
 *
 *   - `subject`        — the subject under which the conflict arose (an identity
 *                        key, e.g. an orderId — not a domain proposition).
 *   - `conflictTypes`  — the conflicting TYPE NAMES (registry vocabulary). Type
 *                        names are structural identifiers, not factual claims.
 *   - `reason`         — a non-propositional `SuppressionReason` code.
 *   - `terminal`       — the safe terminal forced for this suppression
 *                        (`ESCALATE` or `UNKNOWN`); both are first-class (§I).
 *
 * **There is deliberately NO `value` / proposition / message field.** §O#5 / Inv
 * 6: the set-gate's own ESCALATE/UNKNOWN output must not re-leak what it just
 * suppressed; a `value` field would be exactly that re-leak. Customer-facing
 * UNKNOWN/ESCALATE prose is rendered DOWNSTREAM from a proposition-free template
 * (SDD §O#3 / §Q deliverable 7) — never authored here, and never echoing
 * `ConsistencyClaim.value`.
 */
export interface SuppressionRecord {
  readonly subject: string;
  readonly conflictTypes: readonly string[];
  readonly reason: SuppressionReason;
  readonly terminal: Extract<TurnTerminal, "ESCALATE" | "UNKNOWN">;
}

// ─────────────────────────────────────────────────────────────────────────
// The gate result — the renderable set + the turn terminal + suppressions
// ─────────────────────────────────────────────────────────────────────────

/**
 * The result of the P2 consistency gate (SDD §D; §I; §J.5):
 *
 *   - `renderable`   — the CONSISTENT VALIDATED subset: the members that survived
 *                      every constraint and may reach the renderer. A suppressed
 *                      or non-validated member is NOT here.
 *   - `terminal`     — the TURN terminal (SDD §I): `RENDER` iff every entering
 *                      VALIDATED member is consistent and renderable; otherwise
 *                      `ESCALATE` (an un-modelled pair or an exclusion conflict
 *                      forces a human/safe posture). `UNKNOWN` is reachable per
 *                      member via a suppression record; the TURN terminal
 *                      escalates whenever ANY suppression occurred (the safest
 *                      turn-level posture — never silently render a partial set
 *                      as if whole).
 *   - `suppressions` — the PROPOSITION-FREE suppression records (SDD §O#5 / Inv
 *                      6), one per suppressed member. EMPTY iff `RENDER`.
 *
 * Invariant on the shape: `suppressions.length > 0 ⟺ terminal !== "RENDER"`, and
 * a `RENDER` result's `renderable` is the VALIDATED input set MINUS any idempotent
 * same-`(subject, type)` duplicates (a provably-equal duplicate read is de-duped
 * to a single renderable member — NOT suppressed, NOT escalated).
 */
export interface ConsistencyResult {
  readonly renderable: readonly ConsistencyClaim[];
  readonly terminal: TurnTerminal;
  readonly suppressions: readonly SuppressionRecord[];
}

/**
 * Options for `checkConsistency`. The constraint `table` is injectable so a
 * downstream repo can supply its full registry cross-product; it DEFAULTS to the
 * kernel-foundation `DEFAULT_CONSISTENCY_TABLE`. Pure — no other inputs.
 */
export interface ConsistencyOptions {
  readonly table?: readonly ConsistencyConstraint[];
}

// ─────────────────────────────────────────────────────────────────────────
// checkConsistency — THE P2 set-level gate (SDD §C P2; §D; §O#1; §O#5; §J.5)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Run the P2 consistency gate over a claim set (SDD §C P2; §D; §J.5). A PURE
 * function: same inputs ⟹ same result.
 *
 * Algorithm (SDD §D lifecycle, in order):
 *
 *   1. **Only VALIDATED enter (§D).** Drop every non-`VALIDATED` member up front.
 *      An UNKNOWN/REFUSED member neither enters the renderable set nor takes part
 *      in any constraint — it can never SUPPRESS a valid same-subject claim.
 *   2. **Partition by subject.** Consistency is same-subject; different-subject
 *      claims never constrain each other.
 *   3. **Per subject, evaluate every UNORDERED pair of co-present members:**
 *        · SAME type, PROVABLY-equal value → idempotent duplicate read: ONE is
 *          de-duplicated out of `renderable` (no record, no ESCALATE).
 *        · SAME type, different (or not-provably-equal) value → a value-level
 *          contradiction: BOTH suppressed with reason `SAME_TYPE_VALUE_CONFLICT`,
 *          terminal `ESCALATE` (never render two conflicting values of one type).
 *        · cross-type `MUTUAL_EXCLUSION` → BOTH members suppressed (never render
 *          both, §D) with reason `MUTUAL_EXCLUSION_CONFLICT`, terminal `ESCALATE`.
 *        · cross-type, NO declared relation → §O#1 default-deny: BOTH members
 *          suppressed with reason `UNMODELLED_SAME_SUBJECT`, terminal `ESCALATE`.
 *        · cross-type `IMPLICATION` / `COMPATIBLE` → consistent; neither
 *          suppressed.
 *      A member is suppressed if it is in ANY conflicting/un-modelled pair (a
 *      member consistent with one peer but excluded by another is still
 *      suppressed — the safest posture).
 *   4. **Assemble.** `renderable` = the VALIDATED members NOT suppressed.
 *      `terminal` = `RENDER` iff nothing was suppressed; else `ESCALATE`.
 *      `suppressions` = the proposition-free records (§O#5).
 *
 * NOTE — a single VALIDATED member with no same-subject peer has no pair to
 * evaluate, so it renders: the gate constrains CO-renders, never a lone claim.
 *
 * §O#5 / Inv 6: the returned `suppressions` carry ONLY `subject` + conflicting
 * `conflictTypes` + a non-propositional `reason` + the `terminal`. They NEVER
 * carry `ConsistencyClaim.value`. The gate's own output asserts nothing factual.
 */
export function checkConsistency(
  claims: readonly ConsistencyClaim[],
  options: ConsistencyOptions = {},
): ConsistencyResult {
  const index = indexTable(options.table ?? DEFAULT_CONSISTENCY_TABLE);

  // ── (1) §D: only VALIDATED enter the P2 set. A non-VALIDATED member is dropped
  // BEFORE any constraint runs — it must never enter the renderable set and must
  // never suppress a valid same-subject claim ("an UNTRUSTED member must never
  // enter or suppress the P2 set"). We index the survivors so suppression can
  // refer to members by position.
  const validated = claims.filter((c) => c.verdict === "VALIDATED");

  // The set of validated-member indices that are suppressed by some pair, plus
  // the proposition-free records describing WHY (one record per suppressed
  // member). A member can be implicated by more than one pair; we keep the first
  // reason that suppressed it (exclusion before default-deny is irrelevant to
  // safety — both force the same safe terminal — but determinism wants a rule:
  // first-encountered in (subject, pair) iteration order).
  const suppressed = new Set<number>();
  const recordByIndex = new Map<number, SuppressionRecord>();

  // ── (2) Partition by subject. Consistency is a SAME-SUBJECT property; only
  // members sharing a subject can constrain one another.
  const bySubject = new Map<string, number[]>();
  validated.forEach((claim, i) => {
    const bucket = bySubject.get(claim.subject);
    if (bucket === undefined) bySubject.set(claim.subject, [i]);
    else bucket.push(i);
  });

  // ── (3) Per subject, evaluate every UNORDERED pair of co-present members.
  for (const indices of bySubject.values()) {
    for (let a = 0; a < indices.length; a++) {
      for (let b = a + 1; b < indices.length; b++) {
        // `a`/`b` are in-bounds by the loop conditions, and every `indices`
        // entry is a valid `validated` position by construction (step 2); the
        // guard narrows `T | undefined` under noUncheckedIndexedAccess without
        // changing behaviour (the branch is unreachable).
        const iA = indices[a];
        const iB = indices[b];
        if (iA === undefined || iB === undefined) continue;
        const claimA = validated[iA];
        const claimB = validated[iB];
        if (claimA === undefined || claimB === undefined) continue;

        // Two members of the SAME type on one subject are not a cross-type
        // co-render the constraint table speaks to — but they are NOT
        // automatically consistent either. Per-claim soundness (P1) VALIDATED
        // each in isolation; their CONJUNCTION is internally consistent IFF they
        // assert the SAME value (an idempotent duplicate read). Two VALIDATED
        // claims of one (subject, type) carrying CONTRADICTORY values are a P2
        // violation exactly like a declared exclusion — rendering both would
        // surface a self-contradiction (SDD §C P2 "the rendered SET must be
        // internally consistent"; §D never-render-both).
        if (claimA.type === claimB.type) {
          if (sameValue(claimA.value, claimB.value)) {
            // Idempotent duplicate — values are PROVABLY equal. Render exactly
            // ONE: drop the later member from the renderable set WITHOUT a
            // suppression record. No contradiction ⟹ no ESCALATE; the turn
            // terminal stays RENDER and the surviving member carries the value.
            suppressed.add(iB);
          } else {
            // Different — OR not provably-equal (the conservative comparison
            // FAILS SAFE to conflict) — values for one (subject, type): two
            // VALIDATED claims asserting CONTRADICTORY content. §D never-render-
            // both: suppress BOTH → terminal ESCALATE, with the non-propositional
            // reason SAME_TYPE_VALUE_CONFLICT.
            suppressPair(
              suppressed,
              recordByIndex,
              claimA.subject,
              iA,
              iB,
              claimA.type,
              claimB.type,
              "SAME_TYPE_VALUE_CONFLICT",
            );
          }
          continue;
        }

        const relation = index.get(pairKey(claimA.type, claimB.type));

        if (relation === "MUTUAL_EXCLUSION") {
          // §D: declared mutually exclusive + both present → suppress BOTH,
          // never render both. Terminal ESCALATE; reason is non-propositional.
          suppressPair(
            suppressed,
            recordByIndex,
            claimA.subject,
            iA,
            iB,
            claimA.type,
            claimB.type,
            "MUTUAL_EXCLUSION_CONFLICT",
          );
        } else if (relation === undefined) {
          // §O#1 default-deny: an un-modelled same-subject co-render → ESCALATE,
          // NOT a silent render. P2 is guaranteed only relative to DECLARED
          // constraints; the un-declared case fails safe.
          suppressPair(
            suppressed,
            recordByIndex,
            claimA.subject,
            iA,
            iB,
            claimA.type,
            claimB.type,
            "UNMODELLED_SAME_SUBJECT",
          );
        }
        // IMPLICATION / COMPATIBLE → consistent co-render; neither suppressed.
      }
    }
  }

  // ── (4) Assemble. renderable = VALIDATED members not suppressed; terminal =
  // RENDER iff nothing suppressed, else ESCALATE; suppressions = the §O#5
  // proposition-free records (deterministic order: by suppressed index).
  const renderable = validated.filter((_, i) => !suppressed.has(i));
  const suppressions: SuppressionRecord[] = [];
  for (const i of [...recordByIndex.keys()].sort((x, y) => x - y)) {
    const record = recordByIndex.get(i);
    if (record !== undefined) suppressions.push(record);
  }

  const terminal: TurnTerminal =
    suppressions.length === 0 ? "RENDER" : "ESCALATE";

  return { renderable, terminal, suppressions };
}

/**
 * Suppress BOTH members of a conflicting/un-modelled pair and record a
 * PROPOSITION-FREE reason for each (SDD §D never-render-both; §O#5 / Inv 6). The
 * record carries ONLY the subject, the conflicting TYPE name(s), a
 * non-propositional reason code, and the `ESCALATE` terminal — NEVER either
 * claim's `value`. The first reason to implicate a member wins (deterministic);
 * a later pair does not overwrite an already-recorded suppression, since both
 * reasons force the same safe terminal.
 */
function suppressPair(
  suppressed: Set<number>,
  recordByIndex: Map<number, SuppressionRecord>,
  subject: string,
  indexA: number,
  indexB: number,
  typeA: string,
  typeB: string,
  reason: SuppressionReason,
): void {
  // conflictTypes lists the structural identity of the conflict, order-stable by
  // sort so the record is deterministic. A cross-type conflict names the unordered
  // PAIR; a SAME_TYPE_VALUE_CONFLICT (typeA === typeB) collapses to the single
  // type-in-conflict (still proposition-free, just non-redundant).
  const conflictTypes =
    typeA === typeB
      ? [typeA]
      : typeA <= typeB
        ? [typeA, typeB]
        : [typeB, typeA];
  for (const i of [indexA, indexB]) {
    suppressed.add(i);
    if (!recordByIndex.has(i)) {
      recordByIndex.set(i, {
        subject,
        conflictTypes,
        reason,
        terminal: "ESCALATE",
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Conservative value equality — drives same-(subject, type) idempotency (P2).
// The fail-closed `sameValue` (idempotent duplicate vs CONTRADICTION) is the
// SINGLE canonical implementation in `./value-equality.ts`, shared verbatim with
// the evidence-ledger's H3 same-key conflict gate so the two determinism-
// critical decisions can never silently diverge. Imported above; not redefined
// here. Sharing a PRIVATE module between two in-package consumers does NOT widen
// the frozen public API (§Q) — the module is not in the `claims/index.ts`
// barrel, so it is never re-exported from the package entry.
// ─────────────────────────────────────────────────────────────────────────
