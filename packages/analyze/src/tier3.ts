/**
 * Tier-3 PolicyCoherenceAnalyzer (AJD-301, ADR-125).
 *
 * Structural coherence checks via pure Pack inspection + planner probing — NOT
 * prompt judgement (prompts are rendered at runtime, outside the Pack) and NOT
 * LLM-as-judge. Detects dead/contradictory policy surface before deploy.
 *
 * Deterministic: pure over (pack, probes); planner probes are wrapped, and
 * diagnostics are sorted so output is byte-stable regardless of probe order.
 */

import { readGuardMetadata, type Guard } from "@adjudicate/core/kernel";
import type { PackV0, Taint } from "@adjudicate/core";
import type { Diagnostic } from "./types.js";

/** A deterministic (state, context) pair used to probe `planner.plan()`. */
export interface PlannerProbe<S = unknown, C = unknown> {
  readonly label: string;
  readonly state: S;
  readonly context: C;
}

export interface Tier3Analyzer {
  readonly name: string;
  readonly code: DiagnosticCodeLike;
  analyze<K extends string, P, S, C>(
    pack: PackV0<K, P, S, C>,
    probes: ReadonlyArray<PlannerProbe<S, C>>,
  ): ReadonlyArray<Diagnostic>;
}

type DiagnosticCodeLike = string;

interface ThresholdMeta {
  readonly phase: string;
  readonly guardId: string;
  readonly threshold: number;
  readonly comparator: ">=" | "<=" | ">" | "<";
}

function eachGuard<K extends string, P, S, C>(
  pack: PackV0<K, P, S, C>,
  fn: (guard: Guard<K, P, S>, phase: "state" | "auth" | "business", index: number) => void,
): void {
  const policy = pack.policy as unknown as {
    stateGuards: ReadonlyArray<Guard<K, P, S>>;
    authGuards: ReadonlyArray<Guard<K, P, S>>;
    business: ReadonlyArray<Guard<K, P, S>>;
  };
  policy.stateGuards.forEach((g, i) => fn(g, "state", i));
  policy.authGuards.forEach((g, i) => fn(g, "auth", i));
  policy.business.forEach((g, i) => fn(g, "business", i));
}

function taintMinimum(pack: { policy: unknown }, kind: string): Taint | undefined {
  const taint = (pack.policy as { taint?: { minimumFor?: (k: string) => Taint } }).taint;
  try {
    return taint?.minimumFor?.(kind);
  } catch {
    return undefined;
  }
}

const policyCoherenceAnalyzer: Tier3Analyzer = {
  name: "PolicyCoherenceAnalyzer",
  code: "AJD-301",
  analyze(pack, probes) {
    const diagnostics: Diagnostic[] = [];
    const declaredIntents = new Set<string>(pack.intents as ReadonlyArray<string>);

    // Probe the planner across fixtures; union the allowed intents.
    const unionAllowed = new Set<string>();
    for (const probe of probes) {
      let allowed: ReadonlyArray<string>;
      try {
        allowed = pack.planner.plan(probe.state, probe.context).allowedIntents;
      } catch (err) {
        diagnostics.push({
          code: "AJD-301",
          severity: "note",
          message: `planner.plan threw for probe "${probe.label}".`,
          detail: { rule: "planner_probe_error", probe: probe.label, error: err instanceof Error ? err.message : String(err) },
        });
        continue;
      }
      for (const k of allowed) unionAllowed.add(k);
    }

    // phantom_intent (error): planner offers an intent the Pack doesn't declare.
    for (const k of [...unionAllowed].sort()) {
      if (!declaredIntents.has(k)) {
        diagnostics.push({
          code: "AJD-301",
          severity: "error",
          message: `Planner allows intent "${k}" which is not in pack.intents.`,
          detail: { rule: "phantom_intent", intent: k },
        });
      }
    }

    // unreachable_intent (warning): a declared, non-system-only intent the
    // planner never offers across the probes. System-only kinds (elevated taint
    // minimum) are intentionally not planner-proposable — excluded.
    for (const k of [...declaredIntents].sort()) {
      const minimum = taintMinimum(pack, k);
      const systemOnly = minimum !== undefined && minimum !== "UNTRUSTED";
      if (!systemOnly && !unionAllowed.has(k)) {
        diagnostics.push({
          code: "AJD-301",
          severity: "warning",
          message: `Intent "${k}" is never offered by the planner across ${probes.length} probe(s).`,
          detail: { rule: "unreachable_intent", intent: k, probeCount: probes.length },
        });
      }
    }

    // system_taint_contradiction (warning): a system-only kind the planner DOES
    // offer — the LLM is shown an intent it can never satisfy (guaranteed REFUSE).
    for (const k of [...unionAllowed].sort()) {
      const minimum = taintMinimum(pack, k);
      if (minimum !== undefined && minimum !== "UNTRUSTED") {
        diagnostics.push({
          code: "AJD-301",
          severity: "warning",
          message: `Planner offers system-only intent "${k}" (taint minimum ${minimum}) — the LLM can never satisfy it.`,
          detail: { rule: "system_taint_contradiction", intent: k, minimum },
        });
      }
    }

    // threshold_conflict (note, low-confidence): two threshold guards in the same
    // phase with mutually-unsatisfiable bounds. Tier 3 cannot resolve WHICH field
    // each reads (extract is an opaque closure), so this is a note only.
    const thresholds: ThresholdMeta[] = [];
    eachGuard(pack, (guard, phase, index) => {
      const meta = readGuardMetadata(guard as unknown as (...a: never[]) => unknown);
      const desc = meta?.description;
      if (desc?.kind === "threshold") {
        thresholds.push({ phase, guardId: `${phase}[${index}]`, threshold: desc.threshold, comparator: desc.comparator });
      }
    });
    for (let i = 0; i < thresholds.length; i += 1) {
      for (let j = i + 1; j < thresholds.length; j += 1) {
        const a = thresholds[i]!;
        const b = thresholds[j]!;
        if (a.phase !== b.phase) continue;
        const aLower = a.comparator === ">=" || a.comparator === ">";
        const bUpper = b.comparator === "<=" || b.comparator === "<";
        const aUpper = a.comparator === "<=" || a.comparator === "<";
        const bLower = b.comparator === ">=" || b.comparator === ">";
        const unsat = (aLower && bUpper && b.threshold < a.threshold) || (aUpper && bLower && a.threshold < b.threshold);
        if (unsat) {
          diagnostics.push({
            code: "AJD-301",
            severity: "note",
            message: `Threshold guards ${a.guardId} and ${b.guardId} have mutually-unsatisfiable bounds (field not statically verifiable).`,
            detail: { rule: "threshold_conflict", a: a.guardId, b: b.guardId, unverifiableField: true },
          });
        }
      }
    }

    return sortDiagnostics(diagnostics);
  },
};

function sortDiagnostics(diags: Diagnostic[]): Diagnostic[] {
  return [...diags].sort((x, y) => {
    const rx = (x.detail?.rule as string) ?? "";
    const ry = (y.detail?.rule as string) ?? "";
    if (rx !== ry) return rx < ry ? -1 : 1;
    return x.message < y.message ? -1 : x.message > y.message ? 1 : 0;
  });
}

export { policyCoherenceAnalyzer };
export const DEFAULT_TIER3_ANALYZERS: ReadonlyArray<Tier3Analyzer> = [policyCoherenceAnalyzer];
