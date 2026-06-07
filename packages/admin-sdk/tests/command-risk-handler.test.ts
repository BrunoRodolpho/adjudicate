import { describe, expect, it } from "vitest";
import {
  createCommandRiskEventsHandler,
  createCommandRiskStatsHandler,
} from "../src/handlers/command-risk.js";
import type { AuditStore } from "../src/store/index.js";
import type { AuditQuery, AuditQueryResult } from "../src/schemas/query.js";

/**
 * ADR-134 — command-risk aggregation. The stats handler buckets command-risk
 * dispositions by (category × disposition) over the two guard channels
 * (validation.command_* and business.rule_satisfied/command_risk_confirm). The
 * events handler returns per-record drill-down rows.
 *
 * SECURITY pin: command-risk audit detail carries the RAW command string
 * (which may contain secrets). NEITHER handler may ever read or return it.
 */

const FIXED_NOW = "2026-05-10T18:00:00.000Z";
const LIVE_SECRET = "echo $AWS_SECRET_ACCESS_KEY";

type Channel = "blocked" | "flag_stripped" | "sanitized" | "confirm";

function basisFor(channel: Channel, category: string, command: string): unknown {
  if (channel === "confirm") {
    return {
      category: "business",
      code: "rule_satisfied",
      detail: { rule: "command_risk_confirm", category, command, matchedRuleIds: ["echo_secret_env"] },
    };
  }
  const code =
    channel === "blocked"
      ? "command_blocked"
      : channel === "flag_stripped"
        ? "command_flag_stripped"
        : "command_sanitized";
  return {
    category: "validation",
    code,
    detail: { category, command, matchedRuleIds: ["rm_recursive"], sanitized: command, stripped: ["-f"] },
  };
}

