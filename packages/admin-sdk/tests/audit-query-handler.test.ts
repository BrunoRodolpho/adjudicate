import { describe, expect, it } from "vitest";
import { createAuditQueryHandler } from "../src/handlers/audit-query.js";
import type { AuditQuery } from "../src/schemas/query.js";
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
