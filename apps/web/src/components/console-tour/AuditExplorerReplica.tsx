"use client";

import { AuditTableReplica } from "./AuditTableReplica";
import { useSimulatedTail } from "./useSimulatedTail";
import { ChartReveal } from "./ChartReveal";
import { ConsoleChrome } from "@/components/console-kit/chrome/ConsoleChrome";
import { CONSOLE_REPLICA_RECORDS } from "@/lib/console-replica-records";
import { cn } from "@/lib/cn";

/**
 * Audit Explorer replica — the flagship /console surface.
 *
 * Composes the {@link ConsoleChrome} honesty boundary (standing "Illustrative
 * replica · sample data" label, MANDATORY) with a header carrying the
 * `SIMULATED` transport badge (MANDATORY — never "live"/"polling") and a "Play
 * simulation" toggle, over an {@link AuditTableReplica} fed by the
 * {@link useSimulatedTail} animation.
 *
 * No network exists: the tail reveals the committed `CONSOLE_REPLICA_RECORDS`
 * fixture on a scripted timer. Under prefers-reduced-motion the full set
 * renders statically (no timed arrivals) and the Play toggle is disabled with
 * a note.
 */
export function AuditExplorerReplica() {
  const tail = useSimulatedTail({ seed: CONSOLE_REPLICA_RECORDS });

  return (
    <ConsoleChrome caption="audit-explorer · localhost:5180">
      <div className="flex flex-col gap-3">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-console-edge pb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-[10px] uppercase tracking-section text-console-muted">
              Audit Explorer
            </h2>
            {/* MANDATORY honesty badge — the transport is SIMULATED, never
                "live"/"polling". Do not relabel. */}
            <span
              className="inline-flex items-center gap-1.5 rounded-sm border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300"
              title="This tail is a client-side simulation of committed sample data — not a live feed."
            >
              <span
                aria-hidden="true"
                className={cn(
                  "h-1.5 w-1.5 rounded-full bg-amber-400",
                  tail.isPlaying && "animate-pulse",
                )}
              />
              SIMULATED
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-wider text-console-faint tabular-nums">
              {tail.revealed} / {tail.total} record
              {tail.total === 1 ? "" : "s"}
            </span>
            {tail.reducedMotion ? (
              <span
                className="text-[10px] uppercase tracking-wider text-console-faint"
                title="Reduced-motion is on: the full sample set is shown at once, with no timed arrivals."
              >
                static (reduced motion)
              </span>
            ) : (
              <button
                type="button"
                onClick={tail.togglePlay}
                aria-pressed={tail.isPlaying}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-[10px] font-medium uppercase tracking-wide transition-colors",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400/60",
                  tail.isPlaying
                    ? "border-console-edge bg-console-panel text-console-muted hover:bg-console-edge/40"
                    : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20",
                )}
              >
                <span aria-hidden="true">{tail.isPlaying ? "❚❚" : "▶"}</span>
                {tail.isPlaying
                  ? "Pause simulation"
                  : tail.complete
                    ? "Replay simulation"
                    : "Play simulation"}
              </button>
            )}
          </div>
        </header>

        {tail.reducedMotion ? (
          <p className="text-[11px] text-console-faint">
            Reduced-motion is enabled — the full sample feed is shown at once,
            with no timed arrivals.
          </p>
        ) : null}

        <ChartReveal>
          <AuditTableReplica
            records={tail.records}
            highlightHashes={tail.newHashes}
          />
        </ChartReveal>
      </div>
    </ConsoleChrome>
  );
}
