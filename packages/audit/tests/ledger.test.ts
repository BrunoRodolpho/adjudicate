import { afterEach, describe, expect, it } from "vitest";
import {
  _resetMetricsSink,
  setMetricsSink,
  type MetricsSink,
  type SinkFailureEvent,
} from "@adjudicate/core/kernel";
import {
  BASIS_CODES,
  basis,
  buildAuditRecord,
  buildEnvelope,
  decisionRefuse,
  recordAggregateSnapshot,
  refuse,
  verifyAuditRecord,
  type AggregateSnapshot,
} from "@adjudicate/core";
import { createMemoryLedger } from "../src/ledger-memory.js";
import { createRedisLedger, type RedisLedgerClient } from "../src/ledger-redis.js";
import { replayWithIntegrity } from "../src/replay-integrity.js";

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

// ── 052: the recorded aggregate snapshot persists through the replayable record ─
// The aggregate/limit snapshot is recorded onto the durable AuditRecord (the
// governance record of truth) and carried VERBATIM by this package's
// replay/integrity path. These pin that the snapshot survives the durable
// record round-trip, is tamper-evident (auditHash), and the integrity check
// catches a snapshot tampered after build.
describe("052 — recorded aggregate snapshot persists through the audit record", () => {
  const snapshot: AggregateSnapshot = {
    windows: { "acct_7|daily": 1500 },
    at: "2026-04-23T11:59:00.000Z",
  };

  function refuseRecord() {
    const env = buildEnvelope({
      kind: "pix.charge.create",
      payload: { amount: 999 },
      actor: { principal: "llm", sessionId: "s-052" },
      taint: "UNTRUSTED",
      nonce: "n-052",
      createdAt: "2026-04-23T12:00:00.000Z",
    });
    return buildAuditRecord({
      envelope: env,
      decision: decisionRefuse(
        refuse("BUSINESS_RULE", "aggregate.limit.exceeded", "over limit"),
        [basis("business", BASIS_CODES.business.RULE_VIOLATED)],
      ),
      durationMs: 3,
      at: "2026-04-23T12:00:01.000Z",
      aggregateSnapshot: recordAggregateSnapshot(snapshot),
    });
  }

  it("carries the recorded snapshot verbatim and verifies tamper-evident", () => {
    const record = refuseRecord();
    expect(record.aggregateSnapshot?.snapshot).toEqual(snapshot);
    expect(verifyAuditRecord(record).verified).toBe(true);
  });

  it("replayWithIntegrity carries the snapshot through and reports it intact", () => {
    const record = refuseRecord();
    // A deterministic adjudicator that re-decides over the RECORDED snapshot on
    // the record — reproducing the stored REFUSE. The snapshot is read off the
    // durable record, proving it persisted through to the replayable record.
    const report = replayWithIntegrity([record], (env) => {
      const committed =
        record.aggregateSnapshot?.snapshot.windows["acct_7|daily"] ?? 0;
      void env;
      return committed >= 1000
        ? decisionRefuse(
            refuse("BUSINESS_RULE", "aggregate.limit.exceeded", "over limit"),
            [basis("business", BASIS_CODES.business.RULE_VIOLATED)],
          )
        : decisionRefuse(refuse("BUSINESS_RULE", "other", "x"), []);
    });
    expect(report.total).toBe(1);
    expect(report.matched).toBe(1);
    expect(report.mismatches).toHaveLength(0);
    expect(report.integrityFailures).toHaveLength(0);
  });

  it("integrity FAILS when the persisted snapshot is tampered after build", () => {
    const record = refuseRecord();
    const tampered = {
      ...record,
      aggregateSnapshot: {
        snapshot: { ...snapshot, windows: { "acct_7|daily": 0 } },
        snapshotHash: record.aggregateSnapshot!.snapshotHash,
      },
    };
    const report = replayWithIntegrity([tampered], () =>
      decisionRefuse(
        refuse("BUSINESS_RULE", "aggregate.limit.exceeded", "over limit"),
        [basis("business", BASIS_CODES.business.RULE_VIOLATED)],
      ),
    );
    expect(report.integrityFailures).toHaveLength(1);
    expect(report.integrityFailures[0]!.kind).toBe("AUDIT_HASH_TAMPERED");
  });
});
