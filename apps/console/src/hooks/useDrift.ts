"use client";

import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";

/**
 * Drift hooks (ADR-132). The unified `/drift` page reads two governance signals:
 *
 *   - `useBehavioralDrift` (re-exported from its own module) — the single-point
 *     statistical snapshot (per-dimension TVD + alerts) from
 *     `governance.behavioralDrift`. Drives Active Drifts + Dimensions.
 *   - `useDriftTimeline` — the bounded TVD/alert TIME-SERIES from
 *     `governance.driftHistory`. Drives the Timeline.
 *
 * Both `retry: false` so a PRECONDITION_FAILED (feature not wired) surfaces
 * immediately as React Query's error state rather than retrying.
 */

export { useBehavioralDrift } from "./useBehavioralDrift";

/** Number of most-recent timeline points to fetch for the Drift Timeline. */
export const DRIFT_TIMELINE_LIMIT = 100;

/** Fetches the bounded drift-history time-series from `governance.driftHistory`. */
export function useDriftTimeline(limit: number = DRIFT_TIMELINE_LIMIT) {
  return useQuery({
    queryKey: ["governance", "driftHistory", limit],
    queryFn: () => trpc.governance.driftHistory.query({ limit }),
    retry: false,
  });
}
