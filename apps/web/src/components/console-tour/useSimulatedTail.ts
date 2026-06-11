"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import type { AuditRecord } from "@adjudicate/core";
import {
  CONSOLE_REPLICA_TAIL,
  type ConsoleReplicaTailStep,
} from "@/lib/console-replica-tail-script";

/**
 * Simulated live-tail driver for the /console Audit Explorer replica.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THIS IS NOT A LIVE FEED. apps/web opens NO SSE/WebSocket/poll connection and
 * holds no admin credentials (it never reads DATABASE_URL/REDIS_URL/admin
 * tokens, never fetches /api/admin/* or any stream endpoint). This hook is a
 * client-side ANIMATION that reveals the committed `CONSOLE_REPLICA_RECORDS`
 * fixture one row at a time on the {@link CONSOLE_REPLICA_TAIL} schedule. Its
 * transport label is the literal {@link SIMULATED_TRANSPORT} — never
 * "live"/"polling".
 *
 * It is the apps/console `useLiveTail` PURE core, with ALL transport
 * (SSE/fetch/poll) stripped out:
 *   - merge semantics: arrivals are deduped by `intentHash`, prepended
 *     newest-first;
 *   - `newHashes` surfaces freshly-seen hashes for a 1.5s row highlight;
 *   - the timer (`setTimeout`) walks the scripted gaps instead of a network.
 *
 * Reduced motion: under `prefers-reduced-motion: reduce` there are NO timed
 * arrivals — the full record set renders statically from the first frame and
 * {@link SimulatedTailState.reducedMotion} is true so the UI can show a note.
 */

/** The only transport label this hook ever reports. Never "live"/"polling". */
export const SIMULATED_TRANSPORT = "SIMULATED" as const;

export interface SimulatedTailState {
  /** Records revealed so far, deduped by `intentHash`, newest-first. */
  readonly records: readonly AuditRecord[];
  /** Whether the simulation timer is currently running. */
  readonly isPlaying: boolean;
  /** Start/stop the scripted arrival timer. No-op under reduced motion. */
  togglePlay(): void;
  /**
   * Intent hashes that arrived most recently. The table applies a 1.5s row
   * highlight to these. Always empty under reduced motion (nothing "arrives").
   */
  readonly newHashes: ReadonlySet<string>;
  /** The literal transport label, "SIMULATED". Surfaced for the honesty badge. */
  readonly transport: typeof SIMULATED_TRANSPORT;
  /** Count of records revealed out of the full scripted set. */
  readonly revealed: number;
  /** Total records in the scripted feed. */
  readonly total: number;
  /** True once every scripted arrival has been revealed. */
  readonly complete: boolean;
  /**
   * True when `prefers-reduced-motion: reduce` is active — the full set is
   * rendered statically with no timed arrivals. The UI surfaces a note.
   */
  readonly reducedMotion: boolean;
}

interface UseSimulatedTailOptions {
  /**
   * The full record set, newest-first (seed from CONSOLE_REPLICA_RECORDS). The
   * scripted tail references these by `intentHash`; any step whose hash is not
   * present is skipped.
   */
  readonly seed: readonly AuditRecord[];
  /**
   * The scripted arrival sequence (oldest-first). Defaults to the committed
   * {@link CONSOLE_REPLICA_TAIL}.
   */
  readonly script?: readonly ConsoleReplicaTailStep[];
}

/**
 * Merge newest-first arrivals into the revealed set, deduping by `intentHash`.
 * Pure — mirrors the apps/console `useLiveTail` ingest, sans the bounded ring
 * (the replica feed is a fixed 12 records, so no cap is needed).
 */
function mergeNewestFirst(
  prev: readonly AuditRecord[],
  arrivals: readonly AuditRecord[],
): AuditRecord[] {
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
  return merged;
}

