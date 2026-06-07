"use client";

import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";

export interface UsePiiClassificationArgs {
  since: string;
  packId?: string;
}

/**
 * Fetches data-classification (PII) dispositions from
 * `governance.piiClassificationStats` (ADR-117) — counts of REWRITE
 * redactions and REFUSE blocks bucketed by sensitivity tier.
 */
export function usePiiClassification(args: UsePiiClassificationArgs) {
  return useQuery({
    queryKey: ["governance", "piiClassificationStats", args],
    queryFn: () =>
      trpc.governance.piiClassificationStats.query({
        since: args.since,
        ...(args.packId ? { packId: args.packId } : {}),
      }),
    retry: false,
  });
}
