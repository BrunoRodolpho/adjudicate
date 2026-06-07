import type { AuditRecord } from "@adjudicate/core";
import { totalVariationDistance } from "./distance.js";

export type DriftDimension = "decision.kind" | "intent.kind" | "basis";

export type DriftSignalKind =
  | "distribution_shift"
  | "new_category"
  | "proportion_spike";

export interface DriftAlert {
  readonly dimension: DriftDimension;
  readonly signal: DriftSignalKind;
  /** TVD for distribution_shift; proportion delta for proportion_spike; 1 for new_category. */
  readonly magnitude: number;
  readonly threshold: number;
  /** Implicated category (new/spiking key); absent for whole-distribution shift. */
  readonly category?: string;
  readonly baselineCount: number;
  readonly recentCount: number;
}

export interface DriftDimensionSnapshot {
  readonly dimension: DriftDimension;
  readonly baseline: Readonly<Record<string, number>>;
  readonly recent: Readonly<Record<string, number>>;
  readonly tvd: number;
  readonly alerts: ReadonlyArray<DriftAlert>;
}

export interface DriftSnapshot {
  readonly schemaVersion: 1;
  readonly baselineWindow: number;
  readonly recentWindow: number;
  readonly alertThreshold: number;
  readonly totalObserved: number;
  readonly dimensions: ReadonlyArray<DriftDimensionSnapshot>;
}

export interface DriftDetectorOptions {
  /** Observations (records) that form the frozen baseline reference window. */
  readonly baselineWindow: number;
  /** Trailing recent window (in keys) compared against the baseline. Default = baselineWindow. */
  readonly recentWindow?: number;
  /** TVD / proportion-delta threshold in [0,1] above which drift fires. */
  readonly alertThreshold: number;
  /** Dimensions to track. */
  readonly dimensions: ReadonlyArray<DriftDimension>;
  /** Per-dimension category cap; over-cap keys land in "__overflow__". Default 64. */
  readonly maxCategoriesPerDimension?: number;
  /** Invoked by evaluate() per crossing. Pure-data callback; side effects are the adopter's. */
  readonly onDrift?: (alert: DriftAlert) => void;
}

export interface DriftDetector {
  /** Synchronous, total, no-throw, no-I/O — safe as an AuditEventBus handler. */
  observe(record: AuditRecord): void;
  /** Pure read: recompute drift, invoke onDrift per crossing, return the alerts. */
  evaluate(): ReadonlyArray<DriftAlert>;
  /** Pure read: full distribution + drift snapshot. */
  snapshot(): DriftSnapshot;
  /** Wire observe() as a bus handler. Returns the bus unsubscribe. */
  attach(bus: { subscribe(h: (r: AuditRecord) => void): () => void }): () => void;
  reset(): void;
}

const OVERFLOW = "__overflow__";

interface DimState {
  readonly baseline: Map<string, number>;
  readonly recentKeys: string[];
  readonly recentCounts: Map<string, number>;
}

function add(counter: Map<string, number>, key: string, max: number): void {
  if (counter.has(key)) {
    counter.set(key, counter.get(key)! + 1);
  } else if (counter.size < max) {
    counter.set(key, 1);
  } else {
    counter.set(OVERFLOW, (counter.get(OVERFLOW) ?? 0) + 1);
  }
}

function toRecord(counter: Map<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of counter) out[k] = v;
  return out;
}

function keysForDimension(dim: DriftDimension, record: AuditRecord): string[] {
  // Defensive: the bus-handler contract is no-throw, so tolerate malformed
  // records (missing decision/envelope/basis) by contributing no keys.
  switch (dim) {
    case "decision.kind": {
      const k = record.decision?.kind;
      return typeof k === "string" ? [k] : [];
    }
    case "intent.kind": {
      const k = record.envelope?.kind;
      return typeof k === "string" ? [k] : [];
    }
    case "basis": {
      const list = record.decision_basis;
      if (!Array.isArray(list)) return [];
      return list
        .map((b) => b?.category)
        .filter((c): c is string => typeof c === "string");
    }
  }
}

