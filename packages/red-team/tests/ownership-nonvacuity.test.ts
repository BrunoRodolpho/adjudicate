import { describe, expect, it } from "vitest";
import {
  generateOwnershipViolationEnvelopes,
  OWNERSHIP_FIXTURES,
  ownershipFixtureFor,
  runCanaryGate,
  runRedTeam,
  type RedTeamPack,
} from "../src/index.js";
import {
  basis,
  BASIS_CODES,
  decisionRefuse,
  refuse,
  type PolicyBundle,
} from "@adjudicate/core";
import { createSystemTaintPolicy } from "@adjudicate/primitives";
import { cliAgentPack } from "@adjudicate/pack-cli-agent";
import { IdentityKycPack } from "@adjudicate/pack-identity-kyc";
import { incidentResponsePack } from "@adjudicate/pack-incident-response";
import { paymentsPixPack } from "@adjudicate/pack-payments-pix";

// 202 — the four shipped packs whose 201 owner predicates this canary must
// GENUINELY exercise. Each entry is the real, in-tree pack viewed as a RedTeamPack.
const PACKS: ReadonlyArray<{ readonly pack: RedTeamPack; readonly gatedKinds: ReadonlyArray<string> }> = [
  { pack: cliAgentPack as unknown as RedTeamPack, gatedKinds: ["terminal.run"] },
  {
    pack: IdentityKycPack as unknown as RedTeamPack,
    gatedKinds: ["kyc.start", "kyc.document.upload"],
  },
  {
    pack: incidentResponsePack as unknown as RedTeamPack,
    gatedKinds: ["incident.remediation.execute", "incident.escalate"],
  },
  {
    pack: paymentsPixPack as unknown as RedTeamPack,
    gatedKinds: ["pix.charge.create", "pix.charge.refund"],
  },
];

const AUTH_BASIS = `auth:${BASIS_CODES.auth.SCOPE_INSUFFICIENT}`;

