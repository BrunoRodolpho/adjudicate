import type { DecisionKind } from "@adjudicate/core";
import { decisionTheme } from "@/lib/decision-theme";

/**
 * A single decision-outcome chip, colored by the six-valued Decision theme.
 * Tolerates unknown strings (renders neutral) per ADR-105 forward-compat.
 */
export function DecisionChip({ kind }: { kind: string }) {
  const token = decisionTheme[kind as DecisionKind];
  if (token === undefined) {
    return (
      <span className="inline-flex items-center rounded-sm border border-edge px-1 py-px font-mono text-[9px] text-faint">
        {kind}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm border px-1 py-px font-mono text-[9px] ${token.fg} ${token.bg} ${token.border}`}
    >
      <span className={`h-1 w-1 rounded-full ${token.dot}`} />
      {token.label}
    </span>
  );
}
