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
  runCanaryGate,
  runRedTeam,
  type AttackVector,
  type CanaryPolicy,
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
  /**
   * 084 — run the FROZEN adversarial-canary GATE instead of the ad-hoc per-vector
   * run. The canary gate folds the 035 ownership/IDOR vector into the frozen set
   * AND (under the strict policy) promotes the `taintEscalationCausality`
   * non-vacuity check to a hard fail. Exit 2 = ROLLBACK / 0 = PROMOTE. `--vectors`
   * is ignored in canary mode (the frozen set is fixed by design).
   */
  readonly canary?: boolean;
  /**
   * 084 — canary failure policy. `"strict"` (default): any non-acceptable
   * decision / error / vacuous taint pass rolls back (single-candidate canary).
   * `"execute-escape"`: roll back ONLY on a reached EXECUTE or error (the §D-1
   * privilege-escalation gate) — for a heterogeneous catalog whose adversarial
   * scenarios are legitimately defended upstream of the taint gate.
   */
  readonly canaryPolicy?: CanaryPolicy;
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

  // 084 — frozen adversarial-canary GATE mode. Runs the FROZEN scenario set
  // (all vectors + the 035 ownership/IDOR vector) with the non-vacuity check
  // promoted to a hard fail, then exits 0 (PROMOTE) / 2 (ROLLBACK). This is the
  // gate CI + release wire over the shipped pack dist bundles.
  if (options.canary === true) {
    const policy: CanaryPolicy = options.canaryPolicy ?? "strict";
    const result = runCanaryGate(pack, { stage: "canary", policy, ...genOpts });
    if (format === "json") {
      out(
        JSON.stringify(
          {
            stage: result.stage,
            policy: result.policy,
            exitCode: result.exitCode,
            taintVacuous: result.taintVacuous,
            executeEscapes: result.executeEscapes,
            ownership: result.ownership,
            causality: result.causality,
            report: result.report,
          },
          null,
          2,
        ),
      );
    } else {
      out(renderRedTeamText(result.report));
      out(
        `  canary[${result.stage}/${result.policy}] · taint gate exercised ${result.causality.byTaintGate}/${result.causality.total}` +
          (result.taintVacuous
            ? result.policy === "strict"
              ? " · VACUOUS taint pass (hard fail)"
              : " · vacuous taint pass (advisory)"
            : "") +
          ` · EXECUTE escapes ${result.executeEscapes}` +
          ` · ownership/IDOR escapes ${result.ownership.escaped} (to-EXECUTE ${result.ownership.toExecute})` +
          ` · verdict ${result.exitCode === 0 ? "PROMOTE" : "ROLLBACK"}`,
      );
    }
    process.exitCode = result.exitCode;
    return;
  }

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
