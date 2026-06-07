"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";

/** Lists approval requests (ADR-122), polling at the live-tail cadence. */
export function useApprovals(filter: { status?: "pending" | "approved" | "declined" | "expired" } = {}) {
  return useQuery({
    queryKey: ["approval", "list", filter],
    queryFn: () => trpc.approval.list.query(filter),
    retry: false,
    refetchInterval: 2000,
  });
}

/** Approve/decline an approval request; invalidates the list on success. */
export function useResolveApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { token: string; accepted: boolean; reason?: string }) =>
      trpc.approval.resolve.mutate(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["approval"] });
    },
  });
}

/**
 * Durable decision history (ADR-136) — resolved/expired approvals from the
 * persisted registry projection. Read-only; no polling (history is append-mostly
 * and re-fetched on resolve via the `["approval"]` invalidation key).
 */
export function useApprovalHistory(
  filter: { status?: "approved" | "declined" | "expired"; sessionId?: string } = {},
) {
  return useQuery({
    queryKey: ["approval", "history", filter],
    queryFn: () => trpc.approval.history.query({ ...filter, limit: 100 }),
    retry: false,
  });
}

/**
 * Audit chain (ADR-136) for a selected resolved approval — request → resolved →
 * resumed, walked over the frozen AuditRecord.supersedes lineage. Disabled until
 * an intentHash is selected.
 */
export function useApprovalChain(intentHash: string | undefined) {
  return useQuery({
    queryKey: ["approval", "chain", intentHash],
    queryFn: () => trpc.approval.chain.query({ intentHash: intentHash as string }),
    enabled: typeof intentHash === "string" && intentHash.length > 0,
    retry: false,
    staleTime: 60_000,
  });
}
