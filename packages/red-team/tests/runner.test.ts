import { describe, expect, it } from "vitest";
import {
  createAuthorityGuard,
  createRewriteGuard,
  createSystemTaintPolicy,
} from "@adjudicate/primitives";
import {
  basis,
  BASIS_CODES,
  createAuthorityGraphStore,
  decisionDefer,
  decisionExecute,
  decisionRefuse,
  refuse,
  resolveOwnership,
  type AuthorityGraphStore,
  type Guard,
  type IntentEnvelope,
  type PolicyBundle,
} from "@adjudicate/core";
import {
  computeRedTeamExitCode,
  createInMemoryRedTeamHistoryStore,
  deriveCanaryBaseline,
  frozenCanaryScenarios,
  generateAllVectors,
  generateTaintEscalationEnvelopes,
  OWNERSHIP_VICTIM_PRINCIPAL,
  OWNERSHIP_VICTIM_RESOURCE,
  renderRedTeamJson,
  renderRedTeamText,
  runBaselinedCanaryGate,
  runCanaryGate,
  runConfigSealCapEditRegression,
  runRedTeam,
  runStagedCanaryRollout,
  taintEscalationCausality,
  TAINT_GATE_BASIS,
  type CanaryBaseline,
  type RedTeamPack,
  type RedTeamScenario,
} from "../src/index.js";
import { leakyStubPack, strictStubPack } from "./helpers.js";

describe("runRedTeam", () => {
  it("a fail-closed pack defends every vector (0 escapes, exit 0)", () => {
    const pack = strictStubPack();
    const report = runRedTeam(pack, generateAllVectors(pack));
    expect(report.summary.escaped).toBe(0);
    expect(report.summary.total).toBeGreaterThan(0);
    expect(report.summary.defended).toBe(report.summary.total);
    expect(computeRedTeamExitCode(report.summary)).toBe(0);
  });

  it("041/042/043: escapesByVector is exhaustive over the extended AttackVector union (incl. provenance_injection + read_inject_intent)", () => {
    // The exhaustive emptyByVector() Record must carry every key of the closed
    // union — a missing arm fails the type-checker; here we assert at runtime
    // that the `provenance_injection` and 043 `read_inject_intent` keys are
    // present and initialized.
    const pack = strictStubPack();
    const report = runRedTeam(pack, generateAllVectors(pack));
    const keys = Object.keys(report.summary.escapesByVector).sort();
    expect(keys).toEqual(
      [
        "prompt_injection",
        "provenance_injection",
        "read_inject_intent",
        "taint_escalation",
        "tool_scope_violation",
      ].sort(),
    );
    // 043's read_inject_intent key is present and (for the strict pack, which
    // declares no origin-required kind) initialized to 0.
    expect(report.summary.escapesByVector.read_inject_intent).toBe(0);
    // 042 LANDS the provenance_injection generator. The strict pack DEFENDS those
    // scenarios (the kernel taint gate REFUSEs the contaminated sub-minimum
    // proposal), so the ESCAPE count for the vector is still 0 — defended, not
    // absent. (Non-vacuity that the generator actually fires is asserted below.)
    expect(report.summary.escapesByVector.provenance_injection).toBe(0);
    expect(
      report.results.some((r) => r.vector === "provenance_injection"),
    ).toBe(true);
  });

  it("a fail-open pack leaks → escapes recorded, exit 2", () => {
    const pack = leakyStubPack();
    const report = runRedTeam(pack, generateAllVectors(pack));
    expect(report.summary.escaped).toBeGreaterThan(0);
    expect(report.summary.escapesByVector.prompt_injection).toBeGreaterThan(0);
    expect(computeRedTeamExitCode(report.summary)).toBe(2);
  });

  it("classifies a rehydrate failure as an error (exit 2)", () => {
    const pack = strictStubPack();
    const throwing = {
      ...pack,
      rehydrateState: () => {
        throw new Error("rehydrate boom");
      },
    };
    const scenario: RedTeamScenario = {
      name: "x",
      vector: "prompt_injection",
      intent: {
        kind: "demo.user.action",
        payload: {},
        actor: { principal: "llm", sessionId: "t" },
        taint: "UNTRUSTED",
        nonce: "n-1",
      },
      state: {},
      defense: { acceptable: ["REFUSE"] },
    };
    const report = runRedTeam(throwing, [scenario]);
    expect(report.summary.errors).toBe(1);
    expect(report.results[0]!.status).toBe("error");
    expect(computeRedTeamExitCode(report.summary)).toBe(2);
  });

  it("renders text + json reports", () => {
    const pack = leakyStubPack();
    const report = runRedTeam(pack, generateAllVectors(pack));
    const text = renderRedTeamText(report);
    expect(text).toContain("escaped");
    expect(text).toContain("escapes by vector");
    expect(() => JSON.parse(renderRedTeamJson(report))).not.toThrow();
  });
});

