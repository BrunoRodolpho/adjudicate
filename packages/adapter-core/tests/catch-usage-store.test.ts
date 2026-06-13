import { describe, expect, it } from "vitest";
import { createInMemoryCatchUsageStore } from "../src/index.js";

const at = "2026-06-07T00:00:00.000Z";

describe("createInMemoryCatchUsageStore (item 7)", () => {
  it("counts total + byReason + byTool", () => {
    const store = createInMemoryCatchUsageStore();
    store.record({ toolName: "delete_db", reason: "out_of_plan", at });
    store.record({ toolName: "delete_db", reason: "out_of_plan", at });
    store.record({ toolName: "drop_table", reason: "out_of_plan", at });

    const c = store.counts();
    expect(c.total).toBe(3);
    expect(store.total()).toBe(3);
    expect(c.byReason).toEqual({ out_of_plan: 3 });
    expect(c.byTool).toEqual([
      { toolName: "delete_db", count: 2 },
      { toolName: "drop_table", count: 1 },
    ]);
  });

  it("byTool is sorted by count desc, then toolName asc", () => {
    const store = createInMemoryCatchUsageStore();
    store.record({ toolName: "b", reason: "out_of_plan", at });
    store.record({ toolName: "a", reason: "out_of_plan", at });
    store.record({ toolName: "a", reason: "out_of_plan", at });
    expect(store.counts().byTool).toEqual([
      { toolName: "a", count: 2 },
      { toolName: "b", count: 1 },
    ]);
  });

  it("bounds tool cardinality via LRU (maxTools)", () => {
    const store = createInMemoryCatchUsageStore({ maxTools: 2 });
    store.record({ toolName: "t1", reason: "out_of_plan", at });
    store.record({ toolName: "t2", reason: "out_of_plan", at });
    store.record({ toolName: "t3", reason: "out_of_plan", at }); // evicts t1 (oldest)
    const tools = store.counts().byTool.map((t) => t.toolName).sort();
    expect(tools).toEqual(["t2", "t3"]);
    // total still counts every catch, even evicted ones.
    expect(store.counts().total).toBe(3);
  });

  it("is empty before any record", () => {
    const store = createInMemoryCatchUsageStore();
    expect(store.counts()).toEqual({ total: 0, byReason: {}, byTool: [] });
  });
});
