import type { DecisionKind } from "@adjudicate/core";

/**
 * Marketing-side metadata for the six Decision outcomes. Source of truth
 * remains `packages/core/src/decision.ts` — this is the presentation layer.
 */

export interface DecisionContent {
  readonly kind: DecisionKind;
  readonly headline: string;
  readonly oneLiner: string;
  readonly accent: string; // text-*-strong class (AA-safe on white)
  readonly bg: string; // bg-* class
  readonly border: string; // border-* class
  readonly icon: "CircleCheck" | "ShieldX" | "RotateCcw" | "Clock" | "UserCheck" | "HelpCircle";
  /** Pre-filled playground payload for this outcome (drives the lab tab). */
  readonly playgroundPreset: {
    readonly intentKind: string;
    readonly payload: Record<string, unknown>;
    /**
     * Optional pre-loaded Pack state. Some outcomes only arise when the kernel
     * reads a fact out of state S (e.g. an approval already on file) — without
     * it the same payload re-adjudicates to a different kind. Seeded as plain
     * JSON; the kernel-runner rehydrates it into the Pack's runtime shape.
     */
    readonly state?: unknown;
  };
}

export const DECISIONS_ORDER: ReadonlyArray<DecisionKind> = [
  "EXECUTE",
  "REFUSE",
  "REWRITE",
  "DEFER",
  "ESCALATE",
  "REQUEST_CONFIRMATION",
];

export const DECISIONS: Record<DecisionKind, DecisionContent> = {
  EXECUTE: {
    kind: "EXECUTE",
    headline: "Execute",
    oneLiner: "The intent runs against the side-effect.",
    accent: "text-execute-strong",
    bg: "bg-execute/10",
    border: "border-execute/40",
    icon: "CircleCheck",
    playgroundPreset: {
      intentKind: "deployment.approval.request",
      payload: { service: "api", environment: "staging", gitSha: "deadbeef", rampPercent: 25 },
    },
  },
  REFUSE: {
    kind: "REFUSE",
    headline: "Refuse",
    oneLiner: "The intent is rejected with a structured refusal.",
    accent: "text-refuse-strong",
    bg: "bg-refuse/10",
    border: "border-refuse/40",
    icon: "ShieldX",
    playgroundPreset: {
      intentKind: "deployment.approval.request",
      payload: { service: "api", environment: "mars", gitSha: "deadbeef" },
    },
  },
  REWRITE: {
    kind: "REWRITE",
    headline: "Rewrite",
    oneLiner: "The kernel returns a sanitised replacement intent.",
    accent: "text-rewrite-strong",
    bg: "bg-rewrite/10",
    border: "border-rewrite/40",
    icon: "RotateCcw",
    // A production deploy at 100% ramp is REWRITTEN down to the 25% production
    // cap (basis quantity_capped). The approval already on file is what lets
    // that REWRITE SURVIVE the kernel's 011 re-adjudication: the kernel rewrites
    // the 100% ramp to 25%, then re-adjudicates the corrected envelope — and
    // because the deploy IS approved, the clamped request clears the
    // production-approval gate (EXECUTE) instead of escalating, so the final
    // audited decision is the REWRITE. Drop the approval and the SAME payload
    // re-adjudicates to ESCALATE (the clamped-but-unapproved deploy escalates;
    // see guided-cases `deploy-prod-overshoot`), which is why this preset must
    // seed the approval in state — without it the homepage REWRITE centerpiece
    // would render an ESCALATE receipt.
    playgroundPreset: {
      intentKind: "deployment.approval.request",
      payload: { service: "api", environment: "production", gitSha: "feedface", rampPercent: 100 },
      state: {
        approvals: {
          "production/api/feedface": {
            service: "api",
            environment: "production",
            gitSha: "feedface",
            approver: "sre-oncall",
            decision: "approved",
            at: "2026-06-07T00:00:00.000Z",
          },
        },
      },
    },
  },
  DEFER: {
    kind: "DEFER",
    headline: "Defer",
    oneLiner: "The kernel parks the intent until an external signal arrives.",
    accent: "text-defer-strong",
    bg: "bg-defer/10",
    border: "border-defer/40",
    icon: "Clock",
    playgroundPreset: {
      intentKind: "deployment.approval.request",
      payload: { service: "api", environment: "staging", gitSha: "feedface", rampPercent: 100 },
    },
  },
  ESCALATE: {
    kind: "ESCALATE",
    headline: "Escalate",
    oneLiner: "The intent is routed to a human approver.",
    accent: "text-escalate-strong",
    bg: "bg-escalate/10",
    border: "border-escalate/40",
    icon: "UserCheck",
    playgroundPreset: {
      intentKind: "deployment.approval.request",
      payload: { service: "api", environment: "production", gitSha: "feedface", rampPercent: 10 },
    },
  },
  REQUEST_CONFIRMATION: {
    kind: "REQUEST_CONFIRMATION",
    headline: "Request confirmation",
    oneLiner: "The kernel asks for an affirmative re-confirmation before proceeding.",
    accent: "text-confirm-strong",
    bg: "bg-confirm/10",
    border: "border-confirm/40",
    icon: "HelpCircle",
    playgroundPreset: {
      intentKind: "deployment.rollback.execute",
      payload: { service: "api", environment: "production", toGitSha: "deadbeef" },
    },
  },
};
