import type { AuditStore } from "../store/index.js";
import type {
  PiiEvent,
  PiiEventsQuery,
  PiiEventsResult,
} from "../schemas/pii-classification.js";

/**
 * Framework-agnostic data-classification (PII) EVENT handler (ADR-129).
 *
 * Where `createPiiClassificationHandler` returns aggregate counts, this returns
 * the individual disposition events for an operator drill-down: one row per
 * `(record × pii basis code)` occurrence, newest-first, carrying ONLY
 * non-sensitive metadata (`intentHash`, `at`, `intentKind`, `decisionKind`,
 * `sensitivityLevel`, `disposition`). The redacted values, field paths, and raw
 * payload are NEVER surfaced — they don't survive into the AuditRecord and must
 * not be reconstructed here.
 *
 * Supports optional `sensitivityLevel` / `disposition` filters and caps results
 * at `limit` (default 200, hard max 500), reporting `truncated` when the window
 * held more matches than were returned.
 */
export interface CreatePiiEventsHandlerDeps {
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

const DEFAULT_LIMIT = 200;
const HARD_MAX = 500;

export function createPiiEventsHandler(
  deps: CreatePiiEventsHandlerDeps,
): (input: PiiEventsQuery) => Promise<PiiEventsResult> {
  const queryLimit = deps.fallbackQueryLimit ?? HARD_MAX;
  const clock = deps.clock ?? (() => new Date().toISOString());
  return async (input) => {
    const until = input.until ?? clock();
    const limit = Math.min(input.limit ?? DEFAULT_LIMIT, HARD_MAX);
    const { records } = await deps.store.query({
      since: input.since,
      until,
      limit: queryLimit,
    });
    const matches: PiiEvent[] = [];
    for (const record of records) {
      if (record.at < input.since) continue;
      if (record.at > until) continue;
      for (const b of record.decision_basis) {
        if (b.category !== "validation") continue;
        const disposition = DISPOSITION_BY_CODE[b.code];
        if (disposition === undefined) continue;
        const level = (b.detail?.sensitivityLevel as string) ?? "low";
        if (!SENSITIVITY.has(level)) continue;
        const sensitivityLevel = level as Sensitivity;
        if (input.disposition && disposition !== input.disposition) continue;
        if (input.sensitivityLevel && sensitivityLevel !== input.sensitivityLevel) {
          continue;
        }
        matches.push({
          intentHash: record.intentHash,
          at: record.at,
          intentKind: record.envelope.kind,
          decisionKind: record.decision.kind,
          sensitivityLevel,
          disposition,
        });
      }
    }
    // Newest-first; the AuditStore does not guarantee ordering across pages.
    matches.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    const events = matches.slice(0, limit);
    return { events, truncated: matches.length > events.length };
  };
}
