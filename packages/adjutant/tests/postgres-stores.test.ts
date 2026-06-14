// P4 — durable Postgres projection stores, tested with a fake SqlExecutor.

import { describe, it, expect } from "vitest";
import {
  createPostgresRemediationProposalStore,
  remediationProposalsDDL,
  type SqlExecutor,
} from "../src/proposal-store-postgres.js";
import {
  createPostgresIncidentProjection,
  dispositionFromDecisionKind,
} from "../src/incident-projection-postgres.js";
import type { RemediationProposal } from "../src/proposal-store.js";

/** A fake SqlExecutor that records writes and returns canned rows for SELECTs. */
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

function proposal(over: Partial<RemediationProposal> = {}): RemediationProposal {
  return {
    proposalId: "nonce-1",
    incidentId: "order:1",
    action: "pix.charge.refund",
    blastRadius: 1,
    disposition: "REVIEW",
    status: "pending_review",
    approvalToken: "tok-1",
    intentHash: "h1",
    createdAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:00.000Z",
    ...over,
  };
}

describe("remediationProposalsDDL", () => {
  it("creates the table + indexes (idempotent)", () => {
    const ddl = remediationProposalsDDL();
    expect(ddl).toContain("CREATE TABLE IF NOT EXISTS remediation_proposals");
    expect(ddl).toContain("proposal_id   TEXT PRIMARY KEY");
    expect(ddl).toMatch(/CREATE INDEX IF NOT EXISTS remediation_proposals_token_idx/);
  });
});

describe("createPostgresRemediationProposalStore", () => {
  it("put → sync reads (get/getByToken/list) + fire-and-forget upsert", async () => {
    const sql = fakeSql();
    const store = createPostgresRemediationProposalStore({ sql });
    store.put(proposal());
    expect(store.get("nonce-1")?.action).toBe("pix.charge.refund");
    expect(store.getByToken("tok-1")?.proposalId).toBe("nonce-1");
    expect(store.list()).toHaveLength(1);
    expect(store.list({ status: "pending_review" })).toHaveLength(1);
    expect(store.list({ status: "executed" })).toHaveLength(0);
    // settle the fire-and-forget write
    await new Promise((r) => setTimeout(r, 0));
    expect(sql.calls.some((c) => /INSERT INTO remediation_proposals/.test(c.sql))).toBe(true);
  });

  it("markResolved transitions status + persists", async () => {
    const sql = fakeSql();
    const store = createPostgresRemediationProposalStore({ sql });
    store.put(proposal());
    store.markResolved("nonce-1", "executed", "2026-06-14T01:00:00.000Z");
    expect(store.get("nonce-1")?.status).toBe("executed");
    expect(store.get("nonce-1")?.updatedAt).toBe("2026-06-14T01:00:00.000Z");
    await new Promise((r) => setTimeout(r, 0));
    expect(sql.calls.some((c) => /UPDATE remediation_proposals/.test(c.sql))).toBe(true);
  });

  it("init() loads the cache from Postgres rows", async () => {
    const sql = fakeSql([
      {
        proposal_id: "p2",
        incident_id: "order:2",
        action: "pix.charge.refund",
        blast_radius: 1,
        disposition: "REVIEW",
        status: "pending_review",
        approval_token: "tok-2",
        intent_hash: "h2",
        envelope_jsonb: null,
        created_at: "2026-06-14T00:00:00.000Z",
        updated_at: "2026-06-14T00:00:00.000Z",
      },
    ]);
    const store = createPostgresRemediationProposalStore({ sql });
    await store.init();
    expect(store.get("p2")?.incidentId).toBe("order:2");
    expect(store.getByToken("tok-2")?.proposalId).toBe("p2");
  });
});

describe("dispositionFromDecisionKind (lossy 6→3 map)", () => {
  it("maps the 6 DecisionKinds onto SAFE/REVIEW/MANUAL", () => {
    expect(dispositionFromDecisionKind("EXECUTE")).toBe("SAFE");
    expect(dispositionFromDecisionKind("REWRITE")).toBe("SAFE");
    expect(dispositionFromDecisionKind("REQUEST_CONFIRMATION")).toBe("REVIEW");
    expect(dispositionFromDecisionKind("DEFER")).toBe("REVIEW");
    expect(dispositionFromDecisionKind("ESCALATE")).toBe("MANUAL");
    expect(dispositionFromDecisionKind("REFUSE")).toBe("MANUAL");
  });
});

describe("createPostgresIncidentProjection", () => {
  it("folds agent_runs into per-incident entries (latest per entity), newest-first", async () => {
    const sql = fakeSql([
      { entity: "order:1", decision_kind: "REQUEST_CONFIRMATION", at: "2026-06-14T02:00:00.000Z" },
      { entity: "order:2", decision_kind: "EXECUTE", at: "2026-06-14T03:00:00.000Z" },
    ]);
    const proj = createPostgresIncidentProjection({ sql });
    await proj.refresh();
    const list = proj.list();
    expect(list).toHaveLength(2);
    // newest-first
    expect(list[0]!.incidentId).toBe("order:2");
    expect(list[0]!.lastDisposition).toBe("SAFE");
    expect(list[0]!.executed).toBe(true);
    expect(list[0]!.pending).toBeNull();
    const o1 = proj.get("order:1")!;
    expect(o1.lastDisposition).toBe("REVIEW");
    expect(o1.executed).toBe(false);
    expect(o1.pending).toEqual({ kind: "review" });
    // record() is a no-op (projection derives from runs)
    proj.record("order:9", { disposition: "SAFE" } as never, "x");
    expect(proj.get("order:9")).toBeNull();
  });

  it("queries the configured agent_runs table with DISTINCT ON (entity)", async () => {
    const sql = fakeSql([]);
    const proj = createPostgresIncidentProjection({ sql, agentRunsTable: "ibx_domain.agent_runs" });
    await proj.refresh();
    expect(sql.calls[0]!.sql).toMatch(/DISTINCT ON \(entity\)[\s\S]*ibx_domain\.agent_runs/);
  });
});
