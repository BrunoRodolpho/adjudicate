import { describe, expect, it } from "vitest";
import {
  createInMemoryAuditStore,
  createInMemoryEmergencyStateStore,
} from "../src/index.js";
import { createAdminCaller, createReadOnlyAdminCaller } from "../src/trpc/index.js";
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

// ─── 115 — kill-switch read-status: history is newest-first + the OBSERVER's
// read view never mutates emergency state ────────────────────────────────────
// The Adjudicant kill-switch view reads `emergency.history` newest-first and
// maps it onto the pure `analyzeKillSwitchTimeline` adopter-side. The store
// contract guarantees newest-first; these tests pin (a) that ordering on the
// read seam and (b) that the READ-ONLY plane (the OBSERVER) cannot toggle the
// switch — `emergency.update` is structurally absent, and reads leave the state
// exactly as found.
describe("emergency read-status — newest-first history + read-only never mutates (115)", () => {
  it("emergency.history returns events newest-first (the kill-switch timeline source)", async () => {
    const { caller } = callerWithStores();
    // Drive three transitions: NORMAL → DENY_ALL → NORMAL → DENY_ALL.
    await caller.emergency.update({
      newStatus: "DENY_ALL",
      reason: "first trip — refund spike",
      confirmationPhrase: "DENY_ALL",
    });
    await caller.emergency.update({
      newStatus: "NORMAL",
      reason: "first clear — spike resolved",
      confirmationPhrase: "NORMAL",
    });
    await caller.emergency.update({
      newStatus: "DENY_ALL",
      reason: "second trip — recurrence",
      confirmationPhrase: "DENY_ALL",
    });

    const events = await caller.emergency.history({ limit: 10 });
    expect(events).toHaveLength(3);
    // Newest-first: the most recent transition is element 0.
    expect(events[0]!.reason).toBe("second trip — recurrence");
    expect(events[0]!.newStatus).toBe("DENY_ALL");
    expect(events[2]!.reason).toBe("first trip — refund spike");
    // Timestamps are monotonically non-increasing (newest-first).
    for (let i = 1; i < events.length; i++) {
      expect(events[i - 1]!.at >= events[i]!.at).toBe(true);
    }
  });

  it("the READ-ONLY plane reads kill-switch state/history WITHOUT mutating it", async () => {
    const store = createInMemoryAuditStore({ records: ALL });
    const emergencyStore = createInMemoryEmergencyStateStore();
    const roCaller = createReadOnlyAdminCaller({
      store,
      emergencyStore,
      actor: operator,
    });

    const before = await roCaller.emergency.state();
    expect(before.status).toBe("NORMAL");

    // Multiple reads of state + history.
    await roCaller.emergency.state();
    await roCaller.emergency.history({ limit: 10 });
    const historyAfter = await roCaller.emergency.history({ limit: 10 });

    // Reads created NO governance events — the OBSERVER never wrote.
    expect(historyAfter).toHaveLength(0);

    const after = await roCaller.emergency.state();
    expect(after).toEqual(before);

    // And `emergency.update` is not even a member of the read-only plane —
    // toggling the switch from the OBSERVER is structurally impossible.
    const dyn = roCaller as unknown as Record<
      string,
      Record<string, (input: unknown) => Promise<unknown>>
    >;
    await expect(
      dyn.emergency!.update!({
        newStatus: "DENY_ALL",
        reason: "OBSERVER must never reach this resolver",
        confirmationPhrase: "DENY_ALL",
      }),
    ).rejects.toThrow(/No .*procedure|not found|No "?mutation"?-procedure/i);
    // State is STILL untouched after the rejected write attempt.
    const final = await roCaller.emergency.state();
    expect(final.status).toBe("NORMAL");
  });
});
