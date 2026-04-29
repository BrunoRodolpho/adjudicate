import { describe, expect, it } from "vitest";
import {
  createInMemoryAuditStore,
  createInMemoryEmergencyStateStore,
} from "../src/index.js";
import { createAdminCaller } from "../src/trpc/index.js";
import type { Actor } from "../src/schemas/emergency.js";
import { ALL } from "./fixtures.js";

const operator: Actor = { id: "op-1", displayName: "Test Operator" };

const callerWithStores = (actor: Actor | null = operator) => {
  const store = createInMemoryAuditStore({ records: ALL });
  const emergencyStore = createInMemoryEmergencyStateStore();
  return {
    caller: createAdminCaller({ store, emergencyStore, actor }),
    emergencyStore,
  };
};

describe("emergency.state", () => {
  it("returns initial NORMAL state", async () => {
    const { caller } = callerWithStores();
    const state = await caller.emergency.state();
    expect(state.status).toBe("NORMAL");
  });

  it("does not require an actor", async () => {
    const { caller } = callerWithStores(null);
    const state = await caller.emergency.state();
    expect(state.status).toBe("NORMAL");
  });
});

describe("emergency.history", () => {
  it("returns empty history initially", async () => {
    const { caller } = callerWithStores();
    const events = await caller.emergency.history({ limit: 10 });
    expect(events).toHaveLength(0);
  });

  it("does not require an actor", async () => {
    const { caller } = callerWithStores(null);
    const events = await caller.emergency.history({ limit: 10 });
    expect(events).toHaveLength(0);
  });
});

describe("emergency.update", () => {
  it("requires an actor (UNAUTHORIZED otherwise)", async () => {
    const { caller } = callerWithStores(null);
    await expect(
      caller.emergency.update({
        newStatus: "DENY_ALL",
        reason: "Trying without auth — should be rejected",
        confirmationPhrase: "DENY_ALL",
      }),
    ).rejects.toThrow();
  });

  it("rejects mismatched confirmationPhrase via Zod refinement", async () => {
    const { caller } = callerWithStores();
    await expect(
      caller.emergency.update({
        newStatus: "DENY_ALL",
        reason: "Confirmation phrase mismatch — should be rejected",
        confirmationPhrase: "deny_all", // lowercase ≠ DENY_ALL
      }),
    ).rejects.toThrow();
  });

  it("rejects too-short reason (< 10 chars)", async () => {
    const { caller } = callerWithStores();
    await expect(
      caller.emergency.update({
        newStatus: "DENY_ALL",
        reason: "short",
        confirmationPhrase: "DENY_ALL",
      }),
    ).rejects.toThrow();
  });

  it("rejects too-long reason (> 500 chars)", async () => {
    const { caller } = callerWithStores();
    await expect(
      caller.emergency.update({
        newStatus: "DENY_ALL",
        reason: "x".repeat(501),
        confirmationPhrase: "DENY_ALL",
      }),
    ).rejects.toThrow();
  });

  it("succeeds with valid input + actor and emits a governance event", async () => {
    const { caller } = callerWithStores();
    const result = await caller.emergency.update({
      newStatus: "DENY_ALL",
      reason: "Refund spike investigation",
      confirmationPhrase: "DENY_ALL",
    });
    expect(result.state.status).toBe("DENY_ALL");
    expect(result.event).not.toBeNull();
    expect(result.event?.actor.id).toBe("op-1");
  });

  it("six-outcome integrity: history is queryable after a transition", async () => {
    const { caller } = callerWithStores();
    await caller.emergency.update({
      newStatus: "DENY_ALL",
      reason: "Engagement for history check",
      confirmationPhrase: "DENY_ALL",
    });
    const events = await caller.emergency.history({ limit: 10 });
    expect(events).toHaveLength(1);
    expect(events[0]!.previousStatus).toBe("NORMAL");
    expect(events[0]!.newStatus).toBe("DENY_ALL");
  });
});
