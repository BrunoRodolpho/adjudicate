import type {
  AdjudicationTraceEntry,
  DecisionKind,
} from "@adjudicate/core";
import type { GuidedStep } from "@/content/guided-cases";
import { DECISIONS } from "@/content/decisions";

/**
 * Pure narration helpers for GUIDED mode.
 *
 * No React, no "use client", no IO, no wall-clock — these are plain functions
 * that turn a real kernel response into newcomer-friendly English. Keeping
 * them here (rather than inline in the components) lets the orchestrator stay
 * small and makes the mapping testable in isolation.
 *
 * Two jobs:
 *   1. {@link friendlyGuardName} — read the evaluation `trace`, find the step
 *      that actually produced the decision (`outcome === "match"`), and name
 *      it in plain language ("the budget guard", "the refund-amount rule"…).
 *   2. {@link decisionSentence} — build the single explanatory sentence shown
 *      next to the DecisionChip, preferring the step's own per-outcome
 *      narration and falling back to the canonical `DECISIONS[kind].oneLiner`.
 */

// ── Phase → friendly label ─────────────────────────────────────────────
//
// Mirrors `AdjudicationTracePhase` in `@adjudicate/core`. These are the
// fallbacks used when a matched guard is anonymous (factory-built guards
// lose their `Function.name`, so `guardName` is absent) or when the match
// is a non-guard phase like `schema` / `taint` / `default`.

const PHASE_FRIENDLY: Record<string, string> = {
  kill: "an emergency stop rule",
  schema: "the input-shape check",
  state: "a state rule",
  taint: "the trust check",
  auth: "an authorisation rule",
  business: "a business rule",
  default: "the pack's default rule",
};

// ── Guard name → friendly label ────────────────────────────────────────
//
// Best-effort prettifier for named guards. The installed demo packs build
// most of their guards from factories (createTokenBudgetGuard,
// createCommandRiskGuard, createDataClassificationGuard…) which are
// anonymous, so those fall through to the phase label above. Named guards
// from the published packs (PIX / KYC / Deployments) get a clean label here;
// anything unmapped is humanised from its identifier.

const GUARD_FRIENDLY: Record<string, string> = {
  validateAmount: "the refund-amount rule",
  validateRefundAmount: "the refund-amount rule",
  escalateLargeRefunds: "the large-refund rule",
  requireConfirmation: "the confirmation rule",
  clampRampPercent: "the ramp-size rule",
  requireApproval: "the production-approval rule",
  awaitDocuments: "the document-wait rule",
  awaitVendor: "the vendor-result rule",
  tokenBudgetGuard: "the token-budget rule",
  commandRiskGuard: "the command-risk rule",
  dataClassificationGuard: "the PII-scan rule",
};

// ── Guard / phase → "what that rule does" ──────────────────────────────
//
// One plain-English clause describing each rule's JOB, appended to the
// "X made the call" sentence so a newcomer learns WHY the kernel landed where
// it did, not just which rule fired. Keyed by the same guard names / phases as
// the friendly-label maps above; anything unmapped simply omits the clause.

const GUARD_JOB: Record<string, string> = {
  validateAmount: "It checks the refund stays within the original charge.",
  validateRefundAmount:
    "It checks the refund stays within the original charge.",
  escalateLargeRefunds:
    "It sends unusually large refunds to a human for sign-off.",
  requireConfirmation:
    "It asks the caller to confirm before a sensitive action runs.",
  clampRampPercent:
    "It caps how much traffic a deployment can take in one move.",
  requireApproval:
    "It blocks production deploys that have no recorded approval.",
  awaitDocuments: "It waits for the required documents to arrive.",
  awaitVendor: "It waits for the external vendor's result before proceeding.",
  tokenBudgetGuard:
    "It checks the request won't push the session past its token budget.",
  commandRiskGuard:
    "It classifies how risky a command is and gates the dangerous ones.",
  dataClassificationGuard:
    "It scans the payload for classified data before it leaves the system.",
};

const PHASE_JOB: Record<string, string> = {
  kill: "It halts everything while an emergency stop is engaged.",
  schema: "It rejects requests whose shape doesn't match the contract.",
  taint: "It stops untrusted input from reaching a privileged action.",
  auth: "It verifies the caller is allowed to perform this action.",
  default: "It applies the Pack's fallback decision when no rule matched.",
};

