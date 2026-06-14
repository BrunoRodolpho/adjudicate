/**
 * RemediationOrchestrator — turns a signal into an adjudicated (and possibly
 * executed) remediation, and resolves a pending REVIEW via the kernel's
 * confirmation-receipt path.
 *
 * Why it is safe (the whole point of Adjutant):
 *   - It has NO executor of its own. The side effect ALWAYS routes through the
 *     adopter-supplied `AdopterExecutor.invokeIntent`, and ONLY on a kernel
 *     EXECUTE (in `handle` and in `resolve`).
 *   - The off-path producers (LLM diagnosis, audit bus, drift) only choose a
 *     disposition and a proposed blast radius. The KERNEL decides: SAFE
 *     (UNTRUSTED) remediations are clamped (REWRITE) then re-adjudicated to
 *     EXECUTE; REVIEW remediations adjudicate to REQUEST_CONFIRMATION and wait.
 *   - `resolve()` does NOT mint an EXECUTE itself: it RE-ADJUDICATES the same
 *     envelope with a `confirmationReceipt`, and the kernel substitutes EXECUTE
 *     (basis `confirmation.RECEIVED`, with `confirmation_resolved` supersession)
 *     — and only then is the adopter's `invokeIntent` called. If state changed
 *     (incident now terminal), the kernel REFUSEs and nothing executes.
 */

import { buildEnvelope } from "@adjudicate/core";
import type {
  AuditRecord,
  AuditSink,
  Decision,
  IntentActor,
  IntentEnvelope,
  Ledger,
} from "@adjudicate/core";
import { adjudicateAndAudit } from "@adjudicate/core/kernel";
import type { AdopterExecutor } from "@adjudicate/adapter-core";
import type { ApprovalRegistry, ApprovalRequest } from "@adjudicate/approval-engine";
import {
  incidentPolicyBundle,
  type IncidentEscalatePayload,
  type IncidentIntentKind,
  type IncidentState,
  type RemediationExecutePayload,
} from "@adjudicate/pack-incident-response";
import type {
  RemediationProposalStatus,
  RemediationProposalStore,
} from "./proposal-store.js";
import type { PendingAction, RemediationOutcome, RemediationSignal } from "./types.js";

const DEFAULT_MAX_PASSES = 4;
const APPROVAL_TTL_SECONDS = 24 * 60 * 60;
/** No-op sink — telemetry only; never gates a decision. */
const noopSink: AuditSink = { emit: async () => {} };

function defaultGenerateToken(): string {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new Error(
      "[adjutant] crypto.randomUUID is unavailable; inject options.generateToken.",
    );
  }
  return globalThis.crypto.randomUUID();
}

export interface RemediationOrchestratorOptions {
  /**
   * Adopter-owned side-effect executor. Adjutant has NO executor of its own —
   * the side effect ALWAYS routes through this, and only on a kernel EXECUTE.
   */
  readonly executor: AdopterExecutor<IncidentIntentKind, unknown, IncidentState>;
  /** Supplies the current IncidentState for adjudication. */
  readonly getState: () => IncidentState | Promise<IncidentState>;
  /** Durable audit sink. Defaults to a no-op. */
  readonly sink?: AuditSink;
  /** Optional execution ledger — replay-suppresses a retried nonce. */
  readonly ledger?: Ledger;
  /** Actor stamped on minted envelopes. */
  readonly actor?: IntentActor;
  /** Bound on REWRITE -> re-adjudicate passes (guards a pathological clamp loop). Default 4. */
  readonly maxPasses?: number;
  /**
   * Optional approval queue (`@adjudicate/approval-engine`). When wired (with a
   * `proposalStore` + the signal's `at`), a REVIEW that adjudicates to
   * REQUEST_CONFIRMATION registers a pending ApprovalRequest here.
   */
  readonly approvalRegistry?: ApprovalRegistry;
  /** Optional proposal read-model. When wired, `handle` records each proposal. */
  readonly proposalStore?: RemediationProposalStore;
  /** Approval-token generator. Default `crypto.randomUUID`; inject for deterministic tests. */
  readonly generateToken?: () => string;
}

/** Arguments to resolve a pending REVIEW proposal. */
export interface ResolveArgs {
  readonly token: string;
  readonly accepted: boolean;
  readonly by?: { readonly id: string; readonly displayName?: string };
  /** Adopter-supplied ISO timestamp of the resolution. */
  readonly at: string;
}

