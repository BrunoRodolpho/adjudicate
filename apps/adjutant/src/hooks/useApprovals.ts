"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";

/**
 * Lists approval requests from `approval.list`, polling at a live cadence so the
 * queue drains as resolutions land.
 */
export function useApprovals(
  filter: { status?: "pending" | "approved" | "declined" | "expired" } = {},
) {
  return useQuery({
    queryKey: ["approval", "list", filter],
    queryFn: () => trpc.approval.list.query(filter),
    retry: false,
    refetchInterval: 2000,
  });
}

/**
 * Approve/decline an approval request via `approval.resolve`. In the Adjutant
 * app this DRIVES the kernel confirmationReceipt re-adjudication of the parked
 * envelope. On success it invalidates the incidents, proposals, AND approvals
 * queries so all three surfaces reflect the new outcome.
 */
export function useResolveApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { token: string; accepted: boolean; reason?: string }) =>
      trpc.approval.resolve.mutate(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["approval"] });
      void qc.invalidateQueries({ queryKey: ["adjutant", "incidents"] });
      void qc.invalidateQueries({ queryKey: ["adjutant", "proposals"] });
    },
  });
}
