"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";
import type { EmergencyStatus } from "@adjudicate/admin-sdk";

interface UpdateInput {
  newStatus: EmergencyStatus;
  reason: string;
  confirmationPhrase: string;
}

/**
 * Mutation hook for toggling the emergency state.
 *
 * On success, invalidates both `emergency.state` and `emergency.history`
 * so the UI re-renders with the new state and the freshly-recorded
 * governance event. The 5s polling on `useEmergencyState` is a backstop
 * for cross-replica updates; the explicit invalidation here is the
 * fast-path for the operator's own action.
 */
export function useUpdateEmergencyState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateInput) => trpc.emergency.update.mutate(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["emergency"] });
    },
  });
}
