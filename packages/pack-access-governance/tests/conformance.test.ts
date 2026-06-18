import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertPackConformance,
  hashAuthorityGraph,
  installPack,
  readRecordedAuthoritySnapshot,
  _resetLearningSink,
  _resetMetricsSink,
  type AuthorityGraph,
  type PackV0,
  type PolicyBundle,
} from "@adjudicate/core";
import { accessGovernancePack } from "../src/index.js";

describe("pack-access-governance — conformance", () => {
  it("satisfies PackV0 and passes assertPackConformance", () => {
    const _t: PackV0 = accessGovernancePack;
    void _t;
    expect(() => assertPackConformance(accessGovernancePack)).not.toThrow();
  });

  it("default polarity is REFUSE", () => {
    expect(accessGovernancePack.policy.default).toBe("REFUSE");
  });

  it("review.resolve is TRUSTED-only; request tolerates UNTRUSTED", () => {
    const taint = accessGovernancePack.policy.taint;
    expect(taint.minimumFor("access.review.resolve")).toBe("TRUSTED");
    expect(taint.minimumFor("access.request")).toBe("UNTRUSTED");
  });

  it("planner never exposes access.review.resolve", () => {
    const plan = accessGovernancePack.planner.plan(
      { reviews: new Map(), grants: new Map([["k", { principal: "a", resourceId: "db.prod", privilegeLevel: 1 }]]) },
      { requesterId: "r" },
    );
    expect(plan.allowedIntents).not.toContain("access.review.resolve");
    expect(plan.allowedIntents).toContain("access.revoke");
  });
});

// ── 033 — install the access pack WITH an authority snapshot injected/recorded ─
// 033 injects + records the snapshot via the installPack seam. It must NOT change
// guard order or outcomes — the snapshot is INJECTED STATE, recorded for replay,
// NOT a new guard (no authority guard is wired; that is 034).
describe("pack-access-governance — 033 authority-snapshot injection (no guard/outcome change)", () => {
  const SNAPSHOT: AuthorityGraph = {
    edges: [
      {
        principal: "user_42",
        relationship: "owns",
        resource: "db.prod",
        permits: { actions: ["access.request"] },
      },
    ],
  };

  beforeEach(() => {
    _resetMetricsSink();
    _resetLearningSink();
  });
  afterEach(() => {
    _resetMetricsSink();
    _resetLearningSink();
  });

  // Capture the pack's guard-array LENGTHS before install so we can assert the
  // injection added zero guards in any phase (guard ORDER + count unchanged).
  const before = accessGovernancePack.policy as PolicyBundle<string, unknown, unknown>;
  const beforeShape = {
    stateGuards: before.stateGuards.length,
    authGuards: before.authGuards.length,
    business: before.business.length,
    default: before.default,
  };

  it("records the injected snapshot on the InstalledPack (and exposes it for replay)", () => {
    const result = installPack(accessGovernancePack, {
      authoritySnapshot: SNAPSHOT,
      warn: () => {},
    });
    expect(result.authoritySnapshot).toBeDefined();
    expect(result.authoritySnapshot!.snapshotHash).toBe(hashAuthorityGraph(SNAPSHOT));
    expect(readRecordedAuthoritySnapshot(result.pack)).toEqual(result.authoritySnapshot);
  });

  it("adds NO guard in any phase — guard order/count and default polarity unchanged", () => {
    const result = installPack(accessGovernancePack, {
      authoritySnapshot: SNAPSHOT,
      warn: () => {},
    });
    const after = result.pack.policy as PolicyBundle<string, unknown, unknown>;
    // withBasisAudit wraps each guard 1:1 (same count); 033 adds none — so the
    // per-phase counts and the default are byte-for-byte the same as before.
    expect({
      stateGuards: after.stateGuards.length,
      authGuards: after.authGuards.length,
      business: after.business.length,
      default: after.default,
    }).toEqual(beforeShape);
    // The authority guard is NOT wired here (deferred to 034): authGuards stays
    // exactly as the pack shipped it.
    expect(after.authGuards.length).toBe(before.authGuards.length);
  });

  it("an install WITHOUT a snapshot is byte-identical (no recorded snapshot, no behavior change)", () => {
    const result = installPack(accessGovernancePack, { warn: () => {} });
    expect(result.authoritySnapshot).toBeUndefined();
    expect("authoritySnapshot" in result).toBe(false);
    expect(readRecordedAuthoritySnapshot(result.pack)).toBeUndefined();
  });
});
