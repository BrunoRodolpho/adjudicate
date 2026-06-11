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
    playgroundPreset: {
      intentKind: "deployment.approval.request",
      payload: { service: "api", environment: "production", gitSha: "feedface", rampPercent: 100 },
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
