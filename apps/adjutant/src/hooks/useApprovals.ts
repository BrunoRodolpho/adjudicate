"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";

/**
 * Lists approval requests from `approval.list`, polling at a live cadence so the
 * queue drains as resolutions land.
 *
 * Display-projection guidance (#28-13) — these rows are a lossy read view, not a
 * control plane:
 *  - `source: "agent"` rows are READ-ONLY here; resolution stays in ibatexas
 *    (the adjutant hides approve/decline for them — see approvals/page.tsx).
 *  - `expired` is reachable only via an active rejected-confirm (single-use
 *    token taken / tampered), NOT a passive TTL sweep (TTL expiry deletes the
 *    row). Treat `expired` as terminal/non-actionable, never a live agent row.
 *  - `channelRef` is a notification-delivery handle, NOT a stable id — key the
 *    UI on `token`, never on `channelRef`.
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
