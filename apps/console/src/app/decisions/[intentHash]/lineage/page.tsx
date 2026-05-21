"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { use } from "react";
import { LineageGraph } from "@/components/decision/LineageGraph";
import { useLineage } from "@/hooks/useLineage";

interface PageProps {
  params: Promise<{ intentHash: string }>;
}

/**
 * Supersession lineage explorer (T-082).
 *
 * Renders the predecessor chain for one AuditRecord. Walk depth is
 * bounded at 20; the {@link LineageGraph} surfaces "truncated" /
 * "cycle detected" states when those guards trip.
 */
export default function LineagePage({ params }: PageProps) {
  const { intentHash } = use(params);
  const router = useRouter();
  const { data, isLoading, isError } = useLineage(intentHash);

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex w-fit items-center gap-1 text-[11px] text-muted hover:text-ink"
        >
          <ChevronLeft size={12} /> back
        </button>
        <h1 className="text-[10px] uppercase tracking-section text-muted">
          Lineage · {intentHash.slice(0, 14)}…
        </h1>
      </div>

      {isLoading ? (
        <div className="rounded-sm border border-edge bg-panel/40 px-3 py-2 text-[11px] text-muted">
          Walking supersession chain…
        </div>
      ) : isError ? (
        <div className="rounded-sm border border-red-500/40 bg-red-500/5 px-3 py-2 text-[11px] text-red-300">
          Failed to walk lineage.
        </div>
      ) : data ? (
        <LineageGraph
          nodes={data.nodes}
          truncated={data.truncated}
          cyclic={data.cyclic}
        />
      ) : null}
    </div>
  );
}
