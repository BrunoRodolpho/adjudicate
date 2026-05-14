"use client";

import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";

export interface UseOutcomeDistributionArgs {
  since: string;
  bucket: "hour" | "day";
  until?: string;
}

/**
 * Fetches the time-bucketed Decision distribution from `governance.outcomeDistribution`.
 * Cached per `(since, bucket, until)` triple via TanStack Query.
 */
export function useOutcomeDistribution(args: UseOutcomeDistributionArgs) {
  return useQuery({
    queryKey: ["governance", "outcomeDistribution", args],
    queryFn: () =>
      trpc.governance.outcomeDistribution.query({
        since: args.since,
        bucket: args.bucket,
        ...(args.until ? { until: args.until } : {}),
      }),
  });
}
