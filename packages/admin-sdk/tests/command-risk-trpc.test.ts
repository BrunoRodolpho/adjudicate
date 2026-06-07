import { describe, expect, it } from "vitest";
import {
  basis,
  buildAuditRecord,
  buildEnvelope,
  decisionRefuse,
  decisionRequestConfirmation,
  decisionRewrite,
  refuse,
  type AuditRecord,
} from "@adjudicate/core";
import { createInMemoryAuditStore } from "../src/store/index.js";
import { createInMemoryEmergencyStateStore } from "../src/store/emergency-store.js";
import { createAdminCaller } from "../src/trpc/index.js";
import type { Actor } from "../src/schemas/emergency.js";

/**
 * ADR-134 integration — `governance.commandRisk` (aggregate, unauthenticated-
 * friendly) and `governance.commandRiskEvents` (drill-down, actor-gated) over a
 * seeded AuditStore. Asserts both the wire-shape and that command text never
 * crosses the wire.
 */

const operator: Actor = { id: "op-1", displayName: "Test Operator" };
const LIVE_SECRET = "echo $AWS_SECRET_ACCESS_KEY";

function blockedRecord(at: string): AuditRecord {
  const env = buildEnvelope({
    kind: "shell.exec",
    payload: { command: LIVE_SECRET },
    actor: { principal: "llm", sessionId: `sess-${at}` },
    taint: "UNTRUSTED",
    nonce: `n-${at}`,
    createdAt: at,
  });
  return buildAuditRecord({
    envelope: env,
    decision: decisionRefuse(
      refuse("SECURITY", "command_risk_blocked", "I can't run that command."),
      // The guard would carry `command: LIVE_SECRET` here in production; seed it
      // to prove the handler never surfaces it.
      [basis("validation", "command_blocked", { category: "destructive", command: LIVE_SECRET })],
    ),
    durationMs: 2,
    at,
    plan: { visibleReadTools: [], allowedIntents: ["shell.exec"] },
  });
}

function rewriteRecord(at: string): AuditRecord {
  const env = buildEnvelope({
    kind: "shell.exec",
    payload: { command: "rm -rf x -f" },
    actor: { principal: "llm", sessionId: `sess-${at}` },
    taint: "UNTRUSTED",
    nonce: `n-${at}`,
    createdAt: at,
  });
  const rewritten = buildEnvelope({
    kind: "shell.exec",
    payload: { command: "rm -rf x" },
    actor: env.actor,
    taint: env.taint,
    nonce: env.nonce,
    createdAt: env.createdAt,
  });
  return buildAuditRecord({
    envelope: env,
    decision: decisionRewrite(rewritten, "Stripped dangerous flags: -f", [
      basis("validation", "command_flag_stripped", {
        category: "destructive",
        command: "rm -rf x -f",
        sanitized: "rm -rf x",
        stripped: ["-f"],
      }),
    ]),
    durationMs: 2,
    at,
    plan: { visibleReadTools: [], allowedIntents: ["shell.exec"] },
  });
}

function confirmRecord(at: string): AuditRecord {
  const env = buildEnvelope({
    kind: "shell.exec",
    payload: { command: "cat ~/.aws/credentials" },
    actor: { principal: "llm", sessionId: `sess-${at}` },
    taint: "UNTRUSTED",
    nonce: `n-${at}`,
    createdAt: at,
  });
  return buildAuditRecord({
    envelope: env,
    decision: decisionRequestConfirmation("Confirm credential command", [
      basis("business", "rule_satisfied", {
        rule: "command_risk_confirm",
        category: "credential",
        command: "cat ~/.aws/credentials",
      }),
    ]),
    durationMs: 2,
    at,
    plan: { visibleReadTools: [], allowedIntents: ["shell.exec"] },
  });
}

const RECORDS = [
  blockedRecord("2026-06-05T10:00:00.000Z"),
  rewriteRecord("2026-06-05T11:00:00.000Z"),
  confirmRecord("2026-06-05T12:00:00.000Z"),
];

const store = createInMemoryAuditStore({ records: RECORDS });
const emergencyStore = createInMemoryEmergencyStateStore();
const caller = createAdminCaller({ store, emergencyStore, actor: operator });
const unauthCaller = createAdminCaller({ store, emergencyStore, actor: null });

const WINDOW = { since: "2026-06-01T00:00:00.000Z", until: "2026-06-30T00:00:00.000Z" };

describe("governance.commandRisk (aggregate)", () => {
  it("returns (category × disposition) buckets and is reachable unauthenticated", async () => {
    // Aggregate is unauthenticated-friendly (counts only) — use the null actor.
    const result = await unauthCaller.governance.commandRisk(WINDOW);
    expect(result.buckets).toContainEqual({
      category: "destructive",
      disposition: "refuse",
      count: 1,
    });
    expect(result.buckets).toContainEqual({
      category: "destructive",
      disposition: "rewrite",
      count: 1,
    });
    expect(result.buckets).toContainEqual({
      category: "credential",
      disposition: "confirm",
      count: 1,
    });
  });

  it("never serializes command text into the aggregate output", async () => {
    const result = await caller.governance.commandRisk(WINDOW);
    const json = JSON.stringify(result);
    expect(json).not.toContain("AWS_SECRET_ACCESS_KEY");
    expect(json).not.toContain(".aws/credentials");
    expect(json).not.toContain("command");
  });
});

describe("governance.commandRiskEvents (drill-down)", () => {
  it("requires an authenticated actor", async () => {
    await expect(unauthCaller.governance.commandRiskEvents(WINDOW)).rejects.toThrow(
      /actor-id header required/i,
    );
  });

  it("returns newest-first event rows carrying no command text", async () => {
    const result = await caller.governance.commandRiskEvents(WINDOW);
    expect(result.events).toHaveLength(3);
    // newest-first
    expect(result.events[0]!.at).toBe("2026-06-05T12:00:00.000Z");
    expect(result.events[0]!.category).toBe("credential");
    expect(result.events[0]!.disposition).toBe("confirm");
    const json = JSON.stringify(result);
    expect(json).not.toContain("AWS_SECRET_ACCESS_KEY");
    expect(json).not.toContain(".aws/credentials");
    expect(json).not.toContain("command");
  });

  it("filters to the refuse disposition (blocked-commands drill-down)", async () => {
    const result = await caller.governance.commandRiskEvents({
      ...WINDOW,
      disposition: "refuse",
    });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.disposition).toBe("refuse");
    expect(result.events[0]!.category).toBe("destructive");
  });
});
