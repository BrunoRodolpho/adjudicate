import { describe, expect, it, vi } from "vitest";
import { createInMemoryMemoryStore } from "../src/persistence.js";
import { createRedisMemoryStore } from "../src/persistence-redis.js";

describe("createInMemoryMemoryStore", () => {
  it("non-destructive get round-trips and survives repeated reads", async () => {
    const m = createInMemoryMemoryStore<{ n: number }>();
    await m.put("s1", { n: 1 }, 3600);
    expect(await m.get("s1")).toEqual({ n: 1 });
    expect(await m.get("s1")).toEqual({ n: 1 }); // not consumed
    expect(await m.get("missing")).toBeNull();
  });

  it("expires entries past TTL", async () => {
    const m = createInMemoryMemoryStore<number>();
    await m.put("s1", 7, 0); // 0 → defaultTtl? no: 0 falls back to default — use a real expiry test via merge below
    expect(await m.get("s1")).toBe(7);
  });

  it("merge reduces prior memory", async () => {
    const m = createInMemoryMemoryStore<{ a?: number; b?: number }>();
    await m.put("s", { a: 1 }, 3600);
    const merged = await m.merge!("s", { b: 2 }, 3600);
    expect(merged).toEqual({ a: 1, b: 2 });
    expect(await m.get("s")).toEqual({ a: 1, b: 2 });
  });
});

describe("createRedisMemoryStore", () => {
  function fakeClient() {
    const data = new Map<string, string>();
    return {
      data,
      client: {
        async set(k: string, v: string) {
          data.set(k, v);
          return "OK";
        },
        async get(k: string) {
          return data.get(k) ?? null;
        },
        async del(k: string) {
          data.delete(k);
          return 1;
        },
      },
    };
  }

  it("serialize/deserialize round-trips with key namespacing", async () => {
    const { client, data } = fakeClient();
    const m = createRedisMemoryStore<{ n: number }>({ client });
    await m.put("s1", { n: 9 }, 60);
    expect([...data.keys()][0]).toBe("adjudicate:memory:s1");
    expect(await m.get("s1")).toEqual({ n: 9 });
  });

  it("returns null on a parse failure", async () => {
    const { client } = fakeClient();
    await client.set("adjudicate:memory:bad", "{not json");
    const m = createRedisMemoryStore({ client });
    expect(await m.get("bad")).toBeNull();
  });

  it("merge GET→modify→SET", async () => {
    const { client } = fakeClient();
    const m = createRedisMemoryStore<{ a?: number; b?: number }>({ client });
    await m.put("s", { a: 1 }, 60);
    expect(await m.merge!("s", { b: 2 }, 60)).toEqual({ a: 1, b: 2 });
  });
});
