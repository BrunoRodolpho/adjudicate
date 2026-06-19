/**
 * `adjudicate red-team` — generates adversarial scenarios for a Pack and runs
 * them through the kernel, asserting the policy's defenses hold. Exits 2 on any
 * escape or error (a policy/harness regression), mirroring simulate diff-mode.
 *
 * Reuses `loadPackFromModule` (same as simulate); the generation + assertion
 * logic lives in @adjudicate/red-team.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  computeRedTeamExitCode,
  generatePromptInjectionEnvelopes,
  generateProvenanceInjectionEnvelopes,
  generateReadInjectIntentEnvelopes,
  generateTaintEscalationEnvelopes,
  generateToolScopeViolationEnvelopes,
  renderRedTeamJson,
  renderRedTeamText,
  runBaselinedCanaryGate,
  runCanaryGate,
  runRedTeam,
  type AttackVector,
  type CanaryBaseline,
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
  /**
   * 084 — the CI/publish gate. Path to a COMMITTED baseline JSON (a
   * `CanaryBaseline`). When set, runs `runBaselinedCanaryGate`: the FULL STRICT
   * canary measured against the baseline. PROMOTE iff no-worse-than-baseline;
   * ROLLBACK on any NEW escape/error/IDOR/vacuity OR any §C friction regression.
   * This is the gate CI/release wire — it documents the pre-existing 035-F1 gaps
   * (so CI is not permanently red) WITHOUT blinding the gate to new escapes or to
   * friction-lowering the way the global `execute-escape` policy did.
   */
  readonly baseline?: string;
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

  // 084 — the CI/publish gate: STRICT canary measured against a COMMITTED
  // baseline. PROMOTE iff no-worse-than-baseline; ROLLBACK on any NEW
  // escape/error/IDOR/vacuity OR any §C friction regression (e.g. a money-mover's
  // IDOR REFUSE→DEFER). This documents the pre-existing 035-F1 gaps WITHOUT
  // blinding the gate the way the global execute-escape policy did.
  if (options.baseline !== undefined) {
    const baselinePath = resolve(cwd, options.baseline);
    let baseline: CanaryBaseline;
    try {
      baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as CanaryBaseline;
    } catch (err) {
      out(`✗ failed to read canary baseline ${baselinePath}: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 2;
      return;
    }
    if (baseline.packId !== pack.id) {
      out(`✗ baseline packId "${baseline.packId}" does not match pack "${pack.id}" — refusing to gate (fail-closed).`);
      process.exitCode = 2;
      return;
    }
    const result = runBaselinedCanaryGate(pack, baseline, { stage: "canary", ...genOpts });
    if (format === "json") {
      out(
        JSON.stringify(
          {
            mode: "baselined",
            packId: pack.id,
            exitCode: result.exitCode,
            regressed: result.regressed,
            reasons: result.reasons,
            strict: {
              exitCode: result.strict.exitCode,
              taintVacuous: result.strict.taintVacuous,
              executeEscapes: result.strict.executeEscapes,
              ownership: result.strict.ownership,
              summary: result.strict.report.summary,
            },
            baseline: {
              escaped: result.baseline.escaped,
              errors: result.baseline.errors,
              ownershipEscaped: result.baseline.ownershipEscaped,
              taintVacuous: result.baseline.taintVacuous,
            },
          },
          null,
          2,
        ),
      );
    } else {
      out(renderRedTeamText(result.strict.report));
      out(
        `  canary[baselined/strict] · escapes ${result.strict.report.summary.escaped}/baseline ${result.baseline.escaped}` +
          ` · ownership/IDOR escapes ${result.strict.ownership.escaped}/baseline ${result.baseline.ownershipEscaped}` +
          ` · vacuous ${result.strict.taintVacuous}/baseline ${result.baseline.taintVacuous}` +
          ` · verdict ${result.exitCode === 0 ? "PROMOTE" : "ROLLBACK"}`,
      );
      for (const reason of result.reasons) out(`    ↳ rollback: ${reason}`);
    }
    process.exitCode = result.exitCode;
    return;
  }

  // 084 — frozen adversarial-canary GATE mode. Runs the FROZEN scenario set
  // (all vectors + the 035 ownership/IDOR vector) with the non-vacuity check
  // promoted to a hard fail, then exits 0 (PROMOTE) / 2 (ROLLBACK). The strict
  // policy is the FULL gate (used by `--baseline` above and the unit suite);
  // `--canary-policy execute-escape` is the §D-1 privilege-escalation-only gate,
  // exposed for ad-hoc local inspection — it is NOT the CI/publish gate.
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
