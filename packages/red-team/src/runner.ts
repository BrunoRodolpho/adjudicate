import {
  adjudicateWithTrace,
  buildEnvelope,
  describePolicyBundle,
  restrictivenessRank,
  type DecisionKind,
  type PolicyBundle,
} from "@adjudicate/core";
import { sha256Canonical } from "@adjudicate/canonical";
import type {
  AttackVector,
  GenerateOptions,
  RedTeamPack,
  RedTeamScenario,
} from "./scenario.js";
import { generateAllVectors } from "./vectors.js";
import { generateOwnershipViolationEnvelopes } from "./vectors/taint-escalation.js";

export type RedTeamStatus = "defended" | "escaped" | "error";

export interface RedTeamResult {
  readonly name: string;
  readonly vector: AttackVector;
  readonly status: RedTeamStatus;
  readonly decision?: DecisionKind;
  /** Flattened `category:code` basis of the final decision — "which defense fired". */
  readonly basisCodes?: ReadonlyArray<string>;
  readonly acceptable: ReadonlyArray<DecisionKind>;
  readonly error?: string;
  /**
   * 202 — true when the kernel evaluation REACHED the auth phase (the trace
   * contains an `auth`-phase entry, i.e. state + taint passed and at least one auth
   * guard ran). The ownership non-vacuity gate asserts every fixture-backed
   * ownership probe reaches auth — proof the owner predicate was actually exercised,
   * not assumed. Omitted on an `error` scenario (no trace).
   */
  readonly reachedAuth?: boolean;
  /**
   * 202 — true when this result came from a fixture-backed ownership scenario (it
   * carries injected authority + a state-valid payload). Lets the canary gate
   * isolate the fixture-backed probes for the `reachedAuth` non-vacuity check.
   */
  readonly fixtureBacked?: boolean;
}

export interface RedTeamSummary {
  readonly total: number;
  readonly defended: number;
  readonly escaped: number;
  readonly errors: number;
  readonly escapesByVector: Readonly<Record<AttackVector, number>>;
}

export interface RedTeamReport {
  readonly pack: { readonly id: string };
  readonly results: ReadonlyArray<RedTeamResult>;
  readonly summary: RedTeamSummary;
}

function emptyByVector(): Record<AttackVector, number> {
  // Exhaustive over the closed AttackVector union — a missing arm fails the
  // type-checker (Record requires every key). 041 added `provenance_injection`;
  // 043 added `read_inject_intent`.
  return {
    prompt_injection: 0,
    taint_escalation: 0,
    tool_scope_violation: 0,
    provenance_injection: 0,
    read_inject_intent: 0,
  };
}

/**
 * Run adversarial scenarios through the pure kernel and classify each as
 * defended / escaped / error. An ESCAPE is a policy regression: the adversarial
 * intent produced a Decision kind outside the scenario's `acceptable` set.
 */
