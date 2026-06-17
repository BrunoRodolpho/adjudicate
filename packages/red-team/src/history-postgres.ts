/**
 * Postgres-backed `RedTeamHistoryStore` (ADR-133, durable variant).
 *
 * The in-memory `createInMemoryRedTeamHistoryStore` (see `./history.ts`) loses
 * every recorded run on a process restart, so the operator console's Red-Team
 * Trend chart resets to a single cold-start point on every deploy. A real
 * deployment records one run per CI release-candidate and wants that trend to
 * survive restarts. This is the durable variant.
 *
 * # Write-through cache (sync interface preserved)
 *
 * `RedTeamHistoryStore` is SYNCHRONOUS (`record(): void`, `view(): …`). To
 * satisfy that AND persist, this is a WRITE-THROUGH CACHE: a per-pack in-memory
 * ring (loaded from Postgres by `init()`) backs the synchronous reads, and each
 * `record` updates the ring synchronously then fire-and-forgets a Postgres
 * upsert. The dedupe identity is `(pack_id, digest)` — enforced both by the
 * in-memory ring AND a `UNIQUE(pack_id, digest)` constraint with `ON CONFLICT
 * DO NOTHING`, so a re-record of the same content is a no-op end to end (cold-
 * start replays never duplicate a run). A dropped async write is recovered on
 * the next `init()`. Mirrors `createPostgresRemediationProposalStore` (adjutant).
 *
 * Unlike the A1 token store, the ring here keeps the PERSISTED digest verbatim
 * (the digest is part of the wire view), so `init()` cannot delegate to the
 * digest-deriving in-memory store — it owns a tiny per-pack ring whose `view()`
 * mirrors `createInMemoryRedTeamHistoryStore`'s exactly.
 *
 * # Determinism — unchanged
 *
 * NO wall-clock and NO RNG on any recorded value (ADR-118 discipline): the
 * content digest is timing-excluded and `record(report, at)` takes the stamp
 * from the caller. The kernel never reads this — in-process telemetry, never a
 * system of record.
 *
 * # No `pg` dependency
 *
 * Callers inject a minimal `SqlExecutor` (pg.Pool satisfies it structurally),
 * exactly as the adjutant's proposal store does — the package stays neutral.
 */

import { digestRedTeamReport } from "./history.js";
import type {
  RedTeamHistoryOptions,
  RedTeamHistoryQuery,
  RedTeamHistoryStore,
  RedTeamHistoryView,
  RedTeamRunRecord,
  RedTeamTrendPoint,
} from "./history.js";
import type { RedTeamSummary } from "./runner.js";

/** Minimal structural Postgres surface — `pg.Pool` satisfies this. */
export interface SqlExecutor {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: ReadonlyArray<unknown>,
  ): Promise<{ rows: T[] }>;
}

/** DDL for the run-history table. Apply once (idempotent). */
export function redTeamRunsDDL(table = "red_team_runs"): string {
  return `
    CREATE TABLE IF NOT EXISTS ${table} (
      pack_id     TEXT NOT NULL,
      digest      TEXT NOT NULL,
      at          TIMESTAMPTZ NOT NULL,
      summary_jsonb JSONB NOT NULL,
      UNIQUE (pack_id, digest)
    );
    CREATE INDEX IF NOT EXISTS ${table}_pack_idx ON ${table}(pack_id);
    CREATE INDEX IF NOT EXISTS ${table}_at_idx ON ${table}(at);
  `;
}

interface RunRow {
  pack_id: string;
  digest: string;
  at: string | Date;
  summary_jsonb: unknown;
}

function toIso(v: string | Date): string {
  return typeof v === "string" ? v : v.toISOString();
}

function rowToRecord(r: RunRow): RedTeamRunRecord {
  return {
    digest: r.digest,
    at: toIso(r.at),
    packId: r.pack_id,
    summary: r.summary_jsonb as RedTeamSummary,
  };
}

/** Derive a trend point from a stored run record (mirrors history.ts). Pure. */
function toTrendPoint(rec: RedTeamRunRecord): RedTeamTrendPoint {
  return {
    at: rec.at,
    packId: rec.packId,
    total: rec.summary.total,
    defended: rec.summary.defended,
    escaped: rec.summary.escaped,
    errors: rec.summary.errors,
  };
}

