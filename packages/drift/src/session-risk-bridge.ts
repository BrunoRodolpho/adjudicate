import type { AuditRecord } from "@adjudicate/core";
import {
  createDriftDetector,
  type DriftAlert,
  type DriftSignalKind,
} from "./detector.js";
import { createDriftHistory, type DriftHistory } from "./history.js";

/**
 * @adjudicate/drift — session-risk → behavioral-drift bridge (WS-E / ADR-132).
 *
 * Feeds an accumulated per-record risk score into a DEDICATED, parallel drift
 * detector so the operator can see drift in the *distribution of risk buckets*
 * over time (is the fleet trending riskier?). Additive, out-of-path, and
 * NON-BREAKING by construction:
 *
 *   - It does NOT extend the closed `DriftDimension` union (that union is
 *     mirrored in admin-sdk's wire schema — editing it is a breaking change).
 *     Instead it runs a private `createDriftDetector` over a single internal
 *     carrier dimension and feeds it synthetic `{ decision: { kind: bucket } }`
 *     records. The carrier label never leaks: this bridge's snapshot/alerts/
 *     history are re-labelled to the `"session.risk"` channel.
 *   - It reuses `createDriftDetector` + `createDriftHistory` verbatim — no
 *     change to any existing drift file, only this new module.
 *   - Determinism (ADR-119) preserved: count-based windows, caller-supplied
 *     `at` for history, no `Date.now()`/RNG. Two bridges fed the same record
 *     sequence + the same `at`s produce byte-identical `snapshot()`/`historyView()`.
 *
 * Score source (in priority order, per record):
 *   1. an injected `riskScoreFn(record)` — the PRIMARY path (e.g. quantize a
 *      `SessionRisk.lastBucket`/EWMA from `@adjudicate/primitives`), and
 *   2. the opportunistic `record.metadata.hallucination_score` (present only
 *      when an adopter wired `createHallucinationMetadataProvider`).
 * A record with no resolvable score is SKIPPED entirely (it contributes no
 * observation), so `totalObserved` counts scored samples only and the baseline
 * window measures N scored records — not N total turns.
 *
 * Outside the determinism boundary by construction: the kernel never reads this;
 * nothing here reaches `intentHash`/`adjudicate()`/policy/state.
 */

/** The four risk buckets, low → critical. */
export type RiskBucket = "low" | "medium" | "high" | "critical";

/** Bucket boundaries on a score in [0,1]. Defaults align with the observability
 *  hallucination buckets (medium ≥ 0.34, high ≥ 0.67). `critical` is opt-in. */
export interface RiskBucketThresholds {
  /** score ≥ this → at least "medium". Default 0.34. */
  readonly medium?: number;
  /** score ≥ this → at least "high". Default 0.67. */
  readonly high?: number;
  /** score ≥ this → "critical". Default: disabled (no critical bucket). */
  readonly critical?: number;
}

/** A drift alert on the session-risk channel (carrier dimension re-labelled). */
export interface RiskDriftAlert {
  readonly channel: "session.risk";
  readonly signal: DriftSignalKind;
  readonly magnitude: number;
  readonly threshold: number;
  /** The implicated risk bucket (new/spiking); absent for whole-distribution shift. */
  readonly category?: string;
  readonly baselineCount: number;
  readonly recentCount: number;
}

/** A point-in-time read of the session-risk drift channel. */
export interface RiskDriftSnapshot {
  readonly channel: "session.risk";
  readonly baselineWindow: number;
  readonly recentWindow: number;
  readonly alertThreshold: number;
  readonly totalObserved: number;
  /** bucket → count over the frozen baseline window. */
  readonly baseline: Readonly<Record<string, number>>;
  /** bucket → count over the trailing recent window. */
  readonly recent: Readonly<Record<string, number>>;
  /** Total-variation distance baseline↔recent. */
  readonly tvd: number;
  readonly alerts: ReadonlyArray<RiskDriftAlert>;
}

/** One recorded point in the session-risk drift timeline. */
export interface RiskDriftHistoryEntry {
  readonly at: string;
  readonly seq: number;
  readonly totalObserved: number;
  readonly tvd: number;
  readonly alertCount: number;
}

/** A read of the retained session-risk timeline + bounding metadata. */
export interface RiskDriftHistoryView {
  readonly capacity: number;
  readonly count: number;
  readonly dropped: number;
  readonly entries: ReadonlyArray<RiskDriftHistoryEntry>;
}

export interface SessionRiskDriftBridgeOptions {
  /** Scored observations that form the frozen baseline reference window. */
  readonly baselineWindow: number;
  /** Trailing recent window. Default = baselineWindow. */
  readonly recentWindow?: number;
  /** TVD / proportion-delta threshold in [0,1] above which drift fires. */
  readonly alertThreshold: number;
  /**
   * PRIMARY score source: derive a risk score in [0,1] (higher = riskier) from
   * a record, or `undefined` to skip it. When omitted, the bridge falls back to
   * `record.metadata.hallucination_score`.
   */
  readonly riskScoreFn?: (record: AuditRecord) => number | undefined;
  /** Bucket boundaries. Default medium ≥ 0.34, high ≥ 0.67, critical disabled. */
  readonly thresholds?: RiskBucketThresholds;
  /** Drift-history ring-buffer capacity. Default 100. */
  readonly historyCapacity?: number;
  /** Invoked by `evaluate()` per crossing, with the re-labelled risk alert. */
  readonly onDrift?: (alert: RiskDriftAlert) => void;
}

