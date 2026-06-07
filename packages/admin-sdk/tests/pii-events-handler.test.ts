import { describe, expect, it } from "vitest";
import { createPiiEventsHandler } from "../src/handlers/pii-events.js";
import type { AuditStore } from "../src/store/index.js";
import type { AuditQuery, AuditQueryResult } from "../src/schemas/query.js";

/**
 * ADR-129 — the PII events handler returns individual (record × pii basis)
 * disposition events (no raw values), newest-first, with optional
 * sensitivity/disposition filters and a result cap.
 */

const FIXED_NOW = "2026-04-28T18:00:00.000Z";

function record(
  at: string,
  code: string,
  sensitivityLevel: string,
  kind = "support.ticket.create",
): unknown {
  return {
    version: 5,
    intentHash: `0x${at}`,
    at,
    durationMs: 1,
    envelope: { kind },
    decision: { kind: code === "pii_blocked" ? "REFUSE" : "REWRITE" },
    decision_basis: [{ category: "validation", code, detail: { sensitivityLevel } }],
  };
}

function storeReturning(records: unknown[]): AuditStore {
  return {
    async query(_q: AuditQuery): Promise<AuditQueryResult> {
      return { records: records as AuditQueryResult["records"] };
    },
    async getByIntentHash() {
      return null;
    },
  };
}

describe("createPiiEventsHandler", () => {
  it("returns event rows newest-first with only non-sensitive fields", async () => {
    const store = storeReturning([
      record("2026-04-28T15:00:00.000Z", "pii_redacted", "high"),
      record("2026-04-28T16:30:00.000Z", "pii_blocked", "critical", "payments.pix.send"),
    ]);
    const handler = createPiiEventsHandler({ store, clock: () => FIXED_NOW });
    const { events, truncated } = await handler({ since: "2026-04-28T00:00:00.000Z" });

    expect(truncated).toBe(false);
    expect(events).toHaveLength(2);
    // newest first
    expect(events[0]!.at).toBe("2026-04-28T16:30:00.000Z");
    expect(events[0]).toEqual({
      intentHash: "0x2026-04-28T16:30:00.000Z",
      at: "2026-04-28T16:30:00.000Z",
      intentKind: "payments.pix.send",
      decisionKind: "REFUSE",
      sensitivityLevel: "critical",
      disposition: "blocked",
    });
    // Defense-in-depth: no value/path keys ever leak.
    expect(Object.keys(events[0]!)).not.toContain("value");
    expect(Object.keys(events[0]!)).not.toContain("fieldPath");
  });

  it("filters by disposition and sensitivityLevel", async () => {
    const store = storeReturning([
      record("2026-04-28T15:00:00.000Z", "pii_redacted", "high"),
      record("2026-04-28T15:30:00.000Z", "pii_blocked", "high"),
      record("2026-04-28T16:00:00.000Z", "pii_blocked", "low"),
    ]);
    const handler = createPiiEventsHandler({ store, clock: () => FIXED_NOW });

    const blocked = await handler({
      since: "2026-04-28T00:00:00.000Z",
      disposition: "blocked",
    });
    expect(blocked.events.map((e) => e.disposition)).toEqual(["blocked", "blocked"]);

    const highBlocked = await handler({
      since: "2026-04-28T00:00:00.000Z",
      disposition: "blocked",
      sensitivityLevel: "high",
    });
    expect(highBlocked.events).toHaveLength(1);
    expect(highBlocked.events[0]!.sensitivityLevel).toBe("high");
  });

  it("caps at limit and reports truncated", async () => {
    const store = storeReturning([
      record("2026-04-28T15:00:00.000Z", "pii_redacted", "high"),
      record("2026-04-28T15:30:00.000Z", "pii_redacted", "high"),
      record("2026-04-28T16:00:00.000Z", "pii_redacted", "high"),
    ]);
    const handler = createPiiEventsHandler({ store, clock: () => FIXED_NOW });
    const { events, truncated } = await handler({
      since: "2026-04-28T00:00:00.000Z",
      limit: 2,
    });
    expect(events).toHaveLength(2);
    expect(truncated).toBe(true);
  });

  it("excludes out-of-window records and ignores non-PII bases", async () => {
    const store = storeReturning([
      record("2026-04-28T15:00:00.000Z", "pii_redacted", "high"),
      record("2026-04-28T19:00:00.000Z", "pii_redacted", "high"), // after FIXED_NOW
      record("2026-04-28T15:10:00.000Z", "unicode_normalized", "high"), // not PII
    ]);
    const handler = createPiiEventsHandler({ store, clock: () => FIXED_NOW });
    const { events } = await handler({ since: "2026-04-28T00:00:00.000Z" });
    expect(events).toHaveLength(1);
    expect(events[0]!.at).toBe("2026-04-28T15:00:00.000Z");
  });
});