/** Result of resolving a pending REVIEW proposal. */
export interface RemediationResolution {
  /** False when the token is unknown / the proposal carries no envelope. */
  readonly resolved: boolean;
  readonly accepted: boolean;
  /** True iff the kernel substituted EXECUTE and the adopter executor ran. */
  readonly executed: boolean;
  /** The Decision from the re-adjudication (null when declined / unresolved). */
  readonly decision: Decision | null;
  readonly executorResult?: unknown;
  /** The updated ApprovalRequest (null when no registry is wired / unknown token). */
  readonly request: ApprovalRequest | null;
}

export interface RemediationOrchestrator {
  /** Turn one signal into an adjudicated (and possibly executed) remediation. */
  handle(signal: RemediationSignal): Promise<RemediationOutcome>;
  /** Resolve a pending REVIEW via the kernel's confirmation-receipt path. */
  resolve(args: ResolveArgs): Promise<RemediationResolution>;
}

export function createRemediationOrchestrator(
  options: RemediationOrchestratorOptions,
): RemediationOrchestrator {
  const sink = options.sink ?? noopSink;
  const maxPasses = Math.max(1, options.maxPasses ?? DEFAULT_MAX_PASSES);
  const deps = options.ledger ? { sink, ledger: options.ledger } : { sink };
  const generateToken = options.generateToken ?? defaultGenerateToken;

  function mintEnvelope(signal: RemediationSignal): IntentEnvelope<IncidentIntentKind> {
    // SAFE remediations are LLM-proposed (UNTRUSTED); REVIEW/MANUAL are
    // operator-originated. principal is a closed enum ("llm"|"user"|"system").
    const actor: IntentActor =
      options.actor ?? {
        principal: signal.disposition === "SAFE" ? "llm" : "user",
        sessionId: signal.incidentId,
      };

    if (signal.disposition === "MANUAL") {
      const payload: IncidentEscalatePayload = {
        incidentId: signal.incidentId,
        reason: signal.reason ?? "manual escalation requested",
      };
      return buildEnvelope<IncidentIntentKind, IncidentEscalatePayload>({
        kind: "incident.escalate",
        payload,
        actor,
        taint: "TRUSTED",
        nonce: signal.nonce,
      });
    }

    const payload: RemediationExecutePayload = {
      incidentId: signal.incidentId,
      action: signal.action,
      blastRadius: signal.blastRadius,
    };
    return buildEnvelope<IncidentIntentKind, RemediationExecutePayload>({
      kind: "incident.remediation.execute",
      payload,
      actor,
      taint: signal.disposition === "SAFE" ? "UNTRUSTED" : "TRUSTED",
      nonce: signal.nonce,
    });
  }

  /** Record the proposal read-model + register an approval for pending_review. */
  async function recordProposal(
    signal: RemediationSignal,
    finalEnvelope: IntentEnvelope<IncidentIntentKind>,
    finalDecisionKind: Decision["kind"] | undefined,
    executed: boolean,
    pending: PendingAction | null,
  ): Promise<void> {
    if (!options.proposalStore || signal.at === undefined) return;
    const at = signal.at;

    let status: RemediationProposalStatus;
    let approvalToken: string | undefined;

    if (executed) {
      status = "executed";
    } else if (pending?.kind === "review") {
      status = "pending_review";
      if (options.approvalRegistry) {
        approvalToken = generateToken();
        const request: ApprovalRequest = {
          token: approvalToken,
          sessionId: signal.incidentId,
          intentHash: finalEnvelope.intentHash,
          intentKind: finalEnvelope.kind,
          prompt: pending.prompt ?? "Confirm remediation?",
          taint: finalEnvelope.taint,
          channel: "adjutant",
          status: "pending",
          requestedAt: at,
        };
        await options.approvalRegistry.put(request, APPROVAL_TTL_SECONDS);
      }
    } else if (pending?.kind === "escalation") {
      status = "pending_escalation";
    } else if (pending?.kind === "defer" || finalDecisionKind === "DEFER") {
      status = "deferred";
    } else {
      status = "refused";
    }

    options.proposalStore.put({
      proposalId: signal.nonce,
      incidentId: signal.incidentId,
      action: signal.action,
      blastRadius: signal.blastRadius,
      disposition: signal.disposition,
      status,
      ...(approvalToken !== undefined ? { approvalToken } : {}),
      intentHash: finalEnvelope.intentHash,
      // Carry the envelope only while it awaits resolution (internal use).
      ...(status === "pending_review" ? { envelope: finalEnvelope } : {}),
      createdAt: at,
      updatedAt: at,
    });
  }

  return {
    async handle(signal: RemediationSignal): Promise<RemediationOutcome> {
      const state = await options.getState();
      const decisions: Decision[] = [];
      const records: AuditRecord[] = [];

      let envelope = mintEnvelope(signal);
      let executed = false;
      let executedEnvelope: IntentEnvelope<IncidentIntentKind> | null = null;
      let executorResult: unknown = undefined;
      let pending: PendingAction | null = null;

      // Bounded REWRITE -> re-adjudicate loop: a well-formed clamp REWRITEs once
      // then EXECUTEs on the second pass. maxPasses guards a pathological policy
      // that REWRITEs forever — on exhaustion nothing executes (executed stays
      // false, pending stays null, and the last REWRITE is surfaced in
      // `decisions` for the operator to see).
      for (let pass = 0; pass < maxPasses; pass += 1) {
        const { decision, record } = await adjudicateAndAudit(
          envelope,
          state,
          incidentPolicyBundle,
          deps,
        );
        decisions.push(decision);
        records.push(record);

        if (decision.kind === "REWRITE") {
          envelope = decision.rewritten as IntentEnvelope<IncidentIntentKind>;
          continue;
        }
        if (decision.kind === "EXECUTE") {
          executorResult = await options.executor.invokeIntent(envelope, state);
          executed = true;
          executedEnvelope = envelope;
          break;
        }
        if (decision.kind === "REQUEST_CONFIRMATION") {
          pending = { kind: "review", prompt: decision.prompt };
          break;
        }
        if (decision.kind === "ESCALATE") {
          pending = { kind: "escalation", reason: decision.reason };
          break;
        }
        if (decision.kind === "DEFER") {
          pending = { kind: "defer", signal: decision.signal, timeoutMs: decision.timeoutMs };
          break;
        }
        break; // REFUSE
      }

      await recordProposal(
        signal,
        executedEnvelope ?? envelope,
        decisions[decisions.length - 1]?.kind,
        executed,
        pending,
      );

      return {
        disposition: signal.disposition,
        decisions,
        records,
        executedEnvelope,
        executed,
        executorResult,
        pending,
      };
    },

    async resolve(args: ResolveArgs): Promise<RemediationResolution> {
      const proposal = options.proposalStore?.getByToken(args.token) ?? null;
      // Unknown token, no parked envelope, or ALREADY resolved -> no-op. The
      // status guard makes resolve idempotent even with no ledger wired: a
      // repeated approve cannot re-adjudicate and double-fire invokeIntent.
      if (!proposal || !proposal.envelope || proposal.status !== "pending_review") {
        return { resolved: false, accepted: args.accepted, executed: false, decision: null, request: null };
      }

      const env = proposal.envelope;
      let decision: Decision | null = null;
      let executed = false;
      let executorResult: unknown = undefined;

      if (args.accepted) {
        const state = await options.getState();
        // Re-adjudicate the SAME envelope with a confirmation receipt — the
        // kernel substitutes EXECUTE for the prior REQUEST_CONFIRMATION. We mint
        // no EXECUTE ourselves; the kernel remains the authority.
        const res = await adjudicateAndAudit(env, state, incidentPolicyBundle, {
          ...deps,
          confirmationReceipt: { intentHash: env.intentHash, at: args.at, token: args.token },
        });
        decision = res.decision;
        if (decision.kind === "EXECUTE") {
          executorResult = await options.executor.invokeIntent(env, state);
          executed = true;
        }
      }

      // Update read-models: the approval reflects the operator's decision; the
      // proposal reflects the kernel's final outcome.
      const proposalStatus: RemediationProposalStatus = !args.accepted
        ? "declined"
        : executed
          ? "executed"
          : "refused";
      options.proposalStore?.markResolved(proposal.proposalId, proposalStatus, args.at);

      let request: ApprovalRequest | null = null;
      if (options.approvalRegistry) {
        request = await options.approvalRegistry.markResolved(
          args.token,
          args.accepted ? "approved" : "declined",
          args.by,
          args.at,
        );
      }

      return { resolved: true, accepted: args.accepted, executed, decision, executorResult, request };
    },
  };
}
