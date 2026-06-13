/**
 * RemediationOrchestrator — turns a signal into an adjudicated (and possibly
 * executed) remediation.
 *
 * Why it is safe (the whole point of Adjutant):
 *   - It has NO executor of its own. The side effect ALWAYS routes through the
 *     adopter-supplied `AdopterExecutor.invokeIntent`, and ONLY on a kernel
 *     EXECUTE. A test asserts the orchestrator exposes no `invokeIntent`.
 *   - The off-path producers (LLM diagnosis, audit bus, drift) only choose a
 *     disposition and a proposed blast radius. The KERNEL decides: a SAFE
 *     (UNTRUSTED) remediation is clamped to the auto cap by
 *     `clampAutoRemediationScope` (REWRITE), then a SECOND adjudication of the
 *     clamped envelope EXECUTEs it. UNTRUSTED taint guarantees the clamp fires —
 *     the clamp-before-confirm/escalate ordering in `incidentPolicyBundle` is
 *     load-bearing.
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
import {
  incidentPolicyBundle,
  type IncidentEscalatePayload,
  type IncidentIntentKind,
  type IncidentState,
  type RemediationExecutePayload,
} from "@adjudicate/pack-incident-response";
import type { PendingAction, RemediationOutcome, RemediationSignal } from "./types.js";

const DEFAULT_MAX_PASSES = 4;
/** No-op sink — telemetry only; never gates a decision. */
const noopSink: AuditSink = { emit: async () => {} };

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
}

export interface RemediationOrchestrator {
  /** Turn one signal into an adjudicated (and possibly executed) remediation. */
  handle(signal: RemediationSignal): Promise<RemediationOutcome>;
}

export function createRemediationOrchestrator(
  options: RemediationOrchestratorOptions,
): RemediationOrchestrator {
  const sink = options.sink ?? noopSink;
  const maxPasses = Math.max(1, options.maxPasses ?? DEFAULT_MAX_PASSES);
  const deps = options.ledger ? { sink, ledger: options.ledger } : { sink };

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
        taint: "TRUSTED", // operator-originated, not LLM-proposed
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
      // SAFE auto remediations are UNTRUSTED (LLM-proposed) so the clamp fires;
      // REVIEW remediations are operator-TRUSTED so they flow to confirm/escalate.
      taint: signal.disposition === "SAFE" ? "UNTRUSTED" : "TRUSTED",
      nonce: signal.nonce,
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
          // The clamp REWROTE the blast radius (UNTRUSTED auto-remediation).
          // Re-adjudicate the clamped envelope — the load-bearing SECOND pass.
          envelope = decision.rewritten as IntentEnvelope<IncidentIntentKind>;
          continue;
        }
        if (decision.kind === "EXECUTE") {
          // The ONLY place a side effect happens — through the adopter's
          // executor, never an executor of Adjutant's own.
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
        // REFUSE or DEFER: nothing to execute.
        break;
      }

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
  };
}
