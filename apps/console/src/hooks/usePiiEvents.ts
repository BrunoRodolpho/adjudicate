"use client";

import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";

export type PiiSensitivityLevel = "low" | "medium" | "high" | "critical";
export type PiiDisposition = "redacted" | "blocked";

export interface UsePiiEventsArgs {
  since: string;
  until?: string;
  sensitivityLevel?: PiiSensitivityLevel;
  disposition?: PiiDisposition;
  packId?: string;
  limit?: number;
}

/**
 * Fetches event-level data-classification (PII) dispositions from
 * `governance.piiEvents` (ADR-129) — the per-event drill-down behind the
 * aggregate `piiClassificationStats` panel. Each event carries only
 * non-sensitive metadata (intentHash, kinds, sensitivity, disposition) so an
 * operator can pivot to the Decision Detail; redacted values never appear.
 *
 * The procedure requires an authenticated actor (UNAUTHORIZED otherwise),
 * which surfaces through React Query's error state.
 */
export function usePiiEvents(args: UsePiiEventsArgs) {
  return useQuery({
    queryKey: ["governance", "piiEvents", args],
    queryFn: () =>
      trpc.governance.piiEvents.query({
        since: args.since,
        ...(args.until ? { until: args.until } : {}),
        ...(args.sensitivityLevel
          ? { sensitivityLevel: args.sensitivityLevel }
          : {}),
        ...(args.disposition ? { disposition: args.disposition } : {}),
        ...(args.packId ? { packId: args.packId } : {}),
        ...(args.limit ? { limit: args.limit } : {}),
      }),
    retry: false,
  });
}
