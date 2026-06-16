import { describe, expect, it } from "vitest";
import {
  createInMemoryAuditStore,
  createInMemoryEmergencyStateStore,
  createInMemoryTurnTraceStore,
  type TurnTraceCall,
} from "../src/index.js";
import { createAdminCaller } from "../src/trpc/index.js";
import type { Actor } from "../src/schemas/emergency.js";

const operator: Actor = { id: "op-1", displayName: "Test Operator" };

const CALLS: TurnTraceCall[] = [
  {
    turnId: "turn-A",
    callIndex: 0,
    conversationId: "conv-1",
    intentHash: null, // planner-phase call
    model: "claude-sonnet-4-6",
    temperature: 0,
    inputTokens: 10,
    outputTokens: 5,
    promptManifest: ["ibatexas/planner.persona@abc123abc123"],
    completion: "{\"toolCalls\":[]}",
    durationMs: 12,
    recordedAt: "2026-06-14T00:00:00.000Z",
    schemaVersion: 1,
  },
  {
    turnId: "turn-A",
    callIndex: 1,
    conversationId: "conv-1",
    intentHash: "deadbeef",
    model: "claude-sonnet-4-6",
    temperature: 0,
    inputTokens: 20,
    outputTokens: 8,
    promptManifest: ["ibatexas/responder.grounded@def456def456"],
    completion: "Cancelei seu pedido.",
    durationMs: 30,
    recordedAt: "2026-06-14T00:00:01.000Z",
    schemaVersion: 1,
  },
  {
    turnId: "turn-B",
    callIndex: 0,
    conversationId: "conv-2",
    intentHash: null,
    model: "claude-sonnet-4-6",
    temperature: 0,
    inputTokens: 7,
    outputTokens: 3,
    promptManifest: ["ibatexas/responder.persona@aaa111aaa111"],
    completion: "Olá!",
    durationMs: 9,
    recordedAt: "2026-06-14T00:01:00.000Z",
    schemaVersion: 1,
  },
];

const caller = (actor: Actor | null = operator, withStore = true) =>
  createAdminCaller({
    store: createInMemoryAuditStore({ records: [] }),
    emergencyStore: createInMemoryEmergencyStateStore(),
    actor,
    ...(withStore ? { turnTrace: createInMemoryTurnTraceStore({ calls: CALLS }) } : {}),
  });

describe("trace.byTurn", () => {
  it("returns one turn's calls ordered planner→responder", async () => {
    const res = await caller().trace.byTurn({ turnId: "turn-A" });
    expect(res.calls.map((c) => c.callIndex)).toEqual([0, 1]);
    expect(res.calls[0]!.intentHash).toBeNull();
    expect(res.calls[1]!.intentHash).toBe("deadbeef");
    expect(res.calls[1]!.promptManifest).toContain(
      "ibatexas/responder.grounded@def456def456",
    );
  });

  it("requires an authenticated actor (UNAUTHORIZED otherwise)", async () => {
    await expect(caller(null).trace.byTurn({ turnId: "turn-A" })).rejects.toThrow();
  });

  it("throws PRECONDITION_FAILED when no turn_trace store is wired", async () => {
    await expect(
      caller(operator, false).trace.byTurn({ turnId: "turn-A" }),
    ).rejects.toThrow(/not configured/i);
  });
});

describe("trace.byConversation", () => {
  it("returns a conversation's calls in chronological timeline order", async () => {
    const res = await caller().trace.byConversation({ conversationId: "conv-1" });
    expect(res.calls).toHaveLength(2);
    expect(res.calls.map((c) => c.turnId)).toEqual(["turn-A", "turn-A"]);
  });

  it("honors the limit", async () => {
    const res = await caller().trace.byConversation({
      conversationId: "conv-1",
      limit: 1,
    });
    expect(res.calls).toHaveLength(1);
  });
});
