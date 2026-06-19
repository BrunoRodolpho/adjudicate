import { generatePromptInjectionEnvelopes } from "./vectors/prompt-injection.js";
import { generateProvenanceInjectionEnvelopes } from "./vectors/provenance-injection.js";
import {
  generateReadInjectIntentEnvelopes,
  generateTaintEscalationEnvelopes,
} from "./vectors/taint-escalation.js";
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
    // 043 — the READ→inject→intent laundering vector (UNTRUSTED-min mutating
    // kinds the pack marks origin-required; no-op for packs that declare none).
    ...generateReadInjectIntentEnvelopes(pack, opts),
  ];
}