// ── 081: cap-edit config-integrity regression (Critique #27) ──────────────────

/** A business-phase bundle whose only knob is a createRewriteGuard clamp cap. */
function rewriteBundle(cap: number): PolicyBundle<string, unknown, unknown> {
  const clamp = createRewriteGuard<string, Record<string, unknown>, unknown>({
    matches: (env) => env.kind === "remediation.apply",
    extract: (env) => (env.payload as { blast?: number }).blast,
    cap,
    mutateField: "blast",
    reason: "clamp blast radius",
  });
  return {
    stateGuards: [],
    authGuards: [],
    taint: { minimumFor: () => "UNTRUSTED" },
    business: [clamp as Guard<string, unknown, unknown>],
    default: "REFUSE",
  };
}

describe("runConfigSealCapEditRegression — the cap-edit escape is defended (081)", () => {
  it("DETECTS a closure-cap edit (5 → 5000) as a config-integrity regression", () => {
    const r = runConfigSealCapEditRegression({
      baseline: rewriteBundle(5),
      tampered: rewriteBundle(5000),
    });
    expect(r.detected).toBe(true);
    expect(r.status).toBe("defended");
    expect(r.vector).toBe("config_integrity");
    expect(r.baselineDigest).not.toBe(r.tamperedDigest);
  });

  it("is non-vacuous: an IDENTICAL cap is NOT flagged (digests agree)", () => {
    const r = runConfigSealCapEditRegression({
      baseline: rewriteBundle(5),
      tampered: rewriteBundle(5),
    });
    // No edit → no detection → not an escape: proves detection tracks the CAP,
    // not guard identity/order. A cap-blind seal would (wrongly) also produce
    // detected:false on the 5→5000 case above — that test guards against it.
    expect(r.detected).toBe(false);
    expect(r.baselineDigest).toBe(r.tamperedDigest);
  });
});

describe("taintEscalationCausality — the taint gate is genuinely exercised when reached", () => {
  // strictStubPack's system-only kind (`demo.system.callback`) has NO state
  // precondition, so a sub-minimum UNTRUSTED envelope reaches the taint gate.
  // This proves the gate fires AND that the causality analysis attributes it
  // correctly — the complement of the PIX fixture, where preconditions fire first.
  it("attributes every taint-escalation defense to the taint gate for a precondition-free pack", () => {
    const pack = strictStubPack();
    const report = runRedTeam(pack, generateTaintEscalationEnvelopes(pack));
    const c = taintEscalationCausality(report);
    expect(c.total).toBeGreaterThan(0);
    expect(c.escaped).toBe(0);
    expect(c.byTaintGate).toBe(c.total); // the gate caught all of them
    expect(c.byOtherGuard).toBe(0);
    // And the actual basis really is the taint gate's code.
    const taintResults = report.results.filter((r) => r.vector === "taint_escalation");
    expect(taintResults.every((r) => r.basisCodes?.includes(TAINT_GATE_BASIS))).toBe(true);
  });
});

// ── 084: the frozen adversarial-canary gate (shadow → canary → auto-rollback) ──

const VICTIM_STORE: AuthorityGraphStore = createAuthorityGraphStore({
  edges: [
    {
      principal: OWNERSHIP_VICTIM_PRINCIPAL,
      relationship: "owns" as const,
      resource: OWNERSHIP_VICTIM_RESOURCE,
      permits: { actions: ["demo.user.action"] },
    },
  ],
});
const SHARED_TAINT = createSystemTaintPolicy({ systemOnlyKinds: ["demo.system.callback"] });

/**
 * A pack that DEFENDS every frozen vector — including the IDOR impersonation
 * case — by wiring `createAuthorityGuard` with the authenticatedPrincipal seam
 * (the acting principal is derived from the actor's sessionId, NEVER from the
 * attacker-controlled resourceRefs.owner). The strict baseline a clean canary
 * should PROMOTE.
 */