describe("202 — ownership canary NON-VACUITY (the owner predicate is genuinely exercised)", () => {
  for (const { pack, gatedKinds } of PACKS) {
    describe(`${pack.id}`, () => {
      it("is fixture-covered for every authority-gated kind", () => {
        for (const kind of gatedKinds) {
          expect(ownershipFixtureFor(pack.id, kind)).toBeDefined();
        }
      });

      it("the ownership probe REACHES the auth phase for every gated kind (non-vacuity proven)", () => {
        const out = generateOwnershipViolationEnvelopes(pack, { perIntent: 3 });
        // Every emitted ownership scenario for a gated kind is fixture-backed and
        // carries a prebuilt (authority-injected) state.
        const fixtureBacked = out.filter((s) => s.fixtureBacked === true);
        expect(fixtureBacked.length).toBeGreaterThan(0);
        for (const s of fixtureBacked) {
          expect(s.prebuiltState).toBeDefined();
          expect((s.prebuiltState as { authority?: unknown }).authority).toBeDefined();
        }
        const report = runRedTeam(pack, out);
        // The load-bearing proof: every fixture-backed probe reached the auth phase
        // (the owner predicate actually ran) — NOT assumed, observed via the trace.
        const fb = report.results.filter((r) => r.fixtureBacked === true);
        expect(fb.length).toBe(fixtureBacked.length);
        for (const r of fb) {
          expect(r.reachedAuth).toBe(true);
        }
      });

      it("forged_unbound AND impersonation → REFUSE at the AUTH phase (auth:scope_insufficient)", () => {
        const out = generateOwnershipViolationEnvelopes(pack, { perIntent: 3 });
        const report = runRedTeam(pack, out);
        expect(report.summary.escaped).toBe(0);
        expect(report.summary.errors).toBe(0);
        const ownership = report.results.filter((r) => r.name.startsWith("ownership_violation."));
        expect(ownership.length).toBe(gatedKinds.length * 2 * 3);
        for (const r of ownership) {
          expect(r.status).toBe("defended");
          expect(r.decision).toBe("REFUSE");
          expect(r.reachedAuth).toBe(true);
          // The defense is the AUTHORITY guard's owner predicate, not the taint
          // floor or a state precondition (which would mean a vacuous probe).
          expect(r.basisCodes).toContain(AUTH_BASIS);
          expect(r.basisCodes).not.toContain("taint:level_insufficient");
        }
        // Specifically the IMPERSONATION case (the one the BARE wiring lets escape):
        // it forges the REAL bound victim owner, so only the principalOf seam
        // (attacker session ≠ victim) REFUSEs it — a genuine IDOR refusal.
        const impersonations = ownership.filter((r) => r.name.includes(".impersonation."));
        expect(impersonations.length).toBe(gatedKinds.length * 3);
        for (const r of impersonations) {
          expect(r.decision).toBe("REFUSE");
          expect(r.basisCodes).toContain(AUTH_BASIS);
        }
      });

      it("the canary gate reports the owner predicate as genuinely exercised (non-vacuous)", () => {
        const result = runCanaryGate(pack, { stage: "canary", policy: "strict", seed: 1 });
        expect(result.ownershipNonVacuity.fixtureBacked).toBe(gatedKinds.length * 2 * 3);
        expect(result.ownershipNonVacuity.reachedAuth).toBe(result.ownershipNonVacuity.fixtureBacked);
        expect(result.ownershipNonVacuity.notExercised).toEqual([]);
        expect(result.ownershipNonVacuity.exercised).toBe(true);
        // No ownership/IDOR escape on any of the four wired packs.
        expect(result.ownership.escaped).toBe(0);
      });
    });
  }

  // ── kyc DEFER → REFUSE flip (the one genuinely-open 035-F1 hole 202 closes) ──
  it("kyc forged/impersonated owners are now REFUSEd at AUTH, not DEFERred at business (12→0)", () => {
    const out = generateOwnershipViolationEnvelopes(IdentityKycPack as unknown as RedTeamPack, {
      perIntent: 3,
    });
    const report = runRedTeam(IdentityKycPack as unknown as RedTeamPack, out);
    const ownership = report.results.filter((r) => r.name.startsWith("ownership_violation."));
    expect(ownership.length).toBe(12); // 2 kinds * 2 cases * 3 perIntent
    for (const r of ownership) {
      // Previously these DEFERred (escaped) at the business stage because the auth
      // guard was inert (no authority injected). With the fixture's authority the
      // owner predicate REFUSEs at auth BEFORE the business DEFER guard runs.
      expect(r.decision).toBe("REFUSE");
      expect(r.decision).not.toBe("DEFER");
      expect(r.reachedAuth).toBe(true);
    }
  });

  // ── pix is still a fully-functioning money-mover (regression guard) ──────────
  it("pix still PROMOTEs a legitimate confirmed-charge refund (the harness did not break the pack)", () => {
    // The fixture exercises the IDOR attack; this asserts the pack still EXECUTEs a
    // legitimate refund where the AUTHENTICATED owner matches — proving the canary
    // change did not turn the pack into a blanket-deny.
    const fixture = ownershipFixtureFor("pack-payments-pix", "pix.charge.refund")!;
    const authority = fixture.buildAuthority();
    const state = {
      ...(paymentsPixPack.rehydrateState(fixture.baseState) as Record<string, unknown>),
      authority: {
        store: authority.store,
        // The host now authenticates the session AS the real owner.
        principalOf: () => "tenant-real-owner",
      },
    };
    const legitPack: RedTeamPack = {
      id: paymentsPixPack.id,
      intents: paymentsPixPack.intents as ReadonlyArray<string>,
      policy: paymentsPixPack.policy as PolicyBundle<string, unknown, unknown>,
      rehydrateState: (raw) => raw,
    };
    const scenario = {
      name: "pix.refund.legit_owner",
      vector: "taint_escalation" as const,
      intent: {
        kind: "pix.charge.refund",
        payload: {
          ...fixture.stateValidPayload,
          // Below the confirm threshold so it EXECUTEs rather than REQUEST_CONFIRMATION.
          refundCentavos: 100,
        },
        actor: { principal: "user" as const, sessionId: "owner-session" },
        taint: "UNTRUSTED" as const,
        nonce: "n-legit",
        createdAt: "2026-05-18T12:00:00.000Z",
        // The REAL owner refunding its own confirmed charge — bound AND authenticated.
        resourceRefs: { owner: "tenant-real-owner", resource: "tenant-owned-resource" },
      },
      state,
      prebuiltState: state,
      defense: { acceptable: ["EXECUTE" as const] },
    };
    const report = runRedTeam(legitPack, [scenario]);
    const r = report.results[0]!;
    // The legitimate owner reaches auth, passes the owner predicate, and EXECUTEs.
    expect(r.reachedAuth).toBe(true);
    expect(r.decision).toBe("EXECUTE");
  });
});

