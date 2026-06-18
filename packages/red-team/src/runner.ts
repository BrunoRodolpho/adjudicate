import { adjudicateWithTrace, buildEnvelope, type DecisionKind } from "@adjudicate/core";
import type { AttackVector, RedTeamPack, RedTeamScenario } from "./scenario.js";

export type RedTeamStatus = "defended" | "escaped" | "error";

export interface RedTeamResult {
  readonly name: string;
  readonly vector: AttackVector;
  readonly status: RedTeamStatus;
  readonly decision?: DecisionKind;
  /** Flattened `category:code` basis of the final decision — "which defense fired". */
  readonly basisCodes?: ReadonlyArray<string>;
  readonly acceptable: ReadonlyArray<DecisionKind>;
  readonly error?: string;
}

export interface RedTeamSummary {
  readonly total: number;
  readonly defended: number;
  readonly escaped: number;
  readonly errors: number;
  readonly escapesByVector: Readonly<Record<AttackVector, number>>;
}

export interface RedTeamReport {
  readonly pack: { readonly id: string };
  readonly results: ReadonlyArray<RedTeamResult>;
  readonly summary: RedTeamSummary;
}

function emptyByVector(): Record<AttackVector, number> {
  // Exhaustive over the closed AttackVector union — a missing arm fails the
  // type-checker (Record requires every key). 041 added `provenance_injection`.
  return {
    prompt_injection: 0,
    taint_escalation: 0,
    tool_scope_violation: 0,
    provenance_injection: 0,
  };
}

/**
 * Run adversarial scenarios through the pure kernel and classify each as
 * defended / escaped / error. An ESCAPE is a policy regression: the adversarial
 * intent produced a Decision kind outside the scenario's `acceptable` set.
 */
export function runRedTeam(
  pack: RedTeamPack,
  scenarios: ReadonlyArray<RedTeamScenario>,
): RedTeamReport {
  const results: RedTeamResult[] = [];
  const escapesByVector = emptyByVector();
  let defended = 0;
  let escaped = 0;
  let errors = 0;

  for (const s of scenarios) {
    try {
      const envelope = buildEnvelope({
        kind: s.intent.kind,
        payload: s.intent.payload,
        actor: s.intent.actor,
        taint: s.intent.taint,
        nonce: s.intent.nonce,
        ...(s.intent.createdAt !== undefined ? { createdAt: s.intent.createdAt } : {}),
      });
      const state = pack.rehydrateState ? pack.rehydrateState(s.state) : s.state;
      const { decision } = adjudicateWithTrace(envelope, state, pack.policy);
      const basisCodes = decision.basis.map((b) => `${b.category}:${b.code}`);
      const isDefended = s.defense.acceptable.includes(decision.kind);
      if (isDefended) {
        defended += 1;
        results.push({
          name: s.name,
          vector: s.vector,
          status: "defended",
          decision: decision.kind,
          basisCodes,
          acceptable: s.defense.acceptable,
        });
      } else {
        escaped += 1;
        escapesByVector[s.vector] += 1;
        results.push({
          name: s.name,
          vector: s.vector,
          status: "escaped",
          decision: decision.kind,
          basisCodes,
          acceptable: s.defense.acceptable,
        });
      }
    } catch (err) {
      errors += 1;
      results.push({
        name: s.name,
        vector: s.vector,
        status: "error",
        acceptable: s.defense.acceptable,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    pack: { id: pack.id },
    results,
    summary: {
      total: scenarios.length,
      defended,
      escaped,
      errors,
      escapesByVector,
    },
  };
}

/** Exit 2 when any scenario escaped or errored (a policy/harness regression). */
export function computeRedTeamExitCode(summary: RedTeamSummary): 0 | 2 {
  return summary.escaped > 0 || summary.errors > 0 ? 2 : 0;
}

/** The basis code the kernel's taint gate emits when it refuses a sub-minimum intent. */
export const TAINT_GATE_BASIS = "taint:level_insufficient";

export interface TaintEscalationCausality {
  /** All taint_escalation scenarios. */
  readonly total: number;
  /** Defended specifically BY THE TAINT GATE (basis `taint:level_insufficient`). */
  readonly byTaintGate: number;
  /**
   * Defended by SOME OTHER guard that fired first (e.g. a state precondition).
   * Still not an escape — but the taint gate was never exercised for these, so a
   * green `escaped===0` does NOT prove the taint gate works for them.
   */
  readonly byOtherGuard: number;
  /** Taint scenarios that escaped (should be 0). */
  readonly escaped: number;
}

/**
 * Causality analysis for the taint-escalation vector. `escaped===0` alone is a
 * VACUOUS guarantee — a pack can pass while a state precondition refuses the
 * sub-minimum intent before the taint gate ever runs (kernel order: state →
 * taint). This breaks the "defended" count down so a reviewer can see how many
 * scenarios the taint gate itself actually caught vs. were caught upstream.
 */
export function taintEscalationCausality(report: RedTeamReport): TaintEscalationCausality {
  const taint = report.results.filter((r) => r.vector === "taint_escalation");
  const defended = taint.filter((r) => r.status === "defended");
  const byTaintGate = defended.filter((r) => r.basisCodes?.includes(TAINT_GATE_BASIS)).length;
  return {
    total: taint.length,
    byTaintGate,
    byOtherGuard: defended.length - byTaintGate,
    escaped: taint.filter((r) => r.status === "escaped").length,
  };
}