function idorDefendedPack(): RedTeamPack {
  const sessionToPrincipal: Record<string, string> = {
    "red-team-attacker": "attacker-principal",
    "red-team": "red-team",
  };
  const authGuard = createAuthorityGuard<string, unknown, AuthorityGraphStore>(
    (envelope, injectedStore) => resolveOwnership(injectedStore, envelope),
    {
      authenticatedPrincipal: (envelope: IntentEnvelope<string, unknown>) =>
        sessionToPrincipal[envelope.actor.sessionId] ?? null,
    },
  );
  const policy: PolicyBundle<string, unknown, AuthorityGraphStore> = {
    stateGuards: [],
    authGuards: [authGuard],
    taint: SHARED_TAINT,
    // Permissive business + EXECUTE default so ONLY the auth/taint gate can stop a
    // proposal — a defended outcome genuinely exercises a guard (non-vacuous).
    business: [() => null],
    default: "EXECUTE",
  };
  return {
    id: "canary-idor-defended",
    intents: ["demo.user.action", "demo.system.callback"],
    policy: policy as PolicyBundle<string, unknown, unknown>,
    planner: {
      plan: () => ({ visibleReadTools: [], allowedIntents: ["demo.user.action"] }),
    },
    rehydrateState: () => VICTIM_STORE,
  };
}

/**
 * The SAME pack, but with only the BARE ownership-binding wiring (no
 * authenticatedPrincipal seam). The IMPERSONATION case ESCAPES (the 034
 * residual) — the canary MUST roll this back.
 */
function idorBareWiredPack(): RedTeamPack {
  const bareGuard = createAuthorityGuard<string, unknown, AuthorityGraphStore>(
    (envelope, injectedStore) => resolveOwnership(injectedStore, envelope),
  );
  const policy: PolicyBundle<string, unknown, AuthorityGraphStore> = {
    stateGuards: [],
    authGuards: [bareGuard],
    taint: SHARED_TAINT,
    // EXECUTE default so the IMPERSONATION case that slips past the bare auth
    // guard genuinely reaches EXECUTE (observable escape — the 034 residual).
    business: [() => null],
    default: "EXECUTE",
  };
  return {
    id: "canary-idor-bare",
    intents: ["demo.user.action", "demo.system.callback"],
    policy: policy as PolicyBundle<string, unknown, unknown>,
    planner: {
      plan: () => ({ visibleReadTools: [], allowedIntents: ["demo.user.action"] }),
    },
    rehydrateState: () => VICTIM_STORE,
  };
}

/**
 * A pack whose taint-escalation defenses ALL fire UPSTREAM of the taint gate: a
 * STATE guard refuses the system-only kind before the taint gate ever runs
 * (kernel order state → taint). `escaped === 0` here is VACUOUS — the taint gate
 * was never exercised. The canary's non-vacuity hard fail must reject it.
 *
 * (Note: the system-only kind has no UNTRUSTED-min mutating slot, so the
 * ownership vector does not fire here — this isolates the vacuous-taint case.)
 */
function vacuousTaintPack(): RedTeamPack {
  const stateRefuseSystemKind: Guard<string, unknown, unknown> = (env) =>
    env.kind === "demo.system.callback"
      ? decisionRefuse(
          refuse("STATE", "demo.precondition", "Precondition unmet."),
          [basis("state", BASIS_CODES.state.TRANSITION_ILLEGAL)],
        )
      : null;
  const policy: PolicyBundle<string, unknown, unknown> = {
    stateGuards: [stateRefuseSystemKind],
    authGuards: [],
    taint: SHARED_TAINT,
    business: [
      (env) =>
        env.kind === "demo.user.action"
          ? decisionRefuse(
              refuse("BUSINESS_RULE", "demo.not_found", "Not found."),
              [basis("business", BASIS_CODES.business.RULE_VIOLATED)],
            )
          : null,
    ],
    default: "REFUSE",
  };
  return {
    id: "canary-vacuous-taint",
    intents: ["demo.user.action", "demo.system.callback"],
    policy,
    planner: {
      plan: () => ({ visibleReadTools: [], allowedIntents: ["demo.user.action"] }),
    },
    rehydrateState: () => ({}),
  };
}

