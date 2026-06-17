import { describe, expect, it } from "vitest";
import { createInMemoryRemediationProposalStore, type RemediationProposal } from "../src/index.js";
import {
  createPostgresRemediationProposalStore,
  type SqlExecutor,
} from "../src/proposal-store-postgres.js";

/** A fake SqlExecutor recording every query; returns canned rows for SELECTs. */
function fakeSql(selectRows: Record<string, unknown>[] = []): SqlExecutor & {
  calls: Array<{ sql: string; params?: ReadonlyArray<unknown> }>;
} {
  const calls: Array<{ sql: string; params?: ReadonlyArray<unknown> }> = [];
  return {
    calls,
    async query<T>(sql: string, params?: ReadonlyArray<unknown>) {
      calls.push({ sql, params });
      if (/^\s*SELECT/i.test(sql)) return { rows: selectRows as T[] };
      return { rows: [] as T[] };
    },
  };
}

const base = (over: Partial<RemediationProposal> = {}): RemediationProposal => ({
  proposalId: "p1",
  incidentId: "inc-1",
  action: "rollback",
  blastRadius: 3,
  disposition: "SAFE",
  status: "executed",
  createdAt: "2026-06-07T00:00:00.000Z",
  updatedAt: "2026-06-07T00:00:00.000Z",
  ...over,
});

describe("createPostgresRemediationProposalStore", () => {
  it("init() self-provisions the table (idempotent DDL) BEFORE the SELECT load", async () => {
    const sql = fakeSql();
    const store = createPostgresRemediationProposalStore({ sql });
    await store.init();
    const ddlIdx = sql.calls.findIndex((c) =>
      /CREATE TABLE IF NOT EXISTS remediation_proposals/.test(c.sql),
    );
    const selIdx = sql.calls.findIndex((c) => /^\s*SELECT/i.test(c.sql));
    expect(ddlIdx).toBe(0);
    expect(ddlIdx).toBeLessThan(selIdx);
  });

  it("put updates the sync cache and fire-and-forgets an upsert", async () => {
    const sql = fakeSql();
    const store = createPostgresRemediationProposalStore({ sql });
    store.put(base({ proposalId: "p1", status: "pending_review", approvalToken: "tok-1" }));
    expect(store.getByToken("tok-1")?.proposalId).toBe("p1");
    await new Promise((r) => setTimeout(r, 0));
    expect(sql.calls.some((c) => /INSERT INTO remediation_proposals/.test(c.sql))).toBe(true);
  });
});

describe("createInMemoryRemediationProposalStore", () => {
  it("put/get round-trips and getByToken finds a pending_review proposal", () => {
    const store = createInMemoryRemediationProposalStore();
    store.put(base({ proposalId: "p1", status: "pending_review", approvalToken: "tok-1" }));
    expect(store.get("p1")?.approvalToken).toBe("tok-1");
    expect(store.getByToken("tok-1")?.proposalId).toBe("p1");
    expect(store.getByToken("nope")).toBeNull();
  });

  it("list filters by incidentId and status, newest-first", () => {
    const store = createInMemoryRemediationProposalStore();
    store.put(base({ proposalId: "p1", incidentId: "inc-1", status: "executed" }));
    store.put(base({ proposalId: "p2", incidentId: "inc-2", status: "pending_review", approvalToken: "t2" }));
    store.put(base({ proposalId: "p3", incidentId: "inc-1", status: "pending_review", approvalToken: "t3" }));
    expect(store.list().map((p) => p.proposalId)).toEqual(["p3", "p2", "p1"]);
    expect(store.list({ incidentId: "inc-1" }).map((p) => p.proposalId)).toEqual(["p3", "p1"]);
    expect(store.list({ status: "pending_review" }).map((p) => p.proposalId)).toEqual(["p3", "p2"]);
  });

  it("markResolved transitions status + updatedAt and moves it to newest", () => {
    const store = createInMemoryRemediationProposalStore();
    store.put(base({ proposalId: "p1", status: "pending_review", approvalToken: "t1" }));
    store.put(base({ proposalId: "p2", status: "pending_review", approvalToken: "t2" }));
    store.markResolved("p1", "executed", "2026-06-07T01:00:00.000Z");
    const p1 = store.get("p1");
    expect(p1?.status).toBe("executed");
    expect(p1?.updatedAt).toBe("2026-06-07T01:00:00.000Z");
    expect(store.list().map((p) => p.proposalId)).toEqual(["p1", "p2"]);
  });

  it("markResolved on an unknown id is a no-op", () => {
    const store = createInMemoryRemediationProposalStore();
    store.markResolved("ghost", "executed", "2026-06-07T01:00:00.000Z");
    expect(store.get("ghost")).toBeNull();
  });
});
