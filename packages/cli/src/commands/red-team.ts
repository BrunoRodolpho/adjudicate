/**
 * `adjudicate red-team` — generates adversarial scenarios for a Pack and runs
 * them through the kernel, asserting the policy's defenses hold. Exits 2 on any
 * escape or error (a policy/harness regression), mirroring simulate diff-mode.
 *
 * Reuses `loadPackFromModule` (same as simulate); the generation + assertion
 * logic lives in @adjudicate/red-team.
 */

import {
  computeRedTeamExitCode,
  generatePromptInjectionEnvelopes,
  generateProvenanceInjectionEnvelopes,
  generateReadInjectIntentEnvelopes,
  generateTaintEscalationEnvelopes,
  generateToolScopeViolationEnvelopes,
  renderRedTeamJson,
  renderRedTeamText,
  runRedTeam,
  type AttackVector,
  type RedTeamPack,
  type RedTeamScenario,
} from "@adjudicate/red-team";
import { loadPackFromModule } from "../lib/pack-loader.js";

export interface RedTeamOptions {
  readonly pack: string;
  readonly seed?: number;
  readonly perIntent?: number;
  readonly vectors?: ReadonlyArray<AttackVector>;
  readonly format?: "text" | "json";
  readonly cwd?: string;
  readonly stdout?: (line: string) => void;
}

// 041 surfaced the `provenance_injection` seam in the AttackVector union; 042
// LANDS its generator (`generateProvenanceInjectionEnvelopes`, wired in the
// per-vector block below). Requesting it now produces real contamination /
// data-provenance scenarios. 043 adds the `read_inject_intent` laundering vector
// (`generateReadInjectIntentEnvelopes`) — fires only for packs that declare an
// UNTRUSTED-min kind as origin-required.
const ALL_VECTORS: ReadonlyArray<AttackVector> = [
  "prompt_injection",
  "taint_escalation",
  "tool_scope_violation",
  "provenance_injection",
  "read_inject_intent",
];

export async function runRedTeamCommand(options: RedTeamOptions): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const out = options.stdout ?? ((line) => process.stdout.write(`${line}\n`));
  const format = options.format ?? "text";
  const vectors = options.vectors ?? ALL_VECTORS;
  const genOpts = {
    ...(options.seed !== undefined ? { seed: options.seed } : {}),
    ...(options.perIntent !== undefined ? { perIntent: options.perIntent } : {}),
  };

  const pack = (await loadPackFromModule(options.pack, cwd)) as unknown as RedTeamPack;

  const scenarios: RedTeamScenario[] = [];
  if (vectors.includes("prompt_injection")) {
    scenarios.push(...generatePromptInjectionEnvelopes(pack, genOpts));
  }
  if (vectors.includes("taint_escalation")) {
    scenarios.push(...generateTaintEscalationEnvelopes(pack, genOpts));
  }
  if (vectors.includes("tool_scope_violation")) {
    scenarios.push(...generateToolScopeViolationEnvelopes(pack, genOpts));
  }
  if (vectors.includes("provenance_injection")) {
    scenarios.push(...generateProvenanceInjectionEnvelopes(pack, genOpts));
  }
  if (vectors.includes("read_inject_intent")) {
    scenarios.push(...generateReadInjectIntentEnvelopes(pack, genOpts));
  }

  const report = runRedTeam(pack, scenarios);
  out(format === "json" ? renderRedTeamJson(report) : renderRedTeamText(report));
  process.exitCode = computeRedTeamExitCode(report.summary);
}
