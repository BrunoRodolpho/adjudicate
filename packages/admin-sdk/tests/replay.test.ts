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
import type { Actor } from "../src/schemas/emergency.js";
import { ALL, fixtureExecute, fixtureRefuse } from "./fixtures.js";

const operator: Actor = { id: "op-1", displayName: "Test Operator" };

// Syntactically valid sha256 hex that matches no fixture — reaches the
// NOT_FOUND path now that IntentHashSchema (APIReviewer-013) rejects
// non-hex placeholders at the wire.
const UNKNOWN_HASH = "a".repeat(64);

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

const callerWithReplayer = (
  replayer: ReplayInvoker | undefined,
  actor: Actor | null = operator,
) => {
  const store = createInMemoryAuditStore({ records: ALL });
  const emergencyStore = createInMemoryEmergencyStateStore();
  return createAdminCaller({
    store,
    emergencyStore,
    actor,
    replayer,
  });
};

/* ────────────────────────────────────────────────────────────────────────── */
/* Tests                                                                      */
/* ────────────────────────────────────────────────────────────────────────── */

describe("replay.run — preconditions", () => {
  it("throws UNAUTHORIZED without an actor (AuthReviewer-004)", async () => {
    const caller = callerWithReplayer(reproducingInvoker, null);
    await expect(
      caller.replay.run({ intentHash: fixtureExecute.intentHash }),
    ).rejects.toThrow(/actor-id header required/i);
  });

  it("throws PRECONDITION_FAILED when replayer is not configured", async () => {
    const caller = callerWithReplayer(undefined);
    await expect(
      caller.replay.run({ intentHash: fixtureExecute.intentHash }),
    ).rejects.toThrow(/Replay capability not configured/);
  });

  it("throws NOT_FOUND for unknown (but well-formed) intentHash", async () => {
    const caller = callerWithReplayer(reproducingInvoker);
    await expect(
      caller.replay.run({ intentHash: UNKNOWN_HASH }),
    ).rejects.toThrow();
  });

  it("rejects empty intentHash at the wire", async () => {
    const caller = callerWithReplayer(reproducingInvoker);
    await expect(caller.replay.run({ intentHash: "" })).rejects.toThrow();
  });

  it("rejects a non-hex intentHash at the wire (APIReviewer-013)", async () => {
    const caller = callerWithReplayer(reproducingInvoker);
    await expect(
      caller.replay.run({ intentHash: "0xnonexistent" }),
    ).rejects.toThrow();
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

// ─── 112-T4 — live replay uses the ReplayInvoker path; integrity badge is a
// SEPARATE read-DTO concern (verifyAuditRecord), never replayWithIntegrity ────
//
// The plan draws a hard line: `replay.run` is LIVE single-record replay via the
// injected `ReplayInvoker` + `classify()` (it surfaces `stateSource`, which only
// the invoker can produce — `replayWithIntegrity` does NO I/O and yields no
// stateSource). The INTEGRITY badge for the explorer is a distinct read concern:
// `audit.byHashVerified` runs the pure `verifyAuditRecord` over the stored DTO.
// These must not be conflated (batch/CI chain-verify is the only `replayWithIntegrity`
// consumer, and it lives in @adjudicate/audit, not on this live read path).
describe("replay.run — ReplayInvoker path + integrity-on-read DTO (112-T4)", () => {
  it("surfaces stateSource straight from the ReplayInvoker (the live-replay path, not replayWithIntegrity)", async () => {
    // A bespoke invoker proves the SDK reads stateSource from the invoker's
    // return — a value `replayWithIntegrity` (no-I/O, array-in) cannot supply.
    const taggingInvoker: ReplayInvoker = {
      async replay(record) {
        return { decision: record.decision, stateSource: "adopter" };
      },
    };
    const caller = callerWithReplayer(taggingInvoker);
    const result = await caller.replay.run({
      intentHash: fixtureExecute.intentHash,
    });
    // The invoker path produced stateSource; classification is null (reproduced).
    expect(result.stateSource).toBe("adopter");
    expect(result.classification).toBeNull();
  });

  it("exposes the integrity badge on the read DTO via verifyAuditRecord (byHashVerified)", async () => {
    const store = createInMemoryAuditStore({ records: ALL });
    const emergencyStore = createInMemoryEmergencyStateStore();
    const caller = createAdminCaller({ store, emergencyStore, actor: operator });
    const verified = await caller.audit.byHashVerified({
      intentHash: fixtureExecute.intentHash,
    });
    expect(verified).not.toBeNull();
    // The DTO carries the verifier verdict — an intact fixture verifies true.
    expect(verified!.verification.verified).toBe(true);
    expect(verified!.record.intentHash).toBe(fixtureExecute.intentHash);
  });
});