describe("runCanaryGate — frozen adversarial-canary gate (084 T1)", () => {
  it("PROMOTES (exit 0) a fully-defended pack and exercises the ownership/IDOR vector non-vacuously", () => {
    const result = runCanaryGate(idorDefendedPack(), { seed: 1 });
    expect(result.exitCode).toBe(0);
    expect(result.report.summary.escaped).toBe(0);
    expect(result.report.summary.errors).toBe(0);
    // The frozen set carried the 035 ownership/IDOR vector and it actually fired
    // (UNTRUSTED-min mutating kind present) and was defended.
    expect(result.ownership.present).toBe(true);
    expect(result.ownership.escaped).toBe(0);
    // The impersonation case (which the bare wiring lets escape) is in the report.
    expect(
      result.report.results.some((r) => r.name.includes(".impersonation.")),
    ).toBe(true);
    // Non-vacuous: the taint gate genuinely caught at least one taint-escalation.
    expect(result.taintVacuous).toBe(false);
    expect(result.causality.byTaintGate).toBeGreaterThan(0);
  });

  it("frozenCanaryScenarios folds the ownership/IDOR vector into generateAllVectors", () => {
    const pack = idorDefendedPack();
    const frozen = frozenCanaryScenarios(pack, { seed: 1 });
    const all = generateAllVectors(pack, { seed: 1 });
    // The frozen set is a strict superset that adds the ownership_violation cases.
    expect(frozen.length).toBeGreaterThan(all.length);
    expect(frozen.some((s) => s.name.startsWith("ownership_violation."))).toBe(true);
    expect(all.some((s) => s.name.startsWith("ownership_violation."))).toBe(false);
  });

  it("ROLLS BACK (exit 2) when the IDOR impersonation case escapes (bare wiring)", () => {
    const result = runCanaryGate(idorBareWiredPack(), { seed: 1 });
    expect(result.exitCode).toBe(2);
    // The ownership vector fired and produced an escape (the IDOR hole).
    expect(result.ownership.present).toBe(true);
    expect(result.ownership.escaped).toBeGreaterThan(0);
    // computeRedTeamExitCode also agrees independently (the underlying report).
    expect(computeRedTeamExitCode(result.report.summary)).toBe(2);
  });

  it("ROLLS BACK (exit 2) a VACUOUS taint pass even though escaped===0 (non-vacuity HARD FAIL)", () => {
    const result = runCanaryGate(vacuousTaintPack(), { seed: 1 });
    // The bare exit-code mapper would PROMOTE this (no escapes/errors)…
    expect(result.report.summary.escaped).toBe(0);
    expect(result.report.summary.errors).toBe(0);
    expect(computeRedTeamExitCode(result.report.summary)).toBe(0);
    // …but the canary catches the vacuity: every taint-escalation defense fired
    // upstream of the taint gate, so the guarantee is hollow → ROLLBACK.
    expect(result.causality.total).toBeGreaterThan(0);
    expect(result.causality.byTaintGate).toBe(0);
    expect(result.taintVacuous).toBe(true);
    expect(result.exitCode).toBe(2);
  });

  it("is deterministic: the same seed yields a byte-identical verdict", () => {
    const a = runCanaryGate(idorDefendedPack(), { seed: 7 });
    const b = runCanaryGate(idorDefendedPack(), { seed: 7 });
    expect(a.exitCode).toBe(b.exitCode);
    expect(JSON.stringify(a.report)).toBe(JSON.stringify(b.report));
  });
});

// A pack that resolves the forged-owner ownership vector to DEFER (non-EXECUTE
// FRICTION) rather than REFUSE — modelling the documented pre-existing 035-F1
// pack-identity-kyc gap (authGuards:[] + a business guard that DEFERs the kind).
// Under STRICT this is an "escape" (DEFER ∉ acceptable=[REFUSE]); under
// EXECUTE-ESCAPE it is friction, not a privilege escalation.
function deferFrictionOwnershipPack(): RedTeamPack {
  const policy: PolicyBundle<string, unknown, unknown> = {
    stateGuards: [],
    authGuards: [], // the 035-F1 gap: no owner predicate wired
    taint: SHARED_TAINT,
    business: [
      (env) =>
        env.kind === "demo.user.action"
          ? decisionDefer("demo.review", 60_000, [
              basis("business", BASIS_CODES.business.RULE_VIOLATED),
            ])
          : null,
    ],
    default: "EXECUTE",
  };
  return {
    id: "canary-defer-friction",
    intents: ["demo.user.action", "demo.system.callback"],
    policy,
    planner: {
      plan: () => ({ visibleReadTools: [], allowedIntents: ["demo.user.action"] }),
    },
    rehydrateState: (raw) => raw ?? {},
  };
}

