/**
 * adjudicateWithDeadline — race the kernel against a wall-clock budget.
 */

import { describe, expect, it } from "vitest";
import {
  basis,
  BASIS_CODES,
  buildEnvelope,
  decisionExecute,
  type IntentEnvelope,
  type PolicyBundle,
  type TaintPolicy,
} from "../../src/index.js";
import { adjudicateWithDeadline } from "../../src/kernel/adjudicate-with-deadline.js";

const taintPolicy: TaintPolicy = { minimumFor: () => "UNTRUSTED" };

const fastBundle: PolicyBundle<string, unknown, unknown> = {
  stateGuards: [],
  authGuards: [],
  taint: taintPolicy,
  business: [() => decisionExecute([basis("business", BASIS_CODES.business.RULE_SATISFIED)])],
  default: "EXECUTE",
};

function envFixture(): IntentEnvelope {
  return buildEnvelope({
    kind: "thing.do",
    payload: { x: 1 },
    actor: { principal: "llm", sessionId: "s-1" },
    taint: "SYSTEM",
    nonce: "n-test", createdAt: "2026-04-23T12:00:00.000Z",
  });
}

describe("adjudicateWithDeadline", () => {
  it("returns the kernel decision when work completes within the budget", async () => {
    const decision = await adjudicateWithDeadline(envFixture(), {}, fastBundle, {
      deadlineMs: 1000,
    });
    expect(decision.kind).toBe("EXECUTE");
  });

  it("returns SECURITY refusal kernel_deadline_exceeded when budget is 0", async () => {
    // Budget of 0 means the deadline timer fires before the microtask kernel
    // call resolves — the wrapper guarantees the typed refusal in this case.
    const decision = await adjudicateWithDeadline(envFixture(), {}, fastBundle, {
      deadlineMs: 0,
    });
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.kind).toBe("SECURITY");
    expect(decision.refusal.code).toBe("kernel_deadline_exceeded");
    expect(decision.basis[0]!.category).toBe("deadline");
    expect(decision.basis[0]!.code).toBe("exceeded");
    expect((decision.basis[0]!.detail as { deadlineMs: number }).deadlineMs).toBe(0);
  });

  it("returns deadline refusal for negative budgets (deterministic short-circuit)", async () => {
    const decision = await adjudicateWithDeadline(envFixture(), {}, fastBundle, {
      deadlineMs: -1,
    });
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.code).toBe("kernel_deadline_exceeded");
  });

  it("never blocks longer than deadlineMs (smoke)", async () => {
    const start = Date.now();
    await adjudicateWithDeadline(envFixture(), {}, fastBundle, {
      deadlineMs: 50,
    });
    const elapsed = Date.now() - start;
    // Wide margin to absorb CI jitter; the kernel is fast and should resolve
    // well under 50ms in normal conditions.
    expect(elapsed).toBeLessThan(500);
  });

  it("clears the deadline timer when the kernel wins (no leaked handles)", async () => {
    // Smoke-only: if we leaked the timer the test runner would hang at
    // shutdown. Resolves in <50ms in practice.
    const decision = await adjudicateWithDeadline(envFixture(), {}, fastBundle, {
      deadlineMs: 60_000,
    });
    expect(decision.kind).toBe("EXECUTE");
  });
});
