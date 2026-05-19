"use client";

import { DecisionBadge } from "@/components/motion/DecisionBadge";
import { DECISIONS, DECISIONS_ORDER } from "@/content/decisions";

/**
 * Collapsible legend explaining the six decision kinds. Mounted above
 * the audit log on the playground right rail. Default closed so the
 * existing density isn't disrupted; expanded gives a permanent reference
 * for visitors who landed cold.
 *
 * Single source of truth for the badge appearance + one-line meaning is
 * `DECISIONS` (apps/web/src/content/decisions.ts) — used by HowItWorks,
 * DecisionsGrid, the playground audit log, and now this legend.
 */
export function DecisionLegend() {
  return (
    <details className="group rounded-lg border border-edge bg-canvas/40">
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-[10px] uppercase tracking-section text-muted transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
        <span>What do these badges mean?</span>
        <span className="text-faint transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <ul className="flex flex-col gap-2 border-t border-edge p-2">
        {DECISIONS_ORDER.map((kind) => (
          <li
            key={kind}
            className="flex items-start gap-2 rounded-md border border-edge bg-surface px-2 py-1.5"
          >
            <DecisionBadge kind={kind} size="sm" animate={false} />
            <span className="flex-1 text-[11px] leading-snug text-muted">
              {DECISIONS[kind].oneLiner}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
