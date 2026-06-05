import { describe, expect, it } from "vitest";
import {
  governanceEventToRow,
  rowToGovernanceEvent,
  type GovernanceEventRow,
} from "../src/governance-events.js";

/*
 * DataReviewer-006: `rowToGovernanceEvent` is a trust boundary — `kind`,
 * `actor` (raw JSONB), and the status TEXT columns arrive unvalidated from
 * Postgres. It now gates them through the SDK's Zod schemas (ActorSchema,
 * EmergencyStatusSchema) and fails loud — the same contract as
 * normalizeTimestamptz — instead of blind-casting.
 */
describe("rowToGovernanceEvent — validation", () => {
  const validRow: GovernanceEventRow = {
    id: "g-1",
    at: "2026-05-31T00:00:00.000Z",
    kind: "emergency.update",
    actor: { id: "op-1", displayName: "Ops" },
    previous_status: "NORMAL",
    new_status: "DENY_ALL",
    reason: "incident",
  };

  it("accepts a valid row", () => {
    expect(() => rowToGovernanceEvent(validRow)).not.toThrow();
  });

  it("returns the validated, normalized event for a valid row", () => {
    const event = rowToGovernanceEvent(validRow);
    expect(event).toEqual({
      id: "g-1",
      at: "2026-05-31T00:00:00.000Z",
      kind: "emergency.update",
      actor: { id: "op-1", displayName: "Ops" },
      previousStatus: "NORMAL",
      newStatus: "DENY_ALL",
      reason: "incident",
    });
  });

  it("round-trips with governanceEventToRow", () => {
    const event = rowToGovernanceEvent(validRow);
    expect(governanceEventToRow(event)).toEqual(validRow);
  });

  it("throws on unknown kind", () => {
    expect(() =>
      rowToGovernanceEvent({ ...validRow, kind: "unknown.kind" }),
    ).toThrow(/kind/);
  });

  it("throws on malformed actor", () => {
    expect(() =>
      rowToGovernanceEvent({ ...validRow, actor: { pwn: 1 } as never }),
    ).toThrow(/actor/);
  });

  it("throws on invalid previousStatus", () => {
    expect(() =>
      rowToGovernanceEvent({ ...validRow, previous_status: "BOGUS" }),
    ).toThrow(/previous_status/);
  });

  it("throws on invalid newStatus", () => {
    expect(() =>
      rowToGovernanceEvent({ ...validRow, new_status: "BOGUS" }),
    ).toThrow(/new_status/);
  });
});
