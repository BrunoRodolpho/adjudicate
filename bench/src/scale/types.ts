/**
 * Shared types for the production-scale simulation harnesses.
 *
 * These harnesses exercise `AuditEventBus` fan-out and distributed
 * kill-switch v2 propagation against in-process fake transports that
 * emulate the failure modes a real Redis cluster exhibits (reconnects,
 * slow consumers, malformed payloads, partitions). The output is
 * machine-readable JSON so RC certification artifacts stay diff-able.
 *
 * The fakes are intentionally local and deterministic — we are
 * measuring *propagation behavior*, not raw Redis throughput. The
 * v0.7-audit identifies "real-world latency profile" as the missing
 * adopter-evidence axis; this harness lower-bounds the runtime
 * structure and pins regressions in framework code.
 */

export interface BenchArtifact {
  readonly name: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly config: Record<string, unknown>;
  readonly measurements: Record<string, number | string | readonly number[]>;
  readonly invariants: ReadonlyArray<InvariantResult>;
  readonly notes?: string;
}

export interface InvariantResult {
  readonly id: string;
  readonly description: string;
  readonly passed: boolean;
  readonly observed?: string | number;
  readonly expected?: string | number;
}

/** Percentile over a finite number sample. p must be in [0, 1]. */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p)));
  return sorted[idx]!;
}

export function summarizeLatencies(samples: readonly number[]): {
  readonly count: number;
  readonly min: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
  readonly mean: number;
} {
  if (samples.length === 0) {
    return { count: 0, min: 0, p50: 0, p95: 0, p99: 0, max: 0, mean: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  return {
    count: sorted.length,
    min: sorted[0]!,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted[sorted.length - 1]!,
    mean: sum / sorted.length,
  };
}
