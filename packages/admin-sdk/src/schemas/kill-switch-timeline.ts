import { z } from "zod";

/**
 * Wire schemas for a kill-switch activation-timeline report (ADR-131). Mirror
 * `@adjudicate/audit`'s `KillSwitchTimelineReport` / `KillSwitchStabilityClass`
 * / `KillSwitchEventSource` structurally so admin-sdk carries no dependency on
 * that package — the same posture `ConfigSealReportSchema` takes toward
 * `@adjudicate/conformance`.
 *
 * `analyzeKillSwitchTimeline` (the producer) already exists, is pure, and has a
 * V1 freeze-matrix row; this surface only re-declares its output shape and
 * exposes it over tRPC. The closed enums here MUST stay byte-equal to the audit
 * package's closed types — a widening on one side without the other is a drift
 * bug (guarded by the conformance/drift test in `kill-switch-timeline-trpc`).
 */

/**
 * Stability classification — closed vocabulary, byte-equal to
 * `@adjudicate/audit`'s `KillSwitchStabilityClass`.
 *
 * stable               — no trips.
 * single_incident      — exactly one trip.
 * recurring_incidents  — multiple trips below the storm thresholds.
 * storm                — trip density / count crosses the storm thresholds.
 */
export const KillSwitchStabilityClassSchema = z.enum([
  "stable",
  "single_incident",
  "recurring_incidents",
  "storm",
]);

/**
 * Event-source vocabulary — closed, byte-equal to `@adjudicate/audit`'s
 * `KillSwitchEventSource`. The adopter maps its governance/audit history onto
 * these sources (e.g. operator console updates → `operator`).
 */
export const KillSwitchEventSourceSchema = z.enum([
  "operator",
  "automated",
  "boot",
  "external",
  "unknown",
]);

/**
 * Roll-up report over a kill-switch event timeline. O(1) in size regardless of
 * event count — counts + one stability class + one headline. Mirrors the
 * producer's `KillSwitchTimelineReport` field-for-field; `schemaVersion` is
 * pinned to `1` to match, and a future v2 is an additive widening.
 */
export const KillSwitchTimelineReportSchema = z.object({
  schemaVersion: z.literal(1),
  totalEvents: z.number().int().nonnegative(),
  trips: z.number().int().nonnegative(),
  clears: z.number().int().nonnegative(),
  /** Number of state transitions (trip→clear or clear→trip). */
  transitions: z.number().int().nonnegative(),
  /** Number of trips within the most active 10-event window. */
  maxTripDensity: z.number().int().nonnegative(),
  /** Aggregated count per source — every closed source key is present. */
  bySource: z.record(KillSwitchEventSourceSchema, z.number().int().nonnegative()),
  /** Active duration accounting in milliseconds across all engaged intervals. */
  activeDurationMs: z.number().nonnegative(),
  stability: KillSwitchStabilityClassSchema,
  headline: z.string(),
});

export type KillSwitchStabilityClassParsed = z.infer<
  typeof KillSwitchStabilityClassSchema
>;
export type KillSwitchEventSourceParsed = z.infer<
  typeof KillSwitchEventSourceSchema
>;
export type KillSwitchTimelineReportParsed = z.infer<
  typeof KillSwitchTimelineReportSchema
>;
