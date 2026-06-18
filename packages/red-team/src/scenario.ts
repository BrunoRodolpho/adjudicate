import type { DecisionKind, PolicyBundle, Taint } from "@adjudicate/core";

/**
 * The adversarial vectors red-team ships. Additive — new vectors land MINOR.
 *
 * 041 adds the closed seam for the PROVENANCE vector: a proposal whose
 * contaminating `origin` (e.g. `"Retrieved"` / `"ExternalAPI"`) should be
 * caught once the origin axis is gated. NOTE: 041 only opens the union seam
 * (so 042/043 can land scenarios); the kernel gate still calls envelope-level
 * `canPropose` only, so a provenance scenario is NOT yet defended — the
 * generators + the consuming gate arrive with plan 042/043.
 */
export type AttackVector =
  | "prompt_injection"
  | "taint_escalation"
  | "tool_scope_violation"
  | "provenance_injection";

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
