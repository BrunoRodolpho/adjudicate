/**
 * @adjudicate/red-team — deterministic adversarial scenario generation.
 *
 * Generates prompt-injection, taint-escalation, and tool-scope-violation
 * scenarios from a Pack's declared surface and runs them through the PURE
 * kernel, asserting the policy's defenses hold (no clean EXECUTE escapes).
 * Same seed → byte-identical scenarios. No kernel changes; a consumer of the
 * existing taint/auth/business basis vocabulary.
 */

export {
  RED_TEAM_DEFAULT_SEED,
  lcg,
  type Rng,
} from "./prng.js";

export {
  NON_EXECUTE_DEFENSES,
  emptyStateFor,
  toSimulateScenario,
  type AttackVector,
  type GenerateOptions,
  type RedTeamPack,
  type RedTeamScenario,
  type ScenarioIntent,
} from "./scenario.js";

export { generatePromptInjectionEnvelopes } from "./vectors/prompt-injection.js";
export { generateTaintEscalationEnvelopes } from "./vectors/taint-escalation.js";
export { generateToolScopeViolationEnvelopes } from "./vectors/tool-scope-violation.js";

export {
  computeRedTeamExitCode,
  runRedTeam,
  taintEscalationCausality,
  TAINT_GATE_BASIS,
  type RedTeamReport,
  type RedTeamResult,
  type RedTeamStatus,
  type RedTeamSummary,
  type TaintEscalationCausality,
} from "./runner.js";

export { renderRedTeamJson, renderRedTeamText } from "./render.js";

import { generatePromptInjectionEnvelopes } from "./vectors/prompt-injection.js";
import { generateTaintEscalationEnvelopes } from "./vectors/taint-escalation.js";
import { generateToolScopeViolationEnvelopes } from "./vectors/tool-scope-violation.js";
import type { GenerateOptions, RedTeamPack, RedTeamScenario } from "./scenario.js";

/** Run all three generators and concatenate. Convenience for the CLI + tests. */
export function generateAllVectors(
  pack: RedTeamPack,
  opts: GenerateOptions = {},
): RedTeamScenario[] {
  return [
    ...generatePromptInjectionEnvelopes(pack, opts),
    ...generateTaintEscalationEnvelopes(pack, opts),
    ...generateToolScopeViolationEnvelopes(pack, opts),
  ];
}
