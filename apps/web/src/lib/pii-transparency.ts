/**
 * Public PII transparency projection (ADR-128, dual-app strategy).
 *
 * `apps/web` is a PUBLIC, unauthenticated surface. This module projects the
 * illustrative PII aggregate fixture down to AGGREGATES ONLY for public display:
 * a closed-enum (sensitivity × disposition) label plus a count censored through
 * the shared small-cohort floor. By construction it only ever reads the
 * `sensitivityLevel`, `disposition`, and `count` fields — never any raw value,
 * field name, hash, or free-text — so nothing sensitive can cross the boundary.
 */
import {
  type PublicBucket,
  toPublicBuckets,
} from "./public-projection";
import type {
  PiiDisposition,
  PiiSensitivityLevel,
  PiiTransparencyRow,
} from "./transparency-fixtures";

/** Display order for sensitivity classes (least → most sensitive). */
const SENSITIVITY_ORDER: readonly PiiSensitivityLevel[] = [
  "low",
  "medium",
  "high",
  "critical",
];

/** Display order for dispositions. */
const DISPOSITION_ORDER: readonly PiiDisposition[] = ["redacted", "blocked"];

/** Human label for a sensitivity class. */
const SENSITIVITY_LABEL: Record<PiiSensitivityLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

/** Human label for a disposition. */
const DISPOSITION_LABEL: Record<PiiDisposition, string> = {
  redacted: "Redacted",
  blocked: "Blocked",
};

/** A public PII bucket: closed-enum sensitivity/disposition plus a censored count. */
export interface PiiPublicBucket extends PublicBucket {
  readonly sensitivityLevel: PiiSensitivityLevel;
  readonly disposition: PiiDisposition;
  readonly sensitivityLabel: string;
  readonly dispositionLabel: string;
}

/**
 * Project illustrative PII aggregate rows into public, cohort-floored buckets.
 *
 * Pure and order-stable: the output is sorted by (sensitivity, disposition) and
 * is deterministic for a given input. Rows with the same (sensitivity,
 * disposition) are summed before censoring. Only counts and closed-enum labels
 * are emitted — never any raw value, field, or hash.
 */
export function projectPiiTransparency(
  sample: ReadonlyArray<PiiTransparencyRow>,
): PiiPublicBucket[] {
  // Aggregate counts by (sensitivity, disposition) so the projection is robust
  // to duplicate rows in the source fixture.
  const totals = new Map<string, number>();
  for (const row of sample) {
    const key = `${row.sensitivityLevel}/${row.disposition}`;
    const count = Number.isFinite(row.count) && row.count > 0 ? row.count : 0;
    totals.set(key, (totals.get(key) ?? 0) + count);
  }

  const pairs: Array<{
    sensitivityLevel: PiiSensitivityLevel;
    disposition: PiiDisposition;
    label: string;
    count: number;
  }> = [];

  for (const sensitivityLevel of SENSITIVITY_ORDER) {
    for (const disposition of DISPOSITION_ORDER) {
      const key = `${sensitivityLevel}/${disposition}`;
      if (!totals.has(key)) continue;
      pairs.push({
        sensitivityLevel,
        disposition,
        label: `${SENSITIVITY_LABEL[sensitivityLevel]} · ${DISPOSITION_LABEL[disposition]}`,
        count: totals.get(key) ?? 0,
      });
    }
  }

  // Project all rows through the shared public contract in one pass, then attach
  // the closed-enum sensitivity/disposition metadata for each bucket.
  const publicBuckets = toPublicBuckets(pairs);
  const result: PiiPublicBucket[] = [];
  for (let i = 0; i < pairs.length; i += 1) {
    const pair = pairs[i];
    const bucket = publicBuckets[i];
    if (pair === undefined || bucket === undefined) continue;
    result.push({
      ...bucket,
      sensitivityLevel: pair.sensitivityLevel,
      disposition: pair.disposition,
      sensitivityLabel: SENSITIVITY_LABEL[pair.sensitivityLevel],
      dispositionLabel: DISPOSITION_LABEL[pair.disposition],
    });
  }
  return result;
}
