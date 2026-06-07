"use client";

import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";

/**
 * Fetches per-session token-budget telemetry (ADR-120) from
 * `governance.tokenBudget`. PRECONDITION_FAILED (no store wired) surfaces as a
 * "not configured" empty state.
 */
export function useTokenBudget(args: { sessionId?: string } = {}) {
  return useQuery({
    queryKey: ["governance", "tokenBudget", args],
    queryFn: () =>
      trpc.governance.tokenBudget.query(
        args.sessionId ? { sessionId: args.sessionId } : {},
      ),
    retry: false,
  });
}
