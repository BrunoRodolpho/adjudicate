/**
 * Claim verdict + turn terminal — the two-level outcome model of the Claims
 * runtime (SDD §I; v1.1 §9). These are DISTINCT spaces and must never be
 * collapsed into one another.
 *
 *   ClaimVerdict (per claim) : VALIDATED · UNKNOWN · REFUSED          (3-valued)
 *   TurnTerminal (per turn)  : RENDER · UNKNOWN · ESCALATE · CLARIFY  (4 terminals)
 *
 * **ESCALATE and CLARIFY are FIRST-CLASS turn terminals** (SDD §I; v1.1 §9). The
 * §P forbidden misreading — "output is the three-valued verdict; terminate
 * VALIDATED/UNKNOWN/REFUSED" — is refused here: the turn space is NOT the claim
 * verdict space. A planner mis-frame degrades to `UNKNOWN`/`ESCALATE`/`CLARIFY`
 * (SDD §B, §C) rather than to a confident wrong assertion; collapsing the turn
 * space would erase the two safe terminals the bounded properties P3/P4 rely on.
 *
 * Mirrors the idiom of `decision.ts` (closed union + readonly tuple + guards):
 * the tuples are the single source of truth for membership; the guards narrow an
 * `unknown` against them. Pure & self-contained — no kernel-downstream import
 * (SDD §R kernel purity: `adjudicate → claustrum → ibatexas`, never backward).
 */

// ─────────────────────────────────────────────────────────────────────────
// Claim verdict (per claim) — SDD §I, §K; v1.1 §9
// ─────────────────────────────────────────────────────────────────────────

/**
 * The three-valued verdict the Claims Kernel returns for a single claim
 * (SDD §I, §K; registry §5):
 *
 *   - `VALIDATED` — present + fresh + consistent; the §E soundness predicate
 *                   holds, so the claim may reach the renderer.
 *   - `UNKNOWN`   — missing / not-found / stale → honest ignorance + offer.
 *                   This is NOT a failure (registry §5). An empty/default value
 *                   resolves UNKNOWN, never VALIDATED (registry §5; SDD §K).
 *   - `REFUSED`   — evidence contradicts, ownership denied, or no backing →
 *                   never asserted to the customer.
 *
 * EXACTLY these three members — no more, no less (SDD §R topology condition 4:
 * the three-valued model must not be reversed or removed).
 */
export type ClaimVerdict = "VALIDATED" | "UNKNOWN" | "REFUSED";

/**
 * The closed membership tuple for `ClaimVerdict`, in spec order. Single source
 * of truth for the 3 members; `isClaimVerdict` narrows against it.
 */
export const CLAIM_VERDICTS: readonly ClaimVerdict[] = [
  "VALIDATED",
  "UNKNOWN",
  "REFUSED",
] as const;

/** Type guard: is `value` one of the exactly-three claim verdicts? Pure. */
export function isClaimVerdict(value: unknown): value is ClaimVerdict {
  return (
    typeof value === "string" &&
    (CLAIM_VERDICTS as readonly string[]).includes(value)
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Turn terminal (per turn) — SDD §I; v1.1 §9
// ─────────────────────────────────────────────────────────────────────────

/**
 * The turn-level safe terminals (SDD §I; v1.1 §9). EXACTLY these four — every
 * turn path terminates in one of them:
 *
 *   - `RENDER`   — render the validated + consistent claim set to the customer.
 *   - `UNKNOWN`  — the turn surfaces honest ignorance (+ offer).
 *   - `ESCALATE` — defer to a human/supervisor (a FIRST-CLASS terminal).
 *   - `CLARIFY`  — ask the customer to disambiguate (a FIRST-CLASS terminal);
 *                  an unmapped span forces this, never a silent drop (SDD §J.8).
 *
 * **DISTINCT from `ClaimVerdict`.** The turn space is NOT the 3-valued claim
 * verdict (SDD §I, §P). `ESCALATE` and `CLARIFY` exist only at the turn level;
 * `VALIDATED`/`REFUSED` are claim-level and never appear here — `RENDER` is the
 * turn-level consequence of a validated+consistent set, not a claim verdict.
 */
export type TurnTerminal = "RENDER" | "UNKNOWN" | "ESCALATE" | "CLARIFY";

/**
 * The closed membership tuple for `TurnTerminal`, in spec order. Single source
 * of truth for the 4 terminals; `isTurnTerminal` narrows against it.
 */
export const TURN_TERMINALS: readonly TurnTerminal[] = [
  "RENDER",
  "UNKNOWN",
  "ESCALATE",
  "CLARIFY",
] as const;

/** Type guard: is `value` one of the exactly-four turn terminals? Pure. */
export function isTurnTerminal(value: unknown): value is TurnTerminal {
  return (
    typeof value === "string" &&
    (TURN_TERMINALS as readonly string[]).includes(value)
  );
}
