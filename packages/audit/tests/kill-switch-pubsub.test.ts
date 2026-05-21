/**
 * `startDistributedKillSwitchPubSub` — pub/sub + polling fallback.
 *
 * The acceptance test for v2 propagation: a remote PUBLISH propagates to
 * every subscriber's `RuntimeContext.killSwitch` within one event-loop
 * tick (no `pollMs` round-trip). The polling fallback continues to
 * guarantee eventual consistency when pub/sub fails.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  startDistributedKillSwitchPubSub,
  type RedisPubSubClient,
} from "../src/kill-switch-pubsub.js";
import {
  createRuntimeContext,
  _resetMetricsSink,
} from "@adjudicate/core/kernel";
import type { RedisLedgerClient } from "../src/ledger-redis.js";

interface FakePubSub extends RedisPubSubClient {
  readonly listeners: Map<string, Set<(m: string) => void>>;
  drop(channel: string): void;
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
          // Handler errors must not crash publishers.
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
    drop(channel) {
      listeners.delete(channel);
    },
  };
}

afterEach(() => {
  _resetMetricsSink();
});

describe("startDistributedKillSwitchPubSub", () => {
  it("applies a remote PUBLISH within one event-loop tick (sub-100 ms)", async () => {
    const { redis } = fakeRedis();
    const pubsub = fakePubSub();
    const ctx = createRuntimeContext({ id: "tenant" });
    const observed: Array<{ source: string; active: boolean }> = [];

    const handle = startDistributedKillSwitchPubSub({
      redis,
      pubsub,
      key: "ENV:kill",
      channel: "ENV:kill:channel",
      pollMs: 60_000, // poll cadence absurdly large; pub/sub must do the work
      context: ctx,
      onApply: (e) => observed.push({ source: e.source, active: e.active }),
    });

    // Wait for boot poll + subscribe to settle.
    await new Promise((r) => setTimeout(r, 20));

    const before = Date.now();
    await pubsub.publish(
      "ENV:kill:channel",
      JSON.stringify({ active: true, reason: "test-incident" }),
    );
    const after = Date.now();

    expect(ctx.killSwitch.isKilled()).toBe(true);
    expect(ctx.killSwitch.state().reason).toBe("test-incident");
    expect(after - before).toBeLessThan(50);
    expect(observed.some((o) => o.source === "pubsub")).toBe(true);

    await handle.stop();
  });

  it("boot poll resyncs state even if no PUBLISH ever fires", async () => {
    const { redis, store } = fakeRedis();
    const pubsub = fakePubSub();
    // Set state BEFORE process boot — common after a cold start.
    store.set(
      "ENV:kill",
      JSON.stringify({ active: true, reason: "pre-boot incident" }),
    );

    const ctx = createRuntimeContext({ id: "tenant" });
    const handle = startDistributedKillSwitchPubSub({
      redis,
      pubsub,
      key: "ENV:kill",
      channel: "ENV:kill:channel",
      pollMs: 60_000,
      context: ctx,
    });

    // Wait only for the boot resync — no polling, no pub/sub.
    await new Promise((r) => setTimeout(r, 20));
    expect(ctx.killSwitch.isKilled()).toBe(true);
    expect(ctx.killSwitch.state().reason).toBe("pre-boot incident");

    await handle.stop();
  });

  it("polling fallback converges when pub/sub is silent", async () => {
    const { redis, store } = fakeRedis();
    const pubsub = fakePubSub();
    const ctx = createRuntimeContext({ id: "tenant" });
    const observed: Array<{ source: string }> = [];

    const handle = startDistributedKillSwitchPubSub({
      redis,
      pubsub,
      key: "ENV:kill",
      channel: "ENV:kill:channel",
      pollMs: 40,
      context: ctx,
      onApply: (e) => observed.push({ source: e.source }),
    });

    // Wait for boot + subscribe.
    await new Promise((r) => setTimeout(r, 20));

    // Out-of-band write — no PUBLISH issued. Only polling can converge.
    store.set(
      "ENV:kill",
      JSON.stringify({ active: true, reason: "silent transition" }),
    );

    await new Promise((r) => setTimeout(r, 120));
    expect(ctx.killSwitch.isKilled()).toBe(true);
    expect(observed.some((o) => o.source === "poll")).toBe(true);

    await handle.stop();
  });

  it("trip() writes Redis AND publishes on the channel", async () => {
    const { redis, store } = fakeRedis();
    const pubsub = fakePubSub();
    const ctx = createRuntimeContext({ id: "tenant" });

    const handle = startDistributedKillSwitchPubSub({
      redis,
      pubsub,
      key: "ENV:kill",
      channel: "ENV:kill:channel",
      pollMs: 60_000,
      context: ctx,
    });
    await new Promise((r) => setTimeout(r, 20));

    await handle.trip("manual incident");

    // Redis was written.
    expect(JSON.parse(store.get("ENV:kill")!)).toEqual({
      active: true,
      reason: "manual incident",
    });
    // The same process's subscriber received the publish.
    expect(ctx.killSwitch.isKilled()).toBe(true);

    await handle.stop();
  });

  it("publish failure does not throw — polling resyncs as fallback", async () => {
    const { redis, store } = fakeRedis();
    const failingPubsub: RedisPubSubClient = {
      async publish() {
        throw new Error("pubsub down");
      },
      async subscribe() {
        return async () => {};
      },
    };
    const ctx = createRuntimeContext({ id: "tenant" });

    const handle = startDistributedKillSwitchPubSub({
      redis,
      pubsub: failingPubsub,
      key: "ENV:kill",
      channel: "ENV:kill:channel",
      pollMs: 30,
      context: ctx,
    });
    await new Promise((r) => setTimeout(r, 20));

    // trip() must not throw even though publish() does.
    await expect(handle.trip("incident")).resolves.toBeUndefined();

    // Redis was written, so polling converges.
    expect(JSON.parse(store.get("ENV:kill")!)).toEqual({
      active: true,
      reason: "incident",
    });

    await new Promise((r) => setTimeout(r, 80));
    expect(ctx.killSwitch.isKilled()).toBe(true);

    await handle.stop();
  });

  it("clear() publishes the cleared state and the kernel applies it", async () => {
    const { redis, store } = fakeRedis();
    const pubsub = fakePubSub();
    store.set(
      "ENV:kill",
      JSON.stringify({ active: true, reason: "initial" }),
    );
    const ctx = createRuntimeContext({ id: "tenant" });
    const handle = startDistributedKillSwitchPubSub({
      redis,
      pubsub,
      key: "ENV:kill",
      channel: "ENV:kill:channel",
      pollMs: 60_000,
      context: ctx,
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(ctx.killSwitch.isKilled()).toBe(true);

    await handle.clear();

    expect(ctx.killSwitch.isKilled()).toBe(false);
    expect(JSON.parse(store.get("ENV:kill")!)).toEqual({
      active: false,
      reason: "cleared",
    });

    await handle.stop();
  });

  it("malformed pub/sub messages are surfaced as sink failures, not crashes", async () => {
    const { redis } = fakeRedis();
    const pubsub = fakePubSub();
    const ctx = createRuntimeContext({ id: "tenant" });

    const handle = startDistributedKillSwitchPubSub({
      redis,
      pubsub,
      key: "ENV:kill",
      channel: "ENV:kill:channel",
      pollMs: 60_000,
      context: ctx,
    });
    await new Promise((r) => setTimeout(r, 20));

    // Garbage message.
    await pubsub.publish("ENV:kill:channel", "not json at all");

    // No crash, state unchanged.
    expect(ctx.killSwitch.isKilled()).toBe(false);

    await handle.stop();
  });

  it("stop() unsubscribes and halts the poller", async () => {
    const { redis, store } = fakeRedis();
    const pubsub = fakePubSub();
    const ctx = createRuntimeContext({ id: "tenant" });

    const handle = startDistributedKillSwitchPubSub({
      redis,
      pubsub,
      key: "ENV:kill",
      channel: "ENV:kill:channel",
      pollMs: 30,
      context: ctx,
    });
    await new Promise((r) => setTimeout(r, 50));

    await handle.stop();

    // After stop, neither path propagates.
    store.set(
      "ENV:kill",
      JSON.stringify({ active: true, reason: "post-stop" }),
    );
    await pubsub.publish(
      "ENV:kill:channel",
      JSON.stringify({ active: true, reason: "post-stop pubsub" }),
    );
    await new Promise((r) => setTimeout(r, 100));
    expect(ctx.killSwitch.isKilled()).toBe(false);
  });

  it("two replicas converge on the same transition (no split-brain)", async () => {
    const { redis } = fakeRedis();
    const pubsub = fakePubSub();
    const ctxA = createRuntimeContext({ id: "tenant-a" });
    const ctxB = createRuntimeContext({ id: "tenant-b" });

    const handleA = startDistributedKillSwitchPubSub({
      redis,
      pubsub,
      key: "ENV:kill",
      channel: "ENV:kill:channel",
      pollMs: 60_000,
      context: ctxA,
    });
    const handleB = startDistributedKillSwitchPubSub({
      redis,
      pubsub,
      key: "ENV:kill",
      channel: "ENV:kill:channel",
      pollMs: 60_000,
      context: ctxB,
    });
    await new Promise((r) => setTimeout(r, 20));

    await handleA.trip("incident-1");

    expect(ctxA.killSwitch.isKilled()).toBe(true);
    expect(ctxB.killSwitch.isKilled()).toBe(true);
    expect(ctxA.killSwitch.state().reason).toBe("incident-1");
    expect(ctxB.killSwitch.state().reason).toBe("incident-1");

    await handleA.stop();
    await handleB.stop();
  });
});