export interface SessionRiskDriftBridge {
  /** Score → bucket → feed the parallel detector. No-signal records are skipped. */
  observe(record: AuditRecord): void;
  /** Recompute drift, invoke `onDrift` per crossing, return the risk alerts. */
  evaluate(): ReadonlyArray<RiskDriftAlert>;
  /** Full risk-bucket distribution + drift snapshot. */
  snapshot(): RiskDriftSnapshot;
  /** Wire `observe()` as an AuditEventBus handler. Returns the bus unsubscribe. */
  attach(bus: { subscribe(h: (r: AuditRecord) => void): () => void }): () => void;
  /** Append the current snapshot to the history, stamped with a caller time. */
  recordHistory(at: string): void;
  /** Read the retained session-risk timeline (oldest → newest) + bounds. */
  historyView(): RiskDriftHistoryView;
  reset(): void;
}

// The internal carrier dimension. Never exposed — the bridge re-labels all
// output to "session.risk". Any of the three closed dimensions would do; the
// detector tracks exactly one and we feed it synthetic decision.kind records.
const RISK_CARRIER = "decision.kind" as const;

/** Deterministic bucketing. Out-of-range scores are clamped to [0,1]. */
export function quantizeRisk(
  score: number,
  thresholds: RiskBucketThresholds = {},
): RiskBucket {
  const s = Math.min(1, Math.max(0, score));
  const medium = thresholds.medium ?? 0.34;
  const high = thresholds.high ?? 0.67;
  const critical = thresholds.critical;
  if (critical !== undefined && s >= critical) return "critical";
  if (s >= high) return "high";
  if (s >= medium) return "medium";
  return "low";
}

function metadataScore(record: AuditRecord): number | undefined {
  const raw = (record.metadata as Record<string, unknown> | undefined)?.hallucination_score;
  return typeof raw === "number" && !Number.isNaN(raw) ? raw : undefined;
}

export function createSessionRiskDriftBridge(
  options: SessionRiskDriftBridgeOptions,
): SessionRiskDriftBridge {
  const toRiskAlert = (a: DriftAlert): RiskDriftAlert => ({
    channel: "session.risk",
    signal: a.signal,
    magnitude: a.magnitude,
    threshold: a.threshold,
    ...(a.category !== undefined ? { category: a.category } : {}),
    baselineCount: a.baselineCount,
    recentCount: a.recentCount,
  });

  const detector = createDriftDetector({
    baselineWindow: options.baselineWindow,
    ...(options.recentWindow !== undefined ? { recentWindow: options.recentWindow } : {}),
    alertThreshold: options.alertThreshold,
    dimensions: [RISK_CARRIER],
    // Buckets are ≤ 4 keys; the default category cap is plenty.
    ...(options.onDrift ? { onDrift: (a) => options.onDrift!(toRiskAlert(a)) } : {}),
  });
  const history: DriftHistory = createDriftHistory(
    options.historyCapacity !== undefined ? { capacity: options.historyCapacity } : {},
  );

  function bucketFor(record: AuditRecord): RiskBucket | undefined {
    // Primary: injected riskScoreFn. Fallback: metadata.hallucination_score.
    const primary = options.riskScoreFn?.(record);
    const score =
      typeof primary === "number" && !Number.isNaN(primary) ? primary : metadataScore(record);
    if (typeof score !== "number" || Number.isNaN(score)) return undefined;
    return quantizeRisk(score, options.thresholds);
  }

  function observe(record: AuditRecord): void {
    const bucket = bucketFor(record);
    if (bucket === undefined) return; // no-signal record contributes nothing
    // Synthetic carrier record: the detector only reads decision.kind here.
    detector.observe({ decision: { kind: bucket } } as unknown as AuditRecord);
  }

  return {
    observe,
    evaluate() {
      return detector.evaluate().map(toRiskAlert);
    },
    snapshot() {
      const snap = detector.snapshot();
      const dim = snap.dimensions[0];
      return {
        channel: "session.risk",
        baselineWindow: snap.baselineWindow,
        recentWindow: snap.recentWindow,
        alertThreshold: snap.alertThreshold,
        totalObserved: snap.totalObserved,
        baseline: dim?.baseline ?? {},
        recent: dim?.recent ?? {},
        tvd: dim?.tvd ?? 0,
        alerts: (dim?.alerts ?? []).map(toRiskAlert),
      };
    },
    attach(bus) {
      return bus.subscribe(observe);
    },
    recordHistory(at) {
      history.record(detector.snapshot(), at);
    },
    historyView() {
      const v = history.view();
      return {
        capacity: v.capacity,
        count: v.count,
        dropped: v.dropped,
        // Single carrier channel → headline TVD is the session-risk TVD.
        entries: v.entries.map((e) => ({
          at: e.at,
          seq: e.seq,
          totalObserved: e.totalObserved,
          tvd: e.maxTvd,
          alertCount: e.alertCount,
        })),
      };
    },
    reset() {
      detector.reset();
      history.reset();
    },
  };
}
