import { describe, expect, it } from "vitest";
import { createPiiClassificationHandler } from "../src/handlers/pii-classification.js";
import type { AuditStore } from "../src/store/index.js";
import type { AuditQuery, AuditQueryResult } from "../src/schemas/query.js";

/**
 * ADR-117 — the PII-classification handler buckets data-classification
 * dispositions by (sensitivityLevel × disposition), reading the
 * `validation.pii_redacted` / `validation.pii_blocked` basis codes whose
 * `detail.sensitivityLevel` rides on the audit record.
 */

const FIXED_NOW = "2026-04-28T18:00:00.000Z";

function record(at: string, code: string, sensitivityLevel: string): unknown {
  return {
    version: 5,
    intentHash: `0x${at}`,
    at,
    durationMs: 1,
    decision: { kind: code === "pii_blocked" ? "REFUSE" : "REWRITE" },
    decision_basis: [{ category: "validation", code, detail: { sensitivityLevel } }],
  };
}

function storeReturning(records: unknown[]): {
  store: AuditStore;
  lastQuery: () => AuditQuery | undefined;
} {
  let captured: AuditQuery | undefined;
  const store: AuditStore = {
    async query(q: AuditQuery): Promise<AuditQueryResult> {
      captured = q;
      return { records: records as AuditQueryResult["records"] };
    },
    async getByIntentHash() {
      return null;
    },
  };
  return { store, lastQuery: () => captured };
}

describe("createPiiClassificationHandler", () => {
  it("buckets by (sensitivityLevel × disposition) and counts", async () => {
    const { store } = storeReturning([
      record("2026-04-28T15:00:00.000Z", "pii_redacted", "high"),
      record("2026-04-28T15:30:00.000Z", "pii_redacted", "high"),
      record("2026-04-28T16:00:00.000Z", "pii_blocked", "critical"),
      record("2026-04-28T16:30:00.000Z", "pii_redacted", "low"),
    ]);
    const handler = createPiiClassificationHandler({ store, clock: () => FIXED_NOW });
    const result = await handler({ since: "2026-04-28T00:00:00.000Z" });

    expect(result.buckets).toContainEqual({ sensitivityLevel: "high", disposition: "redacted", count: 2 });
    expect(result.buckets).toContainEqual({ sensitivityLevel: "critical", disposition: "blocked", count: 1 });
    expect(result.buckets).toContainEqual({ sensitivityLevel: "low", disposition: "redacted", count: 1 });
    // Deterministic order: critical first (highest tier).
    expect(result.buckets[0]!.sensitivityLevel).toBe("critical");
  });

  it("ignores non-PII validation/other basis codes", async () => {
    const { store } = storeReturning([
      record("2026-04-28T15:00:00.000Z", "unicode_normalized", "high"),
      {
        version: 5,
        intentHash: "0xx",
        at: "2026-04-28T15:00:00.000Z",
        durationMs: 1,
        decision: { kind: "EXECUTE" },
        decision_basis: [{ category: "business", code: "rule_satisfied" }],
      },
    ]);
    const handler = createPiiClassificationHandler({ store, clock: () => FIXED_NOW });
    const result = await handler({ since: "2026-04-28T00:00:00.000Z" });
    expect(result.buckets).toEqual([]);
  });

  it("resolves until to clock() when absent and excludes out-of-window records", async () => {
    const { store, lastQuery } = storeReturning([
      record("2026-04-28T15:00:00.000Z", "pii_redacted", "high"),
      record("2026-04-28T19:00:00.000Z", "pii_redacted", "high"), // after FIXED_NOW
    ]);
    const handler = createPiiClassificationHandler({ store, clock: () => FIXED_NOW });
    const result = await handler({ since: "2026-04-28T00:00:00.000Z" });
    expect(lastQuery()?.until).toBe(FIXED_NOW);
    expect(result.buckets).toContainEqual({ sensitivityLevel: "high", disposition: "redacted", count: 1 });
  });
});
