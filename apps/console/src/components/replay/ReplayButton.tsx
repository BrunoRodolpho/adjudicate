"use client";

import { Play } from "lucide-react";
import { useState, type MouseEvent } from "react";
import { cn } from "@/lib/cn";
import { ReplayDialog } from "./ReplayDialog";

interface Props {
  intentHash: string;
  /**
   * Intent kind from the audit record. Lets the Replay dialog show
   * the active Pack badge from the moment it opens, instead of
   * waiting for the round-trip to resolve. Optional so callers that
   * don't have the record handy still work.
   */
  intentKind?: string;
  variant?: "icon" | "button";
  className?: string;
}

/**
 * Replay trigger. Two variants:
 *   - "icon"   : compact Play icon for table row actions. Stops click
 *                propagation so the table's row-click navigation
 *                doesn't fire alongside.
 *   - "button" : full chip with label for detail-page headers and
 *                similar prominent placements.
 *
 * The Dialog instance is owned per-button. State is local; XState lives
 * inside the Dialog. This keeps the component tree decoupled — no
 * global context, no top-level provider needed.
 */
export function ReplayButton({
  intentHash,
  intentKind,
  variant = "button",
  className,
}: Props) {
  const [open, setOpen] = useState(false);

  const handleOpen = (e: MouseEvent) => {
    e.stopPropagation();
    setOpen(true);
  };

  if (variant === "icon") {
    return (
      <>
        <button
          type="button"
          onClick={handleOpen}
          className={cn(
            "rounded-sm p-1 text-faint transition-colors hover:bg-edge hover:text-ink",
            className,
          )}
          title="Replay this decision"
          aria-label="Replay this decision"
        >
          <Play size={11} />
        </button>
        {open ? (
          <ReplayDialog
            intentHash={intentHash}
            intentKind={intentKind}
            onClose={() => setOpen(false)}
          />
        ) : null}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className={cn(
          "flex items-center gap-1.5 rounded-sm border border-edge bg-canvas px-2 py-1 text-[11px] uppercase tracking-wider text-muted transition-colors hover:border-ink/30 hover:text-ink",
          className,
        )}
      >
        <Play size={11} />
        Replay
      </button>
      {open ? (
        <ReplayDialog
          intentHash={intentHash}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
