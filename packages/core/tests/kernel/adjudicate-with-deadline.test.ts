/**
 * adjudicateWithDeadline — race the kernel against a wall-clock budget.
 */

import { describe, expect, it, vi } from "vitest";
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

  it("returns SECURITY refusal for NaN deadline (NaN<=0 is false, guard must catch it)", async () => {
    const decision = await adjudicateWithDeadline(envFixture(), {}, fastBundle, {
      deadlineMs: NaN,
    });
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.kind).toBe("SECURITY");
    expect(decision.refusal.code).toBe("kernel_deadline_exceeded");
  });

  it("returns SECURITY refusal for Infinity deadline (non-finite guard)", async () => {
    // Infinity would create a timer that never fires in practice, defeating
    // the purpose. The guard treats non-finite as an invalid budget.
    const decision = await adjudicateWithDeadline(envFixture(), {}, fastBundle, {
      deadlineMs: Infinity,
    });
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.kind).toBe("SECURITY");
    expect(decision.refusal.code).toBe("kernel_deadline_exceeded");
  });

  it("kernel wins the race within budget without the deadline timer firing", async () => {
    // Deterministic replacement for the old wall-clock smoke test (which
    // asserted `Date.now()` elapsed < 500ms — a flaky 10× margin over the
    // 50ms budget). The kernel call is scheduled as a microtask while the
    // deadline is a setTimeout; with fake timers installed and the clock
    // NEVER advanced, the microtask must resolve first. So if the wrapper
    // returns the kernel's EXECUTE decision while no timer has fired, the
    // kernel provably beat the budget — no real-clock dependence at all.
    vi.useFakeTimers();
    try {
      const pending = adjudicateWithDeadline(envFixture(), {}, fastBundle, {
        deadlineMs: 50,
      });
      // Flush only microtasks; do NOT advance fake time, so the 50ms timer
      // cannot fire. The kernel microtask resolves the race.
      await vi.advanceTimersByTimeAsync(0);
      const decision = await pending;
      expect(decision.kind).toBe("EXECUTE");
      // The deadline timer was the only pending timer; the wrapper must have
      // cleared it on the kernel win (no leaked handles).
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
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
