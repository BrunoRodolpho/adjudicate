import type { ApprovalRequestParsed } from "@adjudicate/admin-sdk";

/**
 * Pure display helpers for the ADR-143 quorum/escalation projection (WS-B).
 * Extracted so the logic is unit-tested independently of React.
 *
 * NOTE: the escalation-due check is inlined (not imported from
 * @adjudicate/approval-engine) on purpose — that package's index pulls in
 * `node:crypto` (the attestation verifier), which cannot enter a client bundle.
 * The logic matches the engine's `isEscalationDue` exactly and is unit-tested.
 */

export interface QuorumProgress {
  readonly count: number;
  readonly required: number;
  readonly met: boolean;
}

/** Quorum progress for a row, or null when the row carries no quorum policy. */
export function quorumProgress(
  a: Pick<ApprovalRequestParsed, "approvals" | "quorum">,
): QuorumProgress | null {
  if (!a.quorum) return null;
  const required = a.quorum.minApprovals;
  const list = a.approvals ?? [];
  // Mirror the engine: distinct approver ids unless distinctApprovers === false.
  const count =
    a.quorum.distinctApprovers === false ? list.length : new Set(list.map((v) => v.id)).size;
  return { count, required, met: count >= required };
}

/** Number of accumulated approvers on a row (0 when none). */
export function approverCount(a: Pick<ApprovalRequestParsed, "approvals">): number {
  return a.approvals?.length ?? 0;
}

/**
 * Whether a pending row is past its escalation deadline at `nowMs`. Mirrors the
 * engine's pure `isEscalationDue` (governance.ts) — kept inline to stay
 * client-bundle safe (see the module note above).
 */
export function escalationDue(
  a: Pick<ApprovalRequestParsed, "status" | "requestedAt" | "escalation">,
  nowMs: number,
): boolean {
  if (a.status !== "pending" || !a.escalation) return false;
  return nowMs - Date.parse(a.requestedAt) >= a.escalation.afterMs;
}
