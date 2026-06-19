import { describe, expect, it, vi, afterEach } from "vitest";
import {
  createDurableEscalationSink,
  type EscalationLog,
} from "./durable-escalation-sink";
import type { RecordedEscalation } from "@adjudicate/admin-sdk";

/**
 * 114 — fail-OPEN governance-plane posture for the durable escalation sink.
 *
 * Mirrors the kill-switch governance log: a failure to write the DURABLE log
 * must NOT fail the operator's escalation (operator-action precedence). The
 * live record already exists; only the audit-trail entry was lost. This
 * fail-OPEN is isolated to the governance plane and never touches the kernel
 * decision hot-path. The escalation is friction-monotone regardless.
 */

afterEach(() => vi.restoreAllMocks());

const input = {
  intentHash: "a".repeat(64),
  recommendation: "review" as const,
  reason: "needs human review before proceeding",
  actor: { id: "op-1" },
};

describe("createDurableEscalationSink — fail-OPEN on durable log failure", () => {
  it("records to the live sink and the durable log on the happy path", async () => {
    const inserted: RecordedEscalation[] = [];
    const log: EscalationLog = {
      insert: async (r) => {
        inserted.push(r);
      },
      history: async () => inserted.slice(),
    };
    const sink = createDurableEscalationSink({ log });
    const record = await sink.record(input);
    expect(record.kind).toBe("escalation.raised");
    expect(inserted).toHaveLength(1);
    expect(inserted[0]!.id).toBe(record.id);
  });

  it("STILL returns the record (fail-OPEN) when the durable log write throws", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const log: EscalationLog = {
      insert: async () => {
        throw new Error("pg down");
      },
      history: async () => [],
    };
    const sink = createDurableEscalationSink({ log });
    // The operator's escalation SUCCEEDS even though the durable log failed.
    const record = await sink.record(input);
    expect(record.kind).toBe("escalation.raised");
    expect(record.recommendation).toBe("review");
    // The failure was logged (observability), not thrown.
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("failed to write escalation"),
      expect.any(Error),
    );
  });

  it("reads history from the durable log (survives process restarts)", async () => {
    const stored: RecordedEscalation[] = [
      {
        id: "esc-1",
        at: "2026-06-19T00:00:00.000Z",
        kind: "escalation.raised",
        intentHash: "a".repeat(64),
        recommendation: "pause",
        reason: "older escalation",
        raisedBy: { id: "op-1" },
      },
    ];
    const log: EscalationLog = {
      insert: async () => {},
      history: async (limit) => stored.slice(0, limit),
    };
    const sink = createDurableEscalationSink({ log });
    const history = await sink.history(10);
    expect(history).toHaveLength(1);
    expect(history[0]!.reason).toBe("older escalation");
  });
});
