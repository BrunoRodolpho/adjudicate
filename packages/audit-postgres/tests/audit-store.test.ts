import { describe, expect, it } from "vitest";
import type { AuditQuery } from "@adjudicate/admin-sdk";
import {
  buildWhereClauses,
  createPostgresAuditStore,
  decodeCursor,
  encodeCursor,
} from "../src/audit-store.js";
import type { IntentAuditRow } from "../src/postgres-sink.js";
import type { PostgresReader } from "../src/pg-reader.js";

/* ────────────────────────────────────────────────────────────────────────── */
/* Mock PostgresReader                                                        */
/* ────────────────────────────────────────────────────────────────────────── */

interface CapturedCall {
  readonly sql: string;
  readonly params: readonly unknown[];
}

function createMockReader(rows: readonly IntentAuditRow[]): {
  reader: PostgresReader;
  calls: CapturedCall[];
} {
  const calls: CapturedCall[] = [];
  const reader: PostgresReader = {
    async query<R>(sql: string, params: readonly unknown[]) {
      calls.push({ sql, params });
      return rows as readonly R[];
    },
  };
  return { reader, calls };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Row fixtures                                                               */
/* ────────────────────────────────────────────────────────────────────────── */

function makeRow(overrides: Partial<IntentAuditRow> = {}): IntentAuditRow {
  return {
    intent_hash: overrides.intent_hash ?? "hash-default",
    session_id: "sess-1",
    kind: "test.intent",
    principal: "llm",
    taint: "UNTRUSTED",
    decision_kind: "EXECUTE",
    refusal_kind: null,
    refusal_code: null,
    decision_basis: ["state:transition_valid"],
    resource_version: null,
    envelope_jsonb: JSON.stringify({
      version: 2,
      kind: "test.intent",
      payload: { x: 1 },
      createdAt: "2026-04-28T20:00:00.000Z",
      nonce: "n1",
      actor: { principal: "llm", sessionId: "sess-1" },
      taint: "UNTRUSTED",
      intentHash: overrides.intent_hash ?? "hash-default",
    }),
    decision_jsonb: JSON.stringify({
      kind: "EXECUTE",
      basis: [{ category: "state", code: "transition_valid" }],
    }),
    recorded_at: "2026-04-28T20:00:00.000Z",
    duration_ms: 5,
    partition_month: "2026-04",
    record_version: 2,
    plan_jsonb: null,
    ...overrides,
  };
}

const q = (overrides: Partial<AuditQuery> = {}): AuditQuery => ({
  limit: 100,
  ...overrides,
});

/* ────────────────────────────────────────────────────────────────────────── */
/* A. Filter mapping (z.object → SQL)                                         */
/* ────────────────────────────────────────────────────────────────────────── */

describe("buildWhereClauses — filter mapping", () => {
  it("returns empty fragments when no filters set", () => {
    const result = buildWhereClauses(q());
    expect(result.clauses).toEqual([]);
    expect(result.params).toEqual([]);
  });

  it("intentKind → kind = $1", () => {
    const result = buildWhereClauses(q({ intentKind: "order.create" }));
    expect(result.clauses).toEqual(["kind = $1"]);
    expect(result.params).toEqual(["order.create"]);
  });

  it("decisionKind → decision_kind = $1", () => {
    const result = buildWhereClauses(q({ decisionKind: "REFUSE" }));
    expect(result.clauses).toEqual(["decision_kind = $1"]);
    expect(result.params).toEqual(["REFUSE"]);
  });

  it("each of the six DecisionKinds parses correctly", () => {
    for (const kind of [
      "EXECUTE",
      "REFUSE",
      "DEFER",
      "ESCALATE",
      "REQUEST_CONFIRMATION",
      "REWRITE",
    ] as const) {
      const result = buildWhereClauses(q({ decisionKind: kind }));
      expect(result.params).toEqual([kind]);
    }
  });

  it("refusalCode → refusal_code = $1", () => {
    const result = buildWhereClauses(q({ refusalCode: "auth.expired" }));
    expect(result.clauses).toEqual(["refusal_code = $1"]);
    expect(result.params).toEqual(["auth.expired"]);
  });

  it("taint → taint = $1", () => {
    const result = buildWhereClauses(q({ taint: "UNTRUSTED" }));
    expect(result.clauses).toEqual(["taint = $1"]);
    expect(result.params).toEqual(["UNTRUSTED"]);
  });

  it("intentHash → intent_hash = $1", () => {
    const result = buildWhereClauses(q({ intentHash: "abc123" }));
    expect(result.clauses).toEqual(["intent_hash = $1"]);
    expect(result.params).toEqual(["abc123"]);
  });

  it("since → recorded_at >= $1", () => {
    const result = buildWhereClauses(q({ since: "2026-04-01T00:00:00.000Z" }));
    expect(result.clauses).toEqual(["recorded_at >= $1"]);
    expect(result.params).toEqual(["2026-04-01T00:00:00.000Z"]);
  });

  it("until → recorded_at <= $1", () => {
    const result = buildWhereClauses(q({ until: "2026-04-30T23:59:59.000Z" }));
    expect(result.clauses).toEqual(["recorded_at <= $1"]);
    expect(result.params).toEqual(["2026-04-30T23:59:59.000Z"]);
  });

  it("since + until (BETWEEN-equivalent) emit both clauses with monotonic params", () => {
    const result = buildWhereClauses(
      q({
        since: "2026-04-01T00:00:00.000Z",
        until: "2026-04-30T23:59:59.000Z",
      }),
    );
    expect(result.clauses).toEqual([
      "recorded_at >= $1",
      "recorded_at <= $2",
    ]);
    expect(result.params).toEqual([
      "2026-04-01T00:00:00.000Z",
      "2026-04-30T23:59:59.000Z",
    ]);
  });

  it("all filters together produce monotonic params and AND-composed clauses", () => {
    const result = buildWhereClauses(
      q({
        intentKind: "order.create",
        decisionKind: "REFUSE",
        refusalCode: "auth.expired",
        taint: "UNTRUSTED",
        intentHash: "h1",
        since: "2026-01-01T00:00:00.000Z",
        until: "2026-12-31T23:59:59.000Z",
      }),
    );
    expect(result.clauses).toEqual([
      "kind = $1",
      "decision_kind = $2",
      "refusal_code = $3",
      "taint = $4",
      "intent_hash = $5",
      "recorded_at >= $6",
      "recorded_at <= $7",
    ]);
    expect(result.params).toHaveLength(7);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/* B. Cursor encode/decode                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

describe("cursor encoding", () => {
  it("round-trips for any valid payload", () => {
    const payloads = [
      { at: "2026-04-28T20:00:00.000Z", hash: "abc" },
      { at: "2026-04-28T20:00:00.000Z", hash: "0xff00aabbcc" },
      { at: "1970-01-01T00:00:00.000Z", hash: "x" },
    ];
    for (const p of payloads) {
      expect(decodeCursor(encodeCursor(p))).toEqual(p);
    }
  });

  it("decode returns null for malformed input", () => {
    expect(decodeCursor("not-base64-!")).toBeNull();
    expect(decodeCursor("")).toBeNull();
    expect(decodeCursor("e30=")).toBeNull(); // base64 of {}
    expect(decodeCursor(Buffer.from('{"at":"x"}').toString("base64url"))).toBeNull();
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/* C. Pagination correctness (the user-flagged area)                          */
/* ────────────────────────────────────────────────────────────────────────── */

describe("AuditStore.query — pagination", () => {
  it("first page (no cursor) — emits LIMIT n+1, no cursor predicate", async () => {
    const { reader, calls } = createMockReader([]);
    const store = createPostgresAuditStore({ reader });
    await store.query(q({ limit: 100 }));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.sql).toContain("LIMIT $1");
    expect(calls[0]!.sql).not.toContain("(recorded_at, intent_hash)");
    expect(calls[0]!.params).toEqual([101]); // limit + 1
  });

  it("page returns < limit → nextCursor undefined", async () => {
    const rows = [makeRow({ intent_hash: "h1" }), makeRow({ intent_hash: "h2" })];
    const { reader } = createMockReader(rows);
    const store = createPostgresAuditStore({ reader });
    const result = await store.query(q({ limit: 100 }));
    expect(result.records).toHaveLength(2);
    expect(result.nextCursor).toBeUndefined();
  });

  it("page returns exactly limit+1 → records sliced to limit; cursor from LAST record in slice (not the n+1 sentinel)", async () => {
    const rows = [
      makeRow({ intent_hash: "h1", recorded_at: "2026-04-28T20:00:03.000Z" }),
      makeRow({ intent_hash: "h2", recorded_at: "2026-04-28T20:00:02.000Z" }),
      makeRow({ intent_hash: "h3", recorded_at: "2026-04-28T20:00:01.000Z" }),
      makeRow({ intent_hash: "sentinel", recorded_at: "2026-04-28T20:00:00.000Z" }),
    ];
    const { reader } = createMockReader(rows);
    const store = createPostgresAuditStore({ reader });
    const result = await store.query(q({ limit: 3 }));
    expect(result.records).toHaveLength(3);
    expect(result.nextCursor).toBeDefined();

    // Cursor must come from h3 (last in slice), not "sentinel" (the +1 row).
    const decoded = decodeCursor(result.nextCursor!);
    expect(decoded).toEqual({
      at: "2026-04-28T20:00:01.000Z",
      hash: "h3",
    });
  });

  it("second page (with cursor) — WHERE includes (recorded_at, intent_hash) < ($at, $hash)", async () => {
    const cursor = encodeCursor({
      at: "2026-04-28T20:00:01.000Z",
      hash: "h3",
    });
    const { reader, calls } = createMockReader([]);
    const store = createPostgresAuditStore({ reader });
    await store.query(q({ limit: 3, cursor }));
    expect(calls[0]!.sql).toContain("(recorded_at, intent_hash) < ($1, $2)");
    expect(calls[0]!.params).toEqual([
      "2026-04-28T20:00:01.000Z",
      "h3",
      4, // limit + 1
    ]);
  });

  it("second page after filter — cursor params come AFTER filter params, monotonic indices", async () => {
    const cursor = encodeCursor({ at: "2026-04-28T20:00:00.000Z", hash: "x" });
    const { reader, calls } = createMockReader([]);
    const store = createPostgresAuditStore({ reader });
    await store.query(q({ limit: 5, decisionKind: "REFUSE", cursor }));
    // Filter uses $1; cursor uses $2,$3; LIMIT uses $4
    expect(calls[0]!.sql).toContain("decision_kind = $1");
    expect(calls[0]!.sql).toContain("(recorded_at, intent_hash) < ($2, $3)");
    expect(calls[0]!.sql).toContain("LIMIT $4");
    expect(calls[0]!.params).toEqual([
      "REFUSE",
      "2026-04-28T20:00:00.000Z",
      "x",
      6,
    ]);
  });

  it("malformed cursor → falls back to first-page semantics, no exception", async () => {
    const { reader, calls } = createMockReader([]);
    const store = createPostgresAuditStore({ reader });
    await expect(
      store.query(q({ limit: 100, cursor: "garbage-string" })),
    ).resolves.toBeDefined();
    expect(calls[0]!.sql).not.toContain("(recorded_at, intent_hash)");
  });

  it("LIMIT honors schema cap — limit:500 → SQL LIMIT 501", async () => {
    const { reader, calls } = createMockReader([]);
    const store = createPostgresAuditStore({ reader });
    await store.query(q({ limit: 500 }));
    expect(calls[0]!.params).toContain(501);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/* D. Ordering invariant (tiebreaker matches primary sort direction)          */
/* ────────────────────────────────────────────────────────────────────────── */

describe("AuditStore.query — ordering invariant", () => {
  it("ORDER BY uses recorded_at DESC AND intent_hash DESC (matching directions)", async () => {
    const { reader, calls } = createMockReader([]);
    const store = createPostgresAuditStore({ reader });
    await store.query(q());
    // Both DESC — critical for keyset pagination correctness during
    // millisecond-burst inserts (webhook fan-out).
    expect(calls[0]!.sql).toContain(
      "ORDER BY recorded_at DESC, intent_hash DESC",
    );
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/* E. getByIntentHash                                                         */
/* ────────────────────────────────────────────────────────────────────────── */

describe("AuditStore.getByIntentHash", () => {
  it("returns the matching record", async () => {
    const row = makeRow({ intent_hash: "target" });
    const { reader, calls } = createMockReader([row]);
    const store = createPostgresAuditStore({ reader });
    const result = await store.getByIntentHash("target");
    expect(result?.intentHash).toBe("target");
    expect(calls[0]!.sql).toContain("WHERE intent_hash = $1");
    expect(calls[0]!.params).toEqual(["target"]);
  });

  it("returns null for unknown hash", async () => {
    const { reader } = createMockReader([]);
    const store = createPostgresAuditStore({ reader });
    const result = await store.getByIntentHash("nope");
    expect(result).toBeNull();
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/* F. TIMESTAMPTZ normalization (Date OR string from pg)                      */
/* ────────────────────────────────────────────────────────────────────────── */

describe("AuditStore — TIMESTAMPTZ normalization", () => {
  it("accepts string recorded_at from pg", async () => {
    const row = makeRow({ recorded_at: "2026-04-28T20:00:00.000Z" });
    const { reader } = createMockReader([row]);
    const store = createPostgresAuditStore({ reader });
    const result = await store.query(q());
    expect(result.records[0]!.at).toBe("2026-04-28T20:00:00.000Z");
  });

  it("accepts Date recorded_at from pg (default driver behavior)", async () => {
    const row = makeRow({
      recorded_at: new Date("2026-04-28T20:00:00.000Z") as unknown as string,
    });
    const { reader } = createMockReader([row]);
    const store = createPostgresAuditStore({ reader });
    const result = await store.query(q());
    expect(result.records[0]!.at).toBe("2026-04-28T20:00:00.000Z");
  });
});
