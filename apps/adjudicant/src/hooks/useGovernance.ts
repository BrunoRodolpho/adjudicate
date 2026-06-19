"use client";

import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";

/**
 * 115 — read hooks for the Adjudicant (Inspector-General) governance surfaces.
 *
 * All three are pure READS over the admin SDK's READ-ONLY router: the OBSERVER
 * plane observes/investigates the governance state but can NEVER authorize or
 * weaken a decision (§C / §D-7). Each backing tRPC procedure is a `.query`; the
 * read-only client is typed against `ReadOnlyAdminRouter`, so no authorize /
 * weaken / replay-mutate procedure is even a member of its type.
 *
 * Every view is FEATURE-DETECTED: when its backing port is not wired into the
 * route-handler context, the procedure throws `PRECONDITION_FAILED`, which
 * surfaces here as `isError` — the UI renders a "not configured in this scaffold"
 * state rather than a crash or a fabricated value.
 *
 * `retry: false` everywhere — a PRECONDITION_FAILED is a deterministic feature
 * signal, not a transient failure, so retrying is pointless (and would mask the
 * feature-detection semantics behind a spinner).
 */

/**
 * Policy-version history — the installed policy bundle's structure (phases +
 * guard metadata) via `governance.describePolicy`. Throws PRECONDITION_FAILED
 * (→ isError) when no `policyDescriptor` port is wired.
 */
export function usePolicyDescriptor() {
  return useQuery({
    queryKey: ["adjudicant", "governance", "describePolicy"],
    queryFn: () => trpc.governance.describePolicy.query(),
    retry: false,
  });
}

/**
 * Operational dashboard — per-guard fire counts in a rolling window via
 * `governance.guardFireStats`. `since` is an inclusive lower bound. Throws
 * PRECONDITION_FAILED (→ isError) when no `guardFireStats` port is wired.
 */
export function useGuardFireStats(since: string) {
  return useQuery({
    queryKey: ["adjudicant", "governance", "guardFireStats", since],
    queryFn: () => trpc.governance.guardFireStats.query({ since }),
    retry: false,
  });
}

/**
 * Operational dashboard — time-bucketed distribution of `Decision.kind` over a
 * window via `governance.outcomeDistribution`. Reads the AuditStore directly (no
 * extra port), so it stays available even in the read-only scaffold.
 */
export function useOutcomeDistribution(since: string, bucket: "hour" | "day") {
  return useQuery({
    queryKey: ["adjudicant", "governance", "outcomeDistribution", since, bucket],
    queryFn: () =>
      trpc.governance.outcomeDistribution.query({ since, bucket }),
    retry: false,
  });
}

/**
 * Kill-switch READ-status — the activation-timeline roll-up via
 * `governance.killSwitchTimeline`. The OBSERVER sees the engage/clear timeline
 * but can never toggle the switch (`emergency.update` is not a member of the
 * read-only client's type). Computed adopter-side from `emergency.history` and
 * threaded as a recorded read; the resolver is a pure `.query`.
 */
export function useKillSwitchTimeline() {
  return useQuery({
    queryKey: ["adjudicant", "governance", "killSwitchTimeline"],
    queryFn: () => trpc.governance.killSwitchTimeline.query(),
    retry: false,
  });
}
