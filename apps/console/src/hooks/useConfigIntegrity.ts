"use client";

import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";

/**
 * Configuration Integrity hooks (ADR-131). `useConfigSealStatusAll` drives the
 * multi-pack Active Seals table + Seal Violations list (one fetch backs both);
 * `useKillSwitchTimeline` drives the activation-timeline stability summary. Both
 * `retry: false` so a PRECONDITION_FAILED (feature not wired) surfaces
 * immediately as React Query's error state rather than retrying.
 */

/** Fetches every installed pack's config-seal report from `governance.configSealStatusAll`. */
export function useConfigSealStatusAll() {
  return useQuery({
    queryKey: ["governance", "configSealStatusAll"],
    queryFn: () => trpc.governance.configSealStatusAll.query(),
    retry: false,
  });
}

/** Fetches the kill-switch activation-timeline roll-up from `governance.killSwitchTimeline`. */
export function useKillSwitchTimeline() {
  return useQuery({
    queryKey: ["governance", "killSwitchTimeline"],
    queryFn: () => trpc.governance.killSwitchTimeline.query(),
    retry: false,
  });
}
