/**
 * @adjudicate/conformance — public-harness tests.
 *
 * The lighthouse Pack (`@adjudicate/pack-payments-pix`) must pass the
 * full default check set. This is the precision claim of the harness:
 * a Pack that the framework already knows is correct never produces
 * spurious failures.
 *
 * The fail-open Pack and `allowDefaultExecute` cases pin the polarity
 * contract — `runConformance` agrees with `assertPackConformance` on
 * what counts as a default-polarity violation.
 */

import { describe, expect, it } from "vitest";
import {
  basis,
  BASIS_CODES,
  decisionExecute,
  type PackV0,
  type TaintPolicy,
} from "@adjudicate/core";
import type { PolicyBundle } from "@adjudicate/core/kernel";
import { paymentsPixPack } from "@adjudicate/pack-payments-pix";
import {
  runConformance,
  DEFAULT_CHECKS,
  defaultPolarityCheck,
  untrustedNeverExecutesCheck,
} from "../src/index.js";

const permissiveTaint: TaintPolicy = { minimumFor: () => "UNTRUSTED" };

function makeReadOnlyPack(
  defaultPolarity: "REFUSE" | "EXECUTE",
): PackV0<"read.only", unknown, unknown, unknown> {
  const policy: PolicyBundle<"read.only", unknown, unknown> = {
    stateGuards: [],
    authGuards: [],
    taint: permissiveTaint,
    business: [
      () =>
        decisionExecute([basis("business", BASIS_CODES.business.RULE_SATISFIED)]),
    ],
    default: defaultPolarity,
  };
  return {
    id: "pack-read-only",
    version: "0.1.0",
    contract: "v0",
    intents: ["read.only"],
    policy,
    planner: { listAllowedTools: () => [], listAllowedKinds: () => [] },
    basisCodes: ["read.only.allowed"],
    // AC-007 (035): a genuinely read-only kind must AFFIRMATIVELY declare itself
    // read-only via sideEffects to be exempt from the owner-predicate requirement
    // (DEFAULT-MUTATING classifier). This pack performs no mutation, so it
    // declares "read" — which is the honest classification and the documented
    // AC-007 exemption.
    sideEffects: { "read.only": "read" },
  };
}

