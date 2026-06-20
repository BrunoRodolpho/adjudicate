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

/**
 * H13 — structural validation of a committed canary baseline. The gate trusts the
 * numeric ceilings + per-scenario array; a baseline missing any of them silently
 * disables that axis (`N > undefined` ⇒ false) and PROMOTES despite escapes. We
 * therefore assert the full required shape BEFORE gating and fail CLOSED (the
 * caller maps a non-null return to exit 2). Returns the first deviation, or null
 * when the value is a well-formed `CanaryBaseline`. `ownershipExercised` is the
 * only optional field (pre-202 backward-compat).
 */
function validateCanaryBaselineShape(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return "expected a JSON object";
  }
  const b = value as Record<string, unknown>;
  if (typeof b.packId !== "string") return 'field "packId" must be a string';
  for (const field of ["escaped", "errors", "ownershipEscaped"] as const) {
    if (!Number.isFinite(b[field])) return `field "${field}" must be a finite number`;
  }
  if (typeof b.taintVacuous !== "boolean") return 'field "taintVacuous" must be a boolean';
  if (b.ownershipExercised !== undefined && typeof b.ownershipExercised !== "boolean") {
    return 'field "ownershipExercised" must be a boolean when present';
  }
  if (!Array.isArray(b.scenarios)) return 'field "scenarios" must be an array';
  for (let i = 0; i < b.scenarios.length; i += 1) {
    const s = b.scenarios[i];
    if (typeof s !== "object" || s === null || Array.isArray(s)) {
      return `scenarios[${i}] must be an object`;
    }
    const sc = s as Record<string, unknown>;
    if (typeof sc.name !== "string") return `scenarios[${i}].name must be a string`;
    if (typeof sc.status !== "string") return `scenarios[${i}].status must be a string`;
    if (sc.decision !== undefined && typeof sc.decision !== "string") {
      return `scenarios[${i}].decision must be a string when present`;
    }
  }
  return null;
}

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
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(baselinePath, "utf8"));
    } catch (err) {
      out(`✗ failed to read canary baseline ${baselinePath}: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 2;
      return;
    }
    // H13 — STRUCTURAL VALIDATION (fail-CLOSED). Without it, a baseline missing the
    // numeric ceilings (e.g. `{packId,scenarios:[]}`) makes the gate compute
    // `N > undefined` → false on every count axis → a clean exit 0 PROMOTE despite
    // live escapes (a CI `set -e` cannot catch a clean 0). Any deviation from the
    // required shape ⇒ refuse to gate (exit 2). Only `ownershipExercised` is
    // optional (pre-202 backward-compat); every other field is REQUIRED.
    const baselineErr = validateCanaryBaselineShape(parsed);
    if (baselineErr !== null) {
      out(`✗ malformed canary baseline ${baselinePath}: ${baselineErr} — refusing to gate (fail-closed).`);
      process.exitCode = 2;
      return;
    }
    const baseline = parsed as CanaryBaseline;
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
              // 202 — the ownership-canary non-vacuity verdict (did the owner
              // predicate actually run for the fixture-backed probes?).
              ownershipNonVacuity: result.strict.ownershipNonVacuity,
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
      const nv = result.strict.ownershipNonVacuity;
      out(
        `  canary[baselined/strict] · escapes ${result.strict.report.summary.escaped}/baseline ${result.baseline.escaped}` +
          ` · ownership/IDOR escapes ${result.strict.ownership.escaped}/baseline ${result.baseline.ownershipEscaped}` +
          ` · vacuous ${result.strict.taintVacuous}/baseline ${result.baseline.taintVacuous}` +
          // 202 — owner-predicate exercise: reachedAuth / fixtureBacked.
          ` · owner-predicate exercised ${nv.reachedAuth}/${nv.fixtureBacked}` +
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
            // 202 — owner-predicate exercise verdict (anti-false-confidence).
            ownershipNonVacuity: result.ownershipNonVacuity,
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
          // 202 — did the owner predicate actually run for the fixture-backed probes?
          ` · owner-predicate exercised ${result.ownershipNonVacuity.reachedAuth}/${result.ownershipNonVacuity.fixtureBacked}` +
          (result.ownershipNonVacuity.notExercised.length > 0
            ? ` · OWNERSHIP CANARY VACUOUS (hard fail): ${result.ownershipNonVacuity.notExercised.join(", ")}`
            : "") +
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
