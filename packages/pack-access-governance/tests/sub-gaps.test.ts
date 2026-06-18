import { describe, expect, it } from "vitest";
import { adjudicate, buildEnvelope, type Decision, type Taint } from "@adjudicate/core";
import { accessGovernancePack, rehydrateAccessState } from "../src/index.js";

/**
 * WS-F — access sub-gap guards: role-explosion, redundancy, peer-review.
 * All three ESCALATE (never duplicate engine/kernel state) and tag a
 * business:rule_violated basis with a `detail.rule` discriminator.
 */

const at = "2026-05-01T12:00:00.000Z";

function run(kind: string, payload: unknown, taint: Taint, state: unknown = { reviews: {}, grants: {} }) {
  const env = buildEnvelope({
    kind,
    payload,
    actor: { principal: taint === "TRUSTED" ? "system" : "llm", sessionId: "s" },
    taint,
    nonce: `n-${Math.random()}`,
    createdAt: at,
  });
  return adjudicate(env, rehydrateAccessState(state), accessGovernancePack.policy);
}

const hasRule = (d: Decision, rule: string): boolean =>
  d.basis.some((b) => (b.detail as { rule?: string } | undefined)?.rule === rule);

describe("WS-F role-explosion", () => {
  it("ESCALATEs when a principal already holds >= threshold grants", () => {
    const grants: Record<string, unknown> = {};
    for (let i = 0; i < 5; i += 1) grants[`r${i}::a`] = { principal: "a", resourceId: `r${i}`, privilegeLevel: 1 };
    const d = run(
      "access.request",
      { principal: "a", resourceId: "db.analytics", privilegeLevel: 0, justification: "x" },
      "UNTRUSTED",
      { reviews: {}, grants },
    );
    expect(d.kind).toBe("ESCALATE");
    expect(hasRule(d, "role_explosion")).toBe(true);
  });

  it("does not fire below the threshold (normal flow preserved)", () => {
    const grants = { "r0::a": { principal: "a", resourceId: "r0", privilegeLevel: 1 } };
    const d = run(
      "access.request",
      { principal: "a", resourceId: "db.analytics", privilegeLevel: 0, justification: "x" },
      "UNTRUSTED",
      { reviews: {}, grants },
    );
    expect(d.kind).toBe("DEFER"); // no review → defers, not escalates
  });
});

describe("WS-F redundancy", () => {
  it("ESCALATEs a request already covered by an equal-or-higher grant", () => {
    const d = run(
      "access.request",
      { principal: "a", resourceId: "db.prod", privilegeLevel: 1, justification: "x" },
      "UNTRUSTED",
      { reviews: {}, grants: { "db.prod::a": { principal: "a", resourceId: "db.prod", privilegeLevel: 1 } } },
    );
    expect(d.kind).toBe("ESCALATE");
    expect(hasRule(d, "redundant_grant")).toBe(true);
  });

  it("does not fire when the request asks for a strictly higher level", () => {
    const d = run(
      "access.request",
      { principal: "a", resourceId: "db.analytics", privilegeLevel: 1, justification: "x" },
      "UNTRUSTED",
      { reviews: {}, grants: { "db.analytics::a": { principal: "a", resourceId: "db.analytics", privilegeLevel: 0 } } },
    );
    expect(d.kind).not.toBe("ESCALATE"); // higher request → not redundant
  });
});

describe("WS-F peer-review for admin grants", () => {
  it("ESCALATEs an admin (level 2) request even with a single approval", () => {
    const d = run(
      "access.request",
      { principal: "a", resourceId: "db.prod", privilegeLevel: 2, justification: "x" },
      "UNTRUSTED",
      { reviews: { "db.prod::a": { resourceId: "db.prod", principal: "a", decision: "approved", grantedLevel: 2, at } }, grants: {} },
    );
    expect(d.kind).toBe("ESCALATE");
    expect(hasRule(d, "peer_review_required")).toBe(true);
  });

  it("does not fire for an approved non-admin (level 1) request — it EXECUTEs", () => {
    const d = run(
      "access.request",
      { principal: "a", resourceId: "db.prod", privilegeLevel: 1, justification: "x" },
      "UNTRUSTED",
      { reviews: { "db.prod::a": { resourceId: "db.prod", principal: "a", decision: "approved", grantedLevel: 1, at } }, grants: {} },
    );
    expect(d.kind).toBe("EXECUTE");
  });

  it("does not fire on an unreviewed admin request — it still REWRITE-clamps to least privilege", () => {
    const d = run(
      "access.request",
      { principal: "a", resourceId: "db.analytics", privilegeLevel: 2, justification: "x" },
      "UNTRUSTED",
    );
    expect(d.kind).toBe("REWRITE");
  });
});
