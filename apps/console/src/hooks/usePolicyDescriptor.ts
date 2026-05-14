"use client";

import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";

export function usePolicyDescriptor() {
  return useQuery({
    queryKey: ["governance", "describePolicy"],
    queryFn: () => trpc.governance.describePolicy.query(),
    // PRECONDITION_FAILED isn't worth retrying.
    retry: false,
  });
}
