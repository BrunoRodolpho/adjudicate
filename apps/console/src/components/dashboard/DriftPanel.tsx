"use client";

import { useMemo } from "react";
import type { AuditRecord } from "@adjudicate/core";
import { useAuditQuery } from "@/hooks/useAuditQuery";
import { cn } from "@/lib/cn";

/**
 * Drift detection panel (T-083).
 *
 * Six drift types from `MetricsSink.recordSinkFailure` reasons. Until
 * @adjudicate/admin-sdk exposes a dedicated counter endpoint, this
 * panel aggregates client-side from the audit table — REFUSE records
 * whose `refusal.code` matches one of the drift codes count toward
 * that type. The mapping is intentionally narrow; only basis_code_drift,
 * rewrite_taint_regression, defer_signal_drift, rewrite_scope_violation,
 * guard_panic, and park_blob_tampered fall under "drift" in this view.
 *
 * Last-7d and last-24h counts are presented side-by-side so an operator
 * spotting an uptick can pivot from a quiet week to a noisy day. The
 * sparkline is a 24-bucket sequence over the last 7 days (one bar per ~7h
 * — close enough to a daily-trend feel without exploding pixel cost).
 */
const DRIFT_TYPES = [
  {
    code: "basis_code_drift",
    label: "Basis Code Drift",
    why: "A guard emitted a basis with a category/code outside the Pack's declared vocabulary. The audit row is preserved but downstream queries that rely on the vocabulary may miss this row.",
  },
  {
    code: "rewrite_taint_regression",
    label: "Rewrite Taint Regression",
    why: "A REWRITE produced an envelope at a LOWER taint than the source. Sanitization must never declassify — this indicates a Pack bug.",
  },
  {
    code: "defer_signal_drift",
    label: "Defer Signal Drift",
    why: "A DEFER returned a `signal` not in the Pack's declared signal vocabulary. Resume machinery may not recognize the signal.",
  },
  {
    code: "rewrite_scope_violation",
    label: "Rewrite Scope Violation",
    why: "REWRITE returned an envelope that is not a sanitize/normalize/cap of the source. REWRITE is scope-restricted; business transformations belong in EXECUTE.",
  },
  {
    code: "guard_panic",
    label: "Guard Panic",
    why: "A guard threw inside the kernel's try/catch wrapper. The kernel produced a SECURITY REFUSE rather than propagate; the audit row records the offending guard.",
  },
  {
    code: "park_blob_tampered",
    label: "Park Blob Tampered",
    why: "A DEFER's parked-state blob failed integrity check on resume. The supersession chain cannot be safely resumed.",
  },
] as const;

const DRIFT_CODES: ReadonlySet<string> = new Set(
  DRIFT_TYPES.map((t) => t.code),
);

