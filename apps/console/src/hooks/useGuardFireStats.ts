"use client";

import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";

export interface UseGuardFireStatsArgs {
  since: string;
  packId?: string;
}

/**
 * Fetches per-guard fire counts from `governance.guardFireStats`. Throws
 * PRECONDITION_FAILED via tRPC when the route handler isn't wired with a
 * `GuardFireStats` instance — surface that to the user as a "not configured"
 * empty state rather than an error.
 */
export function useGuardFireStats(args: UseGuardFireStatsArgs) {
  return useQuery({
    queryKey: ["governance", "guardFireStats", args],
    queryFn: () =>
      trpc.governance.guardFireStats.query({
        since: args.since,
        ...(args.packId ? { packId: args.packId } : {}),
      }),
    // PRECONDITION_FAILED isn't an "error" worth retrying — it's a config gap.
    retry: false,
  });
}
