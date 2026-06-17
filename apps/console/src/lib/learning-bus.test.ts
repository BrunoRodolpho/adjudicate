import { describe, expect, it } from "vitest";
import type { RedisPubSubClient } from "@adjudicate/audit";
import { createRedisLearningBus } from "./learning-bus";

/**
 * Item B — the learning bus must multiplex N SSE clients onto ONE Redis
 * subscription (#28-6) and reject any non-v1 payload before fan-out (#28-11).
 */

const VALID = {
  schemaVersion: 1,
  at: "2026-06-17T00:00:00.000Z",
  agentId: "agent-1",
  sessionId: "sess-1",
  kind: "agent.turn",
};

function fakePubSub() {
  let handler: ((m: string) => void) | null = null;
  let subscribeCalls = 0;
  let unsubscribeCalls = 0;
  const client: RedisPubSubClient = {
    async publish() {
      return 0;
    },
    async subscribe(_channel: string, h: (m: string) => void) {
      subscribeCalls += 1;
      handler = h;
      return async () => {
        unsubscribeCalls += 1;
        handler = null;
      };
    },
  };
  return {
    client,
    emit: (m: string) => handler?.(m),
    subscribeCalls: () => subscribeCalls,
    unsubscribeCalls: () => unsubscribeCalls,
  };
}

describe("createRedisLearningBus (#28-6 multiplex)", () => {
  it("fans N subscribers out from ONE shared redis subscription", async () => {
    const ps = fakePubSub();
    const bus = createRedisLearningBus(ps.client);
    const a: unknown[] = [];
    const b: unknown[] = [];

    const unsubA = await bus.subscribe((e) => a.push(e));
    const unsubB = await bus.subscribe((e) => b.push(e));
    // One Redis SUBSCRIBE regardless of how many SSE clients attach.
    expect(ps.subscribeCalls()).toBe(1);

    ps.emit(JSON.stringify(VALID));
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0]).toEqual(VALID);

    // Torn down only when the LAST subscriber leaves.
    await unsubA();
    expect(ps.unsubscribeCalls()).toBe(0);
    await unsubB();
    expect(ps.unsubscribeCalls()).toBe(1);
  });

  it("rejects non-v1 / malformed payloads before fan-out (#28-11)", async () => {
    const ps = fakePubSub();
    const bus = createRedisLearningBus(ps.client);
    const seen: unknown[] = [];
    await bus.subscribe((e) => seen.push(e));

    ps.emit(JSON.stringify({ ...VALID, schemaVersion: 2 })); // wrong version
    ps.emit("{ not json"); // unparseable
    ps.emit(JSON.stringify([1, 2, 3])); // non-object
    ps.emit(JSON.stringify(VALID)); // the only one that should pass

    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual(VALID);
  });
});