// ── ANTI-GAMING: a deliberately-broken fixture triggers NOT-EXERCISED ──────────
// §7 risk 1 / §8 — a fixture-backed probe whose payload/state can NOT reach the
// auth phase (a state guard refuses upstream) must HARD-FAIL the canary as
// NOT-EXERCISED, never silently pass. This proves the gate is not gameable: a
// vacuous fixture reddens rather than greens.
describe("202 — anti-gaming: a fixture-backed probe that can't reach auth is a HARD NOT-EXERCISED fail", () => {
  // A stub pack whose `id` collides with a real fixture key ("pack-cli-agent") so
  // the generator emits a FIXTURE-BACKED ownership probe for `terminal.run` — but
  // whose STATE guard ALWAYS REFUSEs, so the probe is refused BEFORE the auth phase
  // (the broken-fixture / un-reachable-auth condition the gate must catch).
  function brokenStatePack(): RedTeamPack {
    const policy: PolicyBundle<string, unknown, unknown> = {
      // A state guard that refuses EVERYTHING → the probe never reaches taint/auth.
      stateGuards: [
        () =>
          decisionRefuse(
            refuse("STATE", "always_refuse", "no", "broken fixture: refuses at state"),
            [basis("state", BASIS_CODES.state.TRANSITION_ILLEGAL)],
          ),
      ],
      authGuards: [],
      taint: createSystemTaintPolicy({ systemOnlyKinds: [] }),
      business: [() => null],
      default: "REFUSE",
    };
    return {
      // Collides with the cli fixture key so `ownershipFixtureFor` returns a fixture
      // and the generator emits FIXTURE-BACKED probes for `terminal.run`.
      id: "pack-cli-agent",
      intents: ["terminal.run"],
      policy,
      rehydrateState: (raw) => raw,
    };
  }

  it("emits fixture-backed probes whose state guard refuses upstream of auth", () => {
    const pack = brokenStatePack();
    const out = generateOwnershipViolationEnvelopes(pack, { perIntent: 3 });
    const fb = out.filter((s) => s.fixtureBacked === true);
    expect(fb.length).toBe(6); // 1 kind * 2 cases * 3 perIntent
    const report = runRedTeam(pack, out);
    // The probes were DEFENDED (the broken pack refuses), but NONE reached auth —
    // a defended-but-vacuous outcome (false confidence) the gate must reject.
    for (const r of report.results.filter((x) => x.fixtureBacked === true)) {
      expect(r.reachedAuth).toBe(false);
    }
  });

  it("the canary gate HARD-FAILS (exit 2) with a NOT-EXERCISED report under BOTH policies", () => {
    const pack = brokenStatePack();
    for (const policy of ["strict", "execute-escape"] as const) {
      const result = runCanaryGate(pack, { stage: "canary", policy, seed: 1 });
      // The non-vacuity verdict surfaces the broken probes (NOT silently passed).
      expect(result.ownershipNonVacuity.fixtureBacked).toBe(6);
      expect(result.ownershipNonVacuity.reachedAuth).toBe(0);
      expect(result.ownershipNonVacuity.notExercised.length).toBe(6);
      expect(result.ownershipNonVacuity.exercised).toBe(false);
      // HARD FAIL under BOTH policies — a vacuous owner-canary manufactures false
      // confidence; this is a rollback, never a warning (§7 risk 1).
      expect(result.exitCode).toBe(2);
    }
  });
});