export interface PostgresRedTeamHistoryStoreOptions
  extends RedTeamHistoryOptions {
  readonly sql: SqlExecutor;
  /** Table name (default `red_team_runs`). */
  readonly table?: string;
  /** Best-effort async-write failure hook (default: swallow). */
  readonly onWriteError?: (err: unknown) => void;
}

export interface PostgresRedTeamHistoryStore extends RedTeamHistoryStore {
  /** Load the cache from Postgres. Call once before serving reads. */
  init(): Promise<void>;
}

const DEFAULT_CAPACITY = 500;

/**
 * Build a durable, write-through `RedTeamHistoryStore` over Postgres. Reads are
 * served from a per-pack in-memory ring (sync interface); `record` updates the
 * ring then persists asynchronously (best-effort, idempotent on `(pack_id,
 * digest)`).
 */
export function createPostgresRedTeamHistoryStore(
  opts: PostgresRedTeamHistoryStoreOptions,
): PostgresRedTeamHistoryStore {
  const table = /^[A-Za-z_][A-Za-z0-9_.]*$/.test(opts.table ?? "red_team_runs")
    ? (opts.table ?? "red_team_runs")
    : "red_team_runs";
  const onWriteError = opts.onWriteError ?? (() => {});
  const rawCapacity = opts.capacity ?? DEFAULT_CAPACITY;
  const capacity =
    Number.isFinite(rawCapacity) && rawCapacity >= 1
      ? Math.floor(rawCapacity)
      : DEFAULT_CAPACITY;

  // Per-pack ring buffers, each oldest → newest. A Map keeps pack insertion
  // order (first-seen) so the cross-pack view is deterministic — identical to
  // createInMemoryRedTeamHistoryStore.
  let byPack = new Map<string, RedTeamRunRecord[]>();

  const fireWrite = (p: Promise<unknown>): void => {
    p.catch(onWriteError);
  };

  /** Append one record to its pack ring, idempotent on digest, FIFO-bounded. */
  function appendRecord(rec: RedTeamRunRecord): void {
    const ring = byPack.get(rec.packId) ?? [];
    if (ring.some((r) => r.digest === rec.digest)) return; // idempotent
    ring.push(rec);
    while (ring.length > capacity) ring.shift();
    byPack.set(rec.packId, ring);
  }

  return {
    async init() {
      // Self-provision the run-history table (idempotent) so a fresh adopter DB
      // doesn't 500 the console route on the first SELECT below.
      await opts.sql.query(redTeamRunsDDL(table));
      const { rows } = await opts.sql.query<RunRow>(
        `SELECT pack_id, digest, at, summary_jsonb FROM ${table} ORDER BY at ASC`,
      );
      byPack = new Map();
      for (const r of rows) appendRecord(rowToRecord(r));
    },

    record(report, at) {
      const packId = report.pack.id;
      const digest = digestRedTeamReport(report);
      // Synchronous cache update (idempotent on (packId, digest)).
      appendRecord({ digest, at, packId, summary: report.summary });
      // Fire-and-forget upsert; UNIQUE(pack_id, digest) + DO NOTHING makes a
      // re-record of the same content a no-op end to end.
      fireWrite(
        opts.sql.query(
          `INSERT INTO ${table} (pack_id, digest, at, summary_jsonb)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (pack_id, digest) DO NOTHING`,
          [packId, digest, at, JSON.stringify(report.summary)],
        ),
      );
    },

    view(query: RedTeamHistoryQuery = {}): RedTeamHistoryView {
      const limit =
        query.limit != null && Number.isFinite(query.limit) && query.limit >= 1
          ? Math.floor(query.limit)
          : undefined;

      const packEntries = [...byPack.entries()].filter(
        ([packId]) => query.packId == null || packId === query.packId,
      );

      const runs: RedTeamRunRecord[] = [];
      const trend: RedTeamTrendPoint[] = [];
      for (const [, ring] of packEntries) {
        const windowed = limit != null ? ring.slice(-limit) : ring;
        for (let i = windowed.length - 1; i >= 0; i--) runs.push(windowed[i]!);
        for (const rec of windowed) trend.push(toTrendPoint(rec));
      }
      return { runs, trend };
    },

    reset() {
      byPack = new Map();
      fireWrite(opts.sql.query(`DELETE FROM ${table}`));
    },
  };
}