export function runRedTeam(
  pack: RedTeamPack,
  scenarios: ReadonlyArray<RedTeamScenario>,
): RedTeamReport {
  const results: RedTeamResult[] = [];
  const escapesByVector = emptyByVector();
  let defended = 0;
  let escaped = 0;
  let errors = 0;

  for (const s of scenarios) {
    try {
      const envelope = buildEnvelope({
        kind: s.intent.kind,
        payload: s.intent.payload,
        actor: s.intent.actor,
        taint: s.intent.taint,
        nonce: s.intent.nonce,
        ...(s.intent.createdAt !== undefined ? { createdAt: s.intent.createdAt } : {}),
        // 042: thread the contaminating origin through so the provenance-injection
        // vector reaches the kernel's taint gate with a Retrieved/ExternalAPI
        // source. Drop-safe — only spread when present, so the existing vectors
        // (which omit it) build byte-identically and `buildEnvelope` defaults to
        // the LLM source for them.
        ...(s.intent.origin !== undefined ? { origin: s.intent.origin } : {}),
        // 031: thread resource-refs through so v3-with-refs vectors build.
        // Drop-safe — only spread when present, so no-refs vectors are byte-identical.
        ...(s.intent.resourceRefs !== undefined
          ? { resourceRefs: s.intent.resourceRefs }
          : {}),
      });
      // 202 — a fixture-backed scenario carries a FULLY-FORMED state (rehydrated
      // base + injected `authority`); use it VERBATIM so the pack's JSON
      // rehydrator cannot strip the host authority infra. Every other scenario
      // rehydrates exactly as before (byte-identical).
      const state =
        s.prebuiltState !== undefined
          ? s.prebuiltState
          : pack.rehydrateState
            ? pack.rehydrateState(s.state)
            : s.state;
      const { decision, trace } = adjudicateWithTrace(envelope, state, pack.policy);
      const basisCodes = decision.basis.map((b) => `${b.category}:${b.code}`);
      // 202 — did evaluation reach the auth phase? The trace carries an `auth`-phase
      // entry iff state + taint passed and an auth guard ran (the owner predicate).
      const reachedAuth = trace.some((e) => e.phase === "auth");
      const isDefended = s.defense.acceptable.includes(decision.kind);
      const fixtureFields =
        s.fixtureBacked === true
          ? { reachedAuth, fixtureBacked: true as const }
          : { reachedAuth };
      if (isDefended) {
        defended += 1;
        results.push({
          name: s.name,
          vector: s.vector,
          status: "defended",
          decision: decision.kind,
          basisCodes,
          acceptable: s.defense.acceptable,
          ...fixtureFields,
        });
      } else {
        escaped += 1;
        escapesByVector[s.vector] += 1;
        results.push({
          name: s.name,
          vector: s.vector,
          status: "escaped",
          decision: decision.kind,
          basisCodes,
          acceptable: s.defense.acceptable,
          ...fixtureFields,
        });
      }
    } catch (err) {
      errors += 1;
      results.push({
        name: s.name,
        vector: s.vector,
        status: "error",
        acceptable: s.defense.acceptable,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    pack: { id: pack.id },
    results,
    summary: {
      total: scenarios.length,
      defended,
      escaped,
      errors,
      escapesByVector,
    },
  };
}

/** Exit 2 when any scenario escaped or errored (a policy/harness regression). */
export function computeRedTeamExitCode(summary: RedTeamSummary): 0 | 2 {
  return summary.escaped > 0 || summary.errors > 0 ? 2 : 0;
}

/** The basis code the kernel's taint gate emits when it refuses a sub-minimum intent. */
export const TAINT_GATE_BASIS = "taint:level_insufficient";

export interface TaintEscalationCausality {
  /** All taint_escalation scenarios. */
  readonly total: number;
  /** Defended specifically BY THE TAINT GATE (basis `taint:level_insufficient`). */
  readonly byTaintGate: number;
  /**
   * Defended by SOME OTHER guard that fired first (e.g. a state precondition).
   * Still not an escape — but the taint gate was never exercised for these, so a
   * green `escaped===0` does NOT prove the taint gate works for them.
   */
  readonly byOtherGuard: number;
  /** Taint scenarios that escaped (should be 0). */
  readonly escaped: number;
}

/**
 * Causality analysis for the taint-escalation vector. `escaped===0` alone is a
 * VACUOUS guarantee — a pack can pass while a state precondition refuses the
 * sub-minimum intent before the taint gate ever runs (kernel order: state →
 * taint). This breaks the "defended" count down so a reviewer can see how many
 * scenarios the taint gate itself actually caught vs. were caught upstream.
 */
export function taintEscalationCausality(report: RedTeamReport): TaintEscalationCausality {
  // H14: the ownership/IDOR scenarios carry vector:"taint_escalation" (they share
  // the generator) but are NOT taint-gate probes — counting them here pollutes the
  // operator causality counters (a REFUSE at the AUTH phase would be miscredited).
  // Exclude them by their stable `ownership_violation.` name prefix; their posture
  // is already gated by the dedicated ownership/non-vacuity axes.
  const taint = report.results.filter(
    (r) => r.vector === "taint_escalation" && !r.name.startsWith("ownership_violation."),
  );
  const defended = taint.filter((r) => r.status === "defended");
  const byTaintGate = defended.filter((r) => r.basisCodes?.includes(TAINT_GATE_BASIS)).length;
  return {
    total: taint.length,
    byTaintGate,
    byOtherGuard: defended.length - byTaintGate,
    escaped: taint.filter((r) => r.status === "escaped").length,
  };
}

// ─── 081: cap-edit config-integrity regression ──────────────────────────────

/**
 * Verdict for the 081 cap-edit escape (Critique #27).
 *
 * The classic escape: editing a `createRewriteGuard` closure-captured cap
 * (e.g. `AUTO_REMEDIATION_BLAST_CAP` 5 → 5000) changes guard BEHAVIOR but, pre-
 * 081, left a byte-identical sealable surface — the ConfigSeal saw guard
 * METADATA only, never the closure cap, so a tampered pack verified clean.
 *
 * This regression closes that as a red-team axis. It compares the structural
 * digest the ConfigSeal binds — `sha256Canonical(describePolicyBundle(bundle))`,
 * which now includes the per-guard CODE-artifact digests (081) — between the
 * sealed baseline and a tampered bundle whose only change is the cap.
 *
 *   `detected: true`  → the digests differ → the seal WOULD catch it → DEFENDED.
 *   `detected: false` → byte-identical surface → cap edit ESCAPED → REGRESSION.
 *
 * Pure: `describePolicyBundle` + `sha256Canonical` (browser-safe `@noble/hashes`),
 * no clock / RNG / IO — same posture as the kernel runner above.
 */
export interface CapEditRegressionResult {
  readonly name: string;
  readonly vector: "config_integrity";
  /** True when the cap edit changed the sealed surface digest (seal catches it). */
  readonly detected: boolean;
  readonly status: RedTeamStatus;
  readonly baselineDigest: string;
  readonly tamperedDigest: string;
}

/** Structural digest of the surface the ConfigSeal binds (081 — includes guard code). */
function policyStructureDigest(bundle: PolicyBundle<string, unknown, unknown>): string {
  return sha256Canonical(describePolicyBundle(bundle));
}

/**
 * Run the 081 cap-edit regression: assert that swapping a guard's
 * closure-captured cap is DETECTED by the ConfigSeal's code-artifact coverage.
 *
 * `baseline` is the sealed-as-trusted policy; `tampered` is the same policy
 * with a behavior-changing cap edit (and otherwise identical guard metadata).
 * A `detected: false` result is an ESCAPE — the seal is once again blind to the
 * cap (a regression of 081). `defended` means the surface digest moved, so a
 * `verifyConfigSeal` over the tampered pack would report a mismatch.
 */
export function runConfigSealCapEditRegression(args: {
  readonly name?: string;
  readonly baseline: PolicyBundle<string, unknown, unknown>;
  readonly tampered: PolicyBundle<string, unknown, unknown>;
}): CapEditRegressionResult {
  const baselineDigest = policyStructureDigest(args.baseline);
  const tamperedDigest = policyStructureDigest(args.tampered);
  const detected = baselineDigest !== tamperedDigest;
  return {
    name: args.name ?? "cap-edit (createRewriteGuard closure cap)",
    vector: "config_integrity",
    detected,
    status: detected ? "defended" : "escaped",
    baselineDigest,
    tamperedDigest,
  };
}

// ─── 084: frozen adversarial-canary gate (shadow → canary → auto-rollback) ───
//
// A deterministic publish/rollout gate that re-runs the FULL adversarial suite
// over a FROZEN scenario set as a precondition to promotion. It lives entirely
// in the red-team SHELL — it runs `runRedTeam` / `computeRedTeamExitCode`
// *around* a pack, never inside `adjudicate()` (§D kernel purity preserved).
//
// Two correctness properties beyond a bare `runRedTeam`:
//
//   1. OWNERSHIP/IDOR COVERAGE. The frozen set is `generateAllVectors` PLUS the
//      035/T10 ownership/IDOR vector (`generateOwnershipViolationEnvelopes`),
//      which `generateAllVectors` does NOT carry. Without it the canary would
//      pass a pack with an open IDOR hole on the §D #8 ownership/authority
//      surface — the exact gap §2 flags. The gate therefore protects ownership
//      as a first-class axis, not just the 3 legacy vectors + provenance.
//
//   2. NON-VACUITY (the primary correctness risk, §7). `escaped === 0` alone is
//      a HOLLOW guarantee for the taint-escalation vector: a state precondition
//      may refuse the sub-minimum intent before the taint gate ever runs (kernel
//      order: state → taint), so a green run can mean "the taint gate was never
//      exercised", not "the taint gate works". The gate promotes
//      `taintEscalationCausality`'s warning into a HARD FAIL: when there ARE
//      taint-escalation scenarios but NONE were caught by the taint gate itself
//      (`byTaintGate === 0` while `total > 0`), the gate fails (exit 2) rather
//      than passing a vacuous green. A partially-vacuous run (some by the taint
//      gate, some upstream) is reported but not failed — at least one scenario
//      genuinely exercised the gate.
//
// Pure: no clock / RNG / IO (the generators take an explicit seed; the kernel is
// pure). Deterministic over `(pack, opts)` — same seed → byte-identical verdict.

/** The terminal verdict of a single canary stage: promote (0) or roll back (2). */
export type CanaryExitCode = 0 | 2;

/** A canary stage label, for the shadow → canary progression. */
export type CanaryStage = "shadow" | "canary";

/**
 * Canary failure policy — what counts as a ROLLBACK.
 *
 *  - `"strict"` (default): the FULL gate. ANY non-acceptable decision (incl. a
 *    DEFER where REFUSE was expected) or error is a rollback, AND a VACUOUS
 *    taint-escalation pass (defended only upstream of the taint gate) is a HARD
 *    FAIL. Use when canarying a single candidate the operator expects to FULLY
 *    defend (REFUSE) every adversarial intent and to genuinely exercise the
 *    taint gate. This is the property the §6 unit tests certify.
 *
 *  - `"execute-escape"`: the §D-1 PRIVILEGE-ESCALATION gate. A rollback fires
 *    ONLY when an adversarial intent reached a clean `EXECUTE` (the executor)
 *    or errored. A non-EXECUTE friction outcome (DEFER/REQUEST_CONFIRMATION/
 *    ESCALATE/REWRITE) where REFUSE was expected, and a vacuous taint pass, are
 *    REPORTED but do NOT roll back. Use over a HETEROGENEOUS catalog of shipped
 *    packs whose adversarial scenarios are legitimately defended upstream of the
 *    taint gate (schema/state preconditions) and which carry documented,
 *    pre-existing non-REFUSE friction (035-F1) — there the strict gate would
 *    over-block on properties that are not privilege escalations.
 *
 * Both policies are FAIL-CLOSED on the real escape (a reached EXECUTE) and on
 * errors; `"execute-escape"` is strictly WEAKER on the advisory axes only.
 */
export type CanaryPolicy = "strict" | "execute-escape";

export interface CanaryGateResult {
  /** Which stage produced this verdict. */
  readonly stage: CanaryStage;
  /** The failure policy this verdict was computed under. */
  readonly policy: CanaryPolicy;
  /** The underlying adversarial report (full per-scenario detail). */
  readonly report: RedTeamReport;
  /** Causality breakdown for the taint-escalation vector. */
  readonly causality: TaintEscalationCausality;
  /**
   * True when the taint-escalation vector PASSED only because every defense fired
   * upstream of the taint gate (`total > 0 && byTaintGate === 0`). Under
   * `"strict"` this is a HARD FAIL; under `"execute-escape"` it is advisory.
   */
  readonly taintVacuous: boolean;
  /**
   * Count of scenarios that reached a clean `EXECUTE` — a genuine privilege
   * escalation to the executor (the §D-1 failure mode). Always a rollback.
   */
  readonly executeEscapes: number;
  /**
   * The ownership/IDOR coverage the frozen set added (035/T10). `present` is true
   * when the pack had an eligible UNTRUSTED-min mutating kind so the vector
   * actually fired; `escaped` counts any non-acceptable IDOR outcome; `toExecute`
   * counts the subset that reached a clean EXECUTE (the real IDOR-to-executor).
   */
  readonly ownership: {
    readonly present: boolean;
    readonly escaped: number;
    readonly toExecute: number;
  };
  /**
   * 202 — the ownership-canary NON-VACUITY verdict (the anti-false-confidence
   * mechanism, §3.3). Mirrors `no-payload-self-confirmation.ts`'s `reachedBusiness`
   * gate: a fixture-backed ownership probe MUST reach the auth phase (the owner
   * predicate ran) for its REFUSE to count as a genuine owner-predicate exercise.
   *
   *   - `fixtureBacked` — count of ownership scenarios emitted from an
   *     `OwnershipFixture` (carrying injected authority + a state-valid payload).
   *   - `reachedAuth` — the subset of those that actually reached the auth phase.
   *   - `notExercised` — names of fixture-backed probes that did NOT reach auth (a
   *     state/taint guard refused upstream → the fixture is broken/vacuous). NON-EMPTY
   *     is a HARD FAIL (NOT-EXERCISED), NOT a silent pass — under BOTH policies (a
   *     vacuous security gate manufactures false confidence; §7 risk 1: do NOT make
   *     this a warning).
   *   - `exercised` — true when ≥1 fixture-backed probe reached auth AND none failed
   *     to (the canary genuinely exercised an owner predicate).
   */
  readonly ownershipNonVacuity: {
    readonly fixtureBacked: number;
    readonly reachedAuth: number;
    readonly notExercised: ReadonlyArray<string>;
    readonly exercised: boolean;
  };
  /**
   * The promote/rollback verdict. 0 = PROMOTE, 2 = ROLLBACK. Fail-closed (§D #6):
   * a reached EXECUTE or an error always rolls back; under `"strict"` a vacuous
   * taint pass / any non-acceptable decision also rolls back. 202 — a fixture-backed
   * ownership probe that does NOT reach auth (`ownershipNonVacuity.notExercised`
   * non-empty) is a HARD FAIL under BOTH policies (anti-gaming).
   */
  readonly exitCode: CanaryExitCode;
}

/**
 * The FROZEN canary scenario set: the full vector suite PLUS the 035/T10
 * ownership/IDOR vector. Deterministic over `(pack, opts)`. Exported so the CLI
 * and tests run EXACTLY the same frozen set the gate certifies.
 */
export function frozenCanaryScenarios(
  pack: RedTeamPack,
  opts: GenerateOptions = {},
): RedTeamScenario[] {
  return [
    ...generateAllVectors(pack, opts),
    // 035/T10 — the ownership/IDOR vector `generateAllVectors` omits. Closes the
    // ownership-axis canary gap (§2/§3): the canary now protects §D #8.
    ...generateOwnershipViolationEnvelopes(pack, opts),
  ];
}

/**
 * Run the frozen adversarial canary gate for one stage against one pack.
 *
 * Promotes the `taintEscalationCausality` non-vacuity warning to a hard fail
 * (under `"strict"`) and folds the ownership/IDOR vector into the frozen set.
 * Reuses `runRedTeam` + `computeRedTeamExitCode` (0 = promote / 2 = rollback) and
 * ONLY ever RAISES friction over the base mapper — a vacuous taint pass that
 * `computeRedTeamExitCode` would call 0 is forced to 2 under `"strict"`
 * (§C monotonicity: the gate may only add friction, never remove it).
 *
 * See `CanaryPolicy` for the strict vs execute-escape failure semantics. Both
 * policies are fail-closed on a reached `EXECUTE` (the §D-1 privilege escalation)
 * and on errors; `"execute-escape"` only relaxes the advisory axes (it never
 * lets a real escape through).
 */
export function runCanaryGate(
  pack: RedTeamPack,
  opts: { readonly stage?: CanaryStage; readonly policy?: CanaryPolicy } & GenerateOptions = {},
): CanaryGateResult {
  const stage: CanaryStage = opts.stage ?? "canary";
  const policy: CanaryPolicy = opts.policy ?? "strict";
  const genOpts: GenerateOptions = {
    ...(opts.seed !== undefined ? { seed: opts.seed } : {}),
    ...(opts.perIntent !== undefined ? { perIntent: opts.perIntent } : {}),
  };
  const scenarios = frozenCanaryScenarios(pack, genOpts);
  const report = runRedTeam(pack, scenarios);
  const causality = taintEscalationCausality(report);

  // Non-vacuity: a taint-escalation vector that "passed" without the taint gate
  // ever firing is a HOLLOW guarantee — under "strict" we refuse to certify it.
  const taintVacuous = causality.total > 0 && causality.byTaintGate === 0;

  // The REAL escape (§D-1): an adversarial intent that reached a clean EXECUTE.
  const executeEscapes = report.results.filter(
    (r) => r.status === "escaped" && r.decision === "EXECUTE",
  ).length;

  // Ownership/IDOR coverage: surface the open §D #8 hole distinctly for the
  // operator's rollback trace — both any non-acceptable outcome (`escaped`) and
  // the subset that actually reached EXECUTE (`toExecute`, the real IDOR hole).
  const ownershipResults = report.results.filter((r) =>
    r.name.startsWith("ownership_violation."),
  );
  const ownership = {
    present: ownershipResults.length > 0,
    escaped: ownershipResults.filter((r) => r.status === "escaped").length,
    toExecute: ownershipResults.filter(
      (r) => r.status === "escaped" && r.decision === "EXECUTE",
    ).length,
  };

  // 202 — ownership NON-VACUITY. A fixture-backed ownership probe carries injected
  // authority + a state-valid payload and is EXPECTED to reach the auth phase (the
  // owner predicate). One that does NOT reach auth (a state/taint guard refused
  // upstream — a broken/vacuous fixture) is reported NOT-EXERCISED, NOT silently
  // passed (mirrors no-payload-self-confirmation.ts:111-118). This is the
  // load-bearing anti-false-confidence mechanism (§3.3 / §7 risk 1).
  const fixtureBackedResults = report.results.filter((r) => r.fixtureBacked === true);
  const notExercised = fixtureBackedResults
    .filter((r) => r.reachedAuth !== true)
    .map((r) => r.name)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const reachedAuthCount = fixtureBackedResults.filter((r) => r.reachedAuth === true).length;
  const ownershipNonVacuity = {
    fixtureBacked: fixtureBackedResults.length,
    reachedAuth: reachedAuthCount,
    notExercised,
    exercised: reachedAuthCount > 0 && notExercised.length === 0,
  };

  // Verdict. ALWAYS fail-closed on a reached EXECUTE or any error (both
  // policies). Under "strict" ALSO fail on any non-acceptable decision (the base
  // mapper) or a vacuous taint pass. 202 — a fixture-backed ownership probe that
  // did NOT reach auth is a HARD FAIL under BOTH policies (a vacuous owner-canary
  // manufactures false confidence; §7 risk 1 — NOT a warning). Friction-only: a 2
  // is never lowered to a 0.
  const base = computeRedTeamExitCode(report.summary); // 2 on ANY escape/error
  const ownershipVacuous = notExercised.length > 0;
  const hardEscape = executeEscapes > 0 || report.summary.errors > 0 || ownershipVacuous;
  const exitCode: CanaryExitCode =
    policy === "strict"
      ? base === 2 || taintVacuous || ownershipVacuous
        ? 2
        : 0
      : hardEscape
        ? 2
        : 0;

  return {
    stage,
    policy,
    report,
    causality,
    taintVacuous,
    executeEscapes,
    ownership,
    ownershipNonVacuity,
    exitCode,
  };
}

// ─── 084: baseline-anchored STRICT canary gate (the CI / publish gate) ───────
//
// `runCanaryGate(policy:"strict")` is the FULL gate — it rolls back on ANY
// non-acceptable decision, a vacuous taint pass, or any IDOR escape. That is the
// right semantics for a candidate the operator expects to FULLY defend, but the
// CURRENTLY-SHIPPED catalog carries DOCUMENTED, pre-existing 035-F1 #8 gaps
// (kyc forged-owner cases resolve to DEFER not REFUSE; cli/pix/deploy defend the
// taint vector UPSTREAM of the taint gate → vacuous). Running bare strict as a
// blocking gate would PERMANENTLY redden CI on those known holes.
//
// The earlier wiring "solved" that by globally substituting the WEAKER
// `execute-escape` policy at the gate. That was the reviewer-rejected hole: it
// blinds the gate to (a) every NON-EXECUTE IDOR escape (kyc's 12 forged-owner
// DEFERs promote) and (b) every §C friction REGRESSION that does not reach
// EXECUTE (a money-mover's IDOR defense silently weakening REFUSE→DEFER still
// promotes). `execute-escape` only catches a reached EXECUTE.
//
// `runBaselinedCanaryGate` is the correct gate: it runs the FULL STRICT gate and
// then compares the strict verdict to a COMMITTED BASELINE that records the known
// pre-existing posture. It PROMOTES iff the candidate is NO WORSE than the
// baseline on every axis; it ROLLS BACK on ANY of:
//
//   • a NEW escape / error / IDOR-escape / vacuity beyond the baseline counts;
//   • a §C FRICTION REGRESSION on ANY scenario — a recorded decision moving to a
//     STRICTLY LESS restrictive kind (e.g. a money-mover's IDOR REFUSE → DEFER),
//     even when both kinds are "acceptable" to that vector. This is the §C / §D-6
//     property `execute-escape` could not deliver: a guard-config change that
//     lowers friction on the ownership/authority surface aborts promotion.
//
// A baseline is itself produced by `deriveCanaryBaseline` from a STRICT run, so
// CI documents exactly which holes are tolerated and freezes them: the gate goes
// red the instant any NEW hole opens or any recorded defense weakens. Pure +
// deterministic over `(pack, baseline, opts)`.

/** A per-scenario decision the baseline freezes, keyed by scenario `name`. */
export interface CanaryBaselineScenario {
  readonly name: string;
  readonly status: RedTeamStatus;
  /** The decision kind the baseline recorded (absent on an `error` scenario). */
  readonly decision?: DecisionKind;
}

/**
 * A COMMITTED, version-controlled snapshot of a pack's known strict-canary
 * posture. The gate promotes iff a fresh strict run is NO WORSE than this. It
 * documents (rather than hides) the pre-existing 035-F1 gaps so CI reddens on any
 * NEW regression while staying green on a frozen, reviewed set of known holes.
 */
export interface CanaryBaseline {
  readonly packId: string;
  /** Frozen aggregate posture (the ceilings a fresh run may not exceed). */
  readonly escaped: number;
  readonly errors: number;
  readonly ownershipEscaped: number;
  readonly taintVacuous: boolean;
  /**
   * 202 — frozen NON-VACUITY posture: true when the strict run that produced this
   * baseline had ≥1 fixture-backed ownership probe REACH the auth phase AND none
   * fail to (the canary genuinely exercised an owner predicate). The baselined gate
   * ROLLS BACK if a baseline recorded `true` but a fresh run no longer exercises the
   * predicate (the fixture/wiring silently regressed to vacuous) — the same
   * anti-false-confidence freeze the per-scenario posture gives the other axes.
   * Optional for backward-compat: a pre-202 baseline (field absent) is treated as
   * `false` (not-yet-asserted) so it never falsely reddens.
   */
  readonly ownershipExercised?: boolean;
  /** Per-scenario decisions, so a friction-LOWERING on any scenario is caught. */
  readonly scenarios: ReadonlyArray<CanaryBaselineScenario>;
}

/** Derive a committable baseline from a STRICT canary run. Pure. */
export function deriveCanaryBaseline(result: CanaryGateResult): CanaryBaseline {
  return {
    packId: result.report.pack.id,
    escaped: result.report.summary.escaped,
    // Hard escapes can NEVER be baselined away (cf. runBaselinedCanaryGate :668).
    // A harness error is a hard escape, so a baseline can never MINT an errors:N
    // ceiling: force 0 here so deriveCanaryBaseline cannot manufacture a baseline
    // that allowlists errors. The gate then checks `errors > 0` unconditionally.
    errors: 0,
    ownershipEscaped: result.ownership.escaped,
    taintVacuous: result.taintVacuous,
    // 202 — freeze whether the canary genuinely exercised an owner predicate.
    ownershipExercised: result.ownershipNonVacuity.exercised,
    scenarios: result.report.results
      .map((r) => ({
        name: r.name,
        status: r.status,
        ...(r.decision !== undefined ? { decision: r.decision } : {}),
      }))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
  };
}

export interface BaselinedCanaryGateResult {
  /** The underlying STRICT canary verdict (full per-scenario detail). */
  readonly strict: CanaryGateResult;
  /** The committed baseline this run was measured against. */
  readonly baseline: CanaryBaseline;
  /** True when the fresh run is WORSE than the baseline on any axis. */
  readonly regressed: boolean;
  /** Human-readable reasons the gate rolled back (empty ⇒ promote). */
  readonly reasons: ReadonlyArray<string>;
  /**
   * The gate verdict. 0 = PROMOTE, 2 = ROLLBACK. Fail-closed (§D-6): a reached
   * EXECUTE / error / NEW escape / NEW vacuity / §C friction-lowering rolls back.
   * §C monotonicity: never lowers friction below the strict run for the baseline.
   */
  readonly exitCode: CanaryExitCode;
}

/**
 * Run the STRICT canary and gate the verdict against a COMMITTED baseline.
 *
 * Rolls back (exit 2) on ANY of:
 *   • a hard escape the strict gate flags unconditionally — a reached EXECUTE or
 *     an error (these always roll back, baseline notwithstanding: a baseline
 *     cannot "allowlist" a privilege escalation or a harness error);
 *   • an aggregate posture WORSE than the baseline (more escapes / errors / IDOR
 *     escapes, or newly vacuous);
 *   • a §C FRICTION REGRESSION on any baselined scenario — its decision moved to
 *     a strictly LESS restrictive kind than the baseline recorded.
 *
 * Promotes (exit 0) only when the run is no-worse-than-baseline on every axis.
 */
export function runBaselinedCanaryGate(
  pack: RedTeamPack,
  baseline: CanaryBaseline,
  opts: { readonly stage?: CanaryStage } & GenerateOptions = {},
): BaselinedCanaryGateResult {
  const genOpts: GenerateOptions = {
    ...(opts.seed !== undefined ? { seed: opts.seed } : {}),
    ...(opts.perIntent !== undefined ? { perIntent: opts.perIntent } : {}),
  };
  const strict = runCanaryGate(pack, {
    ...(opts.stage !== undefined ? { stage: opts.stage } : {}),
    policy: "strict",
    ...genOpts,
  });

  const reasons: string[] = [];

  // Hard escapes can NEVER be baselined away: a reached EXECUTE (§D-1 privilege
  // escalation) or a harness error always rolls back regardless of the baseline.
  if (strict.executeEscapes > 0) {
    reasons.push(`${strict.executeEscapes} adversarial intent(s) reached a clean EXECUTE`);
  }
  // A harness error is a hard escape (a vacuous/broken canary manufactures false
  // confidence): it always rolls back UNCONDITIONALLY, exactly like a reached
  // EXECUTE — it can NEVER be baselined away. (deriveCanaryBaseline forces
  // errors:0 so a stale/malicious baseline cannot mint an errors:N ceiling.)
  if (strict.report.summary.errors > 0) {
    reasons.push(`${strict.report.summary.errors} harness error(s) (errors can never be baselined away)`);
  }

  // Aggregate posture may not exceed the frozen baseline ceilings.
  if (strict.report.summary.escaped > baseline.escaped) {
    reasons.push(`escapes regressed ${baseline.escaped} → ${strict.report.summary.escaped}`);
  }
  if (strict.ownership.escaped > baseline.ownershipEscaped) {
    reasons.push(
      `ownership/IDOR escapes regressed ${baseline.ownershipEscaped} → ${strict.ownership.escaped}`,
    );
  }
  if (strict.taintVacuous && !baseline.taintVacuous) {
    reasons.push("taint-escalation coverage became vacuous (taint gate no longer exercised)");
  }

  // 202 — ownership NON-VACUITY. A fixture-backed ownership probe that did NOT reach
  // auth is an UNCONDITIONAL hard fail (a broken/vacuous fixture manufactures false
  // confidence — it can never be baselined away, exactly like a reached EXECUTE).
  if (strict.ownershipNonVacuity.notExercised.length > 0) {
    reasons.push(
      `ownership canary became VACUOUS — fixture-backed probe(s) did not reach the auth phase ` +
        `(NOT-EXERCISED): ${strict.ownershipNonVacuity.notExercised.join(", ")}`,
    );
  }
  // And a baseline that recorded a genuinely-exercised owner predicate must not
  // silently regress to a run that no longer exercises one (the wiring/fixture went
  // inert). `ownershipExercised` absent on a pre-202 baseline ⇒ not-yet-asserted ⇒
  // no false redden.
  if (baseline.ownershipExercised === true && !strict.ownershipNonVacuity.exercised) {
    reasons.push(
      "ownership canary non-vacuity regressed: the owner predicate is no longer exercised " +
        "(baseline recorded an exercised owner predicate)",
    );
  }

  // §C MONOTONICITY: per-scenario friction-lowering. A baselined scenario whose
  // decision moved to a STRICTLY less restrictive kind is a regression even if
  // both kinds are "acceptable" to that vector — this is the REFUSE→DEFER money-
  // mover weakening `execute-escape` could not catch.
  const baselineByName = new Map(baseline.scenarios.map((s) => [s.name, s]));
  for (const r of strict.report.results) {
    const b = baselineByName.get(r.name);
    if (b === undefined) continue; // a NEW scenario is covered by the count checks.
    if (b.decision === undefined || r.decision === undefined) continue;
    if (restrictivenessRank(r.decision) < restrictivenessRank(b.decision)) {
      reasons.push(
        `§C friction regression on "${r.name}": ${b.decision} → ${r.decision} (less restrictive)`,
      );
    }
  }

  const regressed = reasons.length > 0;
  return {
    strict,
    baseline,
    regressed,
    reasons,
    exitCode: regressed ? 2 : 0,
  };
}
