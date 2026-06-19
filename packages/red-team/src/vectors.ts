import { generatePromptInjectionEnvelopes } from "./vectors/prompt-injection.js";
import { generateProvenanceInjectionEnvelopes } from "./vectors/provenance-injection.js";
import { generateTaintEscalationEnvelopes } from "./vectors/taint-escalation.js";
import { generateToolScopeViolationEnvelopes } from "./vectors/tool-scope-violation.js";
import type { GenerateOptions, RedTeamPack, RedTeamScenario } from "./scenario.js";

/** Run all generators and concatenate. Convenience for the CLI + tests. */
export function generateAllVectors(
  pack: RedTeamPack,
  opts: GenerateOptions = {},
): RedTeamScenario[] {
  return [
    ...generatePromptInjectionEnvelopes(pack, opts),
    ...generateTaintEscalationEnvelopes(pack, opts),
    ...generateToolScopeViolationEnvelopes(pack, opts),
    // 042 — the contamination / data-provenance vector.
    ...generateProvenanceInjectionEnvelopes(pack, opts),
  ];
}
