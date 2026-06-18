/**
 * @adjudicate/drift — opt-in behavioral/statistical drift detection.
 *
 * A pure observer wired to the AuditEventBus: it maintains bounded running
 * distributions per dimension (decision.kind / intent.kind / basis) over a
 * frozen baseline vs a trailing recent window, and fires `onDrift` when a
 * dimension shifts past a threshold (total-variation distance, new-category,
 * proportion-spike). Count-based windows → fully deterministic. The kernel
 * never reads it; nothing here enters the decision path or intentHash.
 *
 * Distinct from the console's OPERATIONAL DriftPanel (integrity codes) — this is
 * statistical distribution drift.
 */

export { totalVariationDistance } from "./distance.js";
export {
  createDriftDetector,
  type DriftAlert,
  type DriftDetector,
  type DriftDetectorOptions,
  type DriftDimension,
  type DriftDimensionSnapshot,
  type DriftSignalKind,
  type DriftSnapshot,
} from "./detector.js";
export {
  createDriftHistory,
  type DriftHistory,
  type DriftHistoryDimensionEntry,
  type DriftHistoryEntry,
  type DriftHistoryOptions,
  type DriftHistoryView,
} from "./history.js";
export {
  createSessionRiskDriftBridge,
  quantizeRisk,
  type RiskBucket,
  type RiskBucketThresholds,
  type RiskDriftAlert,
  type RiskDriftHistoryEntry,
  type RiskDriftHistoryView,
  type RiskDriftSnapshot,
  type SessionRiskDriftBridge,
  type SessionRiskDriftBridgeOptions,
} from "./session-risk-bridge.js";
