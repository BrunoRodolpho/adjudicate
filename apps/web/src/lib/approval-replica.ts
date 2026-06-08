/**
 * approval-replica — ILLUSTRATIVE operator-detail fixtures for the
 * /console/approvals Approval Center replica (mirrors apps/console's approvals
 * page, ADR-122 + ADR-136).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THIS IS COMMITTED SAMPLE DATA. It exists ONLY to drive the clearly-labeled
 * "Illustrative replica of the operator console" surface under /console, behind
 * the ConsoleChrome honesty boundary. apps/web is a public, unauthenticated
 * marketing surface with NO database/redis/admin credentials and no kernel
 * runtime — this committed fixture is the ONLY data the replica ever renders.
 *
 * DISPLAY-ONLY: in the reference console, resolving an approval is a DISPLAY-ONLY
 * projection (it flips the registry status for the operator view). Real
 * authorization runs in the adopter's adapter process — single-use token take,
 * parked-blob hash verification, and kernel re-adjudication
 * (`createApprovalEngine.resolve` → adapter-core `confirm()`). This replica is
 * even further removed (a static marketing display), so the component carries an
 * amber "display-only" banner mirroring the console's disclosure.
 *
 * The audit chain (request → resolved → resumed) is anchored on the SAME
 * supersession the audit-explorer replica uses: the parked confirmation
 * (`DEPLOYMENT_ROLLBACK_PARKED_HASH`) → the resumed EXECUTE
 * (`DEPLOYMENT_ROLLBACK_RESUMED_HASH`), so the chain's `resumed` step deep-links
 * to a REAL sample receipt in `CONSOLE_REPLICA_RECORDS_BY_HASH`.
 *
 * DETERMINISM: every timestamp below is a FIXED literal — no wall-clock and no
 * random source. `resolvedBy` is a CLAIMED actor (a forgeable display name, not
 * a verified principal) — the replica labels it "claimed" to stay honest, exactly
 * as the console does until per-operator OIDC identity lands (ADR-136).
 */

import { DEPLOYMENT_ROLLBACK_RESUMED_HASH } from "./console-replica-records";

/** Closed-enum approval status. */
export type ApprovalStatus = "pending" | "approved" | "declined" | "expired";

/** A pending REQUEST_CONFIRMATION item awaiting human review. */
export interface PendingApproval {
  /** Synthetic anonymous request id (also the React key). */
  readonly id: string;
  /** The intent kind that produced the confirmation request. */
  readonly intentKind: string;
  /** The confirmation prompt shown to the operator. */
  readonly prompt: string;
  /** Synthetic anonymous session id that raised the request. */
  readonly sessionId: string;
  /** FIXED literal ISO timestamp the request was raised. */
  readonly requestedAt: string;
}

/** A resolved approval in the durable decision history (read-only). */
export interface ResolvedApproval {
  /** Synthetic anonymous request id (also the React key). */
  readonly id: string;
  readonly intentKind: string;
  readonly status: Exclude<ApprovalStatus, "pending">;
  /** FIXED literal ISO timestamp the operator resolved it. */
  readonly resolvedAt: string;
  /** CLAIMED actor display name — forgeable header, not a verified identity. */
  readonly resolvedBy: string;
  /**
   * The decision's intentHash, if it anchors an audit chain. Present only for
   * the supersession-chain row so selecting it can render request → resolved →
   * resumed against a real sample receipt.
   */
  readonly intentHash?: string;
}

/** One ordered step in a request → resolved → resumed audit chain. */
export interface ApprovalChainStep {
  readonly kind: "requested" | "resolved" | "resumed";
  /** Human label for the step. */
  readonly label: string;
  /** FIXED literal ISO timestamp for the step. */
  readonly at: string;
  /** Resolution status carried by the step, if any. */
  readonly status?: ApprovalStatus;
  /** CLAIMED actor, if a human acted at this step. */
  readonly actor?: string;
  /** The frozen `supersedes.reason` carried into the resumed record. */
  readonly supersedesReason?: string;
  /**
   * Whether a single-use confirmation token was present at this step. Signals
   * token PRESENCE only — the token VALUE is never carried or rendered.
   */
  readonly tokenPresent?: boolean;
  /** Deep-link target — a real sample intentHash, when ledger-backed. */
  readonly intentHash?: string;
}

