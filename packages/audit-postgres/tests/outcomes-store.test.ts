import { describe, expect, it } from "vitest";
import type { RetrospectiveOutcome } from "@adjudicate/core";
import { loadOutcomesWindow } from "../src/outcomes-store.js";
import type { PostgresReader } from "../src/pg-reader.js";

/**
 * APIReviewer-003 — `loadOutcomesWindow` uses an INCLUSIVE upper bound
 * (`observed_at <= $2`) so the `decisionAccuracy` window join stays
 * consistent with the audit query window. A record whose `observed_at`
 * equals `untilIso` must be returned.
 */

interface AuditOutcomeRow {
  intent_hash: string;
  observed: RetrospectiveOutcome["observed"];
  observed_at: string | Date;
  note: string | null;
}

interface CapturedCall {
  readonly sql: string;
  readonly params: readonly unknown[];
}

function mockReader(rows: readonly AuditOutcomeRow[]): {
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

describe("loadOutcomesWindow — inclusive [since, until] bounds (APIReviewer-003)", () => {
  it("emits an inclusive upper-bound predicate (observed_at <= $2)", async () => {
    const { reader, calls } = mockReader([]);
    await loadOutcomesWindow(reader, {
      sinceIso: "2026-04-01T00:00:00.000Z",
      untilIso: "2026-04-30T23:59:59.000Z",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.sql).toContain("observed_at >= $1");
    expect(calls[0]!.sql).toContain("observed_at <= $2");
    // Must NOT use the old half-open predicate.
    expect(calls[0]!.sql).not.toContain("observed_at < $2");
    expect(calls[0]!.params).toEqual([
      "2026-04-01T00:00:00.000Z",
      "2026-04-30T23:59:59.000Z",
    ]);
  });

  it("returns a record whose observed_at EQUALS untilIso (boundary is inclusive)", async () => {
    const boundaryIso = "2026-04-30T23:59:59.000Z";
    const { reader } = mockReader([
      {
        intent_hash: "a".repeat(64),
        observed: "succeeded",
        observed_at: boundaryIso,
        note: null,
      },
    ]);
    const map = await loadOutcomesWindow(reader, {
      sinceIso: "2026-04-01T00:00:00.000Z",
      untilIso: boundaryIso,
    });
    const hit = map.get("a".repeat(64));
    expect(hit).toBeDefined();
    expect(hit?.at).toBe(boundaryIso);
    expect(hit?.observed).toBe("succeeded");
  });

  it("omits the upper bound entirely when untilIso is absent (open-ended)", async () => {
    const { reader, calls } = mockReader([]);
    await loadOutcomesWindow(reader, { sinceIso: "2026-04-01T00:00:00.000Z" });
    expect(calls[0]!.sql).toContain("observed_at >= $1");
    expect(calls[0]!.sql).not.toContain("$2");
    expect(calls[0]!.params).toEqual(["2026-04-01T00:00:00.000Z"]);
  });
});
