import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  basis,
  BASIS_CODES,
  buildAuditRecord,
  buildEnvelope,
  decisionExecute,
  type AuditRecord,
} from "@adjudicate/core";
import { createAuditQueryHandler } from "../src/handlers/audit-query.js";
import type { AuditQuery, AuditQueryResult } from "../src/schemas/query.js";
import type { AuditStore } from "../src/store/index.js";
import { createInMemoryAuditStore } from "../src/store/index.js";
import {
  ALL,
  fixtureExecute,
  fixtureRefuse,
} from "./fixtures.js";

const handler = createAuditQueryHandler({
  store: createInMemoryAuditStore({ records: ALL }),
});

const q = (overrides: Partial<AuditQuery> = {}): AuditQuery => ({
  limit: 100,
  ...overrides,
});

describe("createAuditQueryHandler", () => {
  it("returns all records when no filters set", async () => {
    const result = await handler(q());
    expect(result.records).toHaveLength(ALL.length);
  });

  it("filters by decisionKind (six-outcome)", async () => {
    for (const kind of [
      "EXECUTE",
      "REFUSE",
      "DEFER",
      "ESCALATE",
      "REQUEST_CONFIRMATION",
      "REWRITE",
    ] as const) {
      const result = await handler(q({ decisionKind: kind }));
      expect(result.records).toHaveLength(1);
      expect(result.records[0]!.decision.kind).toBe(kind);
    }
  });

  it("filters by intentKind", async () => {
    const result = await handler(q({ intentKind: fixtureExecute.envelope.kind }));
    expect(result.records).toHaveLength(1);
    expect(result.records[0]!.intentHash).toBe(fixtureExecute.intentHash);
  });

  it("filters by refusalCode only on REFUSE records", async () => {
    if (fixtureRefuse.decision.kind !== "REFUSE") {
      throw new Error("test invariant: fixtureRefuse should be REFUSE");
    }
    const result = await handler(
      q({ refusalCode: fixtureRefuse.decision.refusal.code }),
    );
    expect(result.records).toHaveLength(1);
    expect(result.records[0]!.intentHash).toBe(fixtureRefuse.intentHash);
  });

  it("filters by intentHash for exact lookup", async () => {
    const result = await handler(q({ intentHash: fixtureExecute.intentHash }));
    expect(result.records).toHaveLength(1);
    expect(result.records[0]!.intentHash).toBe(fixtureExecute.intentHash);
  });

  it("respects limit", async () => {
    const result = await handler(q({ limit: 2 }));
    expect(result.records).toHaveLength(2);
  });

  it("returns empty for no matches", async () => {
    const result = await handler(q({ intentKind: "nonexistent.kind" }));
    expect(result.records).toHaveLength(0);
  });

  it("AND-composes multiple filters", async () => {
    // Both filters match Refuse fixture
    const result = await handler(
      q({ decisionKind: "REFUSE", taint: "UNTRUSTED" }),
    );
    expect(result.records).toHaveLength(1);

    // Conflicting filters → 0 matches
    const empty = await handler(
      q({ decisionKind: "REFUSE", taint: "SYSTEM" }),
    );
    expect(empty.records).toHaveLength(0);
  });

  it("returns newest-first by `at`", async () => {
    const result = await handler(q());
    for (let i = 1; i < result.records.length; i++) {
      expect(result.records[i - 1]!.at >= result.records[i]!.at).toBe(true);
    }
  });
});

/**
 * APIReviewer-007 (item 3) — a malformed pagination cursor surfaces from the
 * store as an `InvalidCursorError` (audit-postgres' typed error, matched here
 * structurally by `name` to avoid a package cycle). The handler must remap it
 * to a tRPC BAD_REQUEST (client error / 400), not let it bubble as a 500.
 */
describe("createAuditQueryHandler — InvalidCursorError → BAD_REQUEST", () => {
  // Mirror of audit-postgres' InvalidCursorError shape: an Error whose
  // `.name` is "InvalidCursorError". The handler matches on name.
  class FakeInvalidCursorError extends Error {
    constructor(message = "Cursor is malformed or has been tampered with.") {
      super(message);
      this.name = "InvalidCursorError";
    }
  }

  const throwingStore = (err: unknown): AuditStore => ({
    async query(): Promise<AuditQueryResult> {
      throw err;
    },
    async getByIntentHash() {
      return null;
    },
  });

  it("remaps InvalidCursorError to TRPCError BAD_REQUEST and preserves the message", async () => {
    const h = createAuditQueryHandler({
      store: throwingStore(new FakeInvalidCursorError()),
    });
    await expect(h(q({ cursor: "garbage" }))).rejects.toBeInstanceOf(TRPCError);
    await h(q({ cursor: "garbage" })).catch((e: unknown) => {
      expect(e).toBeInstanceOf(TRPCError);
      const trpc = e as TRPCError;
      expect(trpc.code).toBe("BAD_REQUEST");
      expect(trpc.message).toMatch(/malformed|tampered/i);
    });
  });

  it("rethrows non-cursor errors unchanged (a real persistence failure is still a 500)", async () => {
    const boom = new Error("connection reset");
    const h = createAuditQueryHandler({ store: throwingStore(boom) });
    await expect(h(q())).rejects.toBe(boom);
  });
});

/**
 * 092 — the handler PASSES THROUGH the store's verify-on-read verdicts
 * (`AuditQueryResult.verifications`) unchanged, and does NOT regress the
 * InvalidCursorError → BAD_REQUEST mapping.
 */
