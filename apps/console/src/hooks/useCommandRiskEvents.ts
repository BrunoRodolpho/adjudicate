"use client";

import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";

export type CommandRiskCategory = "destructive" | "credential" | "network";
export type CommandRiskDisposition = "refuse" | "rewrite" | "confirm";

export interface UseCommandRiskEventsArgs {
  since: string;
  until?: string;
  category?: CommandRiskCategory;
  disposition?: CommandRiskDisposition;
  packId?: string;
  limit?: number;
}

/**
 * Fetches event-level command-risk dispositions from
 * `governance.commandRiskEvents` (ADR-134) — the per-event drill-down behind the
 * aggregate `commandRisk` panel. Each event carries only non-sensitive metadata
 * (intentHash, kinds, category, disposition) so an operator can pivot to the
 * Decision Detail.
 *
 * SECURITY: the raw command, sanitized command, stripped flags, and matched rule
 * ids NEVER appear — the event schema has no field that could carry the
 * (tainted, secret-bearing) command text.
 *
 * The procedure requires an authenticated actor (UNAUTHORIZED otherwise), which
 * surfaces through React Query's error state.
 */
export function useCommandRiskEvents(args: UseCommandRiskEventsArgs) {
  return useQuery({
    queryKey: ["governance", "commandRiskEvents", args],
    queryFn: () =>
      trpc.governance.commandRiskEvents.query({
        since: args.since,
        ...(args.until ? { until: args.until } : {}),
        ...(args.category ? { category: args.category } : {}),
        ...(args.disposition ? { disposition: args.disposition } : {}),
        ...(args.packId ? { packId: args.packId } : {}),
        ...(args.limit ? { limit: args.limit } : {}),
      }),
    retry: false,
  });
}
