/**
 * Decision — the 6-valued output of adjudicate(envelope, state, policy).
 *
 *   EXECUTE              → mutation is authorized; proceed to side effect
 *   REFUSE               → not allowed; surface a typed Refusal to the user
 *   ESCALATE             → defer to a human or supervisor; block until resolved
 *   REQUEST_CONFIRMATION → ask the user to re-confirm, then re-adjudicate
 *   DEFER                → valid but awaits an external signal (e.g. payment webhook)
 *   REWRITE              → kernel substitutes a sanitized/normalized/capped envelope
 *
 * REWRITE is scope-restricted: sanitization, normalization, and safe mechanical
 * capping only. Never business transformation. See @adjudicate/core/README.md.
 *
 * **REWRITE re-adjudication & executed-hash recording (011).** A REWRITE is a
 * *proposal substitution*, not authorization. The `rewritten` envelope carries
 * its own content-addressed `intentHash`; the kernel never mutates that recipe.
 * Two things happen to a REWRITE before any side effect:
 *   1. In the pure kernel (`adjudicate`), the rewritten `intentHash` is re-derived
 *      fail-closed and a taint-elevating rewrite is blocked (a non-deterministic
 *      rewrite may only INCREASE friction — §C monotonicity).
 *   2. In the audited shell (`adjudicateAndAudit`), the rewritten envelope
 *      re-enters the kernel ONCE; only a second-pass EXECUTE lets it reach the
 *      executor. The EXECUTED (rewritten) hash — not the original — is the audit
 *      row's indexed `intentHash` and the ledger-claim key, linked back to the
 *      original via a `rewrite_executed` supersession.
 * REWRITE→REWRITE is bounded to that single pass: a rewrite that itself rewrites
 * falls through to REFUSE, never recursing.
 */

import type { IntentEnvelope } from "./envelope.js";
import type { DecisionBasis } from "./basis-codes.js";
import type { Refusal } from "./refusal.js";

export type DecisionKind =
  | "EXECUTE"
  | "REFUSE"
  | "ESCALATE"
  | "REQUEST_CONFIRMATION"
  | "DEFER"
  | "REWRITE";

export type Decision =
  | { kind: "EXECUTE"; basis: readonly DecisionBasis[] }
  | { kind: "REFUSE"; refusal: Refusal; basis: readonly DecisionBasis[] }
  | {
      kind: "ESCALATE";
      to: "human" | "supervisor";
      reason: string;
      basis: readonly DecisionBasis[];
    }
  | {
      kind: "REQUEST_CONFIRMATION";
      prompt: string;
      basis: readonly DecisionBasis[];
    }
  | {
      kind: "DEFER";
      signal: string;
      timeoutMs: number;
      basis: readonly DecisionBasis[];
    }
  | {
      kind: "REWRITE";
      rewritten: IntentEnvelope;
      reason: string;
      basis: readonly DecisionBasis[];
    };

/** Construct an EXECUTE decision with the given basis list. */
export function decisionExecute(basis: readonly DecisionBasis[]): Decision {
  return { kind: "EXECUTE", basis };
}

export function decisionRefuse(
  refusal: Refusal,
  basis: readonly DecisionBasis[],
): Decision {
  return { kind: "REFUSE", refusal, basis };
}

export function decisionEscalate(
  to: "human" | "supervisor",
  reason: string,
  basis: readonly DecisionBasis[],
): Decision {
  return { kind: "ESCALATE", to, reason, basis };
}

export function decisionRequestConfirmation(
  prompt: string,
  basis: readonly DecisionBasis[],
): Decision {
  return { kind: "REQUEST_CONFIRMATION", prompt, basis };
}

export function decisionDefer(
  signal: string,
  timeoutMs: number,
  basis: readonly DecisionBasis[],
): Decision {
  return { kind: "DEFER", signal, timeoutMs, basis };
}

export function decisionRewrite(
  rewritten: IntentEnvelope,
  reason: string,
  basis: readonly DecisionBasis[],
): Decision {
  return { kind: "REWRITE", rewritten, reason, basis };
}

