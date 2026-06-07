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
