"use client";

import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";

export interface UseCommandRiskArgs {
  since: string;
  until?: string;
  packId?: string;
}

/**
 * Fetches command-risk dispositions from `governance.commandRisk` (ADR-134,
 * ADR-123) — counts of REFUSE blocks, sanitizing REWRITEs, and CONFIRM routings
 * bucketed by `(category × disposition)`.
 *
 * SECURITY: the wire result carries ONLY the closed-enum category + disposition
 * and integer counts. The raw command string (which may contain secrets) is
 * never read into the result by the handler nor permitted by its `.output()`
 * schema, so it cannot reach this hook or any UI built on it.
 */
export function useCommandRisk(args: UseCommandRiskArgs) {
  return useQuery({
    queryKey: ["governance", "commandRisk", args],
    queryFn: () =>
      trpc.governance.commandRisk.query({
        since: args.since,
        ...(args.until ? { until: args.until } : {}),
        ...(args.packId ? { packId: args.packId } : {}),
      }),
    retry: false,
  });
}
