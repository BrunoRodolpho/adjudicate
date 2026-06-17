/**
 * createPostgresIncidentProjection (P4) — incidents PROJECTED from real agent
 * runs, NOT a second adjudication.
 *
 * # No canned data, but one honest analogy
 * The adopter (ibatexas) models PIX-payment remediation; the adjutant interface
 * models SRE incidents. This projection maps each managed-agent run
 * (`ibx_domain.agent_runs`, one row per trigger turn) onto one incident:
 *   incidentId      = the run's `entity` (e.g. order:123)
 *   lastDisposition = a LOSSY 6→3 map of the kernel DecisionKind onto the
 *                     RemediationDisposition union (EXECUTE→SAFE,
 *                     REQUEST_CONFIRMATION/DEFER→REVIEW, ESCALATE/REFUSE→MANUAL,
 *                     REWRITE→SAFE). REFUSE/DEFER/REWRITE have no natural SRE
 *                     target — these are SYNTHESIZED. The richer incident-page
 *                     fields (severity / blastRadius / dependencies) are NOT in
 *                     this read-model entry; where the operator UI shows them
 *                     they are FABRICATED from payment status and must carry a
 *                     "no canned data — operator analogy" banner (owner sign-off).
 *
 * The interface is synchronous (`list()`/`get()` return values), so reads are
 * served from an in-memory cache refreshed from Postgres by `refresh()`. The
 * cache is a pure fold of agent_runs — `record()` is a no-op (this projection
 * derives from runs, it does not accumulate orchestrator outcomes).
 *
 * No `pg` dependency: callers inject a minimal `SqlExecutor` (pg.Pool satisfies it).
 */

import type {
  IncidentProjection,
  IncidentProjectionEntry,
} from "./incident-projection.js";
import type { PendingAction, RemediationDisposition } from "./types.js";
import type { SqlExecutor } from "./proposal-store-postgres.js";

/** LOSSY 6→3 map: kernel DecisionKind → RemediationDisposition (synthesized analogy). */
export function dispositionFromDecisionKind(decisionKind: string): RemediationDisposition {
  switch (decisionKind) {
    case "EXECUTE":
    case "REWRITE": // kernel sanitized + would execute → treat as auto-safe
      return "SAFE";
    case "REQUEST_CONFIRMATION":
    case "DEFER": // awaiting a signal → still needs a human eye
      return "REVIEW";
    case "ESCALATE":
    case "REFUSE": // no natural SRE target → escalate to a human
    default:
      return "MANUAL";
  }
}

/** Derive the read-model's `pending` shape from the kernel decision kind. */
function pendingFromDecisionKind(decisionKind: string): PendingAction | null {
  switch (decisionKind) {
    case "REQUEST_CONFIRMATION":
      return { kind: "review" };
    case "ESCALATE":
      return { kind: "escalation" };
    case "DEFER":
      return { kind: "defer" };
    default:
      return null;
  }
}

interface AgentRunRow {
  entity: string;
  decision_kind: string;
  at: string | Date;
}

/** Identifier safety: a configured table name must be a plain identifier. */
function safeIdent(name: string, fallback: string): string {
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(name) ? name : fallback;
}

/**
 * Default cap on the number of incidents (latest-per-entity) the projection
 * loads. Bounds the init/refresh scan so a large agent_runs table cannot pull
 * an unbounded result set into the in-memory cache (#28-10). This is a COUNT
 * bound on the freshest entities — it never drops an entity by age, so it
 * carries no semantic window behaviour.
 */
const DEFAULT_INCIDENT_CAPACITY = 1000;

export interface PostgresIncidentProjectionOptions {
  readonly sql: SqlExecutor;
  /** Fully-qualified agent_runs table (default `ibx_domain.agent_runs`). */
  readonly agentRunsTable?: string;
  /**
   * Max incidents (newest-run-first) to fold into the cache. Default 1000.
   * Bounds the refresh scan; the N most-recently-active entities are kept.
   */
  readonly capacity?: number;
}

export interface PostgresIncidentProjection extends IncidentProjection {
  /** Refresh the cache from the latest agent_runs rows (one incident per entity). */
  refresh(): Promise<void>;
}

/**
 * Build a durable `IncidentProjection` that folds `agent_runs` into per-incident
 * entries (latest run per entity wins). Call `refresh()` to (re)load; reads are
 * served from the in-memory cache to satisfy the synchronous interface.
 */
export function createPostgresIncidentProjection(
  opts: PostgresIncidentProjectionOptions,
): PostgresIncidentProjection {
  // #28-4: the table name is interpolated into the SELECT below, so guard it
  // against identifier injection (the default is schema-qualified, allowed).
  const agentRuns = safeIdent(
    opts.agentRunsTable ?? "ibx_domain.agent_runs",
    "ibx_domain.agent_runs",
  );
  const rawCapacity = opts.capacity ?? DEFAULT_INCIDENT_CAPACITY;
  const capacity =
    Number.isFinite(rawCapacity) && rawCapacity >= 1
      ? Math.floor(rawCapacity)
      : DEFAULT_INCIDENT_CAPACITY;
  // Insertion-ordered (newest-updated last); list() reverses to newest-first.
  const byId = new Map<string, IncidentProjectionEntry>();

  return {
    async refresh() {
      // One incident per entity = the LATEST agent run for that entity, bounded
      // to the `capacity` most-recently-active entities (#28-10 scan bound — a
      // COUNT cap, never a time window, so no entity is dropped by age). The
      // inner DISTINCT ON picks latest-per-entity; the middle query keeps the N
      // freshest; the outer ORDER BY at ASC delivers them oldest-first so the
      // Map fold below needs no JS re-sort (list() reverses to newest-first).
      const { rows } = await opts.sql.query<AgentRunRow>(
        `SELECT entity, decision_kind, at FROM (
           SELECT entity, decision_kind, at FROM (
             SELECT DISTINCT ON (entity) entity, decision_kind, at
               FROM ${agentRuns}
               ORDER BY entity, at DESC
           ) latest
           ORDER BY at DESC
           LIMIT ${capacity}
         ) top
         ORDER BY at ASC`,
      );
      byId.clear();
      for (const r of rows) {
        byId.set(r.entity, {
          incidentId: r.entity,
          lastDisposition: dispositionFromDecisionKind(r.decision_kind),
          executed: r.decision_kind === "EXECUTE",
          pending: pendingFromDecisionKind(r.decision_kind),
          passes: 1, // one agent turn per run
          updatedAt: toIso(r.at),
        });
      }
    },

    // This projection derives from agent_runs, not accumulated outcomes.
    record() {
      /* no-op — refresh() is the source of truth */
    },

    list() {
      return [...byId.values()].reverse();
    },

    get(incidentId) {
      return byId.get(incidentId) ?? null;
    },
  };
}

function toIso(v: string | Date): string {
  return typeof v === "string" ? v : v.toISOString();
}
