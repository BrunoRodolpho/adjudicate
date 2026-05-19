"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { PolicyBundleDescriptorParsed } from "@adjudicate/admin-sdk";

/**
 * Single fetch of `/api/playground/policy` shared across all playground
 * surfaces that need the policy descriptor (Pack Inspector,
 * GuardMetadataGraph if it ever moves into the playground, etc.).
 *
 * The endpoint is `force-static` and returns the descriptor for all three
 * shipped Packs — fetching it more than once per page load is wasted work.
 */

export interface InstalledPackDescriptor {
  readonly id: string;
  readonly name: string;
  readonly descriptor: PolicyBundleDescriptorParsed;
}

interface PolicyResponse {
  readonly packs: ReadonlyArray<InstalledPackDescriptor>;
}

interface PolicyContextValue {
  readonly packs: ReadonlyArray<InstalledPackDescriptor> | null;
  readonly error: string | null;
}

const PolicyContext = createContext<PolicyContextValue>({
  packs: null,
  error: null,
});

export function PolicyProvider({ children }: { children: React.ReactNode }) {
  const [packs, setPacks] = useState<ReadonlyArray<InstalledPackDescriptor> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/playground/policy")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setPacks((data as PolicyResponse).packs);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load policy");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PolicyContext.Provider value={{ packs, error }}>
      {children}
    </PolicyContext.Provider>
  );
}

export function usePolicy() {
  return useContext(PolicyContext);
}

/**
 * Map a playground tab id to the Pack id it routes to.
 * Pack ids carry the `pack-` prefix as registered in their `index.ts`
 * manifests (e.g. `pack-payments-pix`).
 */
export const TAB_TO_PACK_ID: Record<string, string | "all"> = {
  lab: "all",
  pix: "pack-payments-pix",
  kyc: "pack-identity-kyc",
  deployments: "pack-deployments-approval",
};