describe("createAuditQueryHandler — 092 verify-on-read pass-through", () => {
  const verifyingStore = (verdicts: AuditQueryResult["verifications"]): AuditStore => ({
    async query(): Promise<AuditQueryResult> {
      return { records: ALL, verifications: verdicts };
    },
    async getByIntentHash() {
      return null;
    },
  });

  it("forwards the verifications array verbatim (same reference, not recomputed)", async () => {
    const verdicts: AuditQueryResult["verifications"] = ALL.map(() => ({
      verified: true as const,
    }));
    const h = createAuditQueryHandler({ store: verifyingStore(verdicts) });
    const result = await h(q());
    expect(result.verifications).toBe(verdicts);
    expect(result.verifications).toHaveLength(ALL.length);
  });

  it("forwards an invalid_signature verdict through to the caller", async () => {
    const verdicts: AuditQueryResult["verifications"] = [
      { verified: false, reason: "invalid_signature", keyId: "kms://k", alg: "sha256-hashbind" },
      ...ALL.slice(1).map(() => ({ verified: true as const })),
    ];
    const h = createAuditQueryHandler({ store: verifyingStore(verdicts) });
    const result = await h(q());
    const flagged = result.verifications![0]!;
    expect(flagged.verified).toBe(false);
    if (flagged.verified === false) expect(flagged.reason).toBe("invalid_signature");
  });

  it("a store that omits verifications still works (field stays undefined)", async () => {
    const result = await handler(q());
    // The reference in-memory store does not verify on read.
    expect(result.verifications).toBeUndefined();
    expect(result.records.length).toBeGreaterThan(0);
  });
});

/**
 * 093 — the handler surfaces per-stream inter-record hash-chain continuity as
 * `chainIntegrity` over the returned records, additive to records/verifications.
 */
describe("createAuditQueryHandler — 093 chain-integrity surfacing", () => {
  let atSeq = 0;
  function chainRecord(
    sessionId: string,
    nonce: string,
    prevAuditHash?: string,
  ): AuditRecord {
    const env = buildEnvelope({
      kind: "order.submit",
      payload: { n: nonce },
      actor: { principal: "llm", sessionId },
      taint: "UNTRUSTED",
      nonce,
      createdAt: "2026-06-18T00:00:00.000Z",
    });
    // Distinct, monotonically-increasing `at` so the per-stream chronological
    // ordering in computeChainIntegrity is deterministic regardless of the
    // store's newest-first list sort.
    const at = `2026-06-18T00:00:${String(atSeq++).padStart(2, "0")}.000Z`;
    return buildAuditRecord({
      envelope: env,
      decision: decisionExecute([basis("state", BASIS_CODES.state.TRANSITION_VALID)]),
      durationMs: 1,
      at,
      ...(prevAuditHash !== undefined ? { prevAuditHash } : {}),
    });
  }

  const storeOf = (records: readonly AuditRecord[]): AuditStore => ({
    async query(): Promise<AuditQueryResult> {
      return { records };
    },
    async getByIntentHash() {
      return null;
    },
  });

  it("reports checked>0 and zero breaks for an intact chain", async () => {
    const g = chainRecord("sA", "0");
    const c1 = chainRecord("sA", "1", g.auditHash);
    const c2 = chainRecord("sA", "2", c1.auditHash);
    const h = createAuditQueryHandler({ store: storeOf([g, c1, c2]) });
    const result = await h(q());
    expect(result.chainIntegrity).toBeDefined();
    expect(result.chainIntegrity!.checked).toBe(2); // c1, c2 have in-window predecessors
    expect(result.chainIntegrity!.breaks).toHaveLength(0);
  });

  it("flags a record whose prevAuditHash does not match its in-window predecessor", async () => {
    const g = chainRecord("sA", "0");
    const broken = chainRecord("sA", "1", "f".repeat(64)); // wrong link
    const h = createAuditQueryHandler({ store: storeOf([g, broken]) });
    const result = await h(q());
    expect(result.chainIntegrity!.checked).toBe(1);
    expect(result.chainIntegrity!.breaks).toHaveLength(1);
    expect(result.chainIntegrity!.breaks[0]!.intentHash).toBe(broken.intentHash);
    expect(result.chainIntegrity!.breaks[0]!.prevAuditHash).toBe("f".repeat(64));
    expect(result.chainIntegrity!.breaks[0]!.predecessorAuditHash).toBe(g.auditHash);
  });

  it("does NOT flag a record whose predecessor is out of window (checked excludes it)", async () => {
    // A mid-chain record whose genesis is not in the returned set.
    const orphanLink = chainRecord("sA", "1", "a".repeat(64));
    const h = createAuditQueryHandler({ store: storeOf([orphanLink]) });
    const result = await h(q());
    expect(result.chainIntegrity!.checked).toBe(0);
    expect(result.chainIntegrity!.breaks).toHaveLength(0);
  });

  it("scopes chains per stream — a link is checked only against the same session", async () => {
    const a0 = chainRecord("sA", "a0");
    const b0 = chainRecord("sB", "b0");
    const a1 = chainRecord("sA", "a1", a0.auditHash); // links within sA
    const h = createAuditQueryHandler({ store: storeOf([a0, b0, a1]) });
    const result = await h(q());
    // a1 checks against a0 (same stream), NOT b0; intact.
    expect(result.chainIntegrity!.checked).toBe(1);
    expect(result.chainIntegrity!.breaks).toHaveLength(0);
  });
});