/**
 * Illustrative pending queue — REQUEST_CONFIRMATION items awaiting review.
 * Synthetic anonymous session ids; the prompts mirror the kind the kernel emits
 * for medium-value refunds and risk-classified shell commands. NEWEST-FIRST.
 */
export const APPROVAL_REPLICA_PENDING: readonly PendingApproval[] = [
  {
    id: "req-pix-640",
    intentKind: "pix.charge.refund",
    prompt: "Confirm the R$ 640,00 refund for PIX charge cha_01HXYZ7MIDD?",
    sessionId: "sess-alpha",
    requestedAt: "2026-06-07T09:41:02.000Z",
  },
  {
    id: "req-cred-read",
    intentKind: "shell.exec",
    prompt: "Confirm a credential-category command before it runs?",
    sessionId: "sess-beta",
    requestedAt: "2026-06-07T09:12:48.000Z",
  },
  {
    id: "req-net-egress",
    intentKind: "shell.exec",
    prompt: "Confirm a network-category command before it runs?",
    sessionId: "sess-gamma",
    requestedAt: "2026-06-07T08:55:19.000Z",
  },
] as const;

/**
 * Illustrative resolved decision history (read-only). NEWEST-FIRST. The first
 * row anchors the supersession audit chain — it carries the resumed receipt's
 * real `intentHash`, so selecting it renders request → resolved → resumed.
 */
export const APPROVAL_REPLICA_HISTORY: readonly ResolvedApproval[] = [
  {
    id: "res-deploy-rollback",
    intentKind: "deployment.rollback.execute",
    status: "approved",
    resolvedAt: "2026-06-06T12:05:00.000Z",
    resolvedBy: "ops-oncall",
    intentHash: DEPLOYMENT_ROLLBACK_RESUMED_HASH,
  },
  {
    id: "res-pix-300",
    intentKind: "pix.charge.refund",
    status: "approved",
    resolvedAt: "2026-06-06T11:48:22.000Z",
    resolvedBy: "finance-review",
  },
  {
    id: "res-kyc-override",
    intentKind: "kyc.session.approve",
    status: "declined",
    resolvedAt: "2026-06-06T10:31:07.000Z",
    resolvedBy: "risk-desk",
  },
  {
    id: "res-egress-expired",
    intentKind: "shell.exec",
    status: "expired",
    resolvedAt: "2026-06-05T22:14:55.000Z",
    resolvedBy: "—",
  },
] as const;

/**
 * The request → resolved → resumed audit chain for the supersession sample.
 *
 * The `requested` step is the parked confirmation (its predecessor record is not
 * emitted in this trimmed sample feed, so it carries no deep-link); the `resumed`
 * step is the kernel-resumed EXECUTE (`DEPLOYMENT_ROLLBACK_RESUMED_HASH`) that
 * carries the frozen `supersedes.reason = "confirmation_resolved"` back-link and
 * deep-links to a REAL sample receipt. Timestamps match the
 * console-replica-records supersession literals exactly.
 */
export const APPROVAL_REPLICA_CHAIN: readonly ApprovalChainStep[] = [
  {
    kind: "requested",
    label: "Confirmation requested",
    at: "2026-06-06T12:00:00.000Z",
    status: "pending",
    tokenPresent: true,
  },
  {
    kind: "resolved",
    label: "Operator resolved",
    at: "2026-06-06T12:04:51.000Z",
    status: "approved",
    actor: "ops-oncall",
    tokenPresent: true,
  },
  {
    kind: "resumed",
    label: "Kernel re-adjudicated (resumed)",
    at: "2026-06-06T12:05:00.000Z",
    status: "approved",
    supersedesReason: "confirmation_resolved",
    intentHash: DEPLOYMENT_ROLLBACK_RESUMED_HASH,
  },
] as const;

/** The intent kind the audit chain belongs to (panel sub-heading). */
export const APPROVAL_REPLICA_CHAIN_INTENT_KIND = "deployment.rollback.execute";
