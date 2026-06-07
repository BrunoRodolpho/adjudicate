"use client";

import { createElement, useCallback, useMemo, useState, type FC } from "react";

type Politeness = "polite" | "assertive";

export interface UseAriaLiveResult {
  /**
   * The message currently held in the live region. Mostly useful for tests and
   * debugging; rendering is handled by {@link AriaLiveRegion}.
   */
  readonly message: string;
  /**
   * Push a new announcement into the live region. Re-announcing the *same*
   * string is supported: the value is briefly cleared and re-set on the next
   * microtask so screen readers treat it as a fresh change instead of a no-op.
   */
  announce(next: string): void;
  /**
   * A render-once component that mounts the `aria-live` region. It is visually
   * hidden via the same `sr-only` clip-rect technique as `VisuallyHidden`,
   * carries no props, and is stable across renders, so it is safe to drop into
   * the app shell a single time.
   */
  readonly AriaLiveRegion: FC;
}

/**
 * Drives a single polite `aria-live` region for dynamic announcements such as
 * "3 new audit records" or "kill switch engaged". The region is visually
 * hidden (the same `sr-only` clip-rect technique as `VisuallyHidden`) and
 * `aria-atomic`, so the whole message is read on each change. Mount the
 * returned `AriaLiveRegion` once at the app shell
 * and call {@link UseAriaLiveResult.announce} from anywhere holding this hook's
 * result.
 *
 * No clock or RNG is touched during render — the re-announce nudge for repeated
 * messages is scheduled with a microtask and only runs in response to an
 * explicit `announce` call.
 */
export function useAriaLive(politeness: Politeness = "polite"): UseAriaLiveResult {
  const [message, setMessage] = useState("");

  const announce = useCallback((next: string) => {
    setMessage((prev) => {
      if (prev === next && next !== "") {
        // Same text would not register as a change; clear, then re-set so the
        // region's content genuinely transitions and is re-read.
        queueMicrotask(() => setMessage(next));
        return "";
      }
      return next;
    });
  }, []);

  const AriaLiveRegion = useMemo<FC>(() => {
    const Region: FC = () =>
      createElement(
        "div",
        {
          // `sr-only` hides the region visually while keeping it in the
          // accessibility tree (same clip-rect technique as VisuallyHidden).
          className: "sr-only",
          "aria-live": politeness,
          "aria-atomic": "true",
          role: "status",
          "data-testid": "aria-live-region",
        },
        message,
      );
    Region.displayName = "AriaLiveRegion";
    return Region;
  }, [message, politeness]);

  return { message, announce, AriaLiveRegion };
}