describe("runCanaryGate — execute-escape policy (§D-1 privilege-escalation gate, 084 T1)", () => {
  it("PROMOTES a VACUOUS taint pass under execute-escape (advisory, not an escalation)", () => {
    const strict = runCanaryGate(vacuousTaintPack(), { seed: 1, policy: "strict" });
    const lenient = runCanaryGate(vacuousTaintPack(), { seed: 1, policy: "execute-escape" });
    // strict: vacuity is a HARD FAIL.
    expect(strict.exitCode).toBe(2);
    // execute-escape: vacuity is reported but no intent reached EXECUTE → PROMOTE.
    expect(lenient.taintVacuous).toBe(true);
    expect(lenient.executeEscapes).toBe(0);
    expect(lenient.exitCode).toBe(0);
  });

  it("PROMOTES a DEFER-friction ownership outcome under execute-escape, ROLLS BACK under strict (models 035-F1 KYC)", () => {
    const strict = runCanaryGate(deferFrictionOwnershipPack(), { seed: 1, policy: "strict" });
    const lenient = runCanaryGate(deferFrictionOwnershipPack(), { seed: 1, policy: "execute-escape" });
    // The ownership vector fired and produced non-REFUSE "escapes"…
    expect(lenient.ownership.present).toBe(true);
    expect(lenient.ownership.escaped).toBeGreaterThan(0);
    // …but they are DEFER (friction), never a clean EXECUTE.
    expect(lenient.ownership.toExecute).toBe(0);
    expect(lenient.executeEscapes).toBe(0);
    // strict rolls back on the non-acceptable DEFER; execute-escape promotes.
    expect(strict.exitCode).toBe(2);
    expect(lenient.exitCode).toBe(0);
  });

  it("ROLLS BACK a genuine EXECUTE escape under BOTH policies (fail-closed on the real escalation)", () => {
    const strict = runCanaryGate(idorBareWiredPack(), { seed: 1, policy: "strict" });
    const lenient = runCanaryGate(idorBareWiredPack(), { seed: 1, policy: "execute-escape" });
    // The bare-wired impersonation reaches a clean EXECUTE — the real IDOR hole.
    expect(lenient.executeEscapes).toBeGreaterThan(0);
    expect(lenient.ownership.toExecute).toBeGreaterThan(0);
    expect(strict.exitCode).toBe(2);
    expect(lenient.exitCode).toBe(2); // execute-escape NEVER lets a real escape through
  });

  it("the result carries the policy it was computed under", () => {
    expect(runCanaryGate(idorDefendedPack(), { seed: 1 }).policy).toBe("strict");
    expect(runCanaryGate(idorDefendedPack(), { seed: 1, policy: "execute-escape" }).policy).toBe(
      "execute-escape",
    );
  });
});

