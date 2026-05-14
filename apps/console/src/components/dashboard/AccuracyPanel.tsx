"use client";

import { useDecisionAccuracy } from "@/hooks/useDecisionAccuracy";

export function AccuracyPanel({ since }: { since: string }) {
  const { data, isLoading, isError } = useDecisionAccuracy({ since });

  if (isLoading) {
    return (
      <div className="rounded-sm border border-edge bg-panel/40 px-3 py-2 text-[11px] text-muted">
        Loading accuracy…
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="rounded-sm border border-edge bg-panel/40 px-3 py-2 text-[11px] italic text-faint">
        Decision-accuracy not configured — wire an OutcomeSink + lookup into
        the route handler to populate this tile.
      </div>
    );
  }

  const reconciled = data.matched / (data.total || 1);
  const successRate = data.matched > 0 ? data.succeeded / data.matched : 0;

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      <Stat label="Total EXECUTEs" value={data.total} />
      <Stat
        label="Reconciled"
        value={`${data.matched}/${data.total} · ${(reconciled * 100).toFixed(0)}%`}
      />
      <Stat
        label="Observed success"
        value={`${(successRate * 100).toFixed(0)}%`}
      />
      <Stat
        label="Failed / withdrawn"
        value={`${data.failed} / ${data.withdrawn}`}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-sm border border-edge bg-panel/40 px-3 py-2">
      <span className="block text-[10px] uppercase tracking-section text-faint">
        {label}
      </span>
      <span className="mt-0.5 block tabular-nums text-base text-ink">
        {value}
      </span>
    </div>
  );
}
