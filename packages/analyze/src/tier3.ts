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

/** Probe the planner across fixtures; union the allowed intents. Errors are
 *  swallowed here — AJD-301 owns the `planner_probe_error` note. */
function probeAllowedIntents<K extends string, P, S, C>(
  pack: PackV0<K, P, S, C>,
  probes: ReadonlyArray<PlannerProbe<S, C>>,
): Set<string> {
  const union = new Set<string>();
  for (const probe of probes) {
    try {
      for (const k of pack.planner.plan(probe.state, probe.context).allowedIntents) union.add(k);
    } catch {
      // AJD-301 reports the error; AJD-302 just contributes no keys for this probe.
    }
  }
  return union;
}

/** All threshold-guard descriptions across every phase (the "merged set"). */
function collectThresholds<K extends string, P, S, C>(
  pack: PackV0<K, P, S, C>,
): ThresholdMeta[] {
  const out: ThresholdMeta[] = [];
  eachGuard(pack, (guard, phase, index) => {
    const desc = readGuardMetadata(guard as unknown as (...a: never[]) => unknown)?.description;
    if (desc?.kind === "threshold") {
      out.push({ phase, guardId: `${phase}[${index}]`, threshold: desc.threshold, comparator: desc.comparator });
    }
  });
  return out;
}

/**
 * AJD-302 — CompositionThresholdReachability (Tier 3, ADVISORY, probe-dependent).
 *
 * Reachability/redundancy of the merged threshold surface, plus a holistic
 * probe-coverage floor that makes the "advisory" honest. NEVER gating (notes +
 * one warning). All threshold checks are field-UNVERIFIABLE at Tier 3 (the
 * `extract` closure is opaque; full field resolution is the deferred Tier-2
 * AJD-202), so they carry `unverifiableField: true`.
 */
const compositionReachabilityAnalyzer: Tier3Analyzer = {
  name: "CompositionReachabilityAnalyzer",
  code: "AJD-302",
  analyze(pack, probes) {
    const diagnostics: Diagnostic[] = [];

    // Non-system declared intents (system-only kinds excluded, same rule as the
    // AJD-301 unreachable_intent check).
    const declared = [...new Set<string>(pack.intents as ReadonlyArray<string>)];
    const nonSystem = declared.filter((k) => {
      const m = taintMinimum(pack, k);
      return !(m !== undefined && m !== "UNTRUSTED");
    });
    const unionAllowed = probeAllowedIntents(pack, probes);
    const covered = nonSystem.filter((k) => unionAllowed.has(k));

    // probe_coverage_floor (warning): the PROBE SET doesn't exercise the whole
    // declared surface, so Tier-3 advisory results are partial. Counts/ratio
    // ONLY — the per-intent defect is AJD-301 `unreachable_intent` (no double
    // listing of intents; this is the analysis-confidence caveat, not the defect).
    if (nonSystem.length > 0 && covered.length < nonSystem.length) {
      diagnostics.push({
        code: "AJD-302",
        severity: "warning",
        message: `Planner probes cover ${covered.length}/${nonSystem.length} declared non-system intent(s) across ${probes.length} probe(s) — Tier-3 advisory results are partial.`,
        detail: {
          rule: "probe_coverage_floor",
          declaredNonSystem: nonSystem.length,
          covered: covered.length,
          probeCount: probes.length,
          coverageRatio: covered.length / nonSystem.length,
        },
      });
    }

    const thresholds = collectThresholds(pack);

    // threshold_unreachable (note): thresholds exist but the planner offers NO
    // intent across the probes → no intent flows through any phase → dead gate.
    if (thresholds.length > 0 && unionAllowed.size === 0) {
      for (const t of thresholds) {
        diagnostics.push({
          code: "AJD-302",
          severity: "note",
          message: `Threshold guard ${t.guardId} is unreachable: the planner offers no intents across ${probes.length} probe(s).`,
          detail: { rule: "threshold_unreachable", guardId: t.guardId, probeCount: probes.length, unverifiableField: true },
        });
      }
    }

    // threshold_redundancy (note): two same-phase, same-direction thresholds
    // where one bound subsumes the other → the dominated guard is never the
    // binding constraint. Field opaque at Tier 3 → advisory only.
    for (let i = 0; i < thresholds.length; i += 1) {
      for (let j = i + 1; j < thresholds.length; j += 1) {
        const a = thresholds[i]!;
        const b = thresholds[j]!;
        if (a.phase !== b.phase) continue;
        const aLower = a.comparator === ">=" || a.comparator === ">";
        const bLower = b.comparator === ">=" || b.comparator === ">";
        const aUpper = a.comparator === "<=" || a.comparator === "<";
        const bUpper = b.comparator === "<=" || b.comparator === "<";
        let redundant: string | undefined;
        if (aLower && bLower) {
          // Lower bounds: the SMALLER threshold is subsumed (always satisfied
          // when the larger is). Equal bounds → the later guardId is the dup.
          redundant =
            a.threshold === b.threshold
              ? a.guardId < b.guardId ? b.guardId : a.guardId
              : a.threshold < b.threshold ? a.guardId : b.guardId;
        } else if (aUpper && bUpper) {
          // Upper bounds: the LARGER threshold is subsumed.
          redundant =
            a.threshold === b.threshold
              ? a.guardId < b.guardId ? b.guardId : a.guardId
              : a.threshold > b.threshold ? a.guardId : b.guardId;
        }
        if (redundant !== undefined) {
          const dominating = redundant === a.guardId ? b.guardId : a.guardId;
          diagnostics.push({
            code: "AJD-302",
            severity: "note",
            message: `Threshold guard ${redundant} is redundant: ${dominating} (same ${a.phase} phase, same direction) subsumes it (field not statically verifiable).`,
            detail: { rule: "threshold_redundancy", redundant, dominating, phase: a.phase, unverifiableField: true },
          });
        }
      }
    }

    return sortDiagnostics(diagnostics);
  },
};

