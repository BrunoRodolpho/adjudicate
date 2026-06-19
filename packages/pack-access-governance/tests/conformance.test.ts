import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  adjudicate,
  assertPackConformance,
  buildEnvelope,
  createAuthorityGraphStore,
  hashAuthorityGraph,
  installPack,
  readRecordedAuthoritySnapshot,
  _resetLearningSink,
  _resetMetricsSink,
  type AuthorityGraph,
  type PackV0,
  type PolicyBundle,
} from "@adjudicate/core";
import { accessGovernancePack, type AccessAuthorityContext, type AccessState } from "../src/index.js";

describe("pack-access-governance — conformance", () => {
  it("satisfies PackV0 and passes assertPackConformance", () => {
    const _t: PackV0 = accessGovernancePack;
    void _t;
    expect(() => assertPackConformance(accessGovernancePack)).not.toThrow();
  });

  it("default polarity is REFUSE", () => {
    expect(accessGovernancePack.policy.default).toBe("REFUSE");
  });

  // 035 — §D #8: the pack must ship a non-empty authGuards (an owner predicate)
  // so its mutating UNTRUSTED-min kinds (access.request/revoke) cannot execute
  // without an authority/owner check. Pre-035 this was `authGuards: []`.
  it("ships a non-empty authGuards (constitutional owner predicate, §D #8)", () => {
    expect(accessGovernancePack.policy.authGuards.length).toBeGreaterThan(0);
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

// ── 035 — the wired authority guard is LOAD-BEARING (non-vacuous) ──────────────
// Proves the wired guard actually closes IDOR for the mutating UNTRUSTED kinds:
// when the host injects authority + identity, an actor acting on a resource it is
// not the authenticated owner of is REFUSEd at the auth gate; when authority is
// absent the guard is inert (pre-035 posture — every other test here unaffected).
describe("pack-access-governance — 035 authority guard (request owner predicate)", () => {
  const OWNER = "principal_owner";
  const RESOURCE = "db.prod"; // a KNOWN resource so the state guard passes

  const store = createAuthorityGraphStore({
    edges: [
      {
        principal: OWNER,
        relationship: "owns" as const,
        resource: RESOURCE,
        permits: { actions: ["access.request"] },
      },
    ],
  });
  const authority: AccessAuthorityContext = {
    store,
    principalOf: (sessionId) =>
      sessionId === "sess-owner" ? OWNER : sessionId === "sess-attacker" ? "attacker" : null,
  };

  function requestEnv(sessionId: string, owner: string) {
    return buildEnvelope({
      kind: "access.request",
      payload: {
        principal: OWNER,
        resourceId: RESOURCE,
        privilegeLevel: 0,
        justification: "need read",
      },
      actor: { principal: "user", sessionId },
      taint: "UNTRUSTED",
      nonce: "n-acc-auth",
      createdAt: "2026-05-18T12:00:00.000Z",
      resourceRefs: { owner, resource: RESOURCE },
    });
  }

  it("inert without injected authority — request flows past the auth gate (pre-035 posture)", () => {
    const noAuth: AccessState = { reviews: new Map(), grants: new Map() };
    const decision = adjudicate(requestEnv("sess-owner", OWNER), noAuth, accessGovernancePack.policy);
    // No authority context ⇒ the auth guard is inert; the request reaches the
    // business stage and DEFERs awaiting review (NOT an auth REFUSE).
    expect(decision.kind).not.toBe("REFUSE");
  });

  it("REFUSEs at the auth gate when an attacker forges the bound owner (IDOR closed)", () => {
    const withAuth: AccessState = { reviews: new Map(), grants: new Map(), authority };
    // Attacker forges owner=OWNER (the real bound owner) but the authenticated
    // session is "attacker" ⇒ the principalOf seam REFUSEs.
    const decision = adjudicate(requestEnv("sess-attacker", OWNER), withAuth, accessGovernancePack.policy);
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.kind).toBe("SECURITY");
    expect(decision.refusal.code).toBe("tenant_binding_violation");
    expect(decision.basis.map((b) => `${b.category}:${b.code}`)).toContain(
      "auth:scope_insufficient",
    );
  });

  it("an honestly-authenticated owner passes the auth gate", () => {
    const withAuth: AccessState = { reviews: new Map(), grants: new Map(), authority };
    const decision = adjudicate(requestEnv("sess-owner", OWNER), withAuth, accessGovernancePack.policy);
    // Owner passes auth → reaches business → DEFERs awaiting review (not an auth REFUSE).
    expect(decision.kind).not.toBe("REFUSE");
  });
});
