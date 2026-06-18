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
