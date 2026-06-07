import type { DriftDimension } from "@adjudicate/drift";

/**
 * Behavioral-drift detector config for the reference console (ADR-119), shared
 * by the tRPC route and its regression test.
 *
 * The windows are sized for the 7-record demo fixture stream (ALL_MOCKS): a
 * 3-record baseline followed by a 4-record recent window. The default
 * production windows (baseline 500 / recent 100) can never drift on 7 records —
 * everything lands in the baseline and `recent` stays empty — which is why the
 * panel and the onDrift alerting path were effectively inert (Item 3). With
 * these windows the real fixtures drift and `evaluate()` fires `onDrift`.
 */
export const DRIFT_CONFIG = {
  baselineWindow: 3,
  recentWindow: 4,
  alertThreshold: 0.25,
  dimensions: ["decision.kind", "intent.kind", "basis"] as DriftDimension[],
} as const;
