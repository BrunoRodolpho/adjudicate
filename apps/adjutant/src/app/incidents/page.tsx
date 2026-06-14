"use client";

import { AsyncBoundary, EmptyState } from "@/components/ui";
import { useIncidents } from "@/hooks/useIncidents";

export const dynamic = "force-dynamic";

/**
 * Incidents — the IncidentState joined with the IncidentProjection's remediation
 * status. Columns: id, severity, status, deps, lastDisposition, executed,
 * pending.
 */
export default function IncidentsPage() {
  const incidents = useIncidents();
  const rows = incidents.data ?? [];

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between border-b border-edge pb-3">
        <h1 className="text-[10px] uppercase tracking-section text-muted">
          Incidents · state &amp; remediation status
        </h1>
        <span className="text-[10px] tabular-nums text-faint">
          {rows.length} incident{rows.length === 1 ? "" : "s"}
        </span>
      </header>

      <div
        className="overflow-hidden rounded-sm border border-edge bg-panel/40"
        data-testid="incidents-table"
      >
        <AsyncBoundary
          isLoading={incidents.isLoading}
          isError={incidents.isError}
          isEmpty={rows.length === 0}
          emptyFallback={<EmptyState title="No incidents recorded." />}
          errorMessage="Incidents port not configured. Wire incidentsPort into the route handler context."
        >
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-edge text-left text-faint">
                <th scope="col" className="px-3 py-1.5 font-normal">Incident</th>
                <th scope="col" className="px-3 py-1.5 font-normal">Severity</th>
                <th scope="col" className="px-3 py-1.5 font-normal">Status</th>
                <th scope="col" className="px-3 py-1.5 font-normal">Deps</th>
                <th scope="col" className="px-3 py-1.5 font-normal">Last disposition</th>
                <th scope="col" className="px-3 py-1.5 font-normal">Executed</th>
                <th scope="col" className="px-3 py-1.5 font-normal">Pending</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.incidentId}
                  data-testid={`incident-row-${r.incidentId}`}
                  className="border-b border-edge/50 last:border-0"
                >
                  <th scope="row" className="px-3 py-1.5 text-left font-mono font-normal text-ink">
                    {r.incidentId}
                  </th>
                  <td className="px-3 py-1.5 uppercase text-muted">{r.severity}</td>
                  <td className="px-3 py-1.5 text-muted">{r.status}</td>
                  <td className="px-3 py-1.5 tabular-nums text-muted">
                    {r.dependencies.length === 0 ? (
                      <span className="text-faint">—</span>
                    ) : (
                      r.dependencies.map((d) => `${d.service} (${d.status})`).join(", ")
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    {r.lastDisposition ? (
                      <DispositionBadge disposition={r.lastDisposition} />
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    {r.executed ? (
                      <span className="text-emerald-300">yes</span>
                    ) : (
                      <span className="text-faint">no</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-muted">
                    {r.pending ? (
                      <span className="rounded-sm border border-edge bg-canvas/60 px-1.5 py-0.5 text-[10px] uppercase tracking-section text-amber-300">
                        {r.pending.kind}
                      </span>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </AsyncBoundary>
      </div>
    </div>
  );
}

function DispositionBadge({
  disposition,
}: {
  disposition: "SAFE" | "REVIEW" | "MANUAL";
}) {
  const cls =
    disposition === "SAFE"
      ? "bg-emerald-400/15 text-emerald-300"
      : disposition === "REVIEW"
        ? "bg-amber-400/15 text-amber-300"
        : "bg-fuchsia-400/15 text-fuchsia-300";
  return (
    <span className={`rounded-sm px-1.5 py-0.5 text-[10px] uppercase tracking-section ${cls}`}>
      {disposition}
    </span>
  );
}