/**
 * Pure escalation-graph cycle detection (DFS back-edge). Deterministic: nodes
 * and successors are visited in sorted order. Returns each cycle as a node list
 * `[v, …, v]` (closed). Exported for direct unit testing of the engine.
 */
export function detectEscalationCycles(
  edges: ReadonlyArray<{ readonly from: string; readonly to: string }>,
): string[][] {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const list = adj.get(e.from);
    if (list) list.push(e.to);
    else adj.set(e.from, [e.to]);
  }
  const nodes = [...new Set(edges.flatMap((e) => [e.from, e.to]))].sort();
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  function dfs(u: string): void {
    color.set(u, GRAY);
    stack.push(u);
    for (const v of [...(adj.get(u) ?? [])].sort()) {
      const c = color.get(v) ?? 0;
      if (c === GRAY) {
        const idx = stack.indexOf(v);
        cycles.push([...stack.slice(idx), v]);
      } else if (c !== BLACK) {
        dfs(v);
      }
    }
    stack.pop();
    color.set(u, BLACK);
  }
  for (const n of nodes) if ((color.get(n) ?? 0) === 0) dfs(n);
  return cycles;
}

/**
 * Extract escalation edges (guard → escalation target) from a Pack's guard
 * metadata. FEASIBILITY (WS-D spike): `GuardDescription` exposes NO escalation
 * TARGET today — `threshold.emits` may be `"ESCALATE"` but never says *to whom*
 * — so no source→target edge is recoverable and this returns `[]` for every
 * current Pack. This is the single seam to populate once guard metadata gains
 * an escalation-target surface (e.g. `description.escalatesTo`); AJD-303 then
 * activates automatically. See docs/guides/composition-analysis.md.
 */
function extractEscalationEdges<K extends string, P, S, C>(
  pack: PackV0<K, P, S, C>,
): Array<{ from: string; to: string }> {
  const edges: Array<{ from: string; to: string }> = [];
  eachGuard(pack, (guard, phase, index) => {
    const desc = readGuardMetadata(guard as unknown as (...a: never[]) => unknown)?.description;
    // A guard may declare it emits ESCALATE, but GuardDescription carries no
    // escalation target, so no from→to edge can be formed. (Future: read
    // `desc.escalatesTo` here to populate edges from `${phase}[${index}]`.)
    void desc;
    void phase;
    void index;
  });
  return edges;
}

/**
 * AJD-303 — CompositionEscalationCycle (Tier 3, ADVISORY, probe-dependent).
 *
 * Detects escalation-graph cycles across the merged set. SOUND NO-OP on all
 * current Packs: no escalation-target metadata exists to form edges (see
 * `extractEscalationEdges`), so it never fires a false positive. Wired + the
 * cycle engine is tested so it activates the moment guard metadata gains an
 * escalation-target surface.
 */
const compositionEscalationCycleAnalyzer: Tier3Analyzer = {
  name: "CompositionEscalationCycleAnalyzer",
  code: "AJD-303",
  analyze(pack, _probes) {
    const cycles = detectEscalationCycles(extractEscalationEdges(pack));
    return sortDiagnostics(
      cycles.map((cycle) => ({
        code: "AJD-303",
        severity: "note" as const,
        message: `Escalation cycle detected across the merged set: ${cycle.join(" → ")}.`,
        detail: { rule: "escalation_cycle", cycle },
      })),
    );
  },
};

export {
  policyCoherenceAnalyzer,
  compositionReachabilityAnalyzer,
  compositionEscalationCycleAnalyzer,
};
export const DEFAULT_TIER3_ANALYZERS: ReadonlyArray<Tier3Analyzer> = [
  policyCoherenceAnalyzer,
  compositionReachabilityAnalyzer,
  compositionEscalationCycleAnalyzer,
];
