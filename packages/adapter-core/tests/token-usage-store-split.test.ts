import { describe, expect, it } from "vitest";
import { createInMemoryTokenUsageStore } from "../src/index.js";

describe("token-usage-store — prompt/completion split accumulation (item 3)", () => {
  it("accumulates the reported split across samples, per session AND tenant", () => {
    const store = createInMemoryTokenUsageStore({ sessionBudget: 10_000 });
    store.record({ sessionId: "s1", tenantId: "t1", prompt: 100, completion: 40, at: "2026-06-07T00:00:00.000Z" });
    store.record({ sessionId: "s1", tenantId: "t1", prompt: 50, completion: 10, at: "2026-06-07T00:01:00.000Z" });

    const sess = store.sessions({ sessionId: "s1" })[0]!;
    expect(sess.promptConsumed).toBe(150);
    expect(sess.completionConsumed).toBe(50);
    expect(sess.consumed).toBe(200); // no explicit total -> total = prompt + completion

    const ten = store.tenants({ tenantId: "t1" })[0]!;
    expect(ten.promptConsumed).toBe(150);
    expect(ten.completionConsumed).toBe(50);
  });

  it("total-only samples contribute to consumed but 0 to the split", () => {
    const store = createInMemoryTokenUsageStore({});
    store.record({ sessionId: "s2", total: 500, at: "2026-06-07T00:00:00.000Z" });
    const sess = store.sessions({ sessionId: "s2" })[0]!;
    expect(sess.consumed).toBe(500);
    expect(sess.promptConsumed).toBe(0);
    expect(sess.completionConsumed).toBe(0);
  });

  it("total + split: consumed uses total; split accumulates independently", () => {
    const store = createInMemoryTokenUsageStore({});
    store.record({ sessionId: "s3", total: 1000, prompt: 700, completion: 300, at: "2026-06-07T00:00:00.000Z" });
    const sess = store.sessions({ sessionId: "s3" })[0]!;
    expect(sess.consumed).toBe(1000);
    expect(sess.promptConsumed).toBe(700);
    expect(sess.completionConsumed).toBe(300);
  });
});
