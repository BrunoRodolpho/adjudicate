import type { DecisionKind } from "@adjudicate/core";

/**
 * Theme tokens for the six Decision outcomes.
 *
 * The framework's distinguishing claim is the six-valued Decision algebra
 * (vs. the two-valued ALLOW/DENY of OPA/Cedar and the EXECUTE/THROW of plain
 * function-calling). Rendering all six with stable, distinct colors is a
 * load-bearing UX commitment — collapsing them to ALLOW/BLOCK/HOLD/MODIFY is
 * available as an opt-in summary view but never as the ground-truth display.
 */
export interface DecisionThemeToken {
  readonly label: string;
  readonly summary: "Allow" | "Block" | "Hold" | "Modify";
  readonly fg: string;
  readonly bg: string;
  readonly border: string;
  readonly dot: string;
}

export const decisionTheme: Record<DecisionKind, DecisionThemeToken> = {
  EXECUTE: {
    label: "EXECUTE",
    summary: "Allow",
    fg: "text-emerald-300",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/40",
    dot: "bg-emerald-400",
  },
  REFUSE: {
    label: "REFUSE",
    summary: "Block",
    fg: "text-red-300",
    bg: "bg-red-500/10",
    border: "border-red-500/40",
    dot: "bg-red-400",
  },
  DEFER: {
    label: "DEFER",
    summary: "Hold",
    fg: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-500/40",
    dot: "bg-amber-400",
  },
  ESCALATE: {
    label: "ESCALATE",
    summary: "Hold",
    fg: "text-violet-300",
    bg: "bg-violet-500/10",
    border: "border-violet-500/40",
    dot: "bg-violet-400",
  },
  REQUEST_CONFIRMATION: {
    label: "CONFIRM?",
    summary: "Hold",
    fg: "text-sky-300",
    bg: "bg-sky-500/10",
    border: "border-sky-500/40",
    dot: "bg-sky-400",
  },
  REWRITE: {
    label: "REWRITE",
    summary: "Modify",
    fg: "text-orange-300",
    bg: "bg-orange-500/10",
    border: "border-orange-500/40",
    dot: "bg-orange-400",
  },
};

/** Stable order for table headers / filter lists. */
export const DECISION_KIND_ORDER: readonly DecisionKind[] = [
  "EXECUTE",
  "REFUSE",
  "DEFER",
  "ESCALATE",
  "REQUEST_CONFIRMATION",
  "REWRITE",
] as const;