/**
 * One plain-English clause describing what the matched rule does, or `null`
 * when the rule isn't in the curated maps. Best-effort: named guard job →
 * phase job → none.
 */
function guardJob(
  trace: ReadonlyArray<AdjudicationTraceEntry>,
): string | null {
  const entry = matchedEntry(trace);
  if (!entry) return null;
  if (entry.guardName && GUARD_JOB[entry.guardName]) {
    return GUARD_JOB[entry.guardName]!;
  }
  return PHASE_JOB[entry.phase] ?? null;
}

/**
 * Turn a guard's raw `Function.name` (camelCase / PascalCase identifier) into
 * a readable lower-case phrase, e.g. `validateRefundAmount` → "validate
 * refund amount". Used only when the name isn't in {@link GUARD_FRIENDLY}.
 */
function humaniseIdentifier(name: string): string {
  const spaced = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return spaced.length > 0 ? `the ${spaced} rule` : "a policy rule";
}

/**
 * The trace entry that produced the final decision — the one and only
 * `outcome === "match"` step. Returns `null` for an empty / all-pass trace
 * (e.g. the defensive ledger-replay short-circuit, which yields `[]`).
 */
export function matchedEntry(
  trace: ReadonlyArray<AdjudicationTraceEntry>,
): AdjudicationTraceEntry | null {
  for (const entry of trace) {
    if (entry.outcome === "match") return entry;
  }
  return null;
}

/**
 * Friendly name of the guard/phase that fired, e.g. "the token-budget rule".
 * Falls back gracefully: named guard → phase label → generic phrase.
 */
export function friendlyGuardName(
  trace: ReadonlyArray<AdjudicationTraceEntry>,
): string {
  const entry = matchedEntry(trace);
  if (!entry) return "the pack's policy";

  if (entry.guardName) {
    return (
      GUARD_FRIENDLY[entry.guardName] ?? humaniseIdentifier(entry.guardName)
    );
  }
  return PHASE_FRIENDLY[entry.phase] ?? "a policy rule";
}

/**
 * The "which guard fired" sentence for the result region, e.g. "The
 * token-budget rule made the call. It checks the request won't push the
 * session past its token budget." Capitalises the leading article and appends
 * a one-clause description of the rule's job when one is known.
 */
export function guardFiredSentence(
  trace: ReadonlyArray<AdjudicationTraceEntry>,
): string {
  const name = friendlyGuardName(trace);
  const lead = name.charAt(0).toUpperCase() + name.slice(1);
  const job = guardJob(trace);
  return job ? `${lead} made the call. ${job}` : `${lead} made the call.`;
}

/**
 * The shortest possible plain-English gloss of WHAT the kernel did, keyed only
 * by the decision kind — no Pack/scenario context. This is the very first
 * thing a newcomer should read about an outcome ("The kernel approved the
 * request as-is."). The richer, scenario-aware sentence still follows via
 * {@link decisionSentence}; this is the one-glance anchor above it.
 *
 * Mirrors the wording used by the sandbox receipt so both modes read the same.
 */
const PLAIN_OUTCOME: Record<DecisionKind, string> = {
  EXECUTE: "The kernel approved the request as-is.",
  REFUSE: "The kernel blocked the request.",
  REWRITE: "The kernel approved a modified version.",
  DEFER: "The kernel paused the request pending a signal.",
  ESCALATE: "The kernel routed the request to a reviewer.",
  REQUEST_CONFIRMATION: "The kernel asked the caller to confirm.",
};

/**
 * Plain-English, kind-only summary of the outcome. Safe for any surface that
 * renders a decision; see {@link PLAIN_OUTCOME}.
 */
export function plainOutcomeSummary(kind: DecisionKind): string {
  return PLAIN_OUTCOME[kind];
}

/**
 * The explanatory sentence shown next to the DecisionChip.
 *
 * Prefers the step's own per-outcome narration keyed by the decision the
 * kernel ACTUALLY returned (so an unexpected outcome still reads sensibly),
 * then the step's narration for its expected outcome, then the canonical
 * marketing one-liner for that decision kind.
 */
export function decisionSentence(
  step: GuidedStep,
  actualKind: DecisionKind,
): string {
  const byOutcome = step.narrateByOutcome?.[actualKind];
  if (byOutcome) return byOutcome;
  return DECISIONS[actualKind].oneLiner;
}
