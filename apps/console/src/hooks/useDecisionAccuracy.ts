"use client";

import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";

export interface UseDecisionAccuracyArgs {
  since: string;
  until?: string;
}

/**
 * Fetches the decision-accuracy aggregate. Treats PRECONDITION_FAILED as an
 * empty state (no outcome sink configured) rather than an error so the
 * console can render a graceful "not wired" tile.
 */
export function useDecisionAccuracy(args: UseDecisionAccuracyArgs) {
  return useQuery({
    queryKey: ["governance", "decisionAccuracy", args],
    queryFn: () =>
      trpc.governance.decisionAccuracy.query({
        since: args.since,
        ...(args.until ? { until: args.until } : {}),
      }),
    retry: false,
  });
}
