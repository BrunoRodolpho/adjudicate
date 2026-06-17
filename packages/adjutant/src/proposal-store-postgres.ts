/**
 * createPostgresRemediationProposalStore (P4) — a DURABLE RemediationProposalStore.
 *
 * The `RemediationProposalStore` interface is synchronous (in-memory-shaped:
 * `get(): RemediationProposal | null`, `put(): void`). To satisfy it AND persist
 * across restarts, this is a WRITE-THROUGH CACHE: an in-memory Map backs the
 * synchronous reads (loaded from Postgres by `init()`), and every mutation
 * updates the Map synchronously then fire-and-forgets a Postgres upsert. The
 * proposal read-model is "durable-ish" by contract (operator observation,
 * insertion-ordered, newest-first) — a dropped async write is recovered on the
 * next `init()` and never affects governance (the kernel never reads this).
 *
 * The store reads/writes the shared adopter Postgres (the same DATABASE_URL the
 * audit store + agent_runs use). No `pg` dependency: callers inject a minimal
 * `SqlExecutor` (pg.Pool satisfies it structurally).
 */

import type { IntentEnvelope } from "@adjudicate/core";
import type { IncidentIntentKind } from "@adjudicate/pack-incident-response";
import type { RemediationDisposition } from "./types.js";
import type {
  RemediationProposal,
  RemediationProposalStatus,
  RemediationProposalStore,
} from "./proposal-store.js";

/** Minimal structural Postgres surface — `pg.Pool` satisfies this. */
export interface SqlExecutor {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: ReadonlyArray<unknown>,
  ): Promise<{ rows: T[] }>;
}

/** DDL for the proposal read-model table. Apply once (idempotent). */
export function remediationProposalsDDL(table = "remediation_proposals"): string {
  return `
    CREATE TABLE IF NOT EXISTS ${table} (
      proposal_id   TEXT PRIMARY KEY,
      incident_id   TEXT NOT NULL,
      action        TEXT NOT NULL,
      blast_radius  INTEGER NOT NULL,
      disposition   TEXT NOT NULL,
      status        TEXT NOT NULL,
      approval_token TEXT,
      intent_hash   TEXT,
      envelope_jsonb JSONB,
      created_at    TIMESTAMPTZ NOT NULL,
      updated_at    TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ${table}_incident_idx ON ${table}(incident_id);
    CREATE INDEX IF NOT EXISTS ${table}_status_idx ON ${table}(status);
    CREATE INDEX IF NOT EXISTS ${table}_token_idx ON ${table}(approval_token);
  `;
}

interface ProposalRow {
  proposal_id: string;
  incident_id: string;
  action: string;
  blast_radius: number;
  disposition: string;
  status: string;
  approval_token: string | null;
  intent_hash: string | null;
  envelope_jsonb: unknown;
  created_at: string | Date;
  updated_at: string | Date;
}

function rowToProposal(r: ProposalRow): RemediationProposal {
  return {
    proposalId: r.proposal_id,
    incidentId: r.incident_id,
    action: r.action,
    blastRadius: r.blast_radius,
    disposition: r.disposition as RemediationDisposition,
    status: r.status as RemediationProposalStatus,
    ...(r.approval_token !== null ? { approvalToken: r.approval_token } : {}),
    ...(r.intent_hash !== null ? { intentHash: r.intent_hash } : {}),
    ...(r.envelope_jsonb != null
      ? { envelope: r.envelope_jsonb as IntentEnvelope<IncidentIntentKind> }
      : {}),
    createdAt: toIso(r.created_at),
    updatedAt: toIso(r.updated_at),
  };
}

function toIso(v: string | Date): string {
  return typeof v === "string" ? v : v.toISOString();
}

/** Default cap on the rows the init() scan loads into the cache (#28-7). */
const DEFAULT_CAPACITY = 1000;

export interface PostgresProposalStoreOptions {
  readonly sql: SqlExecutor;
  /** Table name (default `remediation_proposals`). */
  readonly table?: string;
  /**
   * Max proposals (newest-updated first) the init() scan loads. Default 1000.
   * Bounds the load so a large table can't pull an unbounded result set into
   * the in-memory cache; the newest `capacity` rows are kept.
   */
  readonly capacity?: number;
  /** Best-effort async-write failure hook (default: swallow). */
  readonly onWriteError?: (err: unknown) => void;
}

export interface PostgresRemediationProposalStore extends RemediationProposalStore {
  /** Load the cache from Postgres. Call once before serving reads. */
  init(): Promise<void>;
}

