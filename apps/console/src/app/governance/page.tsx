"use client";

import { useMemo, useState } from "react";
import { GuardFireBars } from "@/components/governance/GuardFireBars";
import { PolicyBundleView } from "@/components/governance/PolicyBundleView";
import {
  RANGE_HOURS,
  RangePicker,
  isoSince,
  type DashboardRange,
} from "@/components/dashboard/RangePicker";
import { useGuardFireStats } from "@/hooks/useGuardFireStats";
import { usePolicyDescriptor } from "@/hooks/usePolicyDescriptor";

/**
 * Governance — Console v0.2 surface for reading policy structure and
 * guard-fire telemetry. Two panels:
 *
 *   1. Policy Bundle — `describePolicyBundle(activePack.policy)` rendered as
 *      collapsible phases with GuardMetadata details.
 *   2. Guard Fire Stats — top-N per-guard fire counts from the in-memory
 *      GuardFireStats accumulator wired into the route handler.
 *
 * Both panels surface PRECONDITION_FAILED (returned by the SDK when the
 * route handler omits the relevant context field) as a friendly empty
 * state rather than as a console error.
 */
export default function GovernancePage() {
  const [range, setRange] = useState<DashboardRange>("7d");
  const since = useMemo(() => isoSince(RANGE_HOURS[range]), [range]);
  const policy = usePolicyDescriptor();
  const stats = useGuardFireStats({ since });

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between border-b border-edge pb-3">
        <h1 className="text-[10px] uppercase tracking-section text-muted">
          Governance · Policy Structure + Guard Fires
        </h1>
        <RangePicker value={range} onChange={setRange} />
      </header>

      <section className="rounded-sm border border-edge bg-panel/40">
        <header className="border-b border-edge px-3 py-1.5">
          <span className="text-[10px] uppercase tracking-section text-faint">
            Active Policy Bundle
          </span>
        </header>
        <div className="px-3 py-2">
          {policy.isLoading ? (
            <p className="text-[11px] text-muted">Loading descriptor…</p>
          ) : policy.isError ? (
            <p className="text-[11px] italic text-faint">
              No policy descriptor configured. Wire one via{" "}
              <code>describePolicyBundle(pack.policy)</code> in the route
              handler context.
            </p>
          ) : policy.data ? (
            <PolicyBundleView descriptor={policy.data} />
          ) : null}
        </div>
      </section>

      <section className="rounded-sm border border-edge bg-panel/40">
        <header className="border-b border-edge px-3 py-1.5">
          <span className="text-[10px] uppercase tracking-section text-faint">
            Guard Fires · last {range}
          </span>
        </header>
        <div className="px-3 py-2">
          {stats.isLoading ? (
            <p className="text-[11px] text-muted">Loading guard fires…</p>
          ) : stats.isError ? (
            <p className="text-[11px] italic text-faint">
              No GuardFireStats configured. Wire an instance into the route
              handler context to populate this panel.
            </p>
          ) : stats.data ? (
            <GuardFireBars buckets={stats.data.buckets} />
          ) : null}
        </div>
      </section>
    </div>
  );
}
