"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AuditRecord } from "@adjudicate/core";
import { gateway } from "@/lib/gateway/client";
import type { AuditQuery } from "@/types/adjudicate";

const POLL_INTERVAL_MS = 2000;
const TAIL_LIMIT = 50;
/** Maximum records kept in the live-tail window. Caps memory under steady state. */
const MAX_RECORDS = 500;

export interface LiveTailState {
  /** Records aggregated across polls, deduped by `intentHash`, newest-first. */
  readonly records: readonly AuditRecord[];
  /** Whether polling is paused. The UI controls this via {@link togglePause}. */
  readonly isPaused: boolean;
  /** Toggle polling on/off — paused mode preserves the records already seen. */
  togglePause(): void;
  /** ISO timestamp of the last successful poll, or `null` before the first. */
  readonly lastUpdate: string | null;
  /**
   * Intent hashes that arrived in the most recent poll. The Audit Explorer
   * uses this to apply a 1.5s row highlight to newly-arrived rows.
   */
  readonly newHashes: ReadonlySet<string>;
}

interface UseLiveTailOptions {
  /** When false, the hook does not poll. Used to gate the cost behind a UI switch. */
  readonly enabled: boolean;
  readonly filters?: AuditQuery;
}

/**
 * Live-tail audit polling.
 *
 * Real-time wire-level streaming (NATS WebSocket bridge) is reserved for
 * post-v0.6. This hook ships a 2-second polling fallback that satisfies
 * the operator's "show me new records as they arrive" workflow without
 * the wire surface.
 *
 * Contract:
 *   - Polls `gateway.queryAudit({ limit: 50 })` every {@link POLL_INTERVAL_MS}
 *     ms. The query is ordered newest-first by the gateway, so we keep
 *     prepending while deduping by `intentHash`.
 *   - When the hook is paused (or `enabled` is false), the interval is
 *     cleared (no wasted requests). Resuming kicks an immediate refetch
 *     so the operator sees a fresh window without waiting two seconds.
 *   - The merged list is capped at {@link MAX_RECORDS} to bound memory
 *     under steady state.
 *
 * The hook intentionally does NOT live inside TanStack Query — the merge
 * semantics (dedupe + bounded ring) don't map onto a simple cache.
 */
export function useLiveTail(options: UseLiveTailOptions): LiveTailState {
  const { enabled } = options;
  const [records, setRecords] = useState<readonly AuditRecord[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [newHashes, setNewHashes] = useState<ReadonlySet<string>>(new Set());

  // Hold filters and known-hashes in refs so the polling loop reads the
  // latest values without resetting the timer on every render.
  const filtersRef = useRef<AuditQuery>(options.filters ?? {});
  filtersRef.current = options.filters ?? {};
  const knownHashesRef = useRef<Set<string>>(new Set());

  const poll = useCallback(async () => {
    try {
      const result = await gateway.queryAudit({
        ...filtersRef.current,
        limit: TAIL_LIMIT,
      });
      const arrivals: AuditRecord[] = [];
      const fresh = new Set<string>();
      for (const rec of result.records) {
        if (!knownHashesRef.current.has(rec.intentHash)) {
          fresh.add(rec.intentHash);
        }
        arrivals.push(rec);
      }
      if (arrivals.length > 0) {
        setRecords((prev) => {
          const seen = new Set<string>();
          const merged: AuditRecord[] = [];
          for (const rec of arrivals) {
            if (seen.has(rec.intentHash)) continue;
            seen.add(rec.intentHash);
            merged.push(rec);
          }
          for (const rec of prev) {
            if (seen.has(rec.intentHash)) continue;
            seen.add(rec.intentHash);
            merged.push(rec);
          }
          knownHashesRef.current = seen;
          return merged.slice(0, MAX_RECORDS);
        });
      }
      // Only update `newHashes` when there are genuinely fresh entries —
      // otherwise we'd thrash setState and re-trigger the fade timer.
      if (fresh.size > 0) {
        setNewHashes(fresh);
      }
      setLastUpdate(new Date().toISOString());
    } catch {
      // Swallow — a transient failure must not throw out of an interval.
      // The next tick will retry; lastUpdate stays stale, which the UI
      // surfaces via the time-ago text.
    }
  }, []);

  useEffect(() => {
    if (!enabled || isPaused) return;
    // Kick an immediate poll so the operator never sees an empty pane
    // on first paint or after un-pausing.
    void poll();
    const id = setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled, isPaused, poll]);

  // Clear the "new" set 1.5s after each update so the row-highlight
  // animation fades.
  useEffect(() => {
    if (newHashes.size === 0) return;
    const id = setTimeout(() => setNewHashes(new Set()), 1500);
    return () => clearTimeout(id);
  }, [newHashes]);

  const togglePause = useCallback(() => setIsPaused((p) => !p), []);

  return { records, isPaused, togglePause, lastUpdate, newHashes };
}
