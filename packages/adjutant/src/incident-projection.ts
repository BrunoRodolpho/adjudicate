/**
 * IncidentProjection — a per-incident read-model of handled remediations.
 *
 * Phase-1 (read+propose) surface: the operations app renders this. It is a pure
 * fold of `RemediationOutcome`s; timestamps are adopter-supplied (no clock/RNG),
 * matching the determinism posture of the rest of the suite's telemetry stores.
 */

import type { PendingAction, RemediationDisposition, RemediationOutcome } from "./types.js";

export interface IncidentProjectionEntry {
  readonly incidentId: string;
  readonly lastDisposition: RemediationDisposition;
  readonly executed: boolean;
  readonly pending: PendingAction | null;
  /** Number of adjudication passes the last handling took (SAFE auto = 2). */
  readonly passes: number;
  readonly updatedAt: string;
}

export interface IncidentProjection {
  /** Fold a handled outcome into the per-incident read-model. */
  record(incidentId: string, outcome: RemediationOutcome, at: string): void;
  /** Snapshot the projection, newest-updated first. */
  list(): ReadonlyArray<IncidentProjectionEntry>;
  get(incidentId: string): IncidentProjectionEntry | null;
}

export function createIncidentProjection(): IncidentProjection {
  // Insertion-ordered; re-inserting on update moves an incident to the end.
  const byId = new Map<string, IncidentProjectionEntry>();
  return {
    record(incidentId, outcome, at) {
      byId.delete(incidentId);
      byId.set(incidentId, {
        incidentId,
        lastDisposition: outcome.disposition,
        executed: outcome.executed,
        pending: outcome.pending,
        passes: outcome.decisions.length,
        updatedAt: at,
      });
    },
    list() {
      return [...byId.values()].reverse();
    },
    get(incidentId) {
      return byId.get(incidentId) ?? null;
    },
  };
}
