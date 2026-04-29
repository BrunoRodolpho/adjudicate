import { describe, expect, it } from "vitest";
import { createEmergencyHandler } from "../src/handlers/emergency.js";
import {
  createInMemoryEmergencyStateStore,
  type EmergencyStateStore,
} from "../src/store/emergency-store.js";
import type { Actor } from "../src/schemas/emergency.js";

const operator: Actor = { id: "op-1", displayName: "Test Operator" };
const otherOperator: Actor = { id: "op-2", displayName: "Other Operator" };

const handlerWithStore = (): {
  handler: ReturnType<typeof createEmergencyHandler>;
  store: EmergencyStateStore;
} => {
  const store = createInMemoryEmergencyStateStore();
  return { handler: createEmergencyHandler({ stateStore: store }), store };
};

describe("createEmergencyHandler", () => {
  describe("getState", () => {
    it("starts in NORMAL state", async () => {
      const { handler } = handlerWithStore();
      const state = await handler.getState();
      expect(state.status).toBe("NORMAL");
      expect(state.toggledBy.id).toBe("system");
    });
  });

  describe("update", () => {
    it("transitions NORMAL → DENY_ALL and emits a governance event", async () => {
      const { handler } = handlerWithStore();
      const result = await handler.update(
        {
          newStatus: "DENY_ALL",
          reason: "Refund spike — investigating",
          confirmationPhrase: "DENY_ALL",
        },
        operator,
      );
      expect(result.state.status).toBe("DENY_ALL");
      expect(result.state.reason).toBe("Refund spike — investigating");
      expect(result.state.toggledBy).toEqual(operator);
      expect(result.event).not.toBeNull();
      expect(result.event?.previousStatus).toBe("NORMAL");
      expect(result.event?.newStatus).toBe("DENY_ALL");
      expect(result.event?.actor).toEqual(operator);
    });

    it("transitions DENY_ALL → NORMAL and emits a governance event", async () => {
      const { handler } = handlerWithStore();
      await handler.update(
        {
          newStatus: "DENY_ALL",
          reason: "First engagement reason",
          confirmationPhrase: "DENY_ALL",
        },
        operator,
      );
      const result = await handler.update(
        {
          newStatus: "NORMAL",
          reason: "Incident resolved at 14:32 UTC",
          confirmationPhrase: "NORMAL",
        },
        otherOperator,
      );
      expect(result.state.status).toBe("NORMAL");
      expect(result.state.toggledBy.id).toBe("op-2");
      expect(result.event?.previousStatus).toBe("DENY_ALL");
      expect(result.event?.newStatus).toBe("NORMAL");
    });

    it("is idempotent for same-status updates (no event emitted)", async () => {
      const { handler } = handlerWithStore();
      const result = await handler.update(
        {
          newStatus: "NORMAL",
          reason: "Already in NORMAL — should be a no-op",
          confirmationPhrase: "NORMAL",
        },
        operator,
      );
      expect(result.state.status).toBe("NORMAL");
      expect(result.event).toBeNull();
    });

    it("is idempotent when re-engaging DENY_ALL", async () => {
      const { handler } = handlerWithStore();
      await handler.update(
        {
          newStatus: "DENY_ALL",
          reason: "Initial engagement reason",
          confirmationPhrase: "DENY_ALL",
        },
        operator,
      );
      const result = await handler.update(
        {
          newStatus: "DENY_ALL",
          reason: "Re-engagement attempt",
          confirmationPhrase: "DENY_ALL",
        },
        otherOperator,
      );
      expect(result.event).toBeNull();
      // State stays as the original engagement.
      expect(result.state.toggledBy.id).toBe("op-1");
      expect(result.state.reason).toBe("Initial engagement reason");
    });
  });

  describe("history", () => {
    it("returns events newest-first", async () => {
      const { handler } = handlerWithStore();
      await handler.update(
        {
          newStatus: "DENY_ALL",
          reason: "Engagement number one",
          confirmationPhrase: "DENY_ALL",
        },
        operator,
      );
      await handler.update(
        {
          newStatus: "NORMAL",
          reason: "Restoration number one",
          confirmationPhrase: "NORMAL",
        },
        operator,
      );
      const events = await handler.history(10);
      expect(events).toHaveLength(2);
      // Newest first
      expect(events[0]!.newStatus).toBe("NORMAL");
      expect(events[1]!.newStatus).toBe("DENY_ALL");
    });

    it("respects limit", async () => {
      const { handler } = handlerWithStore();
      for (let i = 0; i < 5; i++) {
        const target = i % 2 === 0 ? "DENY_ALL" : "NORMAL";
        await handler.update(
          {
            newStatus: target,
            reason: `Toggle iteration ${i}`,
            confirmationPhrase: target,
          },
          operator,
        );
      }
      const events = await handler.history(3);
      expect(events).toHaveLength(3);
    });

    it("excludes idempotent no-ops from history", async () => {
      const { handler } = handlerWithStore();
      await handler.update(
        {
          newStatus: "NORMAL",
          reason: "No-op number one — this should not appear",
          confirmationPhrase: "NORMAL",
        },
        operator,
      );
      await handler.update(
        {
          newStatus: "NORMAL",
          reason: "No-op number two — also excluded",
          confirmationPhrase: "NORMAL",
        },
        operator,
      );
      const events = await handler.history(10);
      expect(events).toHaveLength(0);
    });
  });
});
