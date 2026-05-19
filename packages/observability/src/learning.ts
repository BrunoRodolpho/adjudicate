/**
 * OTLP-shaped LearningSink.
 *
 * Adopters install this when they want adjudication outcomes routed to a
 * downstream analytics warehouse via the OTLP pipeline (e.g., a collector
 * that fans out to BigQuery / Snowflake / Honeycomb). The sink emits a
 * structured `learning.outcome` event per Decision; the exporter is
 * responsible for shaping it onto the destination's wire format.
 *
 * Learning events are richer than metrics — they carry `basisCodes`,
 * `planFingerprint`, and guard identity — so the `body` field carries the
 * full LearningEvent. Attributes mirror the headline fields for partition
 * keys.
 *
 * Wiring:
 *
 *     import { setLearningSink } from "@adjudicate/core/kernel";
 *     import { createOtlpLearningSink } from "@adjudicate/observability";
 *
 *     setLearningSink(createOtlpLearningSink({ exporter }));
 */

import type { LearningSink } from "@adjudicate/core/kernel";
import type { Exporter, ExportedEvent } from "./exporter.js";
import { SEMCONV } from "./semconv.js";

export interface OtlpLearningSinkOptions {
  readonly exporter: Exporter;
  /** Optional Pack identifier stamped on every event. */
  readonly packId?: string;
  /** Optional Pack policy version stamped on every event. */
  readonly policyVersion?: string;
}

export function createOtlpLearningSink(
  opts: OtlpLearningSinkOptions,
): LearningSink {
  return {
    recordOutcome(event) {
      const exported: ExportedEvent = {
        kind: "learning.outcome",
        name: "adjudicate.learning.outcome",
        at: event.at,
        attributes: {
          [SEMCONV.INTENT_KIND]: event.intentKind,
          [SEMCONV.DECISION_KIND]: event.decisionKind,
          [SEMCONV.TAINT]: event.taint,
          [SEMCONV.LATENCY_MS]: event.durationMs,
          [SEMCONV.INTENT_HASH]: event.intentHash,
          ...(event.guardId !== undefined
            ? { [SEMCONV.GUARD_ID]: event.guardId }
            : {}),
          ...(event.guardPhase !== undefined
            ? { "adjudicate.guard.phase": event.guardPhase }
            : {}),
          ...(event.planFingerprint !== undefined
            ? { "adjudicate.plan.fingerprint": event.planFingerprint }
            : {}),
          ...(opts.packId !== undefined ? { [SEMCONV.PACK_ID]: opts.packId } : {}),
          ...(opts.policyVersion !== undefined
            ? { [SEMCONV.POLICY_VERSION]: opts.policyVersion }
            : {}),
        },
        // Full LearningEvent for warehouses that ingest event bodies.
        body: event,
      };
      try {
        opts.exporter.export(exported);
      } catch {
        /* swallow — sink failures must not affect Decisions. */
      }
    },
  };
}