export function createDriftDetector(options: DriftDetectorOptions): DriftDetector {
  const recentWindow = options.recentWindow ?? options.baselineWindow;
  const max = options.maxCategoriesPerDimension ?? 64;
  const dims = new Map<DriftDimension, DimState>();
  for (const d of options.dimensions) {
    dims.set(d, { baseline: new Map(), recentKeys: [], recentCounts: new Map() });
  }
  let totalObserved = 0;

  function pushRecent(st: DimState, key: string): void {
    st.recentKeys.push(key);
    st.recentCounts.set(key, (st.recentCounts.get(key) ?? 0) + 1);
    while (st.recentKeys.length > recentWindow) {
      const evicted = st.recentKeys.shift()!;
      const c = (st.recentCounts.get(evicted) ?? 0) - 1;
      if (c <= 0) st.recentCounts.delete(evicted);
      else st.recentCounts.set(evicted, c);
    }
  }

  function computeDimension(dim: DriftDimension, st: DimState): DriftDimensionSnapshot {
    const baseline = toRecord(st.baseline);
    const recent = toRecord(st.recentCounts);
    const tvd = totalVariationDistance(baseline, recent);
    const baselineTotal = Object.values(baseline).reduce((s, n) => s + n, 0);
    const recentTotal = Object.values(recent).reduce((s, n) => s + n, 0);
    const alerts: DriftAlert[] = [];
    if (baselineTotal > 0 && recentTotal > 0) {
      if (tvd >= options.alertThreshold) {
        alerts.push({
          dimension: dim,
          signal: "distribution_shift",
          magnitude: tvd,
          threshold: options.alertThreshold,
          baselineCount: baselineTotal,
          recentCount: recentTotal,
        });
      }
      // Deterministic order: iterate recent keys sorted.
      for (const key of Object.keys(recent).sort()) {
        if (!(key in baseline)) {
          alerts.push({
            dimension: dim,
            signal: "new_category",
            magnitude: 1,
            threshold: options.alertThreshold,
            category: key,
            baselineCount: baselineTotal,
            recentCount: recentTotal,
          });
        }
        const delta = recent[key]! / recentTotal - (baseline[key] ?? 0) / baselineTotal;
        if (delta >= options.alertThreshold) {
          alerts.push({
            dimension: dim,
            signal: "proportion_spike",
            magnitude: delta,
            threshold: options.alertThreshold,
            category: key,
            baselineCount: baselineTotal,
            recentCount: recentTotal,
          });
        }
      }
    }
    return { dimension: dim, baseline, recent, tvd, alerts };
  }

  return {
    observe(record) {
      const frozen = totalObserved >= options.baselineWindow;
      for (const [dim, st] of dims) {
        for (const key of keysForDimension(dim, record)) {
          if (!frozen) add(st.baseline, key, max);
          else pushRecent(st, key);
        }
      }
      totalObserved += 1;
    },
    evaluate() {
      const alerts: DriftAlert[] = [];
      for (const [dim, st] of dims) {
        for (const a of computeDimension(dim, st).alerts) {
          alerts.push(a);
          options.onDrift?.(a);
        }
      }
      return alerts;
    },
    snapshot() {
      return {
        schemaVersion: 1,
        baselineWindow: options.baselineWindow,
        recentWindow,
        alertThreshold: options.alertThreshold,
        totalObserved,
        dimensions: [...dims.entries()].map(([dim, st]) => computeDimension(dim, st)),
      };
    },
    attach(bus) {
      return bus.subscribe((r) => this.observe(r));
    },
    reset() {
      for (const st of dims.values()) {
        st.baseline.clear();
        st.recentKeys.length = 0;
        st.recentCounts.clear();
      }
      totalObserved = 0;
    },
  };
}
