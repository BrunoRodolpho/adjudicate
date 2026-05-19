"use client";

import { useMemo } from "react";
import type { AuditRecord } from "@adjudicate/core";
import { useAuditQuery } from "@/hooks/useAuditQuery";
import { cn } from "@/lib/cn";

/**
 * SLO panel (T-084).
 *
 * Targets from docs/perf/v0.2-baseline.md:
 *   - adjudicate()           p99 ≤ 2ms
 *   - adjudicateAndAudit()   p99 ≤ 15ms
 *   - audit sink emit        p99 ≤ 50ms (buffered)
 *
 * The audit row's `durationMs` is the end-to-end adjudicateAndAudit
 * timing — the kernel records it on every emitted record. We bucket by
 * `envelope.kind` so each intent kind reports its own latency, and apply
 * the global SLO target (`adjudicateAndAudit` is the entry path the
 * console can observe; bare-kernel p99 is not surfaced in the audit row).
 *
 * Color thresholds: green < 50% utilization, yellow 50–80%, red > 80%.
 */
const SLO_TARGET_MS = 15;

export function SLOPanel() {
  const since = useMemo(
    () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    [],
  );
  const { data, isLoading, isError } = useAuditQuery({
    since,
    limit: 1000,
  });

  const stats = useMemo(
    () => computeSLOStats(data?.records ?? []),
    [data?.records],
  );

  return (
    <section className="flex flex-col gap-2">
      <header className="flex items-baseline justify-between">
        <h2 className="text-[10px] uppercase tracking-section text-faint">
          Latency · adjudicateAndAudit() · last 24h
        </h2>
        <span className="text-[10px] text-faint">
          SLO target: p99 ≤ {SLO_TARGET_MS}ms
        </span>
      </header>
      <div className="overflow-hidden rounded-sm border border-edge bg-panel/40">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-edge bg-panel">
              <th className="px-2 py-1.5 text-left text-[10px] uppercase tracking-section text-faint">
                Intent kind
              </th>
              <th className="px-2 py-1.5 text-right text-[10px] uppercase tracking-section text-faint">
                count
              </th>
              <th className="px-2 py-1.5 text-right text-[10px] uppercase tracking-section text-faint">
                p50
              </th>
              <th className="px-2 py-1.5 text-right text-[10px] uppercase tracking-section text-faint">
                p95
              </th>
              <th className="px-2 py-1.5 text-right text-[10px] uppercase tracking-section text-faint">
                p99
              </th>
              <th className="px-2 py-1.5 text-right text-[10px] uppercase tracking-section text-faint">
                budget
              </th>
              <th className="px-2 py-1.5 text-right text-[10px] uppercase tracking-section text-faint">
                utilization
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-muted">
                  Computing latency percentiles…
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-red-300">
                  Failed to load audit records.
                </td>
              </tr>
            ) : stats.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-4 text-center italic text-faint"
                >
                  No records in window.
                </td>
              </tr>
            ) : (
              stats.map((s) => {
                const utilization = (s.p99 / SLO_TARGET_MS) * 100;
                return (
                  <tr key={s.kind} className="border-b border-edge">
                    <td className="px-2 py-1.5 text-ink">{s.kind}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted">
                      {s.count}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted">
                      {fmt(s.p50)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted">
                      {fmt(s.p95)}
                    </td>
                    <td
                      className={cn(
                        "px-2 py-1.5 text-right tabular-nums",
                        utilColor(utilization),
                      )}
                    >
                      {fmt(s.p99)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-faint">
                      {SLO_TARGET_MS}ms
                    </td>
                    <td
                      className={cn(
                        "px-2 py-1.5 text-right tabular-nums",
                        utilColor(utilization),
                      )}
                    >
                      {utilization.toFixed(0)}%
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] italic text-faint">
        adjudicateAndAudit() includes the bounded audit sink emit. Bare-kernel
        adjudicate() p99 ≤ 2ms is not separable from the audit row.
      </p>
    </section>
  );
}

function utilColor(util: number): string {
  if (util > 80) return "text-red-300";
  if (util > 50) return "text-amber-300";
  return "text-emerald-300";
}

function fmt(n: number): string {
  if (n < 1) return "<1ms";
  if (n < 10) return `${n.toFixed(2)}ms`;
  return `${n.toFixed(1)}ms`;
}

interface SLOStat {
  readonly kind: string;
  readonly count: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
}

function computeSLOStats(records: readonly AuditRecord[]): readonly SLOStat[] {
  const byKind = new Map<string, number[]>();
  for (const r of records) {
    const kind = r.envelope.kind;
    if (typeof r.durationMs !== "number" || !Number.isFinite(r.durationMs)) {
      continue;
    }
    if (!byKind.has(kind)) byKind.set(kind, []);
    byKind.get(kind)!.push(r.durationMs);
  }
  const out: SLOStat[] = [];
  for (const [kind, samples] of byKind.entries()) {
    samples.sort((a, b) => a - b);
    out.push({
      kind,
      count: samples.length,
      p50: percentile(samples, 0.5),
      p95: percentile(samples, 0.95),
      p99: percentile(samples, 0.99),
    });
  }
  // Sort by p99 descending — operators want the worst offenders first.
  return out.sort((a, b) => b.p99 - a.p99);
}

function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(q * sorted.length) - 1),
  );
  return sorted[idx]!;
}
