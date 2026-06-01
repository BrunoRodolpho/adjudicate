import { afterEach, describe, expect, it } from "vitest";
import {
  _resetMetricsSink,
  setMetricsSink,
  type MetricsSink,
  type SinkFailureEvent,
} from "@adjudicate/core/kernel";
import { createMemoryLedger } from "../src/ledger-memory.js";
import { createRedisLedger, type RedisLedgerClient } from "../src/ledger-redis.js";

function spyMetricsSink(failures: SinkFailureEvent[]): MetricsSink {
  return {
    recordLedgerOp() {},
    recordDecision() {},
    recordRefusal() {},
    recordSinkFailure(e) {
      failures.push(e);
    },
    recordShadowDivergence() {},
    recordResourceLimit() {},
  };
}

describe("ExecutionLedger — memory implementation", () => {
  it("returns null for unknown intents", async () => {
    const ledger = createMemoryLedger();
    expect(await ledger.checkLedger("unknown-hash")).toBe(null);
  });

  it("records and retrieves", async () => {
    const ledger = createMemoryLedger();
    await ledger.recordExecution({
      intentHash: "h1",
      resourceVersion: "v1",
      sessionId: "s1",
      kind: "order.tool.propose",
    });
    const hit = await ledger.checkLedger("h1");
    expect(hit).not.toBe(null);
    expect(hit?.resourceVersion).toBe("v1");
    expect(hit?.kind).toBe("order.tool.propose");
  });

  it("is idempotent — second record() with same hash does not overwrite", async () => {
    const ledger = createMemoryLedger();
    await ledger.recordExecution({
      intentHash: "h2",
      resourceVersion: "v1",
      sessionId: "s1",
      kind: "x",
    });
    await ledger.recordExecution({
      intentHash: "h2",
      resourceVersion: "v2",
      sessionId: "s1",
      kind: "x",
    });
    const hit = await ledger.checkLedger("h2");
    expect(hit?.resourceVersion).toBe("v1");
  });
});

describe("ExecutionLedger — Redis implementation", () => {
  afterEach(() => {
    _resetMetricsSink();
  });

  function mockRedis(): {
    client: RedisLedgerClient;
    store: Map<string, string>;
    setCalls: Array<{ key: string; value: string; options?: { NX?: boolean; EX?: number } }>;
  } {
    const store = new Map<string, string>();
    const setCalls: Array<{
      key: string;
      value: string;
      options?: { NX?: boolean; EX?: number };
    }> = [];
    const client: RedisLedgerClient = {
      async set(key, value, options) {
        setCalls.push({ key, value, ...(options ? { options } : {}) });
        if (options?.NX && store.has(key)) return null;
        store.set(key, value);
        return "OK";
      },
      async get(key) {
        return store.get(key) ?? null;
      },
    };
    return { client, store, setCalls };
  }

  it("builds namespaced keys via keyFor()", async () => {
    const { client, setCalls } = mockRedis();
    const ledger = createRedisLedger({
      client,
      keyFor: (suffix) => `dev:${suffix}`,
    });
    await ledger.recordExecution({
      intentHash: "abc",
      resourceVersion: "v1",
      sessionId: "s",
      kind: "k",
    });
    expect(setCalls[0]!.key).toBe("dev:ledger:intent:abc");
    expect(setCalls[0]!.options).toEqual({ NX: true, EX: 14 * 24 * 60 * 60 });
  });

  it("returns LedgerHit after record", async () => {
    const { client } = mockRedis();
    const ledger = createRedisLedger({ client, keyFor: (s) => s });
    await ledger.recordExecution({
      intentHash: "x",
      resourceVersion: "v1",
      sessionId: "sess",
      kind: "order.tool.propose",
    });
    const hit = await ledger.checkLedger("x");
    expect(hit?.resourceVersion).toBe("v1");
    expect(hit?.kind).toBe("order.tool.propose");
    expect(hit?.sessionId).toBe("sess");
  });

  it("returns null on malformed payload (corruption-safe)", async () => {
    const store = new Map<string, string>();
    store.set("ledger:intent:x", "not-json{}{");
    const client: RedisLedgerClient = {
      async set() {
        return "OK";
      },
      async get(key) {
        return store.get(key) ?? null;
      },
    };
    const ledger = createRedisLedger({ client, keyFor: (s) => s });
    expect(await ledger.checkLedger("x")).toBe(null);
  });

  it("checkLedger calls recordSinkFailure when stored value is not valid JSON", async () => {
    const failures: SinkFailureEvent[] = [];
    setMetricsSink(spyMetricsSink(failures));

    const store = new Map<string, string>();
    store.set("ledger:intent:corrupt", "CORRUPT");
    const client: RedisLedgerClient = {
      async set() {
        return "OK";
      },
      async get(key) {
        return store.get(key) ?? null;
      },
    };
    const ledger = createRedisLedger({ client, keyFor: (s) => s });

    // Behavior unchanged: a JSON.parse throw is still surfaced as a cache miss.
    expect(await ledger.checkLedger("corrupt")).toBe(null);

    // ErrorReviewer-001: the parse failure is now visible to operators.
    expect(failures).toHaveLength(1);
    expect(failures[0]!.sink).toBe("buffered");
    expect(failures[0]!.subject).toBe("ledger:intent:corrupt");
    expect(failures[0]!.errorClass).toBe("SyntaxError");
  });

  it("SET NX prevents overwrite — first writer wins", async () => {
    const { client, store } = mockRedis();
    const ledger = createRedisLedger({ client, keyFor: (s) => s });
    await ledger.recordExecution({
      intentHash: "y",
      resourceVersion: "v1",
      sessionId: "s1",
      kind: "k",
    });
    await ledger.recordExecution({
      intentHash: "y",
      resourceVersion: "v2",
      sessionId: "s2",
      kind: "k",
    });
    const stored = JSON.parse(store.get("ledger:intent:y")!) as {
      resourceVersion: string;
    };
    expect(stored.resourceVersion).toBe("v1");
  });

  it("respects custom TTL", async () => {
    const { client, setCalls } = mockRedis();
    const ledger = createRedisLedger({
      client,
      keyFor: (s) => s,
      ttlSeconds: 60,
    });
    await ledger.recordExecution({
      intentHash: "z",
      resourceVersion: "v",
      sessionId: "s",
      kind: "k",
    });
    expect(setCalls[0]!.options?.EX).toBe(60);
  });
});
