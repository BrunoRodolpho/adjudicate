/**
 * Chaos tests for distributed kill-switch propagation under adverse
 * conditions:
 *
 *   1. Burst of malformed pub/sub messages must not crash propagation.
 *   2. Pub/sub disconnect followed by reconnect must not lose state.
 *   3. Many replicas tripping concurrently must converge — no split-brain.
 *   4. Polling fallback must converge when pub/sub is completely silent.
 *   5. Trip → clear → trip rapidly must end up clear-then-trip on every
 *      replica (last-write-wins semantics).
 *   6. Disconnect storm (many subscribes/unsubscribes) must not leak
 *      handlers.
 *
 * These tests are deliberately stress-shaped — they run many transitions
 * in tight loops with short pollMs values. They DO NOT use Vitest's
 * fake timers because the polling/pub-sub interaction is inherently
 * asynchronous; the assertions are eventual-consistency-style with
 * generous timeouts to keep CI flake-free.
 */

import { describe, expect, it } from "vitest";
import {
  startDistributedKillSwitchPubSub,
  type RedisPubSubClient,
} from "../src/kill-switch-pubsub.js";
import {
  createRuntimeContext,
} from "@adjudicate/core/kernel";
import type { RedisLedgerClient } from "../src/ledger-redis.js";

interface FakePubSub extends RedisPubSubClient {
  readonly listeners: Map<string, Set<(m: string) => void>>;
  /** Force-detach all subscribers (simulates disconnect). */
  forceDisconnect(): void;
}

function fakeRedis(): {
  redis: RedisLedgerClient;
  store: Map<string, string>;
} {
  const store = new Map<string, string>();
  return {
    store,
    redis: {
      async get(key) {
        return store.get(key) ?? null;
      },
      async set(key, value) {
        store.set(key, value);
        return "OK";
      },
    },
  };
}

function fakePubSub(): FakePubSub {
  const listeners = new Map<string, Set<(m: string) => void>>();
  return {
    listeners,
    async publish(channel, message) {
      const set = listeners.get(channel);
      if (set === undefined) return 0;
      let n = 0;
      for (const h of set) {
        try {
          h(message);
          n++;
        } catch {
          // Handler errors must not crash the bus.
        }
      }
      return n;
    },
    async subscribe(channel, handler) {
      const set = listeners.get(channel) ?? new Set();
      set.add(handler);
      listeners.set(channel, set);
      return async () => {
        set.delete(handler);
      };
    },
    forceDisconnect() {
      listeners.clear();
    },
  };
}

async function waitUntil(
  cond: () => boolean,
  maxMs = 1000,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (cond()) return true;
    await new Promise((r) => setTimeout(r, 5));
  }
  return cond();
}

