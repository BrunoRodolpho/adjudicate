/**
 * Redis-backed token-usage telemetry store (ADR-135 durable variant). Reads the
 * live `llm:tokens:*` keyspace via SCAN into an in-memory snapshot; reads stay
 * synchronous, `refresh()` self-throttles. Tested with a fake Redis client.
 */
import { describe, expect, it, vi } from "vitest";
import {
  createRedisTokenUsageStore,
  type TokenUsageRedisClient,
} from "../src/token-usage-store-redis.js";

function fakeRedis(entries: Record<string, string>): TokenUsageRedisClient & {
  store: Map<string, string>;
} {
  const store = new Map(Object.entries(entries));
  return {
    store,
    async scan(pattern: string) {
      // Minimal glob: only `prefix:*` is used here.
      const prefix = pattern.endsWith("*") ? pattern.slice(0, -1) : pattern;
      return [...store.keys()].filter((k) => k.startsWith(prefix));
    },
    async get(key: string) {
      return store.get(key) ?? null;
    },
  };
}

describe("createRedisTokenUsageStore — refresh + read", () => {
  it("folds JSON values from llm:tokens:* into the session view", async () => {
    const redis = fakeRedis({
      "llm:tokens:sess-a": JSON.stringify({
        tenantId: "acme",
        total: 1000,
        at: "2026-06-07T00:00:00.000Z",
      }),
      "llm:tokens:sess-b": JSON.stringify({ tenantId: "acme", total: 500, at: "2026-06-07T00:01:00.000Z" }),
    });
    const store = createRedisTokenUsageStore({ redis, sessionBudget: 2000 });
    await store.refresh();

    const sessions = store.sessions();
    expect(sessions).toHaveLength(2);
    expect(sessions.find((s) => s.sessionId === "sess-a")).toMatchObject({
      sessionId: "sess-a",
      tenantId: "acme",
      consumed: 1000,
      budget: 2000,
    });
    expect(store.totalConsumed()).toBe(1500);
    const tenants = store.tenants();
    expect(tenants).toHaveLength(1);
    expect(tenants[0]).toMatchObject({ tenantId: "acme", consumed: 1500, sessionCount: 2 });
  });

  it("parses a bare-integer value as a combined total (tenant unknown)", async () => {
    const redis = fakeRedis({ "llm:tokens:sess-x": "777" });
    const store = createRedisTokenUsageStore({ redis });
    await store.refresh();
    const s = store.sessions();
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ sessionId: "sess-x", consumed: 777 });
    expect(s[0]!.tenantId).toBeUndefined();
  });

  it("skips malformed values without throwing", async () => {
    const redis = fakeRedis({
      "llm:tokens:good": "100",
      "llm:tokens:bad": "{not json",
      "llm:tokens:empty": "",
      "llm:tokens:noqty": JSON.stringify({ tenantId: "x" }),
    });
    const store = createRedisTokenUsageStore({ redis });
    await store.refresh();
    const s = store.sessions();
    expect(s).toHaveLength(1);
    expect(s[0]!.sessionId).toBe("good");
  });

  it("derives sessionId from the key suffix when the value omits it", async () => {
    const redis = fakeRedis({ "llm:tokens:sess-from-key": JSON.stringify({ total: 42 }) });
    const store = createRedisTokenUsageStore({ redis });
    await store.refresh();
    expect(store.sessions()[0]?.sessionId).toBe("sess-from-key");
  });

  it("self-throttles refresh to at most once per cacheTtlMs", async () => {
    const redis = fakeRedis({ "llm:tokens:s": "1" });
    const scanSpy = vi.spyOn(redis, "scan");
    const store = createRedisTokenUsageStore({ redis, cacheTtlMs: 60_000 });
    await store.refresh();
    await store.refresh();
    await store.refresh();
    expect(scanSpy).toHaveBeenCalledTimes(1);
  });

  it("rebuilds the snapshot wholesale so deleted keys drop out", async () => {
    const redis = fakeRedis({ "llm:tokens:s1": "100", "llm:tokens:s2": "200" });
    const store = createRedisTokenUsageStore({ redis, cacheTtlMs: 0 });
    await store.refresh();
    expect(store.sessions()).toHaveLength(2);
    redis.store.delete("llm:tokens:s2");
    await store.refresh();
    const s = store.sessions();
    expect(s).toHaveLength(1);
    expect(s[0]!.sessionId).toBe("s1");
  });

  it("fails open: a scan error keeps the prior snapshot and reports", async () => {
    const redis = fakeRedis({ "llm:tokens:s": "100" });
    const onRefreshError = vi.fn();
    const store = createRedisTokenUsageStore({ redis, cacheTtlMs: 0, onRefreshError });
    await store.refresh();
    expect(store.sessions()).toHaveLength(1);
    vi.spyOn(redis, "scan").mockRejectedValueOnce(new Error("redis down"));
    await store.refresh();
    // prior snapshot still serves
    expect(store.sessions()).toHaveLength(1);
    expect(onRefreshError).toHaveBeenCalledOnce();
  });

  it("honors a custom keyPrefix", async () => {
    const redis = fakeRedis({ "custom:tok:abc": "9" });
    const store = createRedisTokenUsageStore({ redis, keyPrefix: "custom:tok" });
    await store.refresh();
    expect(store.sessions()[0]?.sessionId).toBe("abc");
  });
});

// #28-8: when the client exposes mget, refresh() reads via chunked MGET instead
// of N per-key GETs (falling back to GET when mget is absent — covered above).
describe("createRedisTokenUsageStore — mget fast path (#28-8)", () => {
  function fakeRedisWithMget(entries: Record<string, string>): TokenUsageRedisClient & {
    getCalls: number;
    mgetBatchSizes: number[];
  } {
    const store = new Map(Object.entries(entries));
    const self = {
      getCalls: 0,
      mgetBatchSizes: [] as number[],
      async scan(pattern: string) {
        const prefix = pattern.endsWith("*") ? pattern.slice(0, -1) : pattern;
        return [...store.keys()].filter((k) => k.startsWith(prefix));
      },
      async get(key: string) {
        self.getCalls++;
        return store.get(key) ?? null;
      },
      async mget(keys: readonly string[]) {
        self.mgetBatchSizes.push(keys.length);
        return keys.map((k) => store.get(k) ?? null);
      },
    };
    return self;
  }

  it("uses mget (never per-key get) and folds the values", async () => {
    const redis = fakeRedisWithMget({
      "llm:tokens:a": "100",
      "llm:tokens:b": "250",
    });
    const store = createRedisTokenUsageStore({ redis });
    await store.refresh();
    expect(redis.getCalls).toBe(0);
    expect(redis.mgetBatchSizes).toEqual([2]);
    expect(store.totalConsumed()).toBe(350);
  });

  it("chunks into batches of 500", async () => {
    const entries: Record<string, string> = {};
    for (let i = 0; i < 600; i++) entries[`llm:tokens:s${i}`] = "1";
    const redis = fakeRedisWithMget(entries);
    const store = createRedisTokenUsageStore({ redis });
    await store.refresh();
    expect(redis.getCalls).toBe(0);
    // 600 keys → one full 500 batch + one 100 batch.
    expect(redis.mgetBatchSizes).toHaveLength(2);
    expect(redis.mgetBatchSizes[0]).toBe(500);
    expect(redis.mgetBatchSizes[1]).toBe(100);
    expect(store.totalConsumed()).toBe(600);
  });
});
