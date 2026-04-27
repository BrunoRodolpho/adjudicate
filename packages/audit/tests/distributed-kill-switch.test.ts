/**
 * T7 (#15, #40, top-priority C) — distributed kill switch via polled Redis.
 *
 * Verifies the acceptance test: with `pollMs: 200`, a remote `redis SET`
 * propagates to the runtime context's kill-switch within `pollMs * 2`.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { startDistributedKillSwitch } from "../src/distributed-kill-switch.js";
import {
  createRuntimeContext,
  _resetMetricsSink,
  setMetricsSink,
  type MetricsSink,
  type SinkFailureEvent,
} from "@adjudicate/core/kernel";
import type { RedisLedgerClient } from "../src/ledger-redis.js";

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

afterEach(() => {
  _resetMetricsSink();
});

describe("startDistributedKillSwitch", () => {
  it("polls the Redis key and applies the active state to the context", async () => {
    const { redis, store } = fakeRedis();
    store.set(
      "ENV:adjudicate:kill",
      JSON.stringify({ active: true, reason: "test-incident" }),
    );
    const ctx = createRuntimeContext({ id: "tenant" });
    const handle = startDistributedKillSwitch({
      redis,
      key: "ENV:adjudicate:kill",
      pollMs: 50,
      context: ctx,
    });
    // Wait for at least one poll.
    await new Promise((r) => setTimeout(r, 120));
    expect(ctx.killSwitch.isKilled()).toBe(true);
    expect(ctx.killSwitch.state().reason).toBe("test-incident");
    await handle.stop();
  });

  it("does not set state when the key is absent", async () => {
    const { redis } = fakeRedis();
    const ctx = createRuntimeContext({ id: "tenant" });
    const handle = startDistributedKillSwitch({
      redis,
      key: "ENV:adjudicate:kill",
      pollMs: 50,
      context: ctx,
    });
    await new Promise((r) => setTimeout(r, 120));
    expect(ctx.killSwitch.isKilled()).toBe(false);
    await handle.stop();
  });

  it("toggles back to inactive on a state transition", async () => {
    const { redis, store } = fakeRedis();
    store.set(
      "ENV:adjudicate:kill",
      JSON.stringify({ active: true, reason: "incident" }),
    );
    const ctx = createRuntimeContext({ id: "tenant" });
    const handle = startDistributedKillSwitch({
      redis,
      key: "ENV:adjudicate:kill",
      pollMs: 30,
      context: ctx,
    });
    await new Promise((r) => setTimeout(r, 100));
    expect(ctx.killSwitch.isKilled()).toBe(true);
    // Operator clears via the handle.
    await handle.clear();
    await new Promise((r) => setTimeout(r, 100));
    expect(ctx.killSwitch.isKilled()).toBe(false);
    await handle.stop();
  });

  it("trip() and clear() are convenience wrappers around redis.set", async () => {
    const { redis, store } = fakeRedis();
    const ctx = createRuntimeContext({ id: "tenant" });
    const handle = startDistributedKillSwitch({
      redis,
      key: "ENV:adjudicate:kill",
      pollMs: 30,
      context: ctx,
    });
    await handle.trip("manual-test");
    expect(JSON.parse(store.get("ENV:adjudicate:kill")!)).toEqual({
      active: true,
      reason: "manual-test",
    });
    await handle.clear();
    expect(JSON.parse(store.get("ENV:adjudicate:kill")!)).toEqual({
      active: false,
      reason: "cleared",
    });
    await handle.stop();
  });

  it("records sink failure on Redis GET error", async () => {
    const failures: SinkFailureEvent[] = [];
    const metrics: MetricsSink = {
      recordLedgerOp() {},
      recordDecision() {},
      recordRefusal() {},
      recordSinkFailure(e) {
        failures.push(e);
      },
      recordShadowDivergence() {},
      recordResourceLimit() {},
    };
    setMetricsSink(metrics);

    const errorRedis: RedisLedgerClient = {
      async get() {
        throw new Error("redis down");
      },
      async set() {
        return "OK";
      },
    };
    const ctx = createRuntimeContext({ id: "tenant" });
    const handle = startDistributedKillSwitch({
      redis: errorRedis,
      key: "ENV:adjudicate:kill",
      pollMs: 30,
      context: ctx,
    });
    await new Promise((r) => setTimeout(r, 80));
    expect(failures.some((f) => f.subject === "distributed-kill-switch")).toBe(true);
    expect(failures.some((f) => f.errorClass === "redis_get")).toBe(true);
    await handle.stop();
  });

  it("records sink failure on malformed payload", async () => {
    const failures: SinkFailureEvent[] = [];
    const metrics: MetricsSink = {
      recordLedgerOp() {},
      recordDecision() {},
      recordRefusal() {},
      recordSinkFailure(e) {
        failures.push(e);
      },
      recordShadowDivergence() {},
      recordResourceLimit() {},
    };
    setMetricsSink(metrics);

    const { redis, store } = fakeRedis();
    store.set("ENV:adjudicate:kill", "not-valid-json");
    const ctx = createRuntimeContext({ id: "tenant" });
    const handle = startDistributedKillSwitch({
      redis,
      key: "ENV:adjudicate:kill",
      pollMs: 30,
      context: ctx,
    });
    await new Promise((r) => setTimeout(r, 80));
    expect(failures.some((f) => f.errorClass === "redis_payload")).toBe(true);
    await handle.stop();
  });

  it("stop() prevents further polling", async () => {
    const { redis, store } = fakeRedis();
    store.set(
      "ENV:adjudicate:kill",
      JSON.stringify({ active: false, reason: "ok" }),
    );
    const ctx = createRuntimeContext({ id: "tenant" });
    const handle = startDistributedKillSwitch({
      redis,
      key: "ENV:adjudicate:kill",
      pollMs: 30,
      context: ctx,
    });
    await new Promise((r) => setTimeout(r, 60));
    await handle.stop();
    // After stop, mutations should not propagate.
    store.set(
      "ENV:adjudicate:kill",
      JSON.stringify({ active: true, reason: "after-stop" }),
    );
    await new Promise((r) => setTimeout(r, 100));
    expect(ctx.killSwitch.isKilled()).toBe(false);
  });

  it("invokes optional logger on poll errors", async () => {
    const warnings: Array<{ reason: string }> = [];
    const errorRedis: RedisLedgerClient = {
      async get() {
        throw new Error("offline");
      },
      async set() {
        return "OK";
      },
    };
    const ctx = createRuntimeContext({ id: "tenant" });
    const handle = startDistributedKillSwitch({
      redis: errorRedis,
      key: "ENV:adjudicate:kill",
      pollMs: 30,
      context: ctx,
      logger: { warn: (e) => warnings.push(e) },
    });
    await new Promise((r) => setTimeout(r, 80));
    expect(warnings.some((w) => w.reason.includes("offline"))).toBe(true);
    await handle.stop();
  });
});
