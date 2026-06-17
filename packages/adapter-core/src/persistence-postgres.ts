/**
 * Postgres-backed `MemoryStore` (ADR-126 read surface, durable variant).
 *
 * The in-memory `createInMemoryMemoryStore` (see `./persistence.ts`) is for
 * tests + the quickstart; it only ever holds what THIS process wrote. The
 * operator console runs no adapter loop, so to show REAL session memory it must
 * READ the claustrum memory tables the agent runtime writes:
 *
 *   - `claustrum_memory_semantic`   — durable per-customer facts/preferences
 *   - `claustrum_memory_relational` — durable per-customer relationships
 *
 * Claustrum keys memory by `customer_id`, but the console looks memory up by
 * `sessionId` (that is what the audit/approval surfaces carry). The bridge is a
 * `sessionId → customer_id` join through `intent_audit` (the audit row records
 * both the session and the resolved customer). This store performs that join,
 * then folds the customer's semantic + relational rows into one memory object.
 *
 * # Read-only by design
 *
 * Claustrum OWNS the writes to these tables; the console only READS. `put` /
 * `merge` are therefore no-ops here (they resolve without writing) — wiring a
 * write path would let the console mutate another service's source of truth.
 * The console only calls `get`.
 *
 * # Fail-open
 *
 * Any query error (missing table, transient DB blip, no matching session)
 * resolves to `null` rather than throwing — `get` is a telemetry read and must
 * never 500 the operator UI. The caller layers this over an in-memory fallback
 * (`createInMemoryMemoryStore`) so the surface degrades to "no memory shown",
 * never to an error page. This mirrors the `DATABASE_URL`-gated fail-open
 * Postgres read in the console's `catches.query()`.
 *
 * # No `pg` dependency
 *
 * Callers inject a minimal `SqlExecutor` (pg.Pool satisfies it structurally),
 * exactly as the adjutant's `createPostgresRemediationProposalStore` does — the
 * package stays provider-neutral.
 */

import type { MemoryStore } from "./persistence.js";

/** Minimal structural Postgres surface — `pg.Pool` satisfies this. */
export interface MemorySqlExecutor {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: ReadonlyArray<unknown>,
  ): Promise<{ rows: T[] }>;
}

export interface CreatePostgresMemoryStoreOptions {
  readonly sql: MemorySqlExecutor;
  /** Semantic-memory table. Default `claustrum_memory_semantic`. */
  readonly semanticTable?: string;
  /** Relational-memory table. Default `claustrum_memory_relational`. */
  readonly relationalTable?: string;
  /** Session→customer join table. Default `intent_audit`. */
  readonly auditTable?: string;
  /** Session-id column on the audit table. Default `session_id`. */
  readonly sessionColumn?: string;
  /**
   * Resolved customer-id column on the audit table. Default `customer_id`.
   * NOTE: the stock `@adjudicate/audit-postgres` `intent_audit` does NOT carry a
   * customer column — an adopter must add one (or point this at theirs) for
   * session→customer resolution to return memory; otherwise the store stays
   * fail-open (resolves to `null` → in-memory/demo fallback).
   */
  readonly customerColumn?: string;
  /** Timestamp column used to pick the most-recent audit row. Default
   *  `recorded_at` (the audit-postgres column — NOT `at`). */
  readonly recordedAtColumn?: string;
  /** Best-effort read-error hook (default: swallow → fail-open to null). */
  readonly onReadError?: (err: unknown) => void;
}

/** Identifier safety: the configured table names must be plain identifiers. */
function safeIdent(name: string, fallback: string): string {
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(name) ? name : fallback;
}

interface SemanticRow {
  key: string | null;
  value: unknown;
}
interface RelationalRow {
  relation: string | null;
  target: string | null;
}

/**
 * Build a read-only, fail-open `MemoryStore` over the claustrum memory tables.
 * `get(sessionId)` joins `sessionId → customer_id` via `intent_audit`, then
 * returns the customer's folded semantic + relational memory (or `null`).
 */
export function createPostgresMemoryStore<M = Record<string, unknown>>(
  opts: CreatePostgresMemoryStoreOptions,
): MemoryStore<M> {
  const semanticTable = safeIdent(
    opts.semanticTable ?? "claustrum_memory_semantic",
    "claustrum_memory_semantic",
  );
  const relationalTable = safeIdent(
    opts.relationalTable ?? "claustrum_memory_relational",
    "claustrum_memory_relational",
  );
  const auditTable = safeIdent(opts.auditTable ?? "intent_audit", "intent_audit");
  const sessionColumn = safeIdent(opts.sessionColumn ?? "session_id", "session_id");
  const customerColumn = safeIdent(opts.customerColumn ?? "customer_id", "customer_id");
  const recordedAtColumn = safeIdent(
    opts.recordedAtColumn ?? "recorded_at",
    "recorded_at",
  );
  const onReadError = opts.onReadError ?? (() => {});

  return {
    async get(sessionId: string): Promise<M | null> {
      try {
        // 1) Resolve sessionId → customer_id via the most-recent audit row that
        //    carries both. LIMIT 1 — one session maps to at most one customer.
        const customerRes = await opts.sql.query<{ customer_id: string | null }>(
          `SELECT ${customerColumn} AS customer_id
             FROM ${auditTable}
            WHERE ${sessionColumn} = $1 AND ${customerColumn} IS NOT NULL
            ORDER BY ${recordedAtColumn} DESC
            LIMIT 1`,
          [sessionId],
        );
        const customerId = customerRes.rows[0]?.customer_id ?? null;
        if (customerId === null) return null;

        // 2) Fold the customer's semantic + relational rows into one memory obj.
        const [semanticRes, relationalRes] = await Promise.all([
          opts.sql.query<SemanticRow>(
            `SELECT key, value FROM ${semanticTable} WHERE customer_id = $1`,
            [customerId],
          ),
          opts.sql.query<RelationalRow>(
            `SELECT relation, target FROM ${relationalTable} WHERE customer_id = $1`,
            [customerId],
          ),
        ]);

        if (semanticRes.rows.length === 0 && relationalRes.rows.length === 0) {
          return null;
        }

        const semantic: Record<string, unknown> = {};
        for (const r of semanticRes.rows) {
          if (r.key !== null) semantic[r.key] = r.value;
        }
        const relations = relationalRes.rows
          .filter((r) => r.relation !== null)
          .map((r) => ({ relation: r.relation as string, target: r.target }));

        return {
          customerId,
          ...semantic,
          ...(relations.length > 0 ? { relations } : {}),
        } as unknown as M;
      } catch (err) {
        // Fail-open: a telemetry read must never 500 the operator UI.
        onReadError(err);
        return null;
      }
    },

    // Read-only: claustrum owns the writes. Resolve without writing.
    async put(): Promise<void> {
      /* no-op — console never writes claustrum's source of truth */
    },
    async merge(sessionId: string): Promise<M> {
      const current = await this.get(sessionId);
      return (current ?? ({} as M)) as M;
    },
  };
}