function record(
  at: string,
  channel: Channel,
  category: string,
  command = LIVE_SECRET,
  kind = "shell.exec",
): unknown {
  return {
    version: 5,
    intentHash: `0x${at}`,
    at,
    durationMs: 1,
    envelope: { kind },
    decision: {
      kind:
        channel === "blocked"
          ? "REFUSE"
          : channel === "confirm"
            ? "REQUEST_CONFIRMATION"
            : "REWRITE",
    },
    decision_basis: [basisFor(channel, category, command)],
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

describe("createCommandRiskStatsHandler", () => {
  it("buckets by (category × disposition) across both guard channels", async () => {
    const store = storeReturning([
      record("2026-05-10T10:00:00.000Z", "blocked", "destructive"),
      record("2026-05-10T11:00:00.000Z", "blocked", "destructive"),
      record("2026-05-10T12:00:00.000Z", "flag_stripped", "destructive"),
      record("2026-05-10T13:00:00.000Z", "sanitized", "destructive"),
      record("2026-05-10T14:00:00.000Z", "confirm", "credential"),
      record("2026-05-10T15:00:00.000Z", "confirm", "network"),
    ]);
    const handler = createCommandRiskStatsHandler({ store, clock: () => FIXED_NOW });
    const { buckets } = await handler({ since: "2026-05-10T00:00:00.000Z" });

    // destructive: 2 refuse, 2 rewrite (flag_stripped + sanitized both → rewrite)
    expect(buckets).toContainEqual({ category: "destructive", disposition: "refuse", count: 2 });
    expect(buckets).toContainEqual({ category: "destructive", disposition: "rewrite", count: 2 });
    expect(buckets).toContainEqual({ category: "credential", disposition: "confirm", count: 1 });
    expect(buckets).toContainEqual({ category: "network", disposition: "confirm", count: 1 });
    expect(buckets).toHaveLength(4);
  });

  it("emits deterministic order: category rank desc, disposition rank asc", async () => {
    const store = storeReturning([
      record("2026-05-10T10:00:00.000Z", "confirm", "network"),
      record("2026-05-10T11:00:00.000Z", "blocked", "destructive"),
      record("2026-05-10T12:00:00.000Z", "confirm", "credential"),
      record("2026-05-10T13:00:00.000Z", "flag_stripped", "destructive"),
    ]);
    const handler = createCommandRiskStatsHandler({ store, clock: () => FIXED_NOW });
    const { buckets } = await handler({ since: "2026-05-10T00:00:00.000Z" });
    expect(buckets.map((b) => `${b.category}/${b.disposition}`)).toEqual([
      "destructive/refuse",
      "destructive/rewrite",
      "credential/confirm",
      "network/confirm",
    ]);
  });

  it("NEVER serializes the raw command (no leak by construction)", async () => {
    const store = storeReturning([
      record("2026-05-10T10:00:00.000Z", "blocked", "credential", LIVE_SECRET),
      record("2026-05-10T11:00:00.000Z", "confirm", "credential", "cat ~/.aws/credentials"),
    ]);
    const handler = createCommandRiskStatsHandler({ store, clock: () => FIXED_NOW });
    const result = await handler({ since: "2026-05-10T00:00:00.000Z" });
    const json = JSON.stringify(result);
    expect(json).not.toContain("AWS_SECRET_ACCESS_KEY");
    expect(json).not.toContain(".aws/credentials");
    expect(json).not.toContain("command");
    expect(json).not.toContain("matchedRuleIds");
    expect(json).not.toContain("rm_recursive");
    expect(json).not.toContain("stripped");
  });

  it("drops poisoned/unknown categories rather than corrupting a bucket", async () => {
    const store = storeReturning([
      record("2026-05-10T10:00:00.000Z", "blocked", "<script>"),
      record("2026-05-10T11:00:00.000Z", "blocked", "safe"),
      record("2026-05-10T12:00:00.000Z", "blocked", "destructive"),
    ]);
    const handler = createCommandRiskStatsHandler({ store, clock: () => FIXED_NOW });
    const { buckets } = await handler({ since: "2026-05-10T00:00:00.000Z" });
    expect(buckets).toEqual([{ category: "destructive", disposition: "refuse", count: 1 }]);
  });

  it("excludes out-of-window records and ignores non-command bases", async () => {
    const store = storeReturning([
      record("2026-05-10T10:00:00.000Z", "blocked", "destructive"),
      record("2026-05-10T19:00:00.000Z", "blocked", "destructive"), // after FIXED_NOW
      record("2026-05-09T23:00:00.000Z", "blocked", "destructive"), // before since
      {
        version: 5,
        intentHash: "0xnoise",
        at: "2026-05-10T10:30:00.000Z",
        durationMs: 1,
        envelope: { kind: "support.ticket.create" },
        decision: { kind: "REWRITE" },
        decision_basis: [
          { category: "validation", code: "pii_redacted", detail: { sensitivityLevel: "high" } },
          { category: "business", code: "rule_satisfied", detail: { rule: "other_rule", category: "destructive" } },
        ],
      },
    ]);
    const handler = createCommandRiskStatsHandler({ store, clock: () => FIXED_NOW });
    const { buckets } = await handler({ since: "2026-05-10T00:00:00.000Z" });
    expect(buckets).toEqual([{ category: "destructive", disposition: "refuse", count: 1 }]);
  });

  it("resolves an omitted until via the injected clock and honors explicit until", async () => {
    const store = storeReturning([
      record("2026-05-10T10:00:00.000Z", "blocked", "destructive"),
      record("2026-05-10T16:00:00.000Z", "blocked", "destructive"),
    ]);
    const handler = createCommandRiskStatsHandler({ store, clock: () => FIXED_NOW });
    const all = await handler({ since: "2026-05-10T00:00:00.000Z" });
    expect(all.buckets[0]!.count).toBe(2);
    const clamped = await handler({
      since: "2026-05-10T00:00:00.000Z",
      until: "2026-05-10T12:00:00.000Z",
    });
    expect(clamped.buckets[0]!.count).toBe(1);
  });

  it("returns no buckets for an empty window", async () => {
    const handler = createCommandRiskStatsHandler({
      store: storeReturning([]),
      clock: () => FIXED_NOW,
    });
    const { buckets } = await handler({ since: "2026-05-10T00:00:00.000Z" });
    expect(buckets).toEqual([]);
  });
});

describe("createCommandRiskEventsHandler", () => {
  it("returns drill-down rows newest-first with only non-sensitive fields", async () => {
    const store = storeReturning([
      record("2026-05-10T15:00:00.000Z", "flag_stripped", "destructive"),
      record("2026-05-10T16:30:00.000Z", "blocked", "credential", LIVE_SECRET, "shell.exec"),
    ]);
    const handler = createCommandRiskEventsHandler({ store, clock: () => FIXED_NOW });
    const { events, truncated } = await handler({ since: "2026-05-10T00:00:00.000Z" });

    expect(truncated).toBe(false);
    expect(events).toHaveLength(2);
    expect(events[0]!.at).toBe("2026-05-10T16:30:00.000Z");
    expect(events[0]).toEqual({
      intentHash: "0x2026-05-10T16:30:00.000Z",
      at: "2026-05-10T16:30:00.000Z",
      intentKind: "shell.exec",
      decisionKind: "REFUSE",
      category: "credential",
      disposition: "refuse",
    });
    // No command-text keys ever leak.
    const json = JSON.stringify(events);
    expect(json).not.toContain("AWS_SECRET_ACCESS_KEY");
    expect(json).not.toContain("command");
    expect(json).not.toContain("matchedRuleIds");
    expect(Object.keys(events[0]!)).not.toContain("command");
  });

  it("filters by category and disposition", async () => {
    const store = storeReturning([
      record("2026-05-10T15:00:00.000Z", "blocked", "destructive"),
      record("2026-05-10T15:30:00.000Z", "confirm", "credential"),
      record("2026-05-10T16:00:00.000Z", "confirm", "network"),
    ]);
    const handler = createCommandRiskEventsHandler({ store, clock: () => FIXED_NOW });

    const confirms = await handler({ since: "2026-05-10T00:00:00.000Z", disposition: "confirm" });
    expect(confirms.events.map((e) => e.disposition)).toEqual(["confirm", "confirm"]);

    const credConfirm = await handler({
      since: "2026-05-10T00:00:00.000Z",
      disposition: "confirm",
      category: "credential",
    });
    expect(credConfirm.events).toHaveLength(1);
    expect(credConfirm.events[0]!.category).toBe("credential");
  });

  it("caps at limit and reports truncated", async () => {
    const store = storeReturning([
      record("2026-05-10T15:00:00.000Z", "blocked", "destructive"),
      record("2026-05-10T15:30:00.000Z", "blocked", "destructive"),
      record("2026-05-10T16:00:00.000Z", "blocked", "destructive"),
    ]);
    const handler = createCommandRiskEventsHandler({ store, clock: () => FIXED_NOW });
    const { events, truncated } = await handler({ since: "2026-05-10T00:00:00.000Z", limit: 2 });
    expect(events).toHaveLength(2);
    expect(truncated).toBe(true);
  });
});
