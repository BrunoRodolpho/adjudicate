"use client";

import { useEffect, useRef } from "react";
import { useAriaLive } from "@/hooks/useAriaLive";
import { useLiveTailContext } from "./LiveTailContext";

/**
 * Screen-reader announcer for the live tail (ADR-128). Mounts a single polite
 * `aria-live` region and announces (a) transport changes — real-time stream vs
 * polling fallback — and (b) freshly-arrived audit records, so non-visual users
 * learn that new rows appeared without watching the table. Renders nothing
 * visible. Must live inside `<LiveTailProvider>`.
 */
export function LiveTailAnnouncer() {
  const { announce, AriaLiveRegion } = useAriaLive("polite");
  const { enabled, transport, newHashes } = useLiveTailContext();
  const prevTransport = useRef(transport);

  useEffect(() => {
    if (!enabled) return;
    if (prevTransport.current === transport) return;
    prevTransport.current = transport;
    if (transport === "sse") {
      announce("Live tail connected: real-time stream.");
    } else if (transport === "polling") {
      announce("Live tail connected: polling fallback.");
    }
  }, [enabled, transport, announce]);

  useEffect(() => {
    if (!enabled || newHashes.size === 0) return;
    const n = newHashes.size;
    announce(`${n} new audit ${n === 1 ? "record" : "records"}.`);
  }, [enabled, newHashes, announce]);

  return <AriaLiveRegion />;
}
