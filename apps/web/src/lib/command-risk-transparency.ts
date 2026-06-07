/**
 * Public command-risk transparency projection (ADR-134, dual-app strategy).
 *
 * `apps/web` is a PUBLIC, unauthenticated surface. This module projects the
 * illustrative command-risk aggregate fixture down to a CATEGORY DISTRIBUTION
 * ONLY for public display: a closed-enum category label plus a count censored
 * through the shared small-cohort floor.
 *
 * SECURITY — REDACTION BY CONSTRUCTION: command-risk audit detail carries the
 * RAW command (which may contain live secrets) and the matched rule ids (which
 * telegraph attack construction). This projection only ever reads `category` and
 * `count` — never any command text, rule id, disposition, timestamp, or tenant
 * datum. The output buckets have no field that could carry any of those, so it is
 * physically impossible to leak a command or a rule id through this surface. The
 * public view also drops the disposition split (blocked/rewritten/confirm) so an
 * outsider cannot infer "a credential-exfil attempt is in progress" from a
 * disposition spike.
 */
import { type PublicBucket, toPublicBuckets } from "./public-projection";
import type {
  CommandRiskCategory,
  CommandRiskTransparencyRow,
} from "./transparency-fixtures";

/** Display order for categories (most → least severe; safe last). */
const CATEGORY_ORDER: readonly CommandRiskCategory[] = [
  "destructive",
  "credential",
  "network",
  "safe",
];

/** Human label for a command-risk category. */
const CATEGORY_LABEL: Record<CommandRiskCategory, string> = {
  destructive: "Destructive",
  network: "Network",
  credential: "Credential",
  safe: "Safe",
};

/** A public command-risk bucket: closed-enum category plus a censored count. */
export interface CommandRiskPublicBucket extends PublicBucket {
  readonly category: CommandRiskCategory;
  readonly categoryLabel: string;
}

/**
 * Project illustrative command-risk aggregate rows into public, cohort-floored
 * buckets — a category distribution.
 *
 * Pure and order-stable: the output is sorted by category severity and is
 * deterministic for a given input. Rows with the same category are summed before
 * censoring. Only counts and closed-enum category labels are emitted — never any
 * command text, rule id, disposition, or timestamp.
 */
export function projectCommandRiskTransparency(
  sample: ReadonlyArray<CommandRiskTransparencyRow>,
): CommandRiskPublicBucket[] {
  // Aggregate counts by category so the projection is robust to duplicate rows
  // in the source fixture.
  const totals = new Map<CommandRiskCategory, number>();
  for (const row of sample) {
    const count = Number.isFinite(row.count) && row.count > 0 ? row.count : 0;
    totals.set(row.category, (totals.get(row.category) ?? 0) + count);
  }

  const pairs: Array<{ category: CommandRiskCategory; label: string; count: number }> =
    [];
  for (const category of CATEGORY_ORDER) {
    if (!totals.has(category)) continue;
    pairs.push({
      category,
      label: CATEGORY_LABEL[category],
      count: totals.get(category) ?? 0,
    });
  }

  // Project all rows through the shared public contract in one pass, then attach
  // the closed-enum category metadata for each bucket.
  const publicBuckets = toPublicBuckets(pairs);
  const result: CommandRiskPublicBucket[] = [];
  for (let i = 0; i < pairs.length; i += 1) {
    const pair = pairs[i];
    const bucket = publicBuckets[i];
    if (pair === undefined || bucket === undefined) continue;
    result.push({
      ...bucket,
      category: pair.category,
      categoryLabel: CATEGORY_LABEL[pair.category],
    });
  }
  return result;
}
