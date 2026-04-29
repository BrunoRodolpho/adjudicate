import { describe, expect, it } from "vitest";
import type { GovernanceEvent } from "@adjudicate/admin-sdk";
import {
  governanceEventToRow,
  rowToGovernanceEvent,
  type GovernanceEventRow,
} from "../src/governance-events.js";
import {
  createPostgresGovernanceLog,
  governanceInsertParams,
  INSERT_GOVERNANCE_EVENT_SQL,
} from "../src/governance-log.js";
import type {
  PostgresGovernanceWriter,
  PostgresReader,
} from "../src/pg-reader.js";

const sampleEvent: GovernanceEvent = {
  id: "evt-1",
  at: "2026-04-28T20:31:19.047Z",
  kind: "emergency.update",
  actor: { id: "op-1", displayName: "Test Operator" },
  previousStatus: "NORMAL",
  newStatus: "DENY_ALL",
  reason: "Investigating refund spike",
};

const sampleEventNoDisplayName: GovernanceEvent = {
  id: "evt-2",
  at: "2026-04-28T21:00:00.000Z",
  kind: "emergency.update",
  actor: { id: "op-2" },
  previousStatus: "DENY_ALL",
  newStatus: "NORMAL",
  reason: "Incident resolved",
};

describe("governance-events row mapping", () => {
  it("round-trips event → row → event", () => {
    const row = governanceEventToRow(sampleEvent);
    const restored = rowToGovernanceEvent(row);
    expect(restored).toEqual(sampleEvent);
  });

  it("round-trips event without displayName", () => {
    const row = governanceEventToRow(sampleEventNoDisplayName);
    const restored = rowToGovernanceEvent(row);
    expect(restored).toEqual(sampleEventNoDisplayName);
  });

  it("maps previousStatus/newStatus to snake_case columns", () => {
    const row = governanceEventToRow(sampleEvent);
    expect(row.previous_status).toBe("NORMAL");
    expect(row.new_status).toBe("DENY_ALL");
  });

  it("normalizes Date values for at field on read", () => {
    const row: GovernanceEventRow = {
      id: "evt-3",
      at: new Date("2026-04-28T22:00:00.000Z") as unknown as string,
      kind: "emergency.update",
      actor: { id: "op-3" },
      previous_status: "NORMAL",
      new_status: "DENY_ALL",
      reason: "Test event",
    };
    const event = rowToGovernanceEvent(row);
    expect(event.at).toBe("2026-04-28T22:00:00.000Z");
  });
});

describe("governanceInsertParams", () => {
  it("returns parameters in the exact column order of the INSERT SQL", () => {
    const row = governanceEventToRow(sampleEvent);
    const params = governanceInsertParams(row);
    // Column order: id, at, kind, actor, previous_status, new_status, reason
    expect(params).toEqual([
      "evt-1",
      "2026-04-28T20:31:19.047Z",
      "emergency.update",
      { id: "op-1", displayName: "Test Operator" },
      "NORMAL",
      "DENY_ALL",
      "Investigating refund spike",
    ]);
  });

  it("INSERT_GOVERNANCE_EVENT_SQL is parameterized with $1..$7 in declared column order", () => {
    expect(INSERT_GOVERNANCE_EVENT_SQL).toContain("(id, at, kind, actor, previous_status, new_status, reason)");
    expect(INSERT_GOVERNANCE_EVENT_SQL).toContain("VALUES ($1, $2, $3, $4, $5, $6, $7)");
    expect(INSERT_GOVERNANCE_EVENT_SQL).toContain("ON CONFLICT (id) DO NOTHING");
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/* PostgresGovernanceLog (with mocked reader + writer)                        */
/* ────────────────────────────────────────────────────────────────────────── */

interface CapturedCall {
  readonly sql: string;
  readonly params: readonly unknown[];
}

function createMockReader(rows: readonly GovernanceEventRow[]): {
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

function createMockWriter(): {
  writer: PostgresGovernanceWriter;
  inserted: GovernanceEventRow[];
} {
  const inserted: GovernanceEventRow[] = [];
  const writer: PostgresGovernanceWriter = {
    async insertGovernanceEvent(row) {
      inserted.push(row);
    },
  };
  return { writer, inserted };
}

describe("PostgresGovernanceLog", () => {
  it("insert writes the event row through the writer", async () => {
    const { reader } = createMockReader([]);
    const { writer, inserted } = createMockWriter();
    const log = createPostgresGovernanceLog({ reader, writer });

    await log.insert(sampleEvent);

    expect(inserted).toHaveLength(1);
    expect(inserted[0]!.id).toBe("evt-1");
    expect(inserted[0]!.previous_status).toBe("NORMAL");
    expect(inserted[0]!.new_status).toBe("DENY_ALL");
    expect(inserted[0]!.actor).toEqual({
      id: "op-1",
      displayName: "Test Operator",
    });
  });

  it("history queries newest-first with limit", async () => {
    const rows: GovernanceEventRow[] = [
      governanceEventToRow(sampleEventNoDisplayName), // 21:00 newer
      governanceEventToRow(sampleEvent),               // 20:31 older
    ];
    const { reader, calls } = createMockReader(rows);
    const { writer } = createMockWriter();
    const log = createPostgresGovernanceLog({ reader, writer });

    const events = await log.history(20);

    expect(events).toHaveLength(2);
    expect(calls[0]!.sql).toContain("ORDER BY at DESC");
    expect(calls[0]!.sql).toContain("LIMIT $1");
    expect(calls[0]!.params).toEqual([20]);
    expect(events[0]!.id).toBe("evt-2");
    expect(events[1]!.id).toBe("evt-1");
  });

  it("history returns empty array when log is empty", async () => {
    const { reader } = createMockReader([]);
    const { writer } = createMockWriter();
    const log = createPostgresGovernanceLog({ reader, writer });

    const events = await log.history(10);
    expect(events).toEqual([]);
  });
});
