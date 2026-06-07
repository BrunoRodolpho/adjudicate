/**
 * Hallucination scoring (ADR-124).
 *
 * An adopter-supplied groundedness scorer attaches a `hallucination_score` to
 * each `AuditRecord` via the kernel's `metadataProvider` seam, and (optionally)
 * emits an OTLP `adjudicate.hallucination.score` attribute. The score is
 * metadata/telemetry — NEVER a kernel-decision input. High scores should be
 * folded by the adopter into state `S` so later state guards tighten.
 */

import type { AuditRecord } from "@adjudicate/core";
import type { Exporter, ExportedEvent } from "./exporter.js";
import { SEMCONV } from "./semconv.js";

export interface HallucinationScorer {
  /** Returns a score in [0,1] (higher = less grounded), or undefined to skip. */
  score(record: AuditRecord): number | undefined;
}

export interface ScoreBucketOptions {
  /** score < grounded → "grounded". Default 0.34. */
  readonly grounded?: number;
  /** score >= hallucinated → "hallucinated". Default 0.67. */
  readonly hallucinated?: number;
}

export type HallucinationBucket = "grounded" | "uncertain" | "hallucinated";

/** Deterministic bucketing. Out-of-range scores are clamped to [0,1]. */
export function bucketHallucinationScore(
  score: number,
  opts: ScoreBucketOptions = {},
): HallucinationBucket {
  const grounded = opts.grounded ?? 0.34;
  const hallucinated = opts.hallucinated ?? 0.67;
  const s = Number.isFinite(score) ? Math.min(1, Math.max(0, score)) : 0;
  if (s >= hallucinated) return "hallucinated";
  if (s < grounded) return "grounded";
  return "uncertain";
}

/**
 * Build a `metadataProvider` (for `adjudicateAndAudit({ metadataProvider })`)
 * that attaches `{ hallucination_score, hallucination_bucket }` and, when an
 * `exporter` is supplied, ALSO emits the OTLP attribute. Best-effort: a throwing
 * exporter is swallowed; a scorer returning undefined yields no metadata.
 */
export function createHallucinationMetadataProvider(opts: {
  readonly scorer: HallucinationScorer;
  readonly exporter?: Exporter;
  readonly bucket?: ScoreBucketOptions;
}): {
  readonly metadataProvider: (record: AuditRecord) => Readonly<Record<string, unknown>> | undefined;
} {
  return {
    metadataProvider(record) {
      const raw = opts.scorer.score(record);
      if (raw === undefined) return undefined;
      const score = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0;
      const bucket = bucketHallucinationScore(score, opts.bucket);
      if (opts.exporter) {
        const event: ExportedEvent = {
          kind: "learning.outcome",
          name: "adjudicate.hallucination.score",
          at: record.at,
          attributes: {
            [SEMCONV.HALLUCINATION_SCORE]: score,
            [SEMCONV.HALLUCINATION_BUCKET]: bucket,
            [SEMCONV.INTENT_HASH]: record.intentHash,
            [SEMCONV.INTENT_KIND]: record.envelope.kind,
          },
        };
        try {
          opts.exporter.export(event);
        } catch {
          /* best-effort — never block the decision/audit path */
        }
      }
      return { hallucination_score: score, hallucination_bucket: bucket };
    },
  };
}
