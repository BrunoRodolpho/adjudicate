"use client";

import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";

/**
 * Hooks for the Token Governance section (ADR-135).
 *
 * `useTokenBudgetByTenant` fetches the per-tenant view + the newest-first
 * budget-exhaustion timeline from `governance.tokenBudgetByTenant`.
 * `useTokenSessions` fetches the per-session view from the back-compat
 * `governance.tokenBudget`. PRECONDITION_FAILED (no store wired) surfaces as
 * React Query's error state so the page can render an honest "not configured"
 * message.
 *
 * These are TELEMETRY reads, outside the determinism boundary — they never feed
 * a kernel decision (enforcement lives in `createTokenBudgetGuard`, fed by
 * adopter state S).
 */
export interface UseTokenBudgetByTenantArgs {
  tenantId?: string;
  since?: string;
  eventLimit?: number;
}

export function useTokenBudgetByTenant(args: UseTokenBudgetByTenantArgs = {}) {
  return useQuery({
    queryKey: ["governance", "tokenBudgetByTenant", args],
    queryFn: () =>
      trpc.governance.tokenBudgetByTenant.query({
        ...(args.tenantId ? { tenantId: args.tenantId } : {}),
        ...(args.since ? { since: args.since } : {}),
        ...(args.eventLimit ? { eventLimit: args.eventLimit } : {}),
      }),
    retry: false,
  });
}

export function useTokenSessions(args: { sessionId?: string; since?: string } = {}) {
  return useQuery({
    queryKey: ["governance", "tokenBudget", "sessions", args],
    queryFn: () =>
      trpc.governance.tokenBudget.query({
        ...(args.sessionId ? { sessionId: args.sessionId } : {}),
        ...(args.since ? { since: args.since } : {}),
      }),
    retry: false,
  });
}
