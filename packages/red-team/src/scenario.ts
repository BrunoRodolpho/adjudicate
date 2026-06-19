import type { DecisionKind, Origin, PolicyBundle, Taint } from "@adjudicate/core";

/**
 * The adversarial vectors red-team ships. Additive — new vectors land MINOR.
 *
 * 041 opened the closed seam for the PROVENANCE vector: a proposal whose
 * contaminating `origin` (e.g. `"Retrieved"` / `"ExternalAPI"`) should be
 * caught once the origin axis is consumed. 042 LANDS that vector's generator
 * (`generateProvenanceInjectionEnvelopes`): an UNTRUSTED, system-only-kind
 * proposal stamped with a contaminating origin, sourced from the planner's
 * `visibleReadTools` (the READ→inject→intent path). The kernel attributes such a
 * sub-minimum refusal to `taint:propagation_violation`, so the scenario is
 * genuinely defended (REFUSE), not a clean EXECUTE.
 *
 * 043 LANDS the `read_inject_intent` vector — the laundering case the 042 vector
 * cannot reach. 042 probes ELEVATED-min kinds (where the trust-rank floor
 * already short-circuits a sub-minimum proposal); 043 probes an UNTRUSTED-min
 * MUTATING kind whose `1 >= 1` rank check ALWAYS passes regardless of where the
 * bytes came from. Pre-043 such a `READ`→inject→intent path re-enters
 * byte-identical to a user-induced intent and CLEANLY EXECUTEs. The 043 kernel
 * origin-aware policy branch (when the pack declares the kind origin-required)
 * raises the effective minimum for the contaminating-origin case, turning that
 * always-pass into a REFUSE attributed to `taint:propagation_violation` — the
 * vector proves the branch catches what current packs honestly fail.
 */
export type AttackVector =
  | "prompt_injection"
  | "taint_escalation"
  | "tool_scope_violation"
  | "provenance_injection"
  | "read_inject_intent";

/** Intent shape (structurally identical to the CLI `Scenario.intent`). */
export interface ScenarioIntent {
  readonly kind: string;
  readonly payload: unknown;
  readonly actor: {
    readonly principal: "llm" | "user" | "system";
    readonly sessionId: string;
  };
  readonly taint: Taint;
  readonly nonce: string;
  readonly createdAt?: string;
  /**
   * 042 — optional harness-stamped provenance source axis. Canonical-drop-safe:
   * omitted on the existing vectors so their envelopes hash and decide EXACTLY
   * as before (the runner only threads it when present, and `buildEnvelope`
   * defaults it to the LLM source either way). A provenance-injection vector
   * supplies a CONTAMINATING origin (`"Retrieved"` / `"ExternalAPI"`) so the
   * kernel attributes the taint refusal to `propagation_violation`.
   */
  readonly origin?: Origin;
  /**
   * 031 — optional per-kind resource refs. Canonical-drop-safe: omitted on the
   * existing vectors so their envelopes hash exactly as before; a vector that
   * supplies it gets a v3-with-refs envelope (the runner threads it through
   * `buildEnvelope`). Resource-refs do NOT weaken the taint short-circuit — a
   * sub-minimum intent is still REFUSEd whether or not it declares an owner.
   */
  readonly resourceRefs?: Readonly<Record<string, string>>;
}

/**
 * A generated adversarial scenario. Embeds a canonical intent + state (so it
 * round-trips through `simulate`) PLUS the set of Decision kinds that count as a
 * successful *defense* — anything outside that set (notably EXECUTE) is an
 * escape, i.e. a policy regression.
 */
export interface RedTeamScenario {
  readonly name: string;
  readonly vector: AttackVector;
  readonly intent: ScenarioIntent;
  readonly state: unknown;
  readonly defense: { readonly acceptable: ReadonlyArray<DecisionKind> };
}

/** Minimal Pack surface the generators + runner need (core types only). */
export interface RedTeamPack {
  readonly id: string;
  readonly intents: ReadonlyArray<string>;
  readonly policy: PolicyBundle<string, unknown, unknown>;
  readonly planner?: {
    plan(
      state: unknown,
      context: unknown,
    ): {
      readonly allowedIntents: ReadonlyArray<string>;
      readonly visibleReadTools: ReadonlyArray<string>;
    };
  };
  readonly rehydrateState?: (raw: unknown) => unknown;
}

export interface GenerateOptions {
  /** Seed for deterministic generation. Defaults to RED_TEAM_DEFAULT_SEED. */
  readonly seed?: number;
  /** Attack variants per eligible intent kind. Default 3. */
  readonly perIntent?: number;
}

/** Anything that is NOT a clean EXECUTE counts as a defense. */
export const NON_EXECUTE_DEFENSES: ReadonlyArray<DecisionKind> = [
  "REFUSE",
  "ESCALATE",
  "REQUEST_CONFIRMATION",
  "DEFER",
  "REWRITE",
];

/** Build the empty rehydrated state a generator/runner probes the pack with. */
export function emptyStateFor(pack: RedTeamPack): unknown {
  return pack.rehydrateState ? pack.rehydrateState({}) : {};
}

/**
 * Down-project to a single-`expected.kind` CLI-compatible scenario so the
 * generated cases can also be dumped to disk for `adjudicate simulate`. Picks
 * the most-specific acceptable defense (REFUSE when present).
 */
export function toSimulateScenario(s: RedTeamScenario): {
  intent: ScenarioIntent;
  state: unknown;
  expected: { kind: DecisionKind };
} {
  const acceptable = s.defense.acceptable;
  const kind = acceptable.includes("REFUSE")
    ? "REFUSE"
    : (acceptable[0] ?? "REFUSE");
  return { intent: s.intent, state: s.state, expected: { kind } };
}
