import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
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
