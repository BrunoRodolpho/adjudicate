"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AuditRecord } from "@adjudicate/core";
import { gateway } from "@/lib/gateway/client";
import type { AuditQuery } from "@/types/adjudicate";

const POLL_INTERVAL_MS = 2000;
const TAIL_LIMIT = 50;
/** Maximum records kept in the live-tail window. Caps memory under steady state. */
const MAX_RECORDS = 500;
/** Server-Sent Events endpoint backed by the AuditEventBus (ADR-128). */
const STREAM_URL = "/api/admin/stream";

/** Active transport for the live tail. */
export type LiveTailTransport = "connecting" | "sse" | "polling";

export interface LiveTailState {
  /** Records aggregated across arrivals, deduped by `intentHash`, newest-first. */
  readonly records: readonly AuditRecord[];
  /** Whether the tail is paused. The UI controls this via {@link togglePause}. */
  readonly isPaused: boolean;
  /** Toggle the tail on/off — paused mode preserves the records already seen. */
  togglePause(): void;
  /** ISO timestamp of the last record arrival, or `null` before the first. */
  readonly lastUpdate: string | null;
  /**
   * Intent hashes that arrived most recently. The Audit Explorer uses this to
   * apply a 1.5s row highlight to newly-arrived rows.
   */
  readonly newHashes: ReadonlySet<string>;
  /**
   * Which transport is active: a live SSE stream, the polling fallback, or
   * still establishing the connection. Surfaced so the UI can show an honest
   * "live" vs "polling" indicator.
   */
  readonly transport: LiveTailTransport;
}

interface UseLiveTailOptions {
  /** When false, the tail does nothing. Used to gate the cost behind a UI switch. */
  readonly enabled: boolean;
  readonly filters?: AuditQuery;
}

/**
 * Live-tail audit stream.
 *
 * Transport (ADR-128): prefers a real-time **Server-Sent Events** stream from
 * `/api/admin/stream`, which fans out the `AuditEventBus`. That endpoint is
 * only available when a live bus is wired (`REDIS_URL` → a kernel publishes on
 * the Redis channel); otherwise it returns 501 and this hook falls back to
 * **2-second polling** against the durable store — the same Redis-or-fallback
 * posture the kill-switch coordination uses. A network/stream error also drops
 * to polling, so the operator's "show me new records as they arrive" workflow
 * never silently dies.
 *
 * Merge semantics are identical on both transports: arrivals are deduped by
 * `intentHash`, prepended newest-first, and the list is capped at
 * {@link MAX_RECORDS} to bound memory.
 *
 * The hook intentionally does NOT live inside TanStack Query — the merge
 * semantics (dedupe + bounded ring + streaming arrivals) don't map onto a
 * simple cache.
 */
export function useLiveTail(options: UseLiveTailOptions): LiveTailState {
  const { enabled } = options;
  const [records, setRecords] = useState<readonly AuditRecord[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [newHashes, setNewHashes] = useState<ReadonlySet<string>>(new Set());
  const [transport, setTransport] = useState<LiveTailTransport>("connecting");

  // Hold filters in a ref so the loop reads the latest value without resetting
  // the connection on every render. `knownHashesRef` tracks what's in the ring
  // so freshly-seen records can be highlighted.
  const filtersRef = useRef<AuditQuery>(options.filters ?? {});
  filtersRef.current = options.filters ?? {};
  const knownHashesRef = useRef<Set<string>>(new Set());

  // Merge newest-first arrivals into the bounded ring, dedupe by intentHash,
  // and surface freshly-seen hashes for the row highlight.
  const ingest = useCallback((arrivals: readonly AuditRecord[]) => {
    if (arrivals.length === 0) return;
    const fresh = new Set<string>();
    for (const rec of arrivals) {
      if (!knownHashesRef.current.has(rec.intentHash)) fresh.add(rec.intentHash);
    }
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
      const capped = merged.slice(0, MAX_RECORDS);
      // Bound the known-hash set to what we actually keep, so it can't grow
      // without limit over a long-lived SSE connection.
      knownHashesRef.current = new Set(capped.map((r) => r.intentHash));
      return capped;
    });
    if (fresh.size > 0) setNewHashes(fresh);
    setLastUpdate(new Date().toISOString());
  }, []);

  useEffect(() => {
    if (!enabled || isPaused) return;
    const controller = new AbortController();
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;

    const poll = async () => {
      try {
        const result = await gateway.queryAudit({
          ...filtersRef.current,
          limit: TAIL_LIMIT,
        });
        ingest(result.records);
      } catch {
        // Transient failure — the next tick retries. lastUpdate stays stale,
        // which the UI surfaces via the time-ago text.
      }
    };

    const startPolling = () => {
      if (stopped || pollTimer !== null) return;
      setTransport("polling");
      // Kick an immediate poll so the operator never sees an empty pane.
      void poll();
      pollTimer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    };

    const parseSseBuffer = (buffer: string): { rest: string } => {
      let rest = buffer;
      for (;;) {
        const sep = rest.indexOf("\n\n");
        if (sep === -1) break;
        const rawEvent = rest.slice(0, sep);
        rest = rest.slice(sep + 2);
        const dataLines: string[] = [];
        for (const line of rawEvent.split("\n")) {
          if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
        }
        if (dataLines.length === 0) continue; // comment / heartbeat / id-only
        try {
          ingest([JSON.parse(dataLines.join("\n")) as AuditRecord]);
        } catch {
          // Skip a malformed frame rather than tearing down the stream.
        }
      }
      return { rest };
    };

    const startSse = async () => {
      try {
        const res = await fetch(STREAM_URL, {
          signal: controller.signal,
          headers: { accept: "text/event-stream" },
        });
        if (!res.ok || !res.body) {
          // 501 (no live bus configured) or any non-OK → polling fallback.
          startPolling();
          return;
        }
        setTransport("sse");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          buffer = parseSseBuffer(buffer).rest;
        }
        // Server closed the stream. If the operator didn't stop us, fall back.
        if (!stopped) startPolling();
      } catch {
        // Aborted by cleanup (navigation/pause) → do nothing. Any other error
        // (network, stream) → polling fallback.
        if (controller.signal.aborted || stopped) return;
        startPolling();
      }
    };

    setTransport("connecting");
    void startSse();

    return () => {
      stopped = true;
      controller.abort();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [enabled, isPaused, ingest]);

  // Clear the "new" set 1.5s after each arrival so the row-highlight fades.
  useEffect(() => {
    if (newHashes.size === 0) return;
    const id = setTimeout(() => setNewHashes(new Set()), 1500);
    return () => clearTimeout(id);
  }, [newHashes]);

  const togglePause = useCallback(() => setIsPaused((p) => !p), []);

  return { records, isPaused, togglePause, lastUpdate, newHashes, transport };
}