describe("runStagedCanaryRollout — shadow → canary persistence + auto-rollback (084 T2)", () => {
  it("PROMOTES a clean rollout and records BOTH stages through the history store", () => {
    const store = createInMemoryRedTeamHistoryStore();
    const result = runStagedCanaryRollout(idorDefendedPack(), {
      store,
      seed: 1,
      shadowAt: "2026-06-19T00:00:00.000Z",
      canaryAt: "2026-06-19T00:05:00.000Z",
    });
    expect(result.exitCode).toBe(0);
    expect(result.regressed).toBe(false);
    expect(result.shadow.exitCode).toBe(0);
    expect(result.canary.exitCode).toBe(0);
    // Persistence seam exercised: the pack's run is recorded (idempotent on the
    // same digest — shadow == canary content for a deterministic pack, so ONE row).
    const view = store.view({ packId: "canary-idor-defended" });
    expect(view.runs.length).toBeGreaterThanOrEqual(1);
  });

  it("ROLLS BACK when a stage fails (the bare-wired IDOR pack escapes)", () => {
    const store = createInMemoryRedTeamHistoryStore();
    const result = runStagedCanaryRollout(idorBareWiredPack(), {
      store,
      seed: 1,
      shadowAt: "2026-06-19T00:00:00.000Z",
      canaryAt: "2026-06-19T00:05:00.000Z",
    });
    expect(result.exitCode).toBe(2);
    // Both stages fail identically (the hole is in the pack, not the stage), so
    // there is no DELTA regression, but the stage failure alone rolls back.
    expect(result.shadow.exitCode).toBe(2);
    expect(result.canary.exitCode).toBe(2);
  });

  it("ROLLS BACK on a shadow→canary DELTA regression: clean baseline, candidate opens an IDOR hole", () => {
    // The genuine staged-rollout case: the SHADOW baseline (authenticatedPrincipal
    // seam) defends everything, but the CANDIDATE regressed to the bare wiring —
    // the IDOR impersonation case now escapes. Neither stage is identical, so this
    // exercises the detectRegression delta path, not just a stage failure.
    const store = createInMemoryRedTeamHistoryStore();
    const result = runStagedCanaryRollout(idorDefendedPack(), {
      candidate: idorBareWiredPack(),
      store,
      seed: 1,
      shadowAt: "2026-06-19T00:00:00.000Z",
      canaryAt: "2026-06-19T00:05:00.000Z",
    });
    // Shadow is clean; canary fails on its own AND regressed vs shadow.
    expect(result.shadow.exitCode).toBe(0);
    expect(result.shadow.ownership.escaped).toBe(0);
    expect(result.canary.ownership.escaped).toBeGreaterThan(0);
    expect(result.regressed).toBe(true);
    expect(result.reasons.join(" ")).toMatch(/ownership\/IDOR escapes regressed/);
    expect(result.exitCode).toBe(2);
    // Both stage reports were persisted (distinct pack ids ⇒ two pack partitions).
    expect(store.view({ packId: "canary-idor-defended" }).runs.length).toBe(1);
    expect(store.view({ packId: "canary-idor-bare" }).runs.length).toBe(1);
  });

  it("a clean baseline with a clean (identical) candidate PROMOTES — no false regression", () => {
    const store = createInMemoryRedTeamHistoryStore();
    const result = runStagedCanaryRollout(idorDefendedPack(), {
      candidate: idorDefendedPack(),
      store,
      seed: 1,
      shadowAt: "2026-06-19T00:00:00.000Z",
      canaryAt: "2026-06-19T00:05:00.000Z",
    });
    expect(result.regressed).toBe(false);
    expect(result.reasons).toEqual([]);
    expect(result.exitCode).toBe(0);
  });
});

