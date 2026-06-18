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

// 041 surfaced the `provenance_injection` seam in the AttackVector union.
// Its generator lands with plan 042/043; until then there is no
// `generate*Envelopes` for it, so requesting it yields zero scenarios (the
// per-vector `if (vectors.includes(...))` blocks below have no provenance
// arm yet). The key is listed so the CLI accepts it and 042/043 only need to
// add the generator call, not re-wire the surface.
const ALL_VECTORS: ReadonlyArray<AttackVector> = [
  "prompt_injection",
  "taint_escalation",
  "tool_scope_violation",
  "provenance_injection",
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

  const report = runRedTeam(pack, scenarios);
  out(format === "json" ? renderRedTeamJson(report) : renderRedTeamText(report));
  process.exitCode = computeRedTeamExitCode(report.summary);
}
