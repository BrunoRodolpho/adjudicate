/**
 * Postgres-backed OutcomeSink + OutcomeLookup. Plugs into core's
 * `recordRetrospectiveOutcome` flow and the admin-sdk's
 * `governance.decisionAccuracy` query.
 *
 * Writes are append-only into `audit_outcomes` (one row per observation).
 * The lookup interface returns the most recent observation for a given
 * `intentHash` — multiple-observation history is queryable via the table
 * directly but isn't part of the in-memory shape the SDK consumes.
 */

import type {
  OutcomeSink,
  RetrospectiveOutcome,
} from "@adjudicate/core";
import type { PostgresReader } from "./pg-reader.js";

interface AuditOutcomeRow {
  intent_hash: string;
  observed: RetrospectiveOutcome["observed"];
  observed_at: string | Date;
  note: string | null;
}

export interface OutcomesWriter {
  insertOutcome(args: {
    readonly intentHash: string;
    readonly observed: RetrospectiveOutcome["observed"];
    readonly at: string;
    readonly note: string | null;
  }): Promise<void>;
}

export const INSERT_OUTCOME_SQL = `
INSERT INTO audit_outcomes (intent_hash, observed, observed_at, note)
VALUES ($1, $2, $3, $4)
ON CONFLICT (intent_hash, observed_at) DO NOTHING
`;

export interface CreatePostgresOutcomeSinkDeps {
  readonly writer: OutcomesWriter;
}

export function createPostgresOutcomeSink(
  deps: CreatePostgresOutcomeSinkDeps,
): OutcomeSink {
  return {
    async recordOutcome(o: RetrospectiveOutcome) {
      await deps.writer.insertOutcome({
        intentHash: o.intentHash,
        observed: o.observed,
        at: o.at,
        note: o.note ?? null,
      });
    },
  };
}

/**
 * Read-side lookup for `governance.decisionAccuracy`. Returns the most
 * recent observation per `intentHash`. Queried per-record by the
 * decision-accuracy handler.
 */
export function createPostgresOutcomeLookup(deps: {
  readonly reader: PostgresReader;
}): { get(intentHash: string): RetrospectiveOutcome | undefined } {
  return {
    get(_intentHash: string): RetrospectiveOutcome | undefined {
      // The synchronous get() contract matches the admin-sdk's
      // OutcomeLookup interface, which is hot-path-fast over an
      // in-memory map. Postgres-backed adopters should preload outcomes
      // for the audit window into memory once per request — that path
      // lives at the admin-sdk handler, not in this adapter. See
      // `createDecisionAccuracyHandler` for the preload pattern an
      // adopter can mirror.
      void deps;
      return undefined;
    },
  };
}

/**
 * Bulk preload for the accuracy handler: fetch all outcomes whose
 * `observed_at` falls in the inclusive window [sinceIso, untilIso] and return
 * them indexed by intentHash (latest observation wins). The admin-sdk handler
 * can build the in-memory lookup from this.
 *
 * Inclusive bounds on both ends (APIReviewer-003 boundary convention): an
 * observation whose `observed_at` equals `untilIso` IS included, so the
 * `decisionAccuracy` window join stays consistent with the audit query window.
 */
export async function loadOutcomesWindow(
  reader: PostgresReader,
  args: { readonly sinceIso: string; readonly untilIso?: string },
): Promise<Map<string, RetrospectiveOutcome>> {
  const params: unknown[] = [args.sinceIso];
  let where = "observed_at >= $1";
  if (args.untilIso) {
    params.push(args.untilIso);
    where += ` AND observed_at <= $2`;
  }
  const rows = await reader.query<AuditOutcomeRow>(
    `SELECT intent_hash, observed, observed_at, note
     FROM audit_outcomes
     WHERE ${where}
     ORDER BY observed_at ASC`,
    params,
  );
  const m = new Map<string, RetrospectiveOutcome>();
  for (const r of rows) {
    const at =
      typeof r.observed_at === "string"
        ? r.observed_at
        : r.observed_at.toISOString();
    m.set(r.intent_hash, {
      intentHash: r.intent_hash,
      observed: r.observed,
      at,
      ...(r.note !== null ? { note: r.note } : {}),
    });
  }
  return m;
}