describe("runConformance() against the lighthouse PIX Pack", () => {
  it("paymentsPixPack passes the full default check set", () => {
    const report = runConformance(paymentsPixPack);
    if (!report.passed) {
      // Surface the failing-check details so a regression in any check
      // is debuggable without inspecting the report by hand.
      const failures = report.results
        .filter((r) => !r.passed)
        .map((r) => `[${r.id}] ${r.name}: ${r.details ?? "(no details)"}`)
        .join("\n");
      throw new Error(`PIX Pack failed conformance:\n${failures}`);
    }
    expect(report.passed).toBe(true);
    expect(report.packId).toBe("pack-payments-pix");
    expect(report.summary.total).toBe(DEFAULT_CHECKS.length);
    expect(report.summary.passed).toBe(DEFAULT_CHECKS.length);
    expect(report.summary.failed).toBe(0);
  });

  it("is deterministic — two runs of the same Pack produce identical reports", () => {
    const a = runConformance(paymentsPixPack);
    const b = runConformance(paymentsPixPack);
    // JSON-equality is the cleanest structural check; ConformanceReport
    // is plain data with no functions, so JSON.stringify is total.
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("same seed → same report; default seed is 42", () => {
    const a = runConformance(paymentsPixPack, { seed: 42 });
    const b = runConformance(paymentsPixPack); // default seed
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("runConformance() default-polarity check", () => {
  it("fails a fail-open Pack (policy.default = \"EXECUTE\") by default", () => {
    const pack = makeReadOnlyPack("EXECUTE");
    const report = runConformance(pack);
    expect(report.passed).toBe(false);
    const polarity = report.results.find((r) => r.id === defaultPolarityCheck.id);
    expect(polarity).toBeDefined();
    expect(polarity?.passed).toBe(false);
    expect(polarity?.details).toMatch(/allowDefaultExecute/);
  });

  it("allows fail-open with { allowDefaultExecute: true }", () => {
    const pack = makeReadOnlyPack("EXECUTE");
    const report = runConformance(pack, { allowDefaultExecute: true });
    const polarity = report.results.find((r) => r.id === defaultPolarityCheck.id);
    expect(polarity?.passed).toBe(true);
    // The read-only Pack also passes all other checks because its
    // permissive taint policy declares no taint-protected kinds, and its
    // single guard emits known basis codes.
    expect(report.passed).toBe(true);
  });

  it("passes a fail-closed Pack (policy.default = \"REFUSE\") without opt-in", () => {
    const pack = makeReadOnlyPack("REFUSE");
    const report = runConformance(pack);
    const polarity = report.results.find((r) => r.id === defaultPolarityCheck.id);
    expect(polarity?.passed).toBe(true);
  });
});

describe("runConformance() check id stability", () => {
  it("DEFAULT_CHECKS exposes stable AC-NNN ids in fixed order", () => {
    const ids = DEFAULT_CHECKS.map((c) => c.id);
    expect(ids).toEqual([
      "AC-001",
      "AC-002",
      "AC-003",
      "AC-004",
      "AC-005",
      "AC-006",
      // AC-007 (plan 035) — mutating UNTRUSTED-min kinds must carry an owner
      // predicate (§D #8). Registered ahead of AC-008 so the id order is dense.
      "AC-007",
      // AC-008 (plan 014) — the payload-self-confirmation check; took the next
      // free id while AC-007 was reserved for 035.
      "AC-008",
    ]);
  });

  it("individual checks are exported by name for partial-set composition", () => {
    expect(untrustedNeverExecutesCheck.id).toBe("AC-001");
    expect(defaultPolarityCheck.id).toBe("AC-006");
  });
});

describe("ConformanceOptions.authorityGraph — 032 surface (AC-007 wired in 035)", () => {
  // 032 EXTENDED the option surface; 035 wires AC-007. AC-007 is a STATIC
  // structural check (it inspects authGuards/taint/sideEffects, NOT the
  // authorityGraph snapshot), so passing the snapshot is still inert w.r.t. the
  // report — but the real pix pack now PASSES AC-007 because 035 wired the
  // authority guard into its authGuards.
  const graph = {
    edges: [
      {
        principal: "user_42",
        relationship: "owns" as const,
        resource: "acct_7",
        permits: { actions: ["pix.charge.refund"] },
      },
    ],
  };

  it("accepts an injected authorityGraph snapshot WITHOUT throwing or changing the report", () => {
    const baseline = runConformance(paymentsPixPack);
    // The same call, now WITH the snapshot, must still pass identically — AC-007
    // is structural and does not consult the snapshot, so the report is stable.
    const withGraph = runConformance(paymentsPixPack, { authorityGraph: graph });
    expect(withGraph.passed).toBe(true);
    expect(withGraph.summary).toEqual(baseline.summary);
    expect(withGraph.results.map((r) => r.id)).toEqual(
      baseline.results.map((r) => r.id),
    );
  });

  it("DEFAULT_CHECKS now registers AC-007 (035) — the real pix pack passes it", () => {
    expect(DEFAULT_CHECKS.map((c) => c.id)).toContain("AC-007");
    // The pix pack wires createAuthorityGuard into authGuards (035), so its
    // mutating UNTRUSTED-min kinds (pix.charge.create/refund) now carry an owner
    // predicate and AC-007 passes.
    const report = runConformance(paymentsPixPack, { authorityGraph: graph });
    const ac007 = report.results.find((r) => r.id === "AC-007");
    expect(ac007?.passed).toBe(true);
  });
});

describe("runConformance() check isolation", () => {
  it("a check that throws is reported as a clean failure, others still run", () => {
    const throwingCheck = {
      id: "AC-999",
      name: "deliberately-broken-check",
      run: () => {
        throw new Error("bug in check");
      },
    };
    const report = runConformance(paymentsPixPack, {
      checks: [throwingCheck, defaultPolarityCheck],
    });
    expect(report.passed).toBe(false);
    expect(report.results).toHaveLength(2);
    const ac999 = report.results.find((r) => r.id === "AC-999");
    expect(ac999?.passed).toBe(false);
    expect(ac999?.details).toMatch(/bug in check/);
    const ac006 = report.results.find((r) => r.id === defaultPolarityCheck.id);
    expect(ac006?.passed).toBe(true);
  });
});