export function useSimulatedTail(
  options: UseSimulatedTailOptions,
): SimulatedTailState {
  const { seed } = options;
  const script = options.script ?? CONSOLE_REPLICA_TAIL;
  const reduce = useReducedMotion() ?? false;

  // Resolve each scripted step to its record once. Steps whose hash is missing
  // from the seed are dropped (the script references real fixture hashes, so
  // this is defensive only).
  const scripted = useMemo<readonly AuditRecord[]>(() => {
    const byHash = new Map(seed.map((r) => [r.intentHash, r]));
    const out: AuditRecord[] = [];
    for (const step of script) {
      const rec = byHash.get(step.intentHash);
      if (rec) out.push(rec);
    }
    return out;
  }, [seed, script]);

  const total = scripted.length;

  // Reduced motion: render the full set statically, newest-first, from frame
  // one — the scripted feed is oldest-first, so reverse it back to feed order.
  const staticSet = useMemo<readonly AuditRecord[]>(
    () => [...scripted].reverse(),
    [scripted],
  );

  // Default to the FULL set so the replica looks alive immediately — a passive
  // visitor must never land on an empty console. Pressing Play resets to empty
  // and re-streams the arrivals as a "live tail" replay.
  const [records, setRecords] = useState<readonly AuditRecord[]>(staticSet);
  const [isPlaying, setIsPlaying] = useState(false);
  const [newHashes, setNewHashes] = useState<ReadonlySet<string>>(new Set());
  // Index of the NEXT scripted step to reveal. Held in a ref so the timer loop
  // reads the latest position without re-arming on every reveal.
  const cursorRef = useRef(0);

  const ingest = useCallback((rec: AuditRecord) => {
    setRecords((prev) => mergeNewestFirst(prev, [rec]));
    setNewHashes(new Set([rec.intentHash]));
  }, []);

  // The scripted-arrival timer. Only runs when playing AND motion is allowed.
  // Each tick reveals one record then arms the next gap; at the end it stops.
  useEffect(() => {
    if (reduce || !isPlaying) return;
    if (cursorRef.current >= scripted.length) {
      setIsPlaying(false);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const step = () => {
      if (cancelled) return;
      const i = cursorRef.current;
      const rec = scripted[i];
      if (!rec) {
        setIsPlaying(false);
        return;
      }
      ingest(rec);
      cursorRef.current = i + 1;
      const next = scripted[cursorRef.current];
      if (!next) {
        setIsPlaying(false);
        return;
      }
      // Find the gap for the NEXT arrival from the script (relative inter-
      // arrival delay). Fall back to a sane default if the script is shorter.
      const nextScript = script[cursorRef.current];
      const afterMs = nextScript?.afterMs ?? 1000;
      timer = setTimeout(step, afterMs);
    };

    // Kick the first reveal immediately so toggling Play feels responsive; the
    // first scripted gap is 0 anyway.
    const firstGap = script[cursorRef.current]?.afterMs ?? 0;
    timer = setTimeout(step, firstGap);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [reduce, isPlaying, scripted, script, ingest]);

  // Clear the highlight 1.5s after each arrival so the row fades back.
  useEffect(() => {
    if (newHashes.size === 0) return;
    const id = setTimeout(() => setNewHashes(new Set()), 1500);
    return () => clearTimeout(id);
  }, [newHashes]);

  const togglePlay = useCallback(() => {
    if (reduce) return; // No timed arrivals under reduced motion.
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    // Begin a fresh replay: clear the table and stream the arrivals from the top.
    cursorRef.current = 0;
    setRecords([]);
    setNewHashes(new Set());
    setIsPlaying(true);
  }, [reduce, isPlaying]);

  const revealed = reduce ? total : records.length;
  const complete = !reduce && revealed >= total && total > 0;

  return {
    records: reduce ? staticSet : records,
    isPlaying,
    togglePlay,
    newHashes,
    transport: SIMULATED_TRANSPORT,
    revealed,
    total,
    complete,
    reducedMotion: reduce,
  };
}
