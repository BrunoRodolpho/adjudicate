/**
 * Adjutant types.
 *
 * Adjutant is a SUBORDINATE EXECUTOR: it carries out adjudicated remediations
 * under supervision and has ZERO independent authority. It never owns an
 * executor; every side effect routes through the adopter's
 * `AdopterExecutor.invokeIntent`, and only on a kernel `EXECUTE`.
 *
 * The LLM-diagnosis step and every observer (audit bus, drift detector) are
 * OFF-PATH: they only produce signals, which Adjutant turns into draft
 * envelopes that re-enter the normal `adjudicate()` path. The kernel never reads
 * the bus, the drift detector, or the LLM.
 */

import type { Decision, IntentEnvelope } from "@adjudicate/core";
import type { AuditRecord } from "@adjudicate/core";
import type { IncidentIntentKind } from "@adjudicate/pack-incident-response";

/**
 * How a signal should be handled, mapped onto kernel outcomes:
 *   - SAFE   → UNTRUSTED remediation envelope; the clamp REWRITEs blast radius
 *              to the auto cap, then a re-adjudication EXECUTEs the clamped one.
 *   - REVIEW → TRUSTED remediation envelope that adjudicates to
 *              REQUEST_CONFIRMATION (routed to human approval).
 *   - MANUAL → an `incident.escalate` envelope (adjudicates to EXECUTE, i.e.
 *              "perform the escalation").
 */
export type RemediationDisposition = "SAFE" | "REVIEW" | "MANUAL";

/** A normalized remediation signal (the off-path producer's output). */
export interface RemediationSignal {
  readonly incidentId: string;
  /** The remediation action label (opaque to the kernel; carried in the payload). */
  readonly action: string;
  /** Proposed hosts/services affected. The kernel CLAMPS this for SAFE/UNTRUSTED. */
  readonly blastRadius: number;
  readonly disposition: RemediationDisposition;
  /** Reason for a MANUAL escalation (defaulted when omitted). */
  readonly reason?: string;
  /**
   * Idempotency nonce (adopter-supplied). Two signals with the same nonce hash
   * to the same intent and are deduped by the ledger — never regenerate on
   * retry.
   */
  readonly nonce: string;
}

/** What awaits a human after adjudication, when the outcome is not auto-executed. */
export interface PendingAction {
  readonly kind: "review" | "escalation";
  readonly prompt?: string;
  readonly reason?: string;
}

/** The result of handling one signal. */
export interface RemediationOutcome {
  readonly disposition: RemediationDisposition;
  /** Every kernel Decision produced, in order (SAFE yields REWRITE then EXECUTE). */
  readonly decisions: ReadonlyArray<Decision>;
  /** Audit records, one per adjudication pass. */
  readonly records: ReadonlyArray<AuditRecord>;
  /** The envelope finally executed, or null when nothing executed. */
  readonly executedEnvelope: IntentEnvelope<IncidentIntentKind> | null;
  /** True iff the adopter's `invokeIntent` was called. */
  readonly executed: boolean;
  /** The adopter executor's return value, when executed. */
  readonly executorResult: unknown;
  /** Set when the outcome awaits human action (review / escalation); else null. */
  readonly pending: PendingAction | null;
}