/**
 * Build a durable, write-through `RemediationProposalStore` over Postgres.
 * Reads are served from the in-memory cache (sync interface); writes update the
 * cache then persist asynchronously (best-effort).
 */
export function createPostgresRemediationProposalStore(
  opts: PostgresProposalStoreOptions,
): PostgresRemediationProposalStore {
  // #28-4: `table` is interpolated into DDL/SELECT/INSERT/UPDATE and into the
  // derived index names below, so guard it against identifier injection (mirrors
  // the inline guard in red-team's history-postgres.ts; safeIdent in
  // adapter-core is module-private and cross-package, not importable here).
  const table = /^[A-Za-z_][A-Za-z0-9_.]*$/.test(opts.table ?? "remediation_proposals")
    ? (opts.table ?? "remediation_proposals")
    : "remediation_proposals";
  const rawCapacity = opts.capacity ?? DEFAULT_CAPACITY;
  const capacity =
    Number.isFinite(rawCapacity) && rawCapacity >= 1
      ? Math.floor(rawCapacity)
      : DEFAULT_CAPACITY;
  const onWriteError = opts.onWriteError ?? (() => {});
  // Insertion-ordered cache; re-inserting on update moves a proposal to the end.
  const byId = new Map<string, RemediationProposal>();

  const fireWrite = (p: Promise<unknown>): void => {
    p.catch(onWriteError);
  };

  return {
    async init() {
      // Self-provision the read-model table (idempotent) so a fresh adopter DB
      // doesn't 500 the admin route on the first SELECT below.
      await opts.sql.query(remediationProposalsDDL(table));
      // #28-7: bound the scan to the newest `capacity` rows, then re-sort ASC so
      // the cache stays oldest→newest (list() does `.reverse()` for newest-first).
      // The inner DESC+LIMIT picks the freshest rows; the outer ASC restores order.
      const { rows } = await opts.sql.query<ProposalRow>(
        `SELECT * FROM (
           SELECT * FROM ${table} ORDER BY updated_at DESC LIMIT ${capacity}
         ) sub ORDER BY updated_at ASC`,
      );
      byId.clear();
      for (const r of rows) {
        const p = rowToProposal(r);
        byId.set(p.proposalId, p);
      }
    },

    put(proposal) {
      byId.delete(proposal.proposalId);
      byId.set(proposal.proposalId, proposal);
      fireWrite(
        opts.sql.query(
          `INSERT INTO ${table}
             (proposal_id, incident_id, action, blast_radius, disposition, status,
              approval_token, intent_hash, envelope_jsonb, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (proposal_id) DO UPDATE SET
             incident_id = EXCLUDED.incident_id,
             action = EXCLUDED.action,
             blast_radius = EXCLUDED.blast_radius,
             disposition = EXCLUDED.disposition,
             status = EXCLUDED.status,
             approval_token = EXCLUDED.approval_token,
             intent_hash = EXCLUDED.intent_hash,
             envelope_jsonb = EXCLUDED.envelope_jsonb,
             updated_at = EXCLUDED.updated_at`,
          [
            proposal.proposalId,
            proposal.incidentId,
            proposal.action,
            proposal.blastRadius,
            proposal.disposition,
            proposal.status,
            proposal.approvalToken ?? null,
            proposal.intentHash ?? null,
            proposal.envelope ? JSON.stringify(proposal.envelope) : null,
            proposal.createdAt,
            proposal.updatedAt,
          ],
        ),
      );
    },

    get(proposalId) {
      return byId.get(proposalId) ?? null;
    },

    getByToken(token) {
      for (const p of byId.values()) {
        if (p.approvalToken === token) return p;
      }
      return null;
    },

    list(filter = {}) {
      const out: RemediationProposal[] = [];
      for (const p of byId.values()) {
        if (filter.incidentId !== undefined && p.incidentId !== filter.incidentId) continue;
        if (filter.status !== undefined && p.status !== filter.status) continue;
        out.push(p);
      }
      return out.reverse();
    },

    markResolved(proposalId, status, at) {
      const prev = byId.get(proposalId);
      if (prev === undefined) return;
      byId.delete(proposalId);
      const next = { ...prev, status, updatedAt: at };
      byId.set(proposalId, next);
      fireWrite(
        opts.sql.query(
          `UPDATE ${table} SET status = $2, updated_at = $3 WHERE proposal_id = $1`,
          [proposalId, status, at],
        ),
      );
    },
  };
}