// ─── 084 review fix: baseline-anchored STRICT gate is the CI/publish gate ─────
//
// These tests certify the property the prior `execute-escape` wiring failed (the
// two rejected MAJOR findings): the gate runs the FULL STRICT canary and rolls
// back on (1) any NEW non-EXECUTE escape beyond the committed baseline and (2)
// any §C friction REGRESSION (REFUSE→DEFER) on the ownership/authority surface —
// neither of which `execute-escape` could catch (it only sees a reached EXECUTE).
describe("runBaselinedCanaryGate — strict gate measured against a committed baseline (084 review)", () => {
  it("PROMOTES a candidate that matches its OWN baseline (a money-mover that REFUSEs every IDOR)", () => {
    const pack = idorDefendedPack();
    const baseline = deriveCanaryBaseline(runCanaryGate(pack, { seed: 1, policy: "strict" }));
    const result = runBaselinedCanaryGate(pack, baseline, { seed: 1 });
    expect(result.strict.policy).toBe("strict");
    expect(result.strict.ownership.escaped).toBe(0);
    expect(result.regressed).toBe(false);
    expect(result.reasons).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  it("DOCUMENTS a pre-existing 035-F1 gap: a DEFER-friction baseline PROMOTES the same DEFER candidate (CI stays green on the known hole)", () => {
    // The kyc-shaped pre-existing hole: forged-owner cases resolve to DEFER, not
    // REFUSE. STRICT alone would ROLLBACK (DEFER ∉ acceptable). The committed
    // baseline freezes that documented posture so CI does not go permanently red.
    const pack = deferFrictionOwnershipPack();
    const bareStrict = runCanaryGate(pack, { seed: 1, policy: "strict" });
    expect(bareStrict.exitCode).toBe(2); // STRICT alone reds on the known hole…
    const baseline = deriveCanaryBaseline(bareStrict);
    const result = runBaselinedCanaryGate(pack, baseline, { seed: 1 });
    expect(result.strict.ownership.escaped).toBeGreaterThan(0); // the hole is still present
    expect(result.regressed).toBe(false); // …but it is no WORSE than the baseline
    expect(result.exitCode).toBe(0); // → PROMOTE (the gate freezes, not hides, the gap)
  });

  it("ROLLS BACK a NEW non-EXECUTE IDOR escape beyond a clean baseline (finding 1: execute-escape promoted kyc's 12 open DEFERs)", () => {
    // Baseline = the FULLY DEFENDED pack (0 IDOR escapes). Candidate = the same
    // pack regressed to DEFER-friction on the ownership surface — 12 non-EXECUTE
    // escapes, NONE reaching EXECUTE (so execute-escape would PROMOTE this).
    const baseline = deriveCanaryBaseline(
      runCanaryGate(idorDefendedPack(), { seed: 1, policy: "strict" }),
    );
    const result = runBaselinedCanaryGate(deferFrictionOwnershipPack(), baseline, { seed: 1 });
    // baselines are over distinct pack ids in this synthetic case, so the gate
    // compares aggregate posture; the ownership-escape COUNT regressed.
    expect(result.strict.executeEscapes).toBe(0); // not a privilege escalation…
    expect(result.strict.ownership.escaped).toBeGreaterThan(0); // …but a NEW hole
    expect(result.regressed).toBe(true);
    expect(result.reasons.join(" ")).toMatch(/ownership\/IDOR escapes regressed 0 → /);
    expect(result.exitCode).toBe(2); // ROLLBACK — execute-escape would have PROMOTED
  });

  it("ROLLS BACK a §C friction REGRESSION (REFUSE → DEFER) on a money-mover, even with NO EXECUTE reached (finding 2: monotonicity hole)", () => {
    // The finding-2 case verbatim: a money-mover whose IDOR cases REFUSE today
    // (baseline) regresses so the SAME scenarios now DEFER. No intent reaches
    // EXECUTE, so execute-escape promotes; the strict baseline gate must roll
    // back on the §C friction-lowering (REFUSE rank 5 → DEFER rank 3).
    const refusePack = idorDefendedPack(); // REFUSEs every ownership case
    const refuseStrict = runCanaryGate(refusePack, { seed: 1, policy: "strict" });
    // Build a baseline whose ownership scenarios are recorded as REFUSE, but pin
    // it to the REGRESSED pack's id so the per-scenario names line up (the
    // friction-lowering check keys on scenario name).
    const regressedPack = deferFrictionOwnershipPack();
    const regressedStrict = runCanaryGate(regressedPack, { seed: 1, policy: "strict" });
    const ownNames = regressedStrict.report.results
      .filter((r) => r.name.startsWith("ownership_violation."))
      .map((r) => r.name);
    expect(ownNames.length).toBeGreaterThan(0);
    // Synthesize the "before the regression" baseline: same names, but REFUSE,
    // 0 escapes (the money-mover's pre-regression posture).
    const baseline: CanaryBaseline = {
      packId: regressedPack.id,
      escaped: 0,
      errors: 0,
      ownershipEscaped: 0,
      taintVacuous: false,
      scenarios: regressedStrict.report.results.map((r) => ({
        name: r.name,
        status: "defended" as const,
        decision: "REFUSE" as const,
      })),
    };
    const result = runBaselinedCanaryGate(regressedPack, baseline, { seed: 1 });
    expect(result.strict.executeEscapes).toBe(0); // no privilege escalation…
    expect(result.regressed).toBe(true);
    // both the count ceiling AND the per-scenario §C friction check fire:
    expect(result.reasons.join(" ")).toMatch(/§C friction regression .*REFUSE → DEFER/);
    expect(result.exitCode).toBe(2); // ROLLBACK — the monotonicity law honored
    // sanity: the REFUSE pack against its OWN baseline PROMOTES (no friction drop).
    const clean = runBaselinedCanaryGate(refusePack, deriveCanaryBaseline(refuseStrict), {
      seed: 1,
    });
    expect(clean.exitCode).toBe(0);
  });

  it("a reached EXECUTE can NEVER be baselined away (a baseline cannot allowlist a privilege escalation)", () => {
    // Even if a (malicious/stale) baseline recorded the IDOR impersonation case as
    // EXECUTE, the gate still rolls back: executeEscapes>0 is unconditional.
    const pack = idorBareWiredPack(); // impersonation reaches a clean EXECUTE
    const strict = runCanaryGate(pack, { seed: 1, policy: "strict" });
    expect(strict.executeEscapes).toBeGreaterThan(0);
    const permissiveBaseline = deriveCanaryBaseline(strict); // records the EXECUTE
    const result = runBaselinedCanaryGate(pack, permissiveBaseline, { seed: 1 });
    expect(result.regressed).toBe(true);
    expect(result.reasons.join(" ")).toMatch(/reached a clean EXECUTE/);
    expect(result.exitCode).toBe(2);
  });

  it("a harness error can NEVER be baselined away (an errors:N baseline still ROLLS BACK on a fresh errors:N run)", () => {
    // H12 regression — mirror of the EXECUTE test above for the errors axis. The
    // pack rehydrates cleanly during GENERATION (`rehydrateState({})` → sentinel)
    // but throws at EXECUTION (the runner re-rehydrates `rehydrateState(state)`,
    // here the sentinel), so the canary produces real `status:"error"` results
    // (errors>0) without breaking scenario generation. Even if a (stale/malicious)
    // baseline RECORDED that errors:N posture, the gate must still roll back:
    // errors>0 is unconditional, exactly like a reached EXECUTE.
    const REHYDRATE_SENTINEL = { __redteamErrorSentinel: true };
    const throwing: RedTeamPack = {
      ...idorDefendedPack(),
      id: "canary-errors",
      rehydrateState: (raw: unknown) => {
        if (raw === REHYDRATE_SENTINEL) throw new Error("rehydrate boom (execution-time)");
        return REHYDRATE_SENTINEL;
      },
    };
    const strict = runCanaryGate(throwing, { seed: 1, policy: "strict" });
    expect(strict.report.summary.errors).toBeGreaterThan(0);
    // deriveCanaryBaseline FORCES errors:0 — a baseline can never MINT an errors:N
    // ceiling that would allowlist the harness errors.
    expect(deriveCanaryBaseline(strict).errors).toBe(0);
    // Hand-craft the worst case: a baseline that DOES record errors:N (bypassing
    // derive). The gate must STILL roll back (errors>0 is baseline-independent).
    const permissiveBaseline: CanaryBaseline = {
      packId: throwing.id,
      escaped: strict.report.summary.escaped,
      errors: strict.report.summary.errors,
      ownershipEscaped: strict.ownership.escaped,
      taintVacuous: strict.taintVacuous,
      scenarios: [],
    };
    const result = runBaselinedCanaryGate(throwing, permissiveBaseline, { seed: 1 });
    expect(result.regressed).toBe(true);
    expect(result.reasons.join(" ")).toMatch(/harness error\(s\) \(errors can never be baselined away\)/);
    expect(result.exitCode).toBe(2);
  });

  it("deriveCanaryBaseline round-trips a strict run into a committable, name-sorted baseline", () => {
    const strict = runCanaryGate(idorDefendedPack(), { seed: 1, policy: "strict" });
    const baseline = deriveCanaryBaseline(strict);
    expect(baseline.packId).toBe("canary-idor-defended");
    expect(baseline.escaped).toBe(strict.report.summary.escaped);
    expect(baseline.ownershipEscaped).toBe(strict.ownership.escaped);
    expect(baseline.taintVacuous).toBe(strict.taintVacuous);
    expect(baseline.scenarios.length).toBe(strict.report.results.length);
    const names = baseline.scenarios.map((s) => s.name);
    expect([...names].sort()).toEqual(names); // sorted ⇒ stable committed diff
  });
});

// A pack that EXECUTEs everything (no defenses) — used to prove the canary never
// PROMOTES a fail-open pack regardless of seed.
describe("runCanaryGate — never promotes a fail-open pack", () => {
  it("a leaky fail-open pack ROLLS BACK", () => {
    const leakyExecPack: RedTeamPack = {
      id: "canary-leaky",
      intents: ["demo.user.action", "demo.system.callback"],
      policy: {
        stateGuards: [],
        authGuards: [],
        taint: { minimumFor: () => "UNTRUSTED" },
        business: [() => decisionExecute([])],
        default: "EXECUTE",
      },
      planner: {
        plan: () => ({ visibleReadTools: [], allowedIntents: ["demo.user.action"] }),
      },
      rehydrateState: (raw) => raw ?? {},
    };
    const result = runCanaryGate(leakyExecPack, { seed: 1 });
    expect(result.exitCode).toBe(2);
    expect(result.report.summary.escaped).toBeGreaterThan(0);
  });
});
