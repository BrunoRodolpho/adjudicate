/**
 * RemediationProposalStore — a durable-ish read-model of remediation proposals.
 *
 * The orchestrator's `handle()` returns a transient `RemediationOutcome`; this
 * store persists each proposal so an operator UI can render "what's awaiting
 * review / escalation" and so `resolve()` can look up the pending envelope by
 * its approval token. It mirrors `incident-projection.ts`'s determinism posture:
 * adopter-supplied `at`, no clock/RNG, insertion-ordered Map, newest-first.
 *
 * The full `envelope` is carried for INTERNAL re-adjudication on resolve; the
 * admin-sdk wire schema projects only the display fields (it never ships the
 * envelope).
 */

import type { IntentEnvelope } from "@adjudicate/core";
import type { IncidentIntentKind } from "@adjudicate/pack-incident-response";
import type { RemediationDisposition } from "./types.js";

export type RemediationProposalStatus =
  | "executed"
  | "pending_review"
  | "pending_escalation"
  | "declined"
  | "refused"
  | "deferred";

export interface RemediationProposal {
  /** Stable id — the signal's nonce (deterministic, adopter-supplied). */
  readonly proposalId: string;
  readonly incidentId: string;
  readonly action: string;
  readonly blastRadius: number;
  readonly disposition: RemediationDisposition;
  readonly status: RemediationProposalStatus;
  /** Approval token when the proposal is pending_review. */
  readonly approvalToken?: string;
  /** intentHash of the envelope this proposal concerns. */
  readonly intentHash?: string;
  /**
   * The envelope awaiting resolution — INTERNAL, for `resolve()`'s
   * confirmationReceipt re-adjudication. Never shipped on the wire.
   */
  readonly envelope?: IntentEnvelope<IncidentIntentKind>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RemediationProposalStore {
  /** Insert or replace a proposal (keyed by proposalId). */
  put(proposal: RemediationProposal): void;
  get(proposalId: string): RemediationProposal | null;
  /** Look up by approval token — used by `resolve()`. */
  getByToken(token: string): RemediationProposal | null;
  /** Snapshot, newest-updated first. */
  list(filter?: {
    readonly incidentId?: string;
    readonly status?: RemediationProposalStatus;
  }): ReadonlyArray<RemediationProposal>;
  /** Transition a proposal's status (adopter-supplied `at`). */
  markResolved(proposalId: string, status: RemediationProposalStatus, at: string): void;
}

export function createInMemoryRemediationProposalStore(): RemediationProposalStore {
  // Insertion-ordered; re-inserting on update moves a proposal to the end.
  const byId = new Map<string, RemediationProposal>();

  return {
    put(proposal) {
      byId.delete(proposal.proposalId);
      byId.set(proposal.proposalId, proposal);
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
      byId.set(proposalId, { ...prev, status, updatedAt: at });
    },
  };
}
