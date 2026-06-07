import { describe, expect, it } from "vitest";
import { adjudicate, buildEnvelope, type Taint } from "@adjudicate/core";
import { accessGovernancePack, rehydrateAccessState } from "../src/index.js";

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

describe("pack-access-governance — six outcomes", () => {
  it("EXECUTE: approved request at granted level", () => {
    expect(
      run("access.request", { principal: "a", resourceId: "db.prod", privilegeLevel: 1, justification: "x" }, "UNTRUSTED", {
        reviews: { "db.prod::a": { resourceId: "db.prod", principal: "a", decision: "approved", grantedLevel: 1, at } },
        grants: {},
      }).kind,
    ).toBe("EXECUTE");
  });
  it("EXECUTE: TRUSTED review resolution", () => {
    expect(run("access.review.resolve", { resourceId: "db.prod", principal: "a", reviewer: "b", decision: "approved", grantedLevel: 1 }, "TRUSTED").kind).toBe("EXECUTE");
  });
  it("REFUSE: unknown resource", () => {
    expect(run("access.request", { principal: "a", resourceId: "nope", privilegeLevel: 0, justification: "x" }, "UNTRUSTED").kind).toBe("REFUSE");
  });
  it("REFUSE: rejected review", () => {
    expect(
      run("access.request", { principal: "a", resourceId: "db.prod", privilegeLevel: 0, justification: "x" }, "UNTRUSTED", {
        reviews: { "db.prod::a": { resourceId: "db.prod", principal: "a", decision: "rejected", at } },
        grants: {},
      }).kind,
    ).toBe("REFUSE");
  });
  it("DEFER: request with no resolved review", () => {
    const d = run("access.request", { principal: "a", resourceId: "db.analytics", privilegeLevel: 0, justification: "x" }, "UNTRUSTED");
    expect(d.kind).toBe("DEFER");
    if (d.kind === "DEFER") expect(d.signal).toBe("access.review.resolved");
  });
  it("REWRITE: over-provisioned request clamps to least privilege", () => {
    const d = run("access.request", { principal: "a", resourceId: "db.analytics", privilegeLevel: 2, justification: "x" }, "UNTRUSTED");
    expect(d.kind).toBe("REWRITE");
    if (d.kind === "REWRITE") {
      expect((d.rewritten.payload as { privilegeLevel: number }).privilegeLevel).toBe(0);
      expect(d.rewritten.taint).toBe("UNTRUSTED");
    }
  });
  it("ESCALATE: sensitive resource without approval", () => {
    const d = run("access.request", { principal: "a", resourceId: "payroll", privilegeLevel: 1, justification: "x" }, "UNTRUSTED");
    expect(d.kind).toBe("ESCALATE");
    if (d.kind === "ESCALATE") expect(d.to).toBe("human");
  });
  it("REQUEST_CONFIRMATION: revoke without a confirmation token", () => {
    expect(
      run("access.revoke", { principal: "a", resourceId: "db.prod" }, "UNTRUSTED", {
        reviews: {},
        grants: { "db.prod::a": { principal: "a", resourceId: "db.prod", privilegeLevel: 1 } },
      }).kind,
    ).toBe("REQUEST_CONFIRMATION");
  });
});

describe("pack-access-governance — taint security (adversarial)", () => {
  it("UNTRUSTED review.resolve is refused at the taint gate (no self-approval)", () => {
    const d = run("access.review.resolve", { resourceId: "db.prod", principal: "a", reviewer: "self", decision: "approved", grantedLevel: 2 }, "UNTRUSTED");
    expect(d.kind).toBe("REFUSE");
    if (d.kind === "REFUSE") expect(d.refusal.kind).toBe("SECURITY");
  });
  it("a forged high-privilege request with no review never EXECUTEs (clamped/deferred)", () => {
    const d = run("access.request", { principal: "a", resourceId: "db.prod", privilegeLevel: 2, justification: "x" }, "UNTRUSTED");
    expect(["REWRITE", "DEFER"]).toContain(d.kind);
  });
});
