import { describe, expect, it } from "vitest";
import type { AuditQuery } from "@adjudicate/admin-sdk";
import {
  buildAuditRecord,
  buildEnvelope,
  decisionExecute,
  hashBindAuditSigner,
} from "@adjudicate/core";
import {
  InvalidCursorError,
  buildWhereClauses,
  createPostgresAuditStore,
  decodeCursor,
  encodeCursor,
  readVerificationSlot,
} from "../src/audit-store.js";
import { recordToRow } from "../src/postgres-sink.js";
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

  // APIReviewer-007: a non-empty cursor that fails to decode is now a hard
  // error (InvalidCursorError) rather than a silent restart from page 1. The
  // old behavior returned the first page + a fresh nextCursor, which loops any
  // client that retries with the bad cursor.
  it("malformed cursor → throws InvalidCursorError (no silent first-page restart)", async () => {
    const { reader, calls } = createMockReader([]);
    const store = createPostgresAuditStore({ reader });
    await expect(
      store.query(q({ limit: 100, cursor: "garbage-string" })),
    ).rejects.toBeInstanceOf(InvalidCursorError);
    // It must fail before issuing any SQL — no page-1 fallback query.
    expect(calls).toHaveLength(0);
  });

  it("tampered/truncated base64url cursor → throws InvalidCursorError", async () => {
    const { reader } = createMockReader([]);
    const store = createPostgresAuditStore({ reader });
    // Valid-looking base64url that decodes to JSON missing required fields.
    const halfCursor = Buffer.from('{"at":"x"}').toString("base64url");
    await expect(
      store.query(q({ limit: 100, cursor: "notvalidbase64!!!" })),
    ).rejects.toBeInstanceOf(InvalidCursorError);
    await expect(
      store.query(q({ limit: 100, cursor: halfCursor })),
    ).rejects.toBeInstanceOf(InvalidCursorError);
  });

  it("undefined cursor → no throw, first-page semantics", async () => {
    const { reader, calls } = createMockReader([]);
    const store = createPostgresAuditStore({ reader });
    await expect(
      store.query(q({ limit: 100, cursor: undefined })),
    ).resolves.toBeDefined();
    expect(calls[0]!.sql).not.toContain("(recorded_at, intent_hash)");
  });

  it("valid encoded cursor → no throw, emits the keyset predicate", async () => {
    const cursor = encodeCursor({ at: "2026-04-28T20:00:01.000Z", hash: "h3" });
    const { reader, calls } = createMockReader([]);
    const store = createPostgresAuditStore({ reader });
    await expect(
      store.query(q({ limit: 3, cursor })),
    ).resolves.toBeDefined();
    expect(calls[0]!.sql).toContain("(recorded_at, intent_hash) < ($1, $2)");
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

  // 112-T3 — the `AuditStore` contract's `getByIntentHash(intentHash,
  // tenantScope?)` second arg. This SINGLE-TENANT reference cold-store IGNORES
  // it (one `intent_audit` table, no tenant column), so accepting a tenantScope
  // must NOT regress behaviour and must NOT widen the query params (no spurious
  // `$2` / WHERE tenant predicate). The arg exists only so the SDK seam (which
  // now threads `input.tenantScope`) is signature-compatible; a multi-tenant
  // adopter overrides this method to add the predicate.
  it("accepts a tenantScope argument and ignores it without regression (single-tenant)", async () => {
    const row = makeRow({ intent_hash: "target" });
    const { reader, calls } = createMockReader([row]);
    const store = createPostgresAuditStore({ reader });
    const result = await store.getByIntentHash("target", "tenant-99");
    // Same record resolves — the scope did not filter it out.
    expect(result?.intentHash).toBe("target");
    // Params are NOT widened: still a single-bind by intent_hash. The scope is
    // ignored (no `$2`, no tenant predicate) — single-tenant reference contract.
    expect(calls[0]!.params).toEqual(["target"]);
    expect(calls[0]!.sql).not.toContain("$2");
    expect(calls[0]!.sql.toLowerCase()).not.toContain("tenant");
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

/* ────────────────────────────────────────────────────────────────────────── */
/* G. 092 — verify-on-read                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

function makeRealRow(opts: {
  marker: string;
  signed?: boolean;
  tamperAuditHash?: boolean;
  forgeSignature?: boolean;
}): IntentAuditRow {
  const env = buildEnvelope({
    kind: "test.intent",
    payload: { marker: opts.marker },
    actor: { principal: "llm", sessionId: "sess-1" },
    taint: "UNTRUSTED",
    nonce: `n-${opts.marker}`,
    createdAt: "2026-04-28T20:00:00.000Z",
  });
  const record = buildAuditRecord({
    envelope: env,
    decision: decisionExecute([]),
    durationMs: 5,
    at: "2026-04-28T20:00:00.000Z",
    ...(opts.signed ? { signer: hashBindAuditSigner("kms://read-key") } : {}),
  });
  const row = recordToRow(record);
  if (opts.tamperAuditHash) {
    // Same-length wrong hash → the re-derived (correct) hash differs → tampered.
    return { ...row, audit_hash: "a".repeat(64) };
  }
  if (opts.forgeSignature) {
    return {
      ...row,
      signature_jsonb: JSON.stringify({
        keyId: "kms://read-key",
        alg: "sha256-hashbind",
        value: "0".repeat(64),
      }),
    };
  }
  return row;
}

describe("AuditStore.query — 092 verify-on-read", () => {
  it("attaches a verifications array index-aligned with records", async () => {
    const rows = [
      makeRealRow({ marker: "a", signed: true }),
      makeRealRow({ marker: "b", signed: true }),
    ];
    const { reader } = createMockReader(rows);
    const store = createPostgresAuditStore({ reader });
    const result = await store.query(q({ limit: 100 }));
    expect(result.records).toHaveLength(2);
    expect(result.verifications).toBeDefined();
    expect(result.verifications).toHaveLength(2);
    // Both intact + validly signed → verified true.
    expect(result.verifications!.every((v) => v.verified === true)).toBe(true);
  });

  it("flags a row with a tampered audit_hash (verified:false / tampered), still returned", async () => {
    const rows = [
      makeRealRow({ marker: "ok" }),
      makeRealRow({ marker: "bad", tamperAuditHash: true }),
    ];
    const { reader } = createMockReader(rows);
    const store = createPostgresAuditStore({ reader });
    const result = await store.query(q({ limit: 100 }));
    // The bad row is NOT dropped — it is flagged.
    expect(result.records).toHaveLength(2);
    const verdicts = result.verifications!;
    const bad = verdicts.find((v) => v.verified === false);
    expect(bad).toBeDefined();
    if (bad && bad.verified === false) expect(bad.reason).toBe("tampered");
  });

  it("flags a row with a forged signature (verified:false / invalid_signature)", async () => {
    const rows = [makeRealRow({ marker: "forged", forgeSignature: true })];
    const { reader } = createMockReader(rows);
    const store = createPostgresAuditStore({ reader });
    const result = await store.query(q({ limit: 100 }));
    const v = result.verifications![0]!;
    expect(v.verified).toBe(false);
    if (v.verified === false) expect(v.reason).toBe("invalid_signature");
  });

  it("verifications align with the sliced page (limit honored, not the +1 sentinel)", async () => {
    const rows = [
      makeRealRow({ marker: "1" }),
      makeRealRow({ marker: "2" }),
      makeRealRow({ marker: "3" }),
      makeRealRow({ marker: "sentinel" }), // the +1 row
    ];
    const { reader } = createMockReader(rows);
    const store = createPostgresAuditStore({ reader });
    const result = await store.query(q({ limit: 3 }));
    expect(result.records).toHaveLength(3);
    expect(result.verifications).toHaveLength(3);
  });
});

describe("AuditStore.getByIntentHash — 092 verify-on-read", () => {
  it("attaches the verdict slot to a returned record (intact → verified:true)", async () => {
    const row = makeRealRow({ marker: "single", signed: true });
    const { reader } = createMockReader([row]);
    const store = createPostgresAuditStore({ reader });
    const record = await store.getByIntentHash(row.intent_hash);
    expect(record).not.toBeNull();
    const v = readVerificationSlot(record!);
    expect(v).toBeDefined();
    expect(v!.verified).toBe(true);
  });

  it("the verdict slot reflects a forged signature without dropping the record", async () => {
    const row = makeRealRow({ marker: "single-forged", forgeSignature: true });
    const { reader } = createMockReader([row]);
    const store = createPostgresAuditStore({ reader });
    const record = await store.getByIntentHash(row.intent_hash);
    // Forensics need the bytes — the row is RETURNED, never silently dropped.
    expect(record).not.toBeNull();
    const v = readVerificationSlot(record!);
    expect(v!.verified).toBe(false);
    if (v && v.verified === false) expect(v.reason).toBe("invalid_signature");
  });

  it("the verdict slot is non-enumerable (record JSON shape unchanged)", async () => {
    const row = makeRealRow({ marker: "shape", signed: true });
    const { reader } = createMockReader([row]);
    const store = createPostgresAuditStore({ reader });
    const record = await store.getByIntentHash(row.intent_hash);
    // The Symbol slot must not widen the serialized/canonical shape of the record.
    expect(Object.keys(record!)).not.toContain("verification");
    expect(JSON.parse(JSON.stringify(record))).toEqual(
      JSON.parse(JSON.stringify(record)),
    );
  });
});
