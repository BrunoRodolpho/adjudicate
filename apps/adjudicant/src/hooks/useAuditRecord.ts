"use client";

import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";

/**
 * 112 — fetches a SINGLE audit record by `intentHash` WITH its integrity verdict
 * via the read-only `audit.byHashVerified` procedure (the explorer's
 * integrity-on-read DTO). The OBSERVER sees the recorded decision AND a
 * deny-by-default tamper/forgery badge, so a tampered `REFUSE→EXECUTE` row never
 * renders as authoritative (§C: a read only ADDS friction; it never weakens).
 *
 * This is a pure READ on the read-only client — `audit.byHashVerified` is a
 * `.query`, and the client is typed against `ReadOnlyAdminRouter`, so no
 * authorize/weaken/replay-mutate procedure is even reachable from this app.
 *
 * `enabled` is gated on a non-empty hash so the lookup does not fire until the
 * operator supplies one; `tenantScope`, when supplied, is threaded to the
 * host-enforced tenant-isolation seam (`getByIntentHash(hash, scope)`).
 */
export function useAuditRecord(
  intentHash: string,
  opts: { tenantScope?: string } = {},
) {
  const trimmed = intentHash.trim();
  return useQuery({
    queryKey: ["adjudicant", "audit", "byHashVerified", trimmed, opts.tenantScope],
    queryFn: () =>
      trpc.audit.byHashVerified.query({
        intentHash: trimmed,
        ...(opts.tenantScope ? { tenantScope: opts.tenantScope } : {}),
      }),
    enabled: trimmed.length > 0,
    retry: false,
  });
}
