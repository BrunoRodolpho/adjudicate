"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AuditRecord } from "@adjudicate/core";
import { useLiveTail, type LiveTailTransport } from "@/hooks/useLiveTail";

interface LiveTailContextValue {
  readonly enabled: boolean;
  setEnabled(value: boolean): void;
  readonly isPaused: boolean;
  togglePause(): void;
  readonly lastUpdate: string | null;
  readonly records: readonly AuditRecord[];
  readonly newHashes: ReadonlySet<string>;
  /** Active transport — "sse" (live) | "polling" (fallback) | "connecting". */
  readonly transport: LiveTailTransport;
}

const LiveTailContext = createContext<LiveTailContextValue | null>(null);

/**
 * Wraps the console shell so the `<LiveTailToggle>` in the TopBar and
 * the Audit Explorer body see the same polling state.
 *
 * The hook only starts polling when `enabled` is true — so the rest of
 * the console (Dashboard, Governance, etc.) never pays the request cost.
 */
export function LiveTailProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const tail = useLiveTail({ enabled });
  const value = useMemo<LiveTailContextValue>(
    () => ({
      enabled,
      setEnabled,
      isPaused: tail.isPaused,
      togglePause: tail.togglePause,
      lastUpdate: tail.lastUpdate,
      records: tail.records,
      newHashes: tail.newHashes,
      transport: tail.transport,
    }),
    [enabled, tail],
  );
  return (
    <LiveTailContext.Provider value={value}>
      {children}
    </LiveTailContext.Provider>
  );
}

export function useLiveTailContext(): LiveTailContextValue {
  const ctx = useContext(LiveTailContext);
  if (!ctx) {
    throw new Error(
      "useLiveTailContext must be used within a <LiveTailProvider>",
    );
  }
  return ctx;
}