export function DriftPanel() {
  const since7d = useMemo(
    () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    [],
  );
  const since24h = useMemo(
    () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    [],
  );

  // Use one wide-window query (7d) and derive both buckets client-side.
  // This minimizes round trips and keeps the panel cheap to mount.
  const { data, isLoading, isError } = useAuditQuery({
    since: since7d,
    limit: 1000,
  });

  const stats = useMemo(() => {
    const records = data?.records ?? [];
    const buckets = computeDriftBuckets(records, since7d, since24h);
    return buckets;
  }, [data?.records, since7d, since24h]);

  return (
    <section className="flex flex-col gap-2">
      <header className="flex items-baseline justify-between">
        <h2 className="text-[10px] uppercase tracking-section text-faint">
          Drift detection · last 7 days
        </h2>
        <span className="text-[10px] text-faint">
          client-side aggregation pending admin-sdk endpoint
        </span>
      </header>
      <div className="overflow-hidden rounded-sm border border-edge bg-panel/40">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-edge bg-panel">
              <th className="px-2 py-1.5 text-left text-[10px] uppercase tracking-section text-faint">
                Drift type
              </th>
              <th className="px-2 py-1.5 text-right text-[10px] uppercase tracking-section text-faint">
                7d
              </th>
              <th className="px-2 py-1.5 text-right text-[10px] uppercase tracking-section text-faint">
                24h
              </th>
              <th className="px-2 py-1.5 text-left text-[10px] uppercase tracking-section text-faint">
                trend
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-muted">
                  Loading drift counts…
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-red-300">
                  Failed to load audit records.
                </td>
              </tr>
            ) : (
              DRIFT_TYPES.map((type) => {
                // `stats` is built from DRIFT_TYPES (see buildStats), so every
                // code is present; the guard satisfies noUncheckedIndexedAccess
                // and renders nothing for an impossible-missing code.
                const s = stats[type.code];
                if (!s) return null;
                const hot = s.last24h > 0;
                return (
                  <tr
                    key={type.code}
                    className={cn(
                      "border-b border-edge align-top",
                      hot && "bg-red-500/5",
                    )}
                  >
                    <td className="px-2 py-1.5">
                      <div className="flex flex-col gap-0.5">
                        <span
                          className={cn(
                            "font-medium",
                            hot ? "text-red-300" : "text-ink",
                          )}
                        >
                          {type.label}
                        </span>
                        <span
                          className="text-[10px] text-faint"
                          title={type.why}
                        >
                          {type.code}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted">
                      {s.last7d}
                    </td>
                    <td
                      className={cn(
                        "px-2 py-1.5 text-right tabular-nums",
                        hot ? "text-red-300" : "text-muted",
                      )}
                    >
                      {s.last24h}
                    </td>
                    <td className="px-2 py-1.5">
                      <Sparkline values={s.spark} hot={hot} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Inline tooltip helper carrying the "Why this matters" copy. */
function _Tooltip(): null {
  return null;
}

interface DriftBucket {
  last7d: number;
  last24h: number;
  /** 24-element sparkline series over the 7d window. */
  spark: number[];
}

function computeDriftBuckets(
  records: readonly AuditRecord[],
  since7dIso: string,
  since24hIso: string,
): Record<string, DriftBucket> {
  const since7d = new Date(since7dIso).getTime();
  const since24h = new Date(since24hIso).getTime();
  const now = Date.now();
  const window7d = now - since7d;
  const SPARK_BUCKETS = 24;

  const out: Record<string, DriftBucket> = {};
  for (const t of DRIFT_TYPES) {
    out[t.code] = { last7d: 0, last24h: 0, spark: new Array(SPARK_BUCKETS).fill(0) };
  }

  for (const r of records) {
    if (r.decision.kind !== "REFUSE") continue;
    const code = r.decision.refusal.code;
    if (!DRIFT_CODES.has(code)) continue;
    const ts = new Date(r.at).getTime();
    if (Number.isNaN(ts) || ts < since7d) continue;
    const bucket = out[code]!;
    bucket.last7d += 1;
    if (ts >= since24h) bucket.last24h += 1;
    const idx = Math.min(
      SPARK_BUCKETS - 1,
      Math.max(0, Math.floor(((ts - since7d) / window7d) * SPARK_BUCKETS)),
    );
    bucket.spark[idx]! += 1;
  }
  return out;
}

function Sparkline({ values, hot }: { values: number[]; hot: boolean }) {
  const max = Math.max(1, ...values);
  const w = 96;
  const h = 16;
  const step = w / values.length;
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden
      className="overflow-visible"
    >
      {values.map((v, i) => {
        const barH = Math.max(1, (v / max) * (h - 2));
        return (
          <rect
            key={i}
            x={i * step + 0.5}
            y={h - barH}
            width={Math.max(1, step - 1)}
            height={barH}
            className={cn(
              hot ? "fill-red-500/70" : "fill-emerald-500/60",
              v === 0 && "fill-zinc-700/40",
            )}
          />
        );
      })}
    </svg>
  );
}
