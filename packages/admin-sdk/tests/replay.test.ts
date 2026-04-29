import { describe, expect, it } from "vitest";
import {
  basis,
  buildAuditRecord,
  buildEnvelope,
  decisionExecute,
  decisionRefuse,
  refuse,
  type AuditRecord,
  type Decision,
} from "@adjudicate/core";
import {
  createInMemoryAuditStore,
  createInMemoryEmergencyStateStore,
  ReplayError,
  type ReplayInvoker,
} from "../src/index.js";
import { createAdminCaller } from "../src/trpc/index.js";
import { ALL, fixtureExecute, fixtureRefuse } from "./fixtures.js";

/* ────────────────────────────────────────────────────────────────────────── */
/* Mock invokers                                                              */
/* ────────────────────────────────────────────────────────────────────────── */

const reproducingInvoker: ReplayInvoker = {
  async replay(record) {
    // Identity reproducer — returns the original decision verbatim. Tests
    // the "matched" branch (no mismatch detected).
    return { decision: record.decision, stateSource: "synthetic" };
  },
};

const decisionKindFlippingInvoker: ReplayInvoker = {
  async replay(record) {
    // Flips EXECUTE → REFUSE to simulate a policy regression.
    if (record.decision.kind === "EXECUTE") {
      const flipped: Decision = decisionRefuse(
        refuse("STATE", "test.now_refused", "Policy now refuses this."),
        [basis("state", "transition_illegal")],
      );
      return { decision: flipped, stateSource: "adopter" };
    }
    return { decision: record.decision, stateSource: "adopter" };
  },
};

const basisDriftInvoker: ReplayInvoker = {
  async replay(record) {
    // Same decision kind but different basis (vocabulary-tightening simulation).
    const same: Decision = decisionExecute([
      basis("auth", "scope_sufficient"),
      basis("business", "rule_satisfied"),
    ]);
    return { decision: same, stateSource: "synthetic" };
  },
};

/* ────────────────────────────────────────────────────────────────────────── */
/* Caller helper                                                              */
/* ────────────────────────────────────────────────────────────────────────── */

const callerWithReplayer = (replayer: ReplayInvoker | undefined) => {
  const store = createInMemoryAuditStore({ records: ALL });
  const emergencyStore = createInMemoryEmergencyStateStore();
  return createAdminCaller({
    store,
    emergencyStore,
    actor: null,
    replayer,
  });
};

/* ────────────────────────────────────────────────────────────────────────── */
/* Tests                                                                      */
/* ────────────────────────────────────────────────────────────────────────── */

describe("replay.run — preconditions", () => {
  it("throws PRECONDITION_FAILED when replayer is not configured", async () => {
    const caller = callerWithReplayer(undefined);
    await expect(
      caller.replay.run({ intentHash: fixtureExecute.intentHash }),
    ).rejects.toThrow(/Replay capability not configured/);
  });

  it("throws NOT_FOUND for unknown intentHash", async () => {
    const caller = callerWithReplayer(reproducingInvoker);
    await expect(
      caller.replay.run({ intentHash: "0xnonexistent" }),
    ).rejects.toThrow();
  });

  it("rejects empty intentHash at the wire", async () => {
    const caller = callerWithReplayer(reproducingInvoker);
    await expect(caller.replay.run({ intentHash: "" })).rejects.toThrow();
  });
});

describe("replay.run — successful reproduction", () => {
  it("returns classification: null when decision reproduces", async () => {
    const caller = callerWithReplayer(reproducingInvoker);
    const result = await caller.replay.run({
      intentHash: fixtureExecute.intentHash,
    });
    expect(result.classification).toBeNull();
    expect(result.original.intentHash).toBe(fixtureExecute.intentHash);
    expect(result.recomputed.kind).toBe(fixtureExecute.decision.kind);
  });

  it("propagates stateSource from the invoker", async () => {
    const caller = callerWithReplayer(reproducingInvoker);
    const result = await caller.replay.run({
      intentHash: fixtureExecute.intentHash,
    });
    expect(result.stateSource).toBe("synthetic");

    const adopterCaller = callerWithReplayer(decisionKindFlippingInvoker);
    const adopterResult = await adopterCaller.replay.run({
      intentHash: fixtureRefuse.intentHash,
    });
    expect(adopterResult.stateSource).toBe("adopter");
  });
});

describe("replay.run — DECISION_KIND mismatch (policy regression)", () => {
  it("classifies as DECISION_KIND when recomputed kind differs from original", async () => {
    const caller = callerWithReplayer(decisionKindFlippingInvoker);
    const result = await caller.replay.run({
      intentHash: fixtureExecute.intentHash,
    });
    expect(result.classification).not.toBeNull();
    expect(result.classification!.kind).toBe("DECISION_KIND");
    expect(result.classification!.expected.kind).toBe("EXECUTE");
    expect(result.classification!.actual.kind).toBe("REFUSE");
  });
});

describe("replay.run — BASIS_DRIFT mismatch", () => {
  it("classifies as BASIS_DRIFT when same kind but different basis flat-set", async () => {
    const caller = callerWithReplayer(basisDriftInvoker);
    const result = await caller.replay.run({
      intentHash: fixtureExecute.intentHash,
    });
    expect(result.classification).not.toBeNull();
    expect(result.classification!.kind).toBe("BASIS_DRIFT");
    expect(result.classification!.basisDelta).toBeDefined();
    // Original fixtureExecute has these basis codes; the drift invoker
    // returns a different set. Symmetric difference must be non-empty.
    const delta = result.classification!.basisDelta!;
    expect(delta.missing.length + delta.extra.length).toBeGreaterThan(0);
  });
});

describe("replay.run — REFUSAL_CODE_DRIFT mismatch", () => {
  it("classifies as REFUSAL_CODE_DRIFT when both REFUSE with same basis but different code", async () => {
    // Build a custom invoker: same REFUSE basis, different code.
    const refusalDriftInvoker: ReplayInvoker = {
      async replay(record) {
        if (record.decision.kind !== "REFUSE") {
          return { decision: record.decision, stateSource: "synthetic" };
        }
        const same: Decision = decisionRefuse(
          refuse(
            record.decision.refusal.kind,
            "different.refusal.code",
            "renamed for clarity",
          ),
          // Same basis flat-set as the original.
          record.decision.basis,
        );
        return { decision: same, stateSource: "synthetic" };
      },
    };
    const caller = callerWithReplayer(refusalDriftInvoker);
    const result = await caller.replay.run({
      intentHash: fixtureRefuse.intentHash,
    });
    expect(result.classification).not.toBeNull();
    expect(result.classification!.kind).toBe("REFUSAL_CODE_DRIFT");
  });
});
