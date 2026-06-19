import {
  adjudicateWithTrace,
  buildEnvelope,
  describePolicyBundle,
  type DecisionKind,
  type PolicyBundle,
} from "@adjudicate/core";
import { sha256Canonical } from "@adjudicate/canonical";
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
        // 042: thread the contaminating origin through so the provenance-injection
        // vector reaches the kernel's taint gate with a Retrieved/ExternalAPI
        // source. Drop-safe — only spread when present, so the existing vectors
        // (which omit it) build byte-identically and `buildEnvelope` defaults to
        // the LLM source for them.
        ...(s.intent.origin !== undefined ? { origin: s.intent.origin } : {}),
        // 031: thread resource-refs through so v3-with-refs vectors build.
        // Drop-safe — only spread when present, so no-refs vectors are byte-identical.
        ...(s.intent.resourceRefs !== undefined
          ? { resourceRefs: s.intent.resourceRefs }
          : {}),
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

// ─── 081: cap-edit config-integrity regression ──────────────────────────────

/**
 * Verdict for the 081 cap-edit escape (Critique #27).
 *
 * The classic escape: editing a `createRewriteGuard` closure-captured cap
 * (e.g. `AUTO_REMEDIATION_BLAST_CAP` 5 → 5000) changes guard BEHAVIOR but, pre-
 * 081, left a byte-identical sealable surface — the ConfigSeal saw guard
 * METADATA only, never the closure cap, so a tampered pack verified clean.
 *
 * This regression closes that as a red-team axis. It compares the structural
 * digest the ConfigSeal binds — `sha256Canonical(describePolicyBundle(bundle))`,
 * which now includes the per-guard CODE-artifact digests (081) — between the
 * sealed baseline and a tampered bundle whose only change is the cap.
 *
 *   `detected: true`  → the digests differ → the seal WOULD catch it → DEFENDED.
 *   `detected: false` → byte-identical surface → cap edit ESCAPED → REGRESSION.
 *
 * Pure: `describePolicyBundle` + `sha256Canonical` (browser-safe `@noble/hashes`),
 * no clock / RNG / IO — same posture as the kernel runner above.
 */
export interface CapEditRegressionResult {
  readonly name: string;
  readonly vector: "config_integrity";
  /** True when the cap edit changed the sealed surface digest (seal catches it). */
  readonly detected: boolean;
  readonly status: RedTeamStatus;
  readonly baselineDigest: string;
  readonly tamperedDigest: string;
}

/** Structural digest of the surface the ConfigSeal binds (081 — includes guard code). */
function policyStructureDigest(bundle: PolicyBundle<string, unknown, unknown>): string {
  return sha256Canonical(describePolicyBundle(bundle));
}

/**
 * Run the 081 cap-edit regression: assert that swapping a guard's
 * closure-captured cap is DETECTED by the ConfigSeal's code-artifact coverage.
 *
 * `baseline` is the sealed-as-trusted policy; `tampered` is the same policy
 * with a behavior-changing cap edit (and otherwise identical guard metadata).
 * A `detected: false` result is an ESCAPE — the seal is once again blind to the
 * cap (a regression of 081). `defended` means the surface digest moved, so a
 * `verifyConfigSeal` over the tampered pack would report a mismatch.
 */
export function runConfigSealCapEditRegression(args: {
  readonly name?: string;
  readonly baseline: PolicyBundle<string, unknown, unknown>;
  readonly tampered: PolicyBundle<string, unknown, unknown>;
}): CapEditRegressionResult {
  const baselineDigest = policyStructureDigest(args.baseline);
  const tamperedDigest = policyStructureDigest(args.tampered);
  const detected = baselineDigest !== tamperedDigest;
  return {
    name: args.name ?? "cap-edit (createRewriteGuard closure cap)",
    vector: "config_integrity",
    detected,
    status: detected ? "defended" : "escaped",
    baselineDigest,
    tamperedDigest,
  };
}
