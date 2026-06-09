"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { DecisionKind } from "@adjudicate/core";
import { EASE_OUT, REVEAL_VIEWPORT } from "@/lib/motion";
import { cn } from "@/lib/cn";

/**
 * ConsoleAuditRows — the animated body of the Step-4 Audit Explorer replica.
 *
 * Client component. The rows slide in from the left (transform translateX +
 * opacity) staggered top-to-bottom as the table scrolls into view, so the live
 * tail reads as if receipts are landing one after another. The highlighted
 * REWRITE row ("your receipt" from Step 3) is gently emphasised after the rows
 * settle — a single soft scale pulse that draws the eye without bouncing.
 *
 * Reduced-motion-safe: under `prefers-reduced-motion` every row renders
 * static and fully visible (no translate, no stagger, no pulse). The REWRITE
 * row keeps its colour/tint emphasis — that's a static visual, not motion.
 *
 * Transform/opacity-only (translateX + scale + opacity); no layout shift. The
 * row data is computed server-side (real intentHash for the highlighted row)
 * and handed in as a serializable array.
 */

export interface AuditRow {
  readonly kind: DecisionKind;
  readonly intent: string;
  readonly hash: string;
  readonly highlight?: boolean;
}

// Dark-surface decision tokens — tuned for the zinc-950 console band so each
// outcome stays unmistakable. (Mirrors the maps StepConsole used inline.)
const DARK_CHIP: Record<DecisionKind, string> = {
  EXECUTE: "border-execute/40 bg-execute/15 text-execute",
  REFUSE: "border-refuse/40 bg-refuse/15 text-refuse",
  REWRITE: "border-rewrite/50 bg-rewrite/15 text-rewrite",
  DEFER: "border-defer/40 bg-defer/15 text-defer",
  ESCALATE: "border-escalate/40 bg-escalate/15 text-escalate",
  REQUEST_CONFIRMATION: "border-confirm/40 bg-confirm/15 text-confirm",
};

const DARK_BAR: Record<DecisionKind, string> = {
  EXECUTE: "bg-execute",
  REFUSE: "bg-refuse",
  REWRITE: "bg-rewrite",
  DEFER: "bg-defer",
  ESCALATE: "bg-escalate",
  REQUEST_CONFIRMATION: "bg-confirm",
};

const SHORT_LABEL: Record<DecisionKind, string> = {
  EXECUTE: "EXECUTE",
  REFUSE: "REFUSE",
  REWRITE: "REWRITE",
  DEFER: "DEFER",
  ESCALATE: "ESCALATE",
  REQUEST_CONFIRMATION: "CONFIRM?",
};

const ROW_STAGGER = 0.06; // 60ms per row, per AUDIT.md.

function shortHashDisplay(hash: string): string {
  return `${hash.slice(0, 10)}…`;
}

export function ConsoleAuditRows({
  rows,
}: {
  readonly rows: ReadonlyArray<AuditRow>;
}) {
  const reduce = useReducedMotion();

  if (reduce) {
    return (
      <ul className="divide-y divide-zinc-800/70">
        {rows.map((row, i) => (
          <li
            key={`${row.hash}-${i}`}
            className={cn(
              "relative grid grid-cols-[120px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3",
              row.highlight ? "bg-rewrite/[0.07]" : "",
            )}
          >
            <RowBody row={row} />
          </li>
        ))}
      </ul>
    );
  }

  // The REWRITE row's gentle emphasis fires once the rows have all entered.
  const pulseDelay = rows.length * ROW_STAGGER + 0.25;

  return (
    <motion.ul
      className="divide-y divide-zinc-800/70"
      initial="hidden"
      whileInView="visible"
      viewport={REVEAL_VIEWPORT}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: ROW_STAGGER } },
      }}
    >
      {rows.map((row, i) => (
        <motion.li
          key={`${row.hash}-${i}`}
          className={cn(
            "relative grid grid-cols-[120px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors",
            row.highlight ? "bg-rewrite/[0.07]" : "hover:bg-zinc-800/40",
          )}
          variants={{
            hidden: { opacity: 0, x: -20 },
            visible: row.highlight
              ? {
                  opacity: 1,
                  x: 0,
                  // Soft single pulse after entrance — emphasis, not a bounce.
                  scale: [1, 1.025, 1],
                  transition: {
                    opacity: { duration: 0.4, ease: EASE_OUT },
                    x: { duration: 0.4, ease: EASE_OUT },
                    scale: {
                      delay: pulseDelay,
                      duration: 0.6,
                      ease: EASE_OUT,
                      times: [0, 0.5, 1],
                    },
                  },
                }
              : {
                  opacity: 1,
                  x: 0,
                  transition: { duration: 0.4, ease: EASE_OUT },
                },
          }}
          // Keep the pulse from nudging neighbours: scale around the row's box.
          style={row.highlight ? { transformOrigin: "left center" } : undefined}
        >
          <RowBody row={row} />
        </motion.li>
      ))}
    </motion.ul>
  );
}

function RowBody({ row }: { readonly row: AuditRow }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-0 left-0 w-0.5",
          row.highlight ? DARK_BAR[row.kind] : "bg-transparent",
        )}
      />
      <span
        className={cn(
          "inline-flex w-fit items-center rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase tracking-section",
          DARK_CHIP[row.kind],
        )}
      >
        {SHORT_LABEL[row.kind]}
      </span>
      <span className="min-w-0 truncate font-mono text-[12px] text-zinc-300">
        {row.intent}
      </span>
      <span className="flex items-center gap-2 font-mono text-[11px] text-zinc-500">
        {shortHashDisplay(row.hash)}
        {row.highlight ? (
          <span className="rounded-sm bg-rewrite/20 px-1.5 py-0.5 text-[9px] uppercase tracking-section text-rewrite">
            your receipt
          </span>
        ) : null}
      </span>
    </>
  );
}