// ─────────────────────────────────────────────────────────────────────────
// 061 · Monotonic escalation: restrictiveness lattice + friction-only ceiling
// ─────────────────────────────────────────────────────────────────────────
//
// The closed 6-outcome `Decision` algebra carries NO built-in restrictiveness
// total order (no `rank`/`severity`/`ordinal`/`confidence`/`metadata` field — see
// invariant #2). 061 adds that order as net-new COMPOSITION METADATA derived from
// the `kind` alone — it does NOT add any field to the `Decision` union and does
// NOT add a 7th outcome. The lattice exists solely so `clampToCeiling` can compute
// index §C's `final = min(deterministic_decision, risk_ceiling)`.
//
// ── The ratified restrictiveness order (index §C, constitutional) ──
//
//   EXECUTE < REWRITE < REQUEST_CONFIRMATION < DEFER < ESCALATE < REFUSE
//   (least friction → most friction)
//
// Index §C ratifies one ordering pair as a constitutional decision, not merely an
// illustration: **REWRITE ranks BELOW REQUEST_CONFIRMATION** — a sanitizing rewrite
// is less friction than asking a human. Do not reorder without amending §C.
//
// Rationale per rung (low→high friction):
//   • EXECUTE              — no friction; the mutation proceeds.
//   • REWRITE              — a mechanically sanitized/normalized/capped proposal
//                            still proceeds (after a single re-adjudication pass);
//                            cheaper than any human/threshold step.
//   • REQUEST_CONFIRMATION — pauses for a human "are you sure?" before proceeding.
//   • DEFER                — valid but blocked awaiting an external signal/webhook.
//   • ESCALATE             — routed to a human/supervisor; blocks until resolved.
//   • REFUSE               — terminally denied; maximum friction.
//
// The numbers are an internal lattice index only; never serialized, never on the
// wire, never a `Decision` field. Higher index == more restrictive (more friction).
const RESTRICTIVENESS_ORDER: readonly DecisionKind[] = [
  "EXECUTE",
  "REWRITE",
  "REQUEST_CONFIRMATION",
  "DEFER",
  "ESCALATE",
  "REFUSE",
] as const;

/**
 * The restrictiveness rank of a `DecisionKind` on the §C lattice: 0 = least
 * restrictive (EXECUTE) … 5 = most restrictive (REFUSE). Higher == more friction.
 *
 * Pure, total, and derived from `kind` alone — no `Decision` field is read or
 * added. Used by `clampToCeiling`; exported so downstream ceiling consumers
 * (05x/10x/11x) and tests can reason about the same total order.
 */
export function restrictivenessRank(kind: DecisionKind): number {
  return RESTRICTIVENESS_ORDER.indexOf(kind);
}

/**
 * Total restrictiveness order: `true` iff `a` is at least as restrictive as `b`
 * (a's friction >= b's friction) on the §C lattice. Reflexive.
 */
export function isAtLeastAsRestrictive(a: DecisionKind, b: DecisionKind): boolean {
  return restrictivenessRank(a) >= restrictivenessRank(b);
}

/**
 * `clampToCeiling` — index §C's `final = min(deterministic, ceiling)` over the
 * restrictiveness lattice. Returns whichever of the two Decisions carries the
 * GREATER friction (the more-restrictive `kind`), so a ceiling may only RAISE
 * friction, never lower it.
 *
 * Semantics (the monotonicity primitive 05x/10x/11x consume):
 *   • If `ceiling` is strictly MORE restrictive than `deterministic`, the
 *     ceiling Decision is returned verbatim (friction is raised).
 *   • Otherwise (`ceiling` equal or LESS restrictive) the `deterministic`
 *     Decision is returned UNCHANGED. A ceiling can never weaken below the
 *     deterministic decision: `REFUSE`-ceiling over an `EXECUTE`-deterministic
 *     raises to REFUSE; an `EXECUTE`-ceiling over a `REFUSE`-deterministic is a
 *     no-op (the REFUSE stands). Only deterministic rules authorize EXECUTE —
 *     the result is EXECUTE iff `deterministic.kind === "EXECUTE"` (invariant
 *     #1/§C), because EXECUTE is the unique minimum of the lattice, so any
 *     non-EXECUTE ceiling clamps an EXECUTE deterministic upward and an EXECUTE
 *     ceiling never lowers a more-restrictive deterministic decision.
 *
 * This adds NO field and NO 7th outcome: it only SELECTS between two existing
 * Decisions by their `kind`'s lattice rank, returning one of them as-is (so its
 * `basis`/payload is preserved exactly — no synthesis, no mutation).
 *
 * Fail-closed (§C / invariant #6): the function is total over the closed algebra
 * and is biased to friction on a tie (it keeps `deterministic` only when the
 * ceiling is NOT strictly more restrictive, i.e. it never trades a more-
 * restrictive ceiling for a less-restrictive deterministic decision).
 *
 * Pure & synchronous (kernel-purity §D): no clock, RNG, or IO.
 */
export function clampToCeiling(deterministic: Decision, ceiling: Decision): Decision {
  // The ceiling wins iff it is STRICTLY more restrictive (higher friction rank);
  // on equal or lower friction the deterministic decision is returned unchanged.
  // This is a true `min` over the restrictiveness lattice (min == most friction)
  // with ties biased to the deterministic decision (fail-closed §C / invariant #6).
  return restrictivenessRank(ceiling.kind) > restrictivenessRank(deterministic.kind)
    ? ceiling
    : deterministic;
}