describe("chaos: distributed kill switch (pub/sub + polling)", () => {
  it("absorbs a burst of malformed messages without dropping subsequent valid ones", async () => {
    const { redis } = fakeRedis();
    const pubsub = fakePubSub();
    const ctx = createRuntimeContext({ id: "tenant" });
    const handle = startDistributedKillSwitchPubSub({
      redis,
      pubsub,
      key: "chaos:k1",
      channel: "chaos:k1:ch",
      pollMs: 60_000,
      context: ctx,
    });
    await new Promise((r) => setTimeout(r, 20));

    // 50 bad messages in quick succession.
    for (let i = 0; i < 50; i++) {
      await pubsub.publish("chaos:k1:ch", `garbage-${i}`);
    }
    expect(ctx.killSwitch.isKilled()).toBe(false);

    // One good message comes through.
    await pubsub.publish(
      "chaos:k1:ch",
      JSON.stringify({ active: true, reason: "after-chaos" }),
    );
    expect(ctx.killSwitch.isKilled()).toBe(true);
    expect(ctx.killSwitch.state().reason).toBe("after-chaos");

    await handle.stop();
  });

  it("polling fallback converges within pollMs*2 when pub/sub is silent", async () => {
    const { redis, store } = fakeRedis();
    const pubsub = fakePubSub();
    const ctx = createRuntimeContext({ id: "tenant" });
    const handle = startDistributedKillSwitchPubSub({
      redis,
      pubsub,
      key: "chaos:k2",
      channel: "chaos:k2:ch",
      pollMs: 50,
      context: ctx,
    });
    await new Promise((r) => setTimeout(r, 20));

    // Out-of-band Redis SET — no PUBLISH.
    store.set(
      "chaos:k2",
      JSON.stringify({ active: true, reason: "silent" }),
    );
    const converged = await waitUntil(() => ctx.killSwitch.isKilled(), 300);
    expect(converged).toBe(true);

    await handle.stop();
  });

  it("trip→clear→trip storm converges on the last state across all replicas", async () => {
    const { redis } = fakeRedis();
    const pubsub = fakePubSub();
    const replicas = Array.from({ length: 5 }, (_, i) =>
      createRuntimeContext({ id: `replica-${i}` }),
    );
    const handles = replicas.map((ctx) =>
      startDistributedKillSwitchPubSub({
        redis,
        pubsub,
        key: "chaos:storm",
        channel: "chaos:storm:ch",
        pollMs: 60_000,
        context: ctx,
      }),
    );
    await new Promise((r) => setTimeout(r, 20));

    // Storm of 20 transitions, alternating active/inactive.
    for (let i = 0; i < 20; i++) {
      if (i % 2 === 0) {
        await handles[0]!.trip(`reason-${i}`);
      } else {
        await handles[0]!.clear();
      }
    }
    // Final state: i=19 was clear()
    for (const ctx of replicas) {
      expect(ctx.killSwitch.isKilled()).toBe(false);
    }

    // Now one final trip.
    await handles[0]!.trip("final");
    for (const ctx of replicas) {
      expect(ctx.killSwitch.isKilled()).toBe(true);
      expect(ctx.killSwitch.state().reason).toBe("final");
    }

    for (const h of handles) await h.stop();
  });

  it("concurrent trip from multiple replicas — last-write-wins on Redis", async () => {
    const { redis, store } = fakeRedis();
    const pubsub = fakePubSub();
    const ctxA = createRuntimeContext({ id: "A" });
    const ctxB = createRuntimeContext({ id: "B" });
    const a = startDistributedKillSwitchPubSub({
      redis,
      pubsub,
      key: "chaos:race",
      channel: "chaos:race:ch",
      pollMs: 60_000,
      context: ctxA,
    });
    const b = startDistributedKillSwitchPubSub({
      redis,
      pubsub,
      key: "chaos:race",
      channel: "chaos:race:ch",
      pollMs: 60_000,
      context: ctxB,
    });
    await new Promise((r) => setTimeout(r, 20));

    // Both trip simultaneously — Redis writes are serialized by the
    // fake's Map, so last write wins. The pub/sub propagates both
    // values; the final state of every replica MUST match the last
    // committed value.
    await Promise.all([a.trip("reason-A"), b.trip("reason-B")]);

    // Both replicas converge on the same value (whichever won the race).
    const stateA = ctxA.killSwitch.state();
    const stateB = ctxB.killSwitch.state();
    expect(stateA.active).toBe(true);
    expect(stateB.active).toBe(true);
    // No split brain: both replicas have the SAME reason.
    const storedRaw = store.get("chaos:race")!;
    const stored = JSON.parse(storedRaw) as { active: boolean; reason: string };
    expect(stateA.reason).toBe(stored.reason);
    expect(stateB.reason).toBe(stored.reason);

    await a.stop();
    await b.stop();
  });

  it("subscribe-storm (start/stop cycles) does not leak listeners", async () => {
    const { redis } = fakeRedis();
    const pubsub = fakePubSub();
    const ctx = createRuntimeContext({ id: "tenant" });

    for (let i = 0; i < 30; i++) {
      const h = startDistributedKillSwitchPubSub({
        redis,
        pubsub,
        key: "chaos:cycle",
        channel: "chaos:cycle:ch",
        pollMs: 60_000,
        context: ctx,
      });
      await new Promise((r) => setTimeout(r, 5));
      await h.stop();
    }
    // After every handle is stopped, listeners should be 0.
    const listeners = pubsub.listeners.get("chaos:cycle:ch");
    expect(listeners === undefined || listeners.size === 0).toBe(true);
  });

  it("pub/sub disconnect followed by reconnect does not lose the latest state", async () => {
    const { redis, store } = fakeRedis();
    const pubsub = fakePubSub();
    const ctx = createRuntimeContext({ id: "tenant" });
    const handle = startDistributedKillSwitchPubSub({
      redis,
      pubsub,
      key: "chaos:reconnect",
      channel: "chaos:reconnect:ch",
      pollMs: 40,
      context: ctx,
    });
    await new Promise((r) => setTimeout(r, 20));

    // Operator trips during pub/sub disconnect window.
    pubsub.forceDisconnect();
    store.set(
      "chaos:reconnect",
      JSON.stringify({ active: true, reason: "during-disconnect" }),
    );
    // Polling fallback eventually converges.
    const converged = await waitUntil(() => ctx.killSwitch.isKilled(), 300);
    expect(converged).toBe(true);
    expect(ctx.killSwitch.state().reason).toBe("during-disconnect");

    await handle.stop();
  });
});
