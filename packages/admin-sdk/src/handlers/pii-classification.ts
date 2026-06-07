import type { AuditStore } from "../store/index.js";
import type {
  PiiClassificationBucket,
  PiiClassificationQuery,
  PiiClassificationResult,
} from "../schemas/pii-classification.js";

/**
 * Framework-agnostic data-classification (PII) stats handler (ADR-117).
 *
 * Iterates audit records in the window and buckets data-classification
 * dispositions by `(sensitivityLevel × disposition)`. The disposition +
 * sensitivity ride in `DecisionBasis.detail` of the `validation` basis codes
 * `pii_redacted` (→ "redacted") and `pii_blocked` (→ "blocked") — the only
 * structured channel that survives into the AuditRecord (GuardDescription
 * metadata is never serialized into a record).
 *
 * Default strategy paginates `store.query` up to `fallbackQueryLimit`
 * (AuditStore caps at 500); production adopters needing wider windows wire a
 * native aggregator.
 */
export interface CreatePiiClassificationHandlerDeps {
  readonly store: AuditStore;
  readonly fallbackQueryLimit?: number;
  readonly clock?: () => string;
}

const SENSITIVITY = new Set(["low", "medium", "high", "critical"]);
type Sensitivity = "low" | "medium" | "high" | "critical";
type Disposition = "redacted" | "blocked";

const DISPOSITION_BY_CODE: Record<string, Disposition> = {
  pii_redacted: "redacted",
  pii_blocked: "blocked",
};

export function createPiiClassificationHandler(
  deps: CreatePiiClassificationHandlerDeps,
): (input: PiiClassificationQuery) => Promise<PiiClassificationResult> {
  const limit = deps.fallbackQueryLimit ?? 500;
  const clock = deps.clock ?? (() => new Date().toISOString());
  return async (input) => {
    const until = input.until ?? clock();
    const { records } = await deps.store.query({
      since: input.since,
      until,
      limit,
    });
    // Keyed by `${sensitivityLevel}|${disposition}` for stable aggregation.
    const counts = new Map<string, number>();
    for (const record of records) {
      if (record.at < input.since) continue;
      if (record.at > until) continue;
      for (const b of record.decision_basis) {
        if (b.category !== "validation") continue;
        const disposition = DISPOSITION_BY_CODE[b.code];
        if (disposition === undefined) continue;
        const level = (b.detail?.sensitivityLevel as string) ?? "low";
        if (!SENSITIVITY.has(level)) continue;
        const key = `${level}|${disposition}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    const buckets: PiiClassificationBucket[] = Array.from(counts.entries())
      .map(([key, count]) => {
        const [sensitivityLevel, disposition] = key.split("|") as [Sensitivity, Disposition];
        return { sensitivityLevel, disposition, count };
      })
      // Deterministic order: by sensitivity tier (desc) then disposition.
      .sort((a, b) =>
        a.sensitivityLevel === b.sensitivityLevel
          ? a.disposition < b.disposition
            ? -1
            : 1
          : tierRank(b.sensitivityLevel) - tierRank(a.sensitivityLevel),
      );
    return { buckets };
  };
}

function tierRank(level: Sensitivity): number {
  return { low: 0, medium: 1, high: 2, critical: 3 }[level];
}
