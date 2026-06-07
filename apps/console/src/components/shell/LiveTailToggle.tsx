"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { useLiveTailContext } from "./LiveTailContext";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";

/**
 * Live-tail control pill rendered in the TopBar.
 *
 * Reads state from the `<LiveTailProvider>` mounted at the shell so the
 * Audit Explorer page can subscribe to the same stream the toggle
 * controls. Three states are surfaced:
 *
 *   - "Live"      — polling, last update is fresh (within 4s)
 *   - "Stale"     — polling but the most recent poll is older than 4s
 *   - "Paused"    — operator-paused; no requests fire
 *
 * The time-ago text refreshes every second via a local interval so
 * "3s ago" is honest without re-rendering the entire tree on each tick.
 */
export function LiveTailToggle() {
  const { isPaused, togglePause, lastUpdate, enabled, setEnabled, transport } =
    useLiveTailContext();
  const [, force] = useState(0);

  // Tick the "Ns ago" text once per second.
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => force((n) => (n + 1) & 0xff), 1000);
    return () => clearInterval(id);
  }, [enabled]);

  if (!enabled) {
    return (
      <button
        type="button"
        onClick={() => setEnabled(true)}
        className="flex items-center gap-1 rounded-sm border border-edge bg-canvas px-2 py-1 text-faint hover:border-ink/30 hover:text-ink"
        title="Start polling for new audit records every 2s"
      >
        <Play size={11} />
        <span>Live tail</span>
      </button>
    );
  }

  const ageMs = lastUpdate ? Date.now() - new Date(lastUpdate).getTime() : 0;
  const isStale = !isPaused && ageMs > 4000;

  const tone = isPaused
    ? "border-amber-700/40 bg-amber-500/5 text-amber-300"
    : isStale
      ? "border-amber-700/40 bg-amber-500/5 text-amber-300"
      : "border-emerald-700/40 bg-emerald-500/5 text-emerald-300";

  return (
    <div className="flex items-center gap-1 text-[11px]">
      <button
        type="button"
        onClick={togglePause}
        className={cn(
          "flex items-center gap-1 rounded-sm border px-2 py-1",
          tone,
        )}
        title={
          isPaused
            ? "Resume live tail"
            : transport === "sse"
              ? "Real-time stream (SSE) — pause"
              : "Polling every 2s — pause"
        }
      >
        {isPaused ? <Play size={11} /> : <Pause size={11} />}
        <span>
          {isPaused ? "Paused" : transport === "sse" ? "Live · stream" : "Live"}
        </span>
      </button>
      <span className="text-faint tabular-nums">
        {lastUpdate ? formatRelative(lastUpdate) : "—"}
      </span>
      <button
        type="button"
        onClick={() => setEnabled(false)}
        className="text-faint hover:text-ink"
        title="Stop live tail"
        aria-label="Stop live tail"
      >
        ×
      </button>
    </div>
  );
}
