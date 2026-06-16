/**
 * Postgres-backed MemoryStore (ADR-126 durable variant). Read-only: joins
 * sessionId → customer_id via intent_audit, folds claustrum semantic +
 * relational rows. Fail-open to null. Tested with a fake SqlExecutor.
 */
import { describe, expect, it, vi } from "vitest";
import {
  createPostgresMemoryStore,
  type MemorySqlExecutor,
} from "../src/persistence-postgres.js";

/**
 * A fake SqlExecutor routing canned rows by which table the SQL touches. Records
 * calls so we can assert on the join.
 */
function fakeSql(canned: {
  customer?: { customer_id: string | null }[];
  semantic?: { key: string | null; value: unknown }[];
  relational?: { relation: string | null; target: string | null }[];
}): MemorySqlExecutor & { calls: Array<{ sql: string; params?: ReadonlyArray<unknown> }> } {
  const calls: Array<{ sql: string; params?: ReadonlyArray<unknown> }> = [];
  return {
    calls,
    async query<T>(sql: string, params?: ReadonlyArray<unknown>) {
      calls.push({ sql, params });
      if (/intent_audit/.test(sql)) return { rows: (canned.customer ?? []) as T[] };
      if (/claustrum_memory_semantic/.test(sql)) return { rows: (canned.semantic ?? []) as T[] };
      if (/claustrum_memory_relational/.test(sql)) return { rows: (canned.relational ?? []) as T[] };
      return { rows: [] as T[] };
    },
  };
}

describe("createPostgresMemoryStore", () => {
  it("joins sessionId → customer_id, then folds semantic + relational memory", async () => {
    const sql = fakeSql({
      customer: [{ customer_id: "cus_42" }],
      semantic: [
        { key: "lastApprovedRegion", value: "us-west-1" },
        { key: "priorEscalations", value: 2 },
      ],
      relational: [{ relation: "manages", target: "team-payments" }],
    });
    const store = createPostgresMemoryStore({ sql });
    const memory = (await store.get("sess-1")) as Record<string, unknown>;
    expect(memory).toMatchObject({
      customerId: "cus_42",
      lastApprovedRegion: "us-west-1",
      priorEscalations: 2,
      relations: [{ relation: "manages", target: "team-payments" }],
    });
    // The join query was parameterized on the sessionId.
    expect(sql.calls[0]!.sql).toMatch(/intent_audit/);
    expect(sql.calls[0]!.params).toEqual(["sess-1"]);
  });

  it("returns null when no session→customer mapping exists", async () => {
    const sql = fakeSql({ customer: [] });
    const store = createPostgresMemoryStore({ sql });
    expect(await store.get("unknown")).toBeNull();
    // Did NOT query the memory tables (no customer to look up).
    expect(sql.calls).toHaveLength(1);
  });

  it("returns null when the customer has no memory rows", async () => {
    const sql = fakeSql({ customer: [{ customer_id: "cus_x" }], semantic: [], relational: [] });
    const store = createPostgresMemoryStore({ sql });
    expect(await store.get("sess-1")).toBeNull();
  });

  it("fails open to null on a query error and reports", async () => {
    const onReadError = vi.fn();
    const sql: MemorySqlExecutor = {
      async query() {
        throw new Error("db down");
      },
    };
    const store = createPostgresMemoryStore({ sql, onReadError });
    expect(await store.get("sess-1")).toBeNull();
    expect(onReadError).toHaveBeenCalledOnce();
  });

  it("put is a no-op (read-only) and merge returns current memory", async () => {
    const sql = fakeSql({
      customer: [{ customer_id: "cus_1" }],
      semantic: [{ key: "note", value: "hi" }],
    });
    const store = createPostgresMemoryStore({ sql });
    const before = sql.calls.length;
    await store.put("sess-1", { anything: true }, 60);
    expect(sql.calls).toHaveLength(before); // no write issued
    const merged = (await store.merge!("sess-1", {}, 60)) as Record<string, unknown>;
    expect(merged).toMatchObject({ customerId: "cus_1", note: "hi" });
  });

  it("honors custom table names", async () => {
    const sql = fakeSql({ customer: [{ customer_id: "c" }], semantic: [{ key: "k", value: 1 }] });
    const store = createPostgresMemoryStore({
      sql,
      auditTable: "ibx_domain.intent_audit",
      semanticTable: "mem_sem",
      relationalTable: "mem_rel",
    });
    await store.get("s");
    expect(sql.calls.some((c) => /ibx_domain\.intent_audit/.test(c.sql))).toBe(true);
    expect(sql.calls.some((c) => /mem_sem/.test(c.sql))).toBe(true);
  });
});
