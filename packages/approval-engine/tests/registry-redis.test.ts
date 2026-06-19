import { describe, expect, it } from "vitest";
import {
  createRedisApprovalRegistry,
  type ApprovalRedisClient,
  type ApprovalRequest,
} from "../src/index.js";

/**
 * In-memory fake of the minimal `ApprovalRedisClient` the registry injects.
 * `keys` is glob-prefix matching (only the trailing `*` form is used). Counts
 * `set` calls so idempotency tests can assert no redundant write.
 */
function fakeRedis() {
  const store = new Map<string, string>();
  let sets = 0;
  const client: ApprovalRedisClient = {
    async set(key, value) {
      sets += 1;
      store.set(key, value);
    },
    async get(key) {
      return store.get(key) ?? null;
    },
    async del(key) {
      return store.delete(key) ? 1 : 0;
    },
    async keys(pattern) {
      const prefix = pattern.endsWith("*") ? pattern.slice(0, -1) : pattern;
      return [...store.keys()].filter((k) => k.startsWith(prefix));
    },
  };
  return { client, store, setCount: () => sets };
}

const base: ApprovalRequest = {
  token: "t1",
  sessionId: "s1",
  intentHash: "0x1",
  intentKind: "deployment.rollback.execute",
  prompt: "Confirm rollback?",
  taint: "UNTRUSTED",
  channel: "console-log",
  status: "pending",
  requestedAt: "2026-04-29T12:00:00.000Z",
};

describe("createRedisApprovalRegistry", () => {
  it("put/get round-trips a projection", async () => {
    const { client } = fakeRedis();
    const r = createRedisApprovalRegistry({ redis: client });
    await r.put(base, 3600);
    const got = await r.get("t1");
    expect(got?.token).toBe("t1");
    expect(got?.intentKind).toBe("deployment.rollback.execute");
    expect(got?.status).toBe("pending");
  });

  it("get returns null for an unknown token", async () => {
    const { client } = fakeRedis();
    const r = createRedisApprovalRegistry({ redis: client });
    expect(await r.get("missing")).toBeNull();
  });

  // ── 072 — separation-of-duty proposer projection round-trips through Redis ──
  it("round-trips the requestedBy (proposer) projection field", async () => {
    const { client, store } = fakeRedis();
    const r = createRedisApprovalRegistry({ redis: client });
    await r.put(
      { ...base, requestedBy: { id: "maker-mallory", displayName: "Mallory" } },
      3600,
    );
    // Persisted in the JSON blob...
    const raw = [...store.values()][0]!;
    expect(JSON.parse(raw).requestedBy).toEqual({
      id: "maker-mallory",
      displayName: "Mallory",
    });
    // ...and rehydrated on read.
    expect((await r.get("t1"))?.requestedBy?.id).toBe("maker-mallory");
    expect((await r.list())[0]?.requestedBy?.displayName).toBe("Mallory");
  });

  it("never persists an envelope blob — only display fields round-trip", async () => {
    const { client, store } = fakeRedis();
    const r = createRedisApprovalRegistry({ redis: client });
    await r.put(base, 3600);
    const raw = [...store.values()][0]!;
    expect(raw).not.toMatch(/envelope/i);
    expect(JSON.parse(raw)).toMatchObject({ token: "t1", intentHash: "0x1" });
  });

  it("list enumerates via prefix-scoped keys, newest-first, with status + session filters", async () => {
    const { client } = fakeRedis();
    const r = createRedisApprovalRegistry({ redis: client });
    await r.put(base, 3600);
    await r.put(
      { ...base, token: "t2", sessionId: "s2", requestedAt: "2026-04-29T12:05:00.000Z" },
      3600,
    );
    await r.put(
      { ...base, token: "t3", status: "approved", requestedAt: "2026-04-29T12:02:00.000Z" },
      3600,
    );

    const all = await r.list();
    expect(all.map((x) => x.token)).toEqual(["t2", "t3", "t1"]); // newest-first

    expect((await r.list({ status: "pending" })).map((x) => x.token)).toEqual(["t2", "t1"]);
    expect((await r.list({ sessionId: "s2" })).map((x) => x.token)).toEqual(["t2"]);
    expect((await r.list({ limit: 1 })).map((x) => x.token)).toEqual(["t2"]);
  });

  it("list does not leak keys from a different prefix", async () => {
    const { client } = fakeRedis();
    const a = createRedisApprovalRegistry({ redis: client, keyPrefix: "tenantA:approval" });
    const b = createRedisApprovalRegistry({ redis: client, keyPrefix: "tenantB:approval" });
    await a.put(base, 3600);
    await b.put({ ...base, token: "t2" }, 3600);
    expect((await a.list()).map((x) => x.token)).toEqual(["t1"]);
    expect((await b.list()).map((x) => x.token)).toEqual(["t2"]);
  });

  it("markResolved transitions status and stamps resolvedBy/resolvedAt", async () => {
    const { client } = fakeRedis();
    const r = createRedisApprovalRegistry({
      redis: client,
      nowIso: () => "2026-04-29T13:00:00.000Z",
    });
    await r.put(base, 3600);
    const resolved = await r.markResolved("t1", "approved", { id: "alice", displayName: "Alice" });
    expect(resolved?.status).toBe("approved");
    expect(resolved?.resolvedBy?.id).toBe("alice");
    expect(resolved?.resolvedAt).toBe("2026-04-29T13:00:00.000Z");
    // Persisted, not just returned.
    expect((await r.get("t1"))?.status).toBe("approved");
  });

  it("markResolved returns null for an unknown token", async () => {
    const { client } = fakeRedis();
    const r = createRedisApprovalRegistry({ redis: client });
    expect(await r.markResolved("nope", "approved")).toBeNull();
  });

  it("re-resolve is idempotent — keeps the first resolution, no second SET", async () => {
    const { client, setCount } = fakeRedis();
    const r = createRedisApprovalRegistry({ redis: client, nowIso: () => "2026-04-29T13:00:00.000Z" });
    await r.put(base, 3600);
    const setsAfterPut = setCount();
    const first = await r.markResolved("t1", "approved", { id: "alice" });
    const setsAfterFirst = setCount();
    expect(setsAfterFirst).toBe(setsAfterPut + 1);

    // Second resolve with a DIFFERENT status/actor must NOT overwrite.
    const second = await r.markResolved("t1", "declined", { id: "mallory" });
    expect(setCount()).toBe(setsAfterFirst); // no extra write
    expect(second?.status).toBe("approved");
    expect(second?.resolvedBy?.id).toBe("alice");
    expect(second).toEqual(first);
  });
});
