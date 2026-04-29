/**
 * Layer 2 guard factories.
 *
 * The two factories here cover two patterns that BOTH existing Packs
 * (@adjudicate/pack-payments-pix and @adjudicate/pack-identity-kyc) hit
 * directly:
 *
 *   createThresholdGuard    — REFUSE/ESCALATE/EXECUTE/REQUEST_CONFIRMATION
 *                              when a numeric extracted from the envelope
 *                              crosses a threshold. PIX uses it for
 *                              refund-amount escalation; KYC uses it for
 *                              vendor-score outcomes.
 *
 *   createStateDeferGuard   — DEFER on a wire signal when an intent kind
 *                              matches (and optionally a state predicate
 *                              holds). PIX uses it for charge.create
 *                              awaiting the provider webhook; KYC uses
 *                              it for kyc.start / kyc.document.upload
 *                              awaiting external completion signals.
 *
 * Both factories are kept narrower than the kernel's `Guard` signature
 * deliberately: the caller specifies WHAT crosses the threshold and
 * WHAT the resulting Decision contains, but the factory owns the
 * "match → extract → compare" / "match → return DEFER" plumbing.
 * Inline guards remain available — these factories are a convenience,
 * not a constraint.
 */

import { decisionDefer } from "@adjudicate/core";
import type {
  Decision,
  DecisionBasis,
  IntentEnvelope,
} from "@adjudicate/core";
import type { Guard } from "@adjudicate/core/kernel";

// ─── createThresholdGuard ──────────────────────────────────────────────────

/**
 * Numeric comparator. The factory engages `onCross` when:
 *
 *   ">="   value >= threshold
 *   "<="   value <= threshold
 *   ">"    value >  threshold
 *   "<"    value <  threshold
 *
 * Strict vs non-strict matters at the boundary: a Pack that REFUSEs at
 * `score < 50` (KYC) wants `<`, not `<=`. The factory does not assume.
 */
export type ThresholdComparator = ">=" | "<=" | ">" | "<";

export interface ThresholdGuardOptions<K extends string, P, S> {
  /**
   * Predicate engaging the guard. Typically `(env) => env.kind === "..."`,
   * but state-aware predicates are supported (e.g., "score AND session
   * is in VENDOR_PENDING"). Returning false short-circuits to `null`,
   * matching the kernel's "this guard has no opinion" semantics.
   */
  readonly matches: (
    envelope: IntentEnvelope<K, P>,
    state: S,
  ) => boolean;
  /**
   * Extract the numeric being compared. Returning `null`/`undefined`
   * also short-circuits — useful when the field is optional in the
   * payload schema and absence should *not* trigger the threshold.
   */
  readonly extract: (
    envelope: IntentEnvelope<K, P>,
    state: S,
  ) => number | null | undefined;
  /** Static threshold value. */
  readonly threshold: number;
  /** Comparator. Defaults to `">="`. */
  readonly comparator?: ThresholdComparator;
  /**
   * Build the Decision for the threshold-crossed case. The factory
   * does NOT prescribe the Decision kind — caller passes whatever's
   * appropriate (REFUSE for low score, ESCALATE for high refund,
   * EXECUTE for clear high score, etc.). Receives the value, the
   * threshold, the envelope, and the state for full context.
   */
  readonly onCross: (
    value: number,
    threshold: number,
    envelope: IntentEnvelope<K, P>,
    state: S,
  ) => Decision;
}

const COMPARATORS: Record<
  ThresholdComparator,
  (value: number, threshold: number) => boolean
> = {
  ">=": (v, t) => v >= t,
  "<=": (v, t) => v <= t,
  ">": (v, t) => v > t,
  "<": (v, t) => v < t,
};

export function createThresholdGuard<K extends string, P, S>(
  options: ThresholdGuardOptions<K, P, S>,
): Guard<K, P, S> {
  const compare = COMPARATORS[options.comparator ?? ">="];
  return (envelope, state) => {
    if (!options.matches(envelope, state)) return null;
    const value = options.extract(envelope, state);
    if (value === null || value === undefined) return null;
    if (!compare(value, options.threshold)) return null;
    return options.onCross(value, options.threshold, envelope, state);
  };
}

// ─── createStateDeferGuard ─────────────────────────────────────────────────

export interface StateDeferGuardOptions<K extends string, P, S> {
  /**
   * Predicate engaging the guard. Typically `(env) => env.kind === "..."`
   * for kinds that always DEFER (KYC's kyc.start), but state-aware
   * predicates support patterns like "DEFER only when the local payment
   * status isn't yet `confirmed`" (PIX's pending-charge case).
   */
  readonly matches: (
    envelope: IntentEnvelope<K, P>,
    state: S,
  ) => boolean;
  /** Wire signal the runtime parks the intent on. */
  readonly signal: string;
  /** DEFER timeout (ms). The runtime ages out the parked intent past this. */
  readonly timeoutMs: number;
  /**
   * Decision basis. Static for simple cases (KYC's stateless DEFERs);
   * a function for cases that want to surface state in the basis (e.g.,
   * "transition INIT→DOCS_REQUIRED" with the source status).
   */
  readonly basis:
    | ReadonlyArray<DecisionBasis>
    | ((
        envelope: IntentEnvelope<K, P>,
        state: S,
      ) => ReadonlyArray<DecisionBasis>);
}

export function createStateDeferGuard<K extends string, P, S>(
  options: StateDeferGuardOptions<K, P, S>,
): Guard<K, P, S> {
  return (envelope, state) => {
    if (!options.matches(envelope, state)) return null;
    const basis =
      typeof options.basis === "function"
        ? options.basis(envelope, state)
        : options.basis;
    return decisionDefer(options.signal, options.timeoutMs, basis);
  };
}
